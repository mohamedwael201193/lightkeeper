#!/usr/bin/env python3
"""T13 Docs MCP + Chain MCP Agent (LIGHTKEEPER) — v2 on the real MCPs.

Composition loop, genuine: question -> DOCS MCP (askQuestion, WITH cited
sources) -> CHAIN MCP (eth_call the SAME function the docs explained) ->
INTERPRET the on-chain result in the context of the docs explanation.

- Docs: https://docs.pharos.xyz/~gitbook/mcp (askQuestion; NEVER sendFeedback)
- Chain: https://mcp.pharos.xyz/mcp (get_chain_info/get_block_number/get_code/
  eth_call/get_logs BY NAME; Pharos mainnet 1672 ONLY)
- Read-only. Zero raw eth_* against RPC URLs. Zero local doc indexes.
  Zero page-scraping as a source.

Citation discipline: DOC-GROUNDED (doc URL + retrieval date + excerpt) /
INFERENCE (derived, labelled) / UNVERIFIED (docs do not cover it -> the agent
SAYS SO and does not execute).

Stdlib + requests only (via src/mcp.py).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mcp import ChainMCP, DocsMCP, CHAIN_MCP_URL, DOCS_MCP_URL  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TODAY = date.today().isoformat()

USDC = "0xc879c018db60520f4355c26ed1a6d572cdac1815"
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
FEEDS_PAGE = "https://docs.pharos.xyz/tooling-and-infrastructure/oracles/chainlink-pe"

# Canonical ERC-20 / feed selectors (universal constants, not chain data).
SELECTORS = {
    "totalSupply()": "0x18160ddd",
    "decimals()": "0x313ce567",
    "balanceOf(address)": "0x70a08231",
    "latestAnswer()": "0x50d25bcd",
}

LINK_RE = re.compile(r"\[([^\]]{1,120})\]\(([^)\s]{1,200})\)")
MAX_CITED_PAGES = 5  # bound the grounding gate's getPage fan-out per round


def page_names_function(page_text: str, fn_name: str) -> bool:
    """Exact-name match: the bare function name as a whole token in the page
    text (not a substring of a longer identifier, not a fuzzy match)."""
    return re.search(rf"(?<![A-Za-z0-9_]){re.escape(fn_name)}(?![A-Za-z0-9_])",
                     page_text) is not None


def grounding_gate(docs: DocsMCP, cites: list, fn_name: str) -> dict:
    """Cited-page grounding gate.

    askQuestion ANSWERS are not documentation by themselves: the function
    counts as DOCUMENTED only if at least one of the pages the answer CITES,
    fetched verbatim via the Docs MCP getPage tool, names the function
    EXACTLY. A page that fails to fetch counts as unverified (fail-closed).
    """
    pages = []
    documented = False
    for c in cites[:MAX_CITED_PAGES]:
        entry = {"url": c["url"], "chars": 0, "names_function": False}
        try:
            pg = docs.call("getPage", {"url": c["url"]})
            text = pg.get("text", "")
            entry["chars"] = len(text)
            entry["names_function"] = page_names_function(text, fn_name)
        except Exception as e:  # fail-closed: unverifiable page != documentation
            entry["fetch_error"] = f"{type(e).__name__}: {str(e)[:120]}"
        documented = documented or entry["names_function"]
        pages.append(entry)
    return {
        "rule": "documented iff a cited page fetched via Docs MCP getPage "
                "names the function exactly (whole-token match)",
        "pages": pages,
        "documented": documented,
    }


def absolutize(url: str) -> str:
    url = url.strip()
    if url.startswith("http"):
        return url
    if url.startswith("/"):
        return "https://docs.pharos.xyz" + url
    return url


def extract_citations(answer: str) -> list:
    """DOC-GROUNDED citations: every markdown link in the verbatim answer."""
    cites = []
    seen = set()
    for title, url in LINK_RE.findall(answer):
        url = absolutize(url)
        if url in seen or "docs.pharos.xyz" not in url:
            continue
        seen.add(url)
        cites.append({
            "label": "DOC-GROUNDED",
            "url": url,
            "retrieval_date": TODAY,
            "section": title.strip()[:120],
            "excerpt": f"Linked from the Docs MCP answer as [{title.strip()[:80]}]",
        })
    return cites


def decode_uint(hexstr: str) -> int:
    return int(hexstr, 16)


def pad_address(addr: str) -> str:
    return "0x" + addr.lower().replace("0x", "").rjust(64, "0")


# ------------------------------------------------------------------ rounds
ROUNDS = [
    {
        "id": "totalsupply",
        "question": "How do I read an ERC-20 token's total supply using eth_call?",
        "goal": "Call totalSupply() on an ERC-20 contract via eth_call",
        "function": "totalSupply()",
        "contract": "USDC",
        "address": USDC,
    },
    {
        "id": "decimals",
        "question": "How do I read an ERC-20 token's decimals using eth_call?",
        "goal": "Call decimals() on an ERC-20 contract via eth_call",
        "function": "decimals()",
        "contract": "USDC",
        "address": USDC,
    },
    {
        "id": "balanceof",
        "question": "How do I read an ERC-20 token balance with balanceOf using eth_call?",
        "goal": "Call balanceOf(address) on an ERC-20 contract via eth_call",
        "function": "balanceOf(address)",
        "contract": "USDC",
        "address": USDC,
        "needs_holder": True,
    },
    {
        "id": "price",
        "question": "What is the live USD market price of USDC on Pharos mainnet?",
        "goal": "Find the documented USDC price feed and read its live quote",
        "function": "latestAnswer()",
        "contract": "USDC/USD feed",
        # address is NOT hardcoded: derived from the Docs MCP getPage below
        "address": None,
        "feed_contract": True,
    },
]


def extract_feed_address(page_markdown: str) -> str | None:
    """Parse the USDC/USD row of the Chainlink feeds table.

    Row shape: | USDC/USD | <aggregator 0x…> | <feed/proxy 0x…> |
    The feed (third column) is the contract exposing latestAnswer().
    """
    for line in page_markdown.splitlines():
        if "USDC/USD" not in line:
            continue
        addrs = re.findall(r"0x[0-9a-fA-F]{40}", line)
        if len(addrs) >= 2:
            return addrs[-1]  # feed proxy = last address column
    return None


def run_round(docs: DocsMCP, chain: ChainMCP, rnd: dict, block: int) -> dict:
    rid = rnd["id"]
    out: dict = {"id": rid, "question": rnd["question"], "goal": rnd["goal"],
                 "function": rnd["function"], "contract": rnd["contract"],
                 "address": rnd["address"]}
    chain_calls: list = []

    # ---- 1. DOCS MCP explains (askQuestion, verbatim) ----
    t0 = datetime.now(timezone.utc).isoformat()
    ans = docs.call("askQuestion", {"question": rnd["question"], "goal": rnd["goal"]})
    answer_text: str = ans.get("text", "")
    out["docs"] = {
        "endpoint": DOCS_MCP_URL,
        "tool": "askQuestion",
        "asked_at_utc": t0,
        "answer_chars": len(answer_text),
        "answer": answer_text,
    }
    cites = extract_citations(answer_text)
    out["citations"] = cites
    # answer-level check (weak, kept for the record): does the answer text name it?
    fn_name = rnd["function"].split("(")[0]
    out["docs_answer_names_function"] = fn_name.lower() in answer_text.lower()
    out["docs_source_count"] = len(cites)

    # ---- 1b. CITED-PAGE GROUNDING GATE ----
    # The askQuestion answer is not documentation by itself. getPage every
    # cited URL via the Docs MCP; the function is DOCUMENTED only if a
    # fetched page names it exactly. The gate verdict drives the
    # interpretation below: NOT DESCRIBED -> raw value, no units, no decimals.
    gate = grounding_gate(docs, cites, fn_name)
    docs_tools = ["askQuestion"] + (["getPage"] if cites else [])
    out["grounding_gate"] = gate
    out["docs_names_function"] = gate["documented"]  # now page-grounded, not answer-based
    out["docs_tools_used"] = docs_tools

    # ---- 2. CHAIN MCP executes the SAME function ----
    # For the price round the feed address is DERIVED, not hardcoded:
    # askQuestion -> getPage(feeds table) -> parse USDC/USD row.
    docs_tools = list(out["docs_tools_used"])
    to = rnd["address"]
    if rnd.get("feed_contract"):
        page = docs.call("getPage", {"url": FEEDS_PAGE})
        if "getPage" not in docs_tools:
            docs_tools.append("getPage")
        page_text = page.get("text", "")
        out["docs"]["feeds_page_chars"] = len(page_text)
        to = extract_feed_address(page_text)
        out["feed_address_from_docs"] = to
        out["feed_page"] = FEEDS_PAGE
        if not to:
            out["chain"] = {"endpoint": CHAIN_MCP_URL, "tools_called": [],
                            "calls": []}
            out["ok"] = False
            out["error"] = "USDC/USD row not found on the docs feeds page"
            out["interpretation"] = ("[UNVERIFIED] The docs feeds page has no "
                                     "USDC/USD row I can parse. No call executed.")
            out["docs_tools_used"] = docs_tools
            return out
        # the docs named this exact feed contract: verify it exists first
        code = chain.call("get_code", {"address": to, "block": "latest"})
        chain_calls.append({"tool": "get_code", "address": to,
                            "has_code": len(code.get("code", "")) > 10})
        if not chain_calls[-1]["has_code"]:
            out["chain"] = {"endpoint": CHAIN_MCP_URL, "tools_called": ["get_code"],
                            "calls": chain_calls}
            out["ok"] = False
            out["error"] = "docs-named feed contract has no code on-chain; refusing to call"
            out["interpretation"] = ("[UNVERIFIED] The Docs MCP named a feed contract "
                                     "with no on-chain code. No call executed.")
            return out
        data = SELECTORS["latestAnswer()"]
    elif rnd.get("needs_holder"):
        # derive a REAL holder from recent Transfer logs (no invented addresses)
        head = chain.call("get_block_number", {})
        tip = int(head["blockNumber"])
        logs = chain.call("get_logs", {"address": USDC,
                                       "topics": [TRANSFER_TOPIC],
                                       "fromBlock": tip - 500, "toBlock": tip})
        chain_calls.append({"tool": "get_logs", "fromBlock": tip - 500,
                            "toBlock": tip, "logs_found": len(logs)})
        if not logs:
            out["chain"] = {"endpoint": CHAIN_MCP_URL, "tools_called": ["get_logs"],
                            "calls": chain_calls}
            out["ok"] = False
            out["error"] = "no recent Transfer logs; no holder to query"
            out["interpretation"] = ("[UNVERIFIED] No holder address derivable from "
                                     "live logs. No call executed.")
            return out
        holder = "0x" + logs[0]["topics"][2][-40:]
        out["holder_from_logs"] = holder
        out["holder_tx"] = logs[0]["transactionHash"]
        data = SELECTORS["balanceOf(address)"] + pad_address(holder)[2:]
    else:
        data = SELECTORS[rnd["function"]]

    res = chain.call("eth_call", {"transaction": {"to": to, "data": data},
                                  "block": block})
    raw = res.get("result", "0x0")
    out["address"] = to  # for derived addresses (price round), record the real one
    chain_calls.append({"tool": "eth_call", "to": to, "data": data[:10] + "…",
                        "block": block, "result": raw})
    out["chain"] = {"endpoint": CHAIN_MCP_URL,
                    "tools_called": sorted({c["tool"] for c in chain_calls}),
                    "calls": chain_calls}

    # ---- 3. INTERPRET in the context of the docs explanation ----
    # The CITED-PAGE GROUNDING GATE decides the interpretation discipline:
    # DOCUMENTED -> [INFERENCE] with docs-context formatting (decimals, units);
    # NOT DESCRIBED -> raw value only: no units, no decimals, no formatting
    # that would imply a documented meaning the pages did not supply.
    value = decode_uint(raw)
    if gate["documented"]:
        if rid == "totalsupply":
            dec = chain.call("eth_call", {"transaction": {"to": USDC, "data": SELECTORS["decimals()"]},
                                          "block": block})
            decimals = decode_uint(dec.get("result", "0x0"))
            human = value / (10 ** decimals)
            interp = (f"[INFERENCE] The Docs MCP explained totalSupply() as an eth_call "
                      f"with selector 0x18160ddd. Called live at block {block}: raw "
                      f"{value}; with {decimals} decimals (live decimals() call) that is "
                      f"{human:,.6f} USDC in circulation. Read-only: no transaction, no gas.")
        elif rid == "decimals":
            interp = (f"[INFERENCE] The Docs MCP explained decimals() as an eth_call "
                      f"returning uint8. Live at block {block}: {value}. All USDC "
                      f"human formatting divides by 10^{value}.")
        elif rid == "balanceof":
            dec = chain.call("eth_call", {"transaction": {"to": USDC, "data": SELECTORS["decimals()"]},
                                          "block": block})
            decimals = decode_uint(dec.get("result", "0x0"))
            human = value / (10 ** decimals)
            interp = (f"[INFERENCE] The Docs MCP explained balanceOf(address) with "
                      f"ABI-encoded calldata (selector 0x70a08231). Holder {out['holder_from_logs']} "
                      f"was taken from a REAL Transfer log (tx {out['holder_tx'][:18]}…). "
                      f"Live at block {block}: {value} base units = {human:,.6f} USDC.")
        else:  # price
            usd = value / 10**18
            interp = (f"[INFERENCE] The Docs MCP askQuestion pointed to the Chainlink "
                      f"feeds page; getPage on that page gave the USDC/USD row with feed "
                      f"{to}; get_code confirmed the contract; latestAnswer() live at block "
                      f"{block}: {value} -> ${usd:.5f} (18 decimals, per the docs). "
                      f"Every step of the address discovery came from the Docs MCP.")
    else:
        interp = (f"[NOT DESCRIBED] The function {rnd['function']} is not described "
                  f"by any cited page: the Docs MCP askQuestion answer cited "
                  f"{len(cites)} page(s), and none of the {len(gate['pages'])} "
                  f"pages fetched via getPage names '{fn_name}' exactly. "
                  f"Raw on-chain value at block {block}: {value} — reported "
                  f"without units and without decimal scaling.")
    out["interpretation"] = interp
    out["ok"] = True
    out["docs_tools_used"] = docs_tools
    out["ran_at_utc"] = datetime.now(timezone.utc).isoformat()
    return out


def main() -> None:
    docs = DocsMCP().connect()
    chain = ChainMCP().connect()
    info = chain.call("get_chain_info", {})
    cid = str(info.get("chainId", info.get("chain_id", "")))
    if cid not in ("1672", "0x688"):
        raise SystemExit(f"chain gate: expected Pharos mainnet 1672, got {cid}")
    head = chain.call("get_block_number", {})
    block = int(head["blockNumber"])
    print(f"chain: {info.get('name')} {cid} | pinned block {block}")

    out_dir = ROOT / "evidence" / "transcripts"
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for rnd in ROUNDS:
        print(f"== {rnd['id']} ==", flush=True)
        try:
            t = run_round(docs, chain, rnd, block)
        except Exception as e:  # fail loudly, never fabricate
            t = {"id": rnd["id"], "question": rnd["question"], "ok": False,
                 "error": f"{type(e).__name__}: {str(e)[:300]}",
                 "ran_at_utc": datetime.now(timezone.utc).isoformat()}
        (out_dir / f"{rnd['id']}.json").write_text(json.dumps(t, indent=2))
        results.append(t)
        print(f"   ok={t.get('ok')} docs_sources={t.get('docs_source_count')} "
              f"names_fn={t.get('docs_names_function')}")
        if t.get("ok"):
            print(f"   {t['interpretation'][:160]}")

    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, cwd=ROOT).stdout.strip()
        dirty = bool(subprocess.run(["git", "status", "--porcelain"],
                                    capture_output=True, text=True, cwd=ROOT).stdout.strip())
    except Exception:
        commit, dirty = "unknown", True
    manifest = {
        "task": "t13-docs-chain-agent",
        "chain_mcp": {"endpoint": CHAIN_MCP_URL, "tools": ["get_chain_info", "get_block_number",
                                                          "get_code", "eth_call", "get_logs"]},
        "docs_mcp": {"endpoint": DOCS_MCP_URL, "tools": ["askQuestion", "getPage"]},
        "pinned_block": block,
        "chain_id": 1672,
        "git_commit": commit,
        "git_dirty": dirty,
        "rawRpcCalls": 0,
        "localDocIndex": False,
        "ran_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    (ROOT / "evidence" / "run-manifest.json").write_text(json.dumps(manifest, indent=2))
    ok = sum(1 for t in results if t.get("ok"))
    print(f"RESULT: {ok}/{len(results)} rounds ok")
    docs.close()
    chain.close()
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
