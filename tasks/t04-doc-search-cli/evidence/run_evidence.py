#!/usr/bin/env python3
"""Run the T04 evidence query battery against the live-built index.

Writes evidence/evidence.json with one record per query:
{query, exit_code, label, stdout, citations:[{page_title, section, page_url, retrieved, score}]}.
Read-only; zero spend. evidence.md embeds the stdout transcripts verbatim.
"""
import json
import os
import subprocess

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(BASE, "pharos-docs")
OUT = os.path.join(BASE, "evidence", "evidence.json")

QUERIES = [
    # (id, query, expectation)
    ("E1", "how do I deploy a contract?", "DOC-GROUNDED"),
    ("E2", "what is the Atlantic testnet chain id and RPC url", "DOC-GROUNDED"),
    ("E3", "how do I get testnet tokens for gas", "DOC-GROUNDED"),
    ("E4", "which oracle should I use for price feeds on Pharos", "DOC-GROUNDED"),
    ("E5", "how do I bridge USDC from Ethereum to Pharos", "DOC-GROUNDED"),
    ("E6", "does Pharos support confidential transactions", "DOC-GROUNDED"),
    ("E7", "how do I install the Pharos MCP server", "DOC-GROUNDED"),
    ("M1", "what is the birthday of the Pharos CEO", "UNVERIFIED"),
    ("M2", "how do I run a Pharos node on a Raspberry Pi", "UNVERIFIED"),
]

idx = json.load(open(os.path.join(BASE, "index", "index.json"), encoding="utf-8"))
records = []
for qid, q, expect in QUERIES:
    r = subprocess.run([CLI, "--json", q], capture_output=True, text=True, timeout=120)
    d = json.loads(r.stdout)
    got = d["label"]
    status = "PASS" if got == expect else "FAIL-EXPECTATION"
    records.append({
        "id": qid,
        "query": q,
        "expected": expect,
        "label": got,
        "expectation_check": status,
        "exit_code": r.returncode,
        "stdout": r.stdout,
        "citations": d["citations"],
        "note": d.get("note"),
    })
    print(f"{qid} exit={r.returncode} label={got} expected={expect} -> {status}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc = {
    "generated": "2026-10-16",
    "corpus_retrieved": idx["built_from"]["retrieved"],
    "index_passages": idx["passage_count"],
    "queries": records,
}
json.dump(doc, open(OUT, "w", encoding="utf-8"), indent=2)
print("wrote", OUT)
