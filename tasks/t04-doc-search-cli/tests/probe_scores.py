#!/usr/bin/env python3
"""Probe top BM25 scores for calibration queries."""
import json, subprocess, sys
qs = [
    "how do I deploy a contract?",
    "what is the Atlantic testnet chain id and RPC url",
    "how do I get testnet tokens for gas",
    "which oracle should I use for price feeds on Pharos",
    "how do I bridge USDC from Ethereum to Pharos",
    "what is the birthday of the Pharos CEO",
    "how do I run a Pharos node on a Raspberry Pi",
    "does Pharos support confidential transactions",
    "how many transactions per second does Pharos do",
    "how do I install the Pharos MCP server",
]
for q in qs:
    r = subprocess.run(["./pharos-docs", "--json", q], capture_output=True, text=True)
    d = json.loads(r.stdout)
    top = [(c["score"], c["page_title"]) for c in d["citations"][:2]]
    print(f"exit={r.returncode} label={d['label']}")
    print(f"  Q: {q}")
    print(f"  top: {top}")
