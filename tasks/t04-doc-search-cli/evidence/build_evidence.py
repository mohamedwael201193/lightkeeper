#!/usr/bin/env python3
"""Build evidence.json from individually-captured CLI runs.

Runs each battery query via the CLI (--json --raw-log). Successful runs are
saved immediately (JSON to evidence/json/<id>.json, raw MCP text to
evidence/raw/<id>.txt). evidence.json is rebuilt from all successful captures.
Failed queries are reported; re-run this script to fill gaps during a good
server patch. Idempotent: skips queries that already have a good capture
unless --force is given.
"""
import json
import os
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(BASE, "pharos-docs")
JSON_DIR = os.path.join(BASE, "evidence", "json")
RAW_DIR = os.path.join(BASE, "evidence", "raw")
OUT = os.path.join(BASE, "evidence", "evidence.json")
MCP_ENDPOINT = "https://docs.pharos.xyz/~gitbook/mcp"

QUERIES = [
    ("E1", "how do I deploy a contract on Pharos?", "search", "DOC-GROUNDED"),
    ("E2", "what is the Atlantic testnet chain id and RPC url", "search", "DOC-GROUNDED"),
    ("E3", "where do I get testnet tokens for gas on Pharos", "ask", "DOC-GROUNDED"),
    ("E7", "what is the Atlantic testnet chain id", "ask", "DOC-GROUNDED"),
    ("E8", "https://docs.pharos.xyz/getting-started/network/atlantic-testnet",
     "page", "DOC-GROUNDED"),
    ("M1", "what is the birthday of the Pharos CEO", "search", "UNVERIFIED"),
    ("M2", "how do I run a Pharos node on a Raspberry Pi", "search", "UNVERIFIED"),
]

FORCE = "--force" in sys.argv


def capture(qid, query, mode):
    os.makedirs(JSON_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)
    json_path = os.path.join(JSON_DIR, qid + ".json")
    raw_path = os.path.join(RAW_DIR, qid + ".txt")
    if not FORCE and os.path.exists(json_path) and os.path.exists(raw_path):
        d = json.load(open(json_path, encoding="utf-8"))
        print(f"[{qid}] cached: {d.get('label')}")
        return d
    if mode == "search":
        cmd = [CLI, "--json", "--raw-log", raw_path, query]
    elif mode == "ask":
        cmd = [CLI, "--json", "--ask", "--raw-log", raw_path, query]
    else:
        cmd = [CLI, "--json", "--page", query, "--raw-log", raw_path]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    try:
        d = json.loads(r.stdout)
    except json.JSONDecodeError:
        print(f"[{qid}] FAILED (exit={r.returncode}): {r.stderr[:120]}")
        return None
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
    print(f"[{qid}] captured: {d.get('label')} exit={d.get('exit_code')}")
    return d


def main():
    captures = {}
    for i, (qid, query, mode, expect) in enumerate(QUERIES):
        if i > 0:
            time.sleep(15)  # politeness
        d = capture(qid, query, mode)
        if d is not None:
            captures[qid] = (d, expect, mode, query)

    records = []
    for qid, query, mode, expect in QUERIES:
        if qid not in captures:
            records.append({"id": qid, "query": query, "mode": mode,
                            "expected": expect, "label": "NOT-CAPTURED",
                            "expectation_check": "FAIL-EXPECTATION"})
            continue
        d, _, _, _ = captures[qid]
        got = d["label"]
        records.append({
            "id": qid, "query": query, "mode": mode, "expected": expect,
            "label": got,
            "expectation_check": "PASS" if got == expect else "FAIL-EXPECTATION",
            "exit_code": d.get("exit_code"),
            "mcp_endpoint": d.get("mcp_endpoint", MCP_ENDPOINT),
            "mcp_tool": d.get("mcp_tool"),
            "retrieved": d.get("retrieved"),
            "citations": d.get("citations", []),
            "closest_pages": d.get("closest_pages", []),
            "note": d.get("note"),
            "answer": d.get("answer"),
            "raw_log": os.path.relpath(os.path.join(RAW_DIR, qid + ".txt"), BASE),
            "stdout": json.dumps(d, indent=2, ensure_ascii=False),
        })

    import datetime
    doc = {
        "task": "T04",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "mcp_endpoint": MCP_ENDPOINT,
        "method": "every query is a real tools/call round-trip against the "
                  "Developer Docs MCP; raw responses saved verbatim under evidence/raw/",
        "records": records,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
    ok = sum(1 for r in records if r["expectation_check"] == "PASS")
    missing = [r["id"] for r in records if r["expectation_check"] != "PASS"]
    print(f"evidence.json: {ok}/{len(records)} PASS; missing: {missing}")
    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main())
