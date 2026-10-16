#!/usr/bin/env python3
"""
T25 — dApp Support Agent (LIGHTKEEPER, Pharos Agent Arena).

TWO real capabilities, zero improvisation:
  1. diagnose <txhash>  — live on-chain failure diagnosis on Pharos Atlantic.
  2. account  <address>  — live account lookup (balance, tx count, recent activity).
  3. ask <question>      — doc-grounded Q&A from a local KB built from real
                           Pharos doc page fetches (2026-10-16). Every claim is
                           labeled DOC-GROUNDED / INFERENCE / UNVERIFIED.
                           If the docs don't cover it, the agent SAYS SO.

Stdlib only. Read-only by default: diagnose/account/ask never broadcast.
Atlantic testnet only (chain id 688689). Secrets: none in this file; the RPC
URL is read from $ATLANTIC_RPC_URL.

Usage:
  python3 support_agent.py diagnose 0x<txhash> [--json]
  python3 support_agent.py account  0x<address> [--json] [--blocks N]
  python3 support_agent.py ask "your question" [--json]
"""
import json
import os
import re
import sys
import urllib.request

CHAIN_ID = 688689
CHAIN_NAME = "Pharos Atlantic testnet"
EXPLORER = "https://atlantic.pharosscan.xyz"
HERE = os.path.dirname(os.path.abspath(__file__))
KB_PATH = os.path.join(HERE, "kb.json")

SEL_ERROR_STRING = "0x08c379a0"   # Error(string)
SEL_PANIC = "0x4e487b71"          # Panic(uint256)
SEL_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4c4a657a90ffc68a99"
SEL_TRANSFERFROM = "0x23b872dd"
SEL_ALLOWANCE = "0xdd62ed3e"
SEL_BALANCEOF = "0x70a08231"

PANIC_MEANINGS = {
    0x01: "assert() failed — an internal invariant was violated",
    0x11: "arithmetic overflow/underflow",
    0x12: "division or modulo by zero",
    0x21: "invalid enum value conversion",
    0x22: "incorrectly encoded storage byte array access",
    0x31: "pop() called on an empty array",
    0x32: "array index out of bounds (or negative fixed-bytes index)",
    0x41: "tried to allocate too much memory or created an oversized array",
    0x51: "called a zero-initialized internal function pointer",
}

STOPWORDS = set(
    "a an the and or of to in on for is are was were be been what how why when "
    "where which who whom whose do does did can could should would will with by "
    "at from as it its this that these those i my me we our you your he she they "
    "them his her their there here than then so such no not yes if else than pharos".split()
)
# NOTE: "pharos" is a stopword for retrieval scoring — every KB entry is about
# Pharos, so it carries zero discriminative power and caused false matches.


# ---------------------------------------------------------------- RPC client
def _rpc_url():
    url = os.environ.get("ATLANTIC_RPC_URL")
    if not url:
        raise SystemExit("ATLANTIC_RPC_URL is not set (source ~/workspace/lightkeeper/.env first)")
    return url


