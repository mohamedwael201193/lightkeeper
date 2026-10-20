#!/usr/bin/env python3
"""WS3 bet F — run the full fleet grounding audit LIVE.

Three batteries, all against live endpoints at audit time:
  quotes  — re-fetch each cited docs page via the Docs MCP, assert verbatim.
  bait    — ask 6 invented-topic questions via askQuestion; a non-refusing
            answer is a hallucination FAIL (transcript published verbatim).
  onchain — pin one Chain MCP block, record eth_call/get_code results, then
            re-issue at the SAME pinned block: exact match required.

Writes packages/docs-grounding/fleet-scorecard.json + fleet-scorecard.md.
Exit 0 only when no check ERRORS (FAILs are honest, recorded, and listed —
they do not zero the exit; the scorecard is the deliverable). sendFeedback
is never called (auditor allowlist + hard block).
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
for _lib in ("docs-grounding", "chain-data"):
    sys.path.insert(0, os.path.join(HERE, "py") if _lib == "docs-grounding"
                    else os.path.join(os.path.dirname(HERE), _lib, "py"))

from lightkeeper_docs_grounding.auditor import (  # noqa: E402
    DocsMCP, build_scorecard, onchain_reread, render_scorecard_md,
    reverify_quotes, run_bait_battery)
from lightkeeper_chain_data import ChainMCP, assert_chain_id  # noqa: E402

ATLANTIC_PAGE = "https://docs.pharos.xyz/getting-started/network/atlantic-testnet"
FEEDS_PAGE = "https://docs.pharos.xyz/tooling-and-infrastructure/oracles/chainlink-pe"

# Verbatim quotes harvested from the live pages (fetched 2026-10-20 via the
# Docs MCP itself); battery 1 re-asserts they are STILL verbatim at audit time.
QUOTES = [
    {"task": "t04", "check_id": "Q1", "source_url": ATLANTIC_PAGE,
     "quote": "| ChainID | 688689 |"},
    {"task": "t04", "check_id": "Q2", "source_url": ATLANTIC_PAGE,
     "quote": "| RPC Public Endpoint | <https://atlantic.dplabs-internal.com> |"},
    {"task": "t13", "check_id": "Q3", "source_url": FEEDS_PAGE,
     "quote": "0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d"},
    {"task": "t13", "check_id": "Q4", "source_url": FEEDS_PAGE,
     "quote": "allowing any on-chain consumer to read the latest price via `latestAnswer()`"},
    {"task": "t13", "check_id": "Q5", "source_url": FEEDS_PAGE,
     "quote": "Pharos has deployed Chainlink self-managed price feeds using "
              "the Chainlink Runtime Environment (CRE)."},
]

USDC = "0xc879c018db60520f4355c26ed1a6d572cdac1815"
FEED = "0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d"
DECIMALS_SEL = "0x313ce567"
TOTALSUPPLY_SEL = "0x18160ddd"
LATESTANSWER_SEL = "0x50d25bcd"


def main():
    docs = DocsMCP().connect()
    print(f"docs mcp: {docs.server_info}")
    chain = ChainMCP(client_name="lk-grounding-auditor").connect()
    try:
        info = chain.get_chain_info()
        assert_chain_id(info.get("chainId"), 1672, what="audit chain")
        pinned = chain.get_block_number()
        print(f"chain: {info.get('name')} 1672 | pinned block {pinned}")

        # --- battery 1: quotes -------------------------------------
        print("battery 1/3: quote re-verification")
        results = reverify_quotes(QUOTES, docs.get_page_text)

        # --- battery 2: bait ----------------------------------------
        print("battery 2/3: hallucination-refusal bait (6 questions)")
        results += run_bait_battery(docs.ask, task="fleet")

        # --- battery 3: independent on-chain re-read ----------------
        print("battery 3/3: pinned-block on-chain re-read")

        def eth_call(addr, data, block):
            return chain.call("eth_call", {"transaction": {"to": addr, "data": data},
                                           "block": block})

        recorded = [
            ("C1", USDC, DECIMALS_SEL),
            ("C2", USDC, TOTALSUPPLY_SEL),
            ("C3", FEED, LATESTANSWER_SEL),
        ]
        checks = []
        for cid, addr, data in recorded:
            res = eth_call(addr, data, pinned)
            checks.append({"task": "t13", "check_id": cid, "tool": "eth_call",
                           "arguments": {"transaction": {"to": addr, "data": data},
                                         "block": pinned},
                           "recorded_result": res})
        results += onchain_reread(checks, lambda tool, args: chain.call(tool, args))
    finally:
        chain.close()

    commit = "unknown"
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, cwd=HERE,
                                timeout=10).stdout.strip() or "unknown"
    except Exception:
        pass
    card = build_scorecard(results, f"run_fleet_audit.py @ {commit}")
    with open(os.path.join(HERE, "fleet-scorecard.json"), "w") as f:
        json.dump(card, f, indent=2, ensure_ascii=False)
    with open(os.path.join(HERE, "fleet-scorecard.md"), "w") as f:
        f.write(render_scorecard_md(card))

    errs = [r for r in results if r.verdict == "ERROR"]
    fails = [r for r in results if r.verdict == "FAIL"]
    print("=" * 60)
    print(f"SCORE: {card['score_pct']}% "
          f"({card['checks_passed']}/{card['checks_scored']} passed; "
          f"{len(fails)} FAIL, {len(errs)} ERROR)")
    for r in fails:
        print(f"  FAIL {r.task}/{r.check_id}: {r.detail}")
    for r in errs:
        print(f"  ERROR {r.task}/{r.check_id}: {r.detail}")
    print("wrote fleet-scorecard.json / .md")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