def rpc(method, params, timeout=45):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(_rpc_url(), data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            out = json.loads(resp.read().decode())
    except Exception as e:
        raise SystemExit(f"RPC call {method} failed: {e}")
    if isinstance(out, dict) and "error" in out:
        return {"_rpc_error": out["error"]}
    return out.get("result")


def h2i(h):
    return int(h, 16) if isinstance(h, str) else int(h)


def wei_to_phrs(w):
    return w / 1e18


def fmt_phrs(w):
    return f"{wei_to_phrs(w):.6f} PHRS"


def explorer_tx(h):
    return f"{EXPLORER}/tx/{h}"


def explorer_addr(a):
    return f"{EXPLORER}/address/{a}"


# ------------------------------------------------------------- revert decode
def decode_revert(data):
    """Decode EVM revert data. Returns (kind, detail, label)."""
    if not data or data in ("0x", "0X"):
        return ("revert_no_data", "The contract reverted but returned no reason data.", "DOC-GROUNDED")
    d = data.lower()
    if d.startswith(SEL_ERROR_STRING):
        try:
            payload = bytes.fromhex(d[10:])
            length = int.from_bytes(payload[32:64], "big")
            reason = payload[64:64 + length].decode("utf-8", errors="replace")
            return ("revert_with_reason", reason, "DOC-GROUNDED")
        except Exception:
            return ("revert_malformed_error", "Error(string) selector present but payload malformed.", "INFERENCE")
    if d.startswith(SEL_PANIC):
        try:
            code = int(d[10:74], 16)
            meaning = PANIC_MEANINGS.get(code, f"unknown panic code 0x{code:02x}")
            return ("revert_panic", f"Panic(0x{code:02x}): {meaning}.", "INFERENCE")
        except Exception:
            return ("revert_malformed_panic", "Panic selector present but payload malformed.", "INFERENCE")
    return ("revert_custom", f"Custom error / unknown revert, selector {d[:10]} (reported honestly — no decoder available).", "DOC-GROUNDED")


def eth_call_replay(tx, block_minus_1):
    """Replay the tx's call at block-1 to capture revert data. Read-only."""
    call = {
        "from": tx["from"],
        "to": tx.get("to"),
        "data": tx.get("input", "0x"),
        "value": tx.get("value", "0x0"),
        "gas": tx.get("gas", "0x7a1200"),
    }
    if not call["to"]:
        return None  # contract creation: no replay target
    res = rpc("eth_call", [call, hex(block_minus_1)])
    if isinstance(res, dict) and "_rpc_error" in res:
        return res["_rpc_error"].get("data") or res["_rpc_error"].get("message")
    return res  # success data (rare: means state changed between blocks)

# ------------------------------------------------------------------ diagnose
def cmd_diagnose(txhash, as_json):
    txhash = txhash.lower()
    if not re.fullmatch(r"0x[0-9a-f]{64}", txhash):
        return _emit({"verdict": "bad_input",
                      "plain": f"'{txhash}' is not a valid 32-byte transaction hash."}, as_json)

    tx = rpc("eth_getTransactionByHash", [txhash])
    if isinstance(tx, dict) and "_rpc_error" in tx:
        tx = None
    if not tx:
        return _emit({
            "verdict": "not_found",
            "tx": txhash,
            "chain": f"{CHAIN_NAME} (chain id {CHAIN_ID})",
            "plain": ("No transaction with this hash exists on " + CHAIN_NAME + ". "
                      "Either the hash is wrong, the tx was never broadcast, or it was "
                      "broadcast on a different network. Fix: re-copy the hash from your "
                      "wallet's activity tab and check the network is Atlantic (chain id 688689)."),
            "explorer": explorer_tx(txhash),
            "label": "DOC-GROUNDED — absence of a record is a direct chain read.",
        }, as_json)

    receipt = rpc("eth_getTransactionReceipt", [txhash])
    if isinstance(receipt, dict) and "_rpc_error" in receipt:
        receipt = None
    if not receipt:
        return _emit({
            "verdict": "pending_or_dropped",
            "tx": txhash,
            "from": tx["from"],
            "plain": ("The transaction is known to the node but has no receipt yet: it is "
                      "sitting in the mempool unmined, or it was dropped and replaced. "
                      "The public RPC cannot distinguish the two — that is an honest "
                      "unknown, not a guess. Fix: wait a few blocks and re-check; if it "
                      "never mines, rebroadcast with a higher gas price."),
            "explorer": explorer_tx(txhash),
            "label": "INFERENCE — mempool state is not provable from public RPC alone.",
        }, as_json)

    block = h2i(tx["blockNumber"])
    status = h2i(receipt["status"])
    gas_limit = h2i(tx["gas"])
    gas_used = h2i(receipt["gasUsed"])
    price = h2i(tx.get("gasPrice") or tx.get("maxFeePerGas") or "0x0")
    fee_wei = gas_used * price
    value_wei = h2i(tx.get("value", "0x0"))
    prev = block - 1

    base = {
        "tx": txhash,
        "chain": f"{CHAIN_NAME} (chain id {CHAIN_ID})",
        "from": tx["from"],
        "to": tx.get("to"),
        "block": block,
        "status": status,
        "gas_limit": gas_limit,
        "gas_used": gas_used,
        "fee_phrs": round(wei_to_phrs(fee_wei), 9),
        "value_phrs": round(wei_to_phrs(value_wei), 9),
        "explorer": explorer_tx(txhash),
    }

    if status == 1:
        base.update({
            "verdict": "success",
            "plain": (f"Good news — your transaction SUCCEEDED at block {block}. It used "
                      f"{gas_used:,} of {gas_limit:,} gas, costing {fmt_phrs(fee_wei)} in fees. "
                      + (f"It moved {fmt_phrs(value_wei)}. " if value_wei else "") +
                      "No fix needed."),
            "label": "DOC-GROUNDED — receipt status is a direct chain read.",
        })
        return _emit(base, as_json)

    # ---- status == 0: failed. Branch into causes.
    # Branch A: insufficient native balance for value + max fee (pre-condition read at block-1)
    if value_wei > 0 and price > 0:
        bal = h2i(rpc("eth_getBalance", [tx["from"], hex(prev)]) or "0x0")
        need = value_wei + gas_limit * price
        if bal < need:
            short = need - bal
            base.update({
                "verdict": "insufficient_balance",
                "balance_at_block_minus_1_phrs": round(wei_to_phrs(bal), 9),
                "needed_phrs": round(wei_to_phrs(need), 9),
                "plain": (f"Your transaction FAILED at block {block} because the sender did not hold enough PHRS. "
                          f"At block {prev} the wallet held {fmt_phrs(bal)}, but the tx needed "
                          f"{fmt_phrs(need)} ({fmt_phrs(value_wei)} value + up to {fmt_phrs(gas_limit * price)} max fee). "
                          f"Shortfall: {fmt_phrs(short)}. Fix: fund the wallet with at least {fmt_phrs(short)} more PHRS, "
                          "or lower the amount / gas limit, then resend."),
                "label": "DOC-GROUNDED — balance and receipt are direct chain reads at block-1.",
            })
            return _emit(base, as_json)

    # Branch B: out of gas (all gas consumed)
    if gas_used == gas_limit:
        base.update({
            "verdict": "out_of_gas",
            "plain": (f"Your transaction FAILED at block {block} with OUT OF GAS: it consumed all "
                      f"{gas_limit:,} gas supplied (gasUsed == gasLimit) and still hadn't finished. "
                      "The EVM deducts the full gas limit up front, so a limit set exactly at the "
                      "needed amount can also fail before refunds apply. "
                      "Fix: resend the same transaction with a higher gas limit — start with 1.5–2x, "
                      "e.g. "
                      f"{int(gas_limit * 1.5):,} instead of {gas_limit:,}. Unused gas is refunded, so "
                      "overshooting the limit slightly is safe."),
            "label": "DOC-GROUNDED — gasUsed == gasLimit is a direct receipt read; "
                     "refund mechanics cited from the Pharos FAQ (see citation below).",
            "citation": {"source": "https://docs.pharos.xyz/getting-started/faqs.md",
                         "fetched": "2026-10-16",
                         "excerpt": "If the gas limit is set too tightly (equal to the actual gas used before "
                                    "refunds), the refund cannot be processed and the transaction fails with an "
                                    "out-of-gas error. ... set the gas limit slightly higher than the expected gas usage."},
        })
        return _emit(base, as_json)

    # Branch C: transferFrom with insufficient allowance / token balance (pre-condition reads at block-1)
    to_code = ""
    if tx.get("to"):
        to_code = rpc("eth_getCode", [tx["to"], hex(prev)]) or "0x"
    data = (tx.get("input") or "0x").lower()
    if to_code not in ("0x", "") and data.startswith(SEL_TRANSFERFROM) and len(data) >= 138:
        owner = "0x" + data[10:74][-40:]
        spender = tx["from"]
        amount = int(data[74:138], 16)
        allow_data = SEL_ALLOWANCE + owner[2:].rjust(64, "0") + spender[2:].rjust(64, "0")
        bal_data = SEL_BALANCEOF + owner[2:].rjust(64, "0")
        allow_raw = rpc("eth_call", [{"to": tx["to"], "data": allow_data}, hex(prev)])
        tbal_raw = rpc("eth_call", [{"to": tx["to"], "data": bal_data}, hex(prev)])
        try:
            allowance = h2i(allow_raw) if not (isinstance(allow_raw, dict)) else None
        except Exception:
            allowance = None
        try:
            tbalance = h2i(tbal_raw) if not (isinstance(tbal_raw, dict)) else None
        except Exception:
            tbalance = None
        if allowance is not None and amount > allowance:
            base.update({
                "verdict": "insufficient_allowance",
                "owner": owner, "spender": spender,
                "plain": (f"Your transaction FAILED at block {block}: the token contract rejected transferFrom "
                          f"because the allowance was too small. At block {prev}, {owner} had approved the spender "
                          f"for {allowance} token-units but the tx tried to move {amount}. "
                          f"Fix: call approve(spender, >= {amount}) from the owner's wallet first, then retry the transfer."),
                "label": "DOC-GROUNDED — allowance/balance are direct eth_call reads at block-1.",
            })
            return _emit(base, as_json)
        if tbalance is not None and amount > tbalance:
            base.update({
                "verdict": "insufficient_token_balance",
                "owner": owner,
                "plain": (f"Your transaction FAILED at block {block}: the owner only held {tbalance} token-units "
                          f"at block {prev} but the tx tried to move {amount}. "
                          "Fix: reduce the amount or fund the owner address with more tokens, then retry."),
                "label": "DOC-GROUNDED — balanceOf is a direct eth_call read at block-1.",
            })
            return _emit(base, as_json)

    # Branch D: generic revert — replay at block-1, decode revert data
    replay = eth_call_replay(tx, prev)
    if isinstance(replay, str) and replay.startswith("0x"):
        kind, detail, dlabel = decode_revert(replay)
    elif replay is None and not tx.get("to"):
        kind, detail, dlabel = ("revert_contract_creation",
                                "Contract creation reverted; replay target unavailable — inspect constructor args.", "INFERENCE")
    elif isinstance(replay, str):
        kind, detail, dlabel = ("revert_no_data", f"The contract reverted; the node returned message: {replay[:160]}", "INFERENCE")
    else:
        kind, detail, dlabel = ("revert_state_changed",
                                "Replay at block-1 unexpectedly succeeded — chain state moved between blocks; "
                                "the revert is real on the mined receipt.", "INFERENCE")

    if kind == "revert_with_reason":
        fix = (f"Fix: the contract itself refused the call with reason \"{detail}\". Read the contract's docs or "
               "source for that exact message — it names the failed requirement (e.g. wrong phase, cap reached, "
               "bad parameter). Adjust your inputs to satisfy it and resend.")
    elif kind == "revert_panic":
        fix = ("Fix: this is a low-level Solidity panic — almost always a bug in the CALLER's inputs or the "
               "contract's assumptions (e.g. math overflow, array out of bounds). Double-check array indices and "
               "amounts; if the contract is yours, add a require() with a message at the suspect line.")
    elif kind == "revert_no_data":
        fix = ("Fix: the contract reverted silently. If it's yours, add require() messages; if it's a third-party "
               "contract, check its docs for preconditions (paused? allowlist? deadline passed?) and simulate with "
               "eth_call before resending.")
    else:
        fix = ("Fix: unknown revert shape — inspect the contract source around the failing call and simulate with "
               "eth_call to reproduce before resending.")

    base.update({
        "verdict": kind,
        "revert_detail": detail,
        "plain": (f"Your transaction FAILED at block {block}: the contract reverted. {detail} "
                  f"It still cost {fmt_phrs(fee_wei)} in gas (failed txs pay for work done). {fix}"),
        "label": dlabel + " — revert data captured by eth_call replay at block-1, decoded locally.",
    })
    return _emit(base, as_json)

# ------------------------------------------------------------------- account
def cmd_account(address, as_json, window=500):
    address = address.lower()
    if not re.fullmatch(r"0x[0-9a-f]{40}", address):
        return _emit({"verdict": "bad_input",
                      "plain": f"'{address}' is not a valid 20-byte address."}, as_json)
    bal = h2i(rpc("eth_getBalance", [address, "latest"]) or "0x0")
    nonce = h2i(rpc("eth_getTransactionCount", [address, "latest"]) or "0x0")
    code = rpc("eth_getCode", [address, "latest"]) or "0x"
    is_contract = code not in ("0x", "")
    latest = h2i(rpc("eth_blockNumber", []) or "0x0")
    from_blk = max(latest - window, 0)
    addr_topic = "0x000000000000000000000000" + address[2:]

    activity = []
    coverage_note = (f"Activity window: last {window} blocks ({from_blk}–{latest}). "
                     "Only ERC-20 Transfer events are scanned — plain PHRS transfers emit no logs, "
                     "so they cannot appear here. That is an honest coverage limit.")
    try:
        for topics in ([[SEL_TRANSFER, addr_topic], [SEL_TRANSFER, None, addr_topic]]):
            logs = rpc("eth_getLogs", [{"fromBlock": hex(from_blk), "toBlock": "latest", "topics": topics}]) or []
            for lg in logs:
                try:
                    frm = "0x" + lg["topics"][1][-40:]
                    to = "0x" + lg["topics"][2][-40:]
                    val = h2i(lg["data"])
                    activity.append({"token": lg["address"], "from": frm, "to": to,
                                     "value_raw": val, "block": h2i(lg["blockNumber"]),
                                     "tx": lg["transactionHash"]})
                except Exception:
                    continue
    except SystemExit:
        coverage_note += " Log scan failed partway; results below are partial."
    seen = set()
    dedup = []
    for a in sorted(activity, key=lambda x: -x["block"]):
        k = (a["tx"], a["token"])
        if k not in seen:
            seen.add(k)
            dedup.append(a)
    recent = dedup[:10]

    direction_bits = []
    for a in recent:
        d = "in" if a["to"] == address else "out"
        direction_bits.append(f"{d} {a['value_raw']} units of token {a['token']} @ block {a['block']} ({explorer_tx(a['tx'])})")

    base = {
        "verdict": "account_report",
        "address": address,
        "chain": f"{CHAIN_NAME} (chain id {CHAIN_ID})",
        "balance_phrs": round(wei_to_phrs(bal), 9),
        "tx_count_nonce": nonce,
        "is_contract": is_contract,
        "recent_transfers": recent,
        "coverage": coverage_note,
        "explorer": explorer_addr(address),
        "label": "DOC-GROUNDED — balance, nonce, code and logs are direct chain reads.",
    }
    kind = "contract" if is_contract else "wallet (EOA)"
    base["plain"] = (
        f"Account {address} on {CHAIN_NAME} is a {kind}. Balance: {fmt_phrs(bal)}. "
        f"Transaction count (nonce): {nonce}. "
        + (f"Recent ERC-20 activity ({len(recent)} shown): " + "; ".join(direction_bits) + ". "
           if recent else "No ERC-20 Transfer events involving this address in the scanned window. ")
        + coverage_note)
    return _emit(base, as_json)


# --------------------------------------------------------------- doc-grounded Q&A
def _tokens(s):
    return [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in STOPWORDS and len(t) > 1]


def cmd_ask(question, as_json):
    try:
        kb = json.load(open(KB_PATH, encoding="utf-8"))
    except Exception as e:
        return _emit({"verdict": "kb_missing", "plain": f"Knowledge base unreadable: {e}"}, as_json)
    qtok = set(_tokens(question))
    scored = []
    for e in kb["entries"]:
        ktok = set(_tokens(e["title"] + " " + " ".join(e["keywords"]) + " " + e["excerpt"]))
        hit = qtok & ktok
        # phrase-level bonus for multi-word keyword matches
        bonus = sum(1 for k in e["keywords"] if k.lower() in question.lower())
        scored.append((len(hit) + 2 * bonus, e, sorted(hit)))
    scored.sort(key=lambda x: -x[0])
    best_score, best, hits = scored[0]

    if best_score < 2:
        return _emit({
            "verdict": "not_covered",
            "question": question,
            "plain": ("I don't have a doc-grounded answer for that. My knowledge base is built from the real "
                      "Pharos docs pages I fetched on 2026-10-16 (llms.txt index, Atlantic Testnet page, FAQs, "
                      "SkillEngine networks.json), and none of them cover your question. I won't improvise — "
                      "ask about Atlantic network parameters, the native token, gas failures, or recommended "
                      "tooling (RPC/oracles/bridges/wallets/dev frameworks), or point me at the doc page to add."),
            "label": "UNVERIFIED — coverage gap, stated honestly instead of improvised.",
            "kb_coverage": [e["id"] for e in kb["entries"]],
        }, as_json)

    citation = {"source": best["url"], "fetched": best["fetched"],
                "excerpt": best["excerpt"], "title": best["title"]}
    return _emit({
        "verdict": "answered",
        "question": question,
        "matched_entry": best["id"],
        "matched_terms": hits,
        "plain": best["excerpt"],
        "citation": citation,
        "label": "DOC-GROUNDED — answer is a direct excerpt from the cited doc page (URL + fetch date + excerpt).",
    }, as_json)


# --------------------------------------------------------------------- output
def _emit(obj, as_json):
    if as_json:
        print(json.dumps(obj, indent=2))
    else:
        v = obj.get("verdict", "")
        print(f"[t25 support-agent] verdict: {v}")
        for k in ("tx", "address", "block", "status", "gas_used", "gas_limit",
                  "fee_phrs", "value_phrs", "balance_phrs", "tx_count_nonce",
                  "is_contract", "revert_detail"):
            if k in obj:
                print(f"  {k}: {obj[k]}")
        print()
        print(obj.get("plain", ""))
        print()
        if obj.get("citation"):
            c = obj["citation"]
            print(f"Citation [{obj.get('label','')}]\n  source : {c['source']}\n  fetched: {c['fetched']}\n  excerpt: {c['excerpt']}")
        else:
            print(f"Label: {obj.get('label', '')}")
        if obj.get("explorer"):
            print(f"Explorer: {obj['explorer']}")
        if obj.get("coverage"):
            print(f"Coverage: {obj['coverage']}")
    return obj


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    cmd, target = argv[1], argv[2]
    as_json = "--json" in argv
    if cmd == "diagnose":
        cmd_diagnose(target, as_json)
    elif cmd == "account":
        window = 500
        for a in argv:
            if a.startswith("--blocks="):
                window = int(a.split("=", 1)[1])
        cmd_account(target, as_json, window)
    elif cmd == "ask":
        # allow multi-word question without quotes
        q = " ".join(a for a in argv[2:] if not a.startswith("--"))
        cmd_ask(q, as_json)
    else:
        print(f"unknown command '{cmd}'. Use: diagnose | account | ask")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
