#!/usr/bin/env python3
"""
T03 Docs MCP Onboarding — query-log runner.

Replays the documented onboarding queries against the real Pharos docs
surfaces and stores the verbatim question->answer log.

Surfaces used (all real, public):
  1. GitBook dynamic ask endpoint:  GET https://docs.pharos.xyz/<page>.md?ask=<q>&goal=<g>
     (the officially documented "query this documentation dynamically" interface;
      llms.txt lines 14-20). This is the only publicly reachable Docs-MCP-class
      surface. The portal-embedded chat on ai.pharos.xyz requires a wallet
      sign-in this agent cannot perform — that limitation is documented, not
      worked around.
  2. The plain .md docs pages themselves (answer = page content).

HONESTY RULES (hard-coded, not just documented):
  - Every response is stored VERBATIM (full body or truncation marker).
  - A non-200 response is recorded as an ATTEMPT with status code, never as an answer.
  - If a query cannot be answered from the docs, the log entry says so.
  - Nothing is invented, paraphrased-into-existence, or reconstructed.

Usage:
  python3 query_log.py run        # replay all queries in queries.json -> evidence/runs/<ts>.json
  python3 query_log.py check      # verify evidence.json exists and print stats
  python3 query_log.py links      # curl-test every link in LINKS.md -> evidence/link_check.json
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
QUERIES_FILE = os.path.join(TASK, "queries.json")
EVIDENCE_FILE = os.path.join(TASK, "evidence.json")
RUNS_DIR = os.path.join(TASK, "evidence", "runs")
LINKS_FILE = os.path.join(TASK, "LINKS.md")
LINK_CHECK_FILE = os.path.join(TASK, "evidence", "link_check.json")

DOCS_BASE = "https://docs.pharos.xyz"
ASK_TIMEOUT_S = 25
DELAY_BETWEEN_QUERIES_S = 6
MAX_BODY_STORE = 20000


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ask_docs(page, question, goal):
    """One honest query. Returns a log dict; never raises into fabrication."""
    url = (
        f"{DOCS_BASE}/{page}.md"
        f"?ask={urllib.parse.quote(question)}"
        f"&goal={urllib.parse.quote(goal)}"
    )
    entry = {
        "surface": "docs-pharos-xyz-ask",
        "page": page,
        "question": question,
        "goal": goal,
        "url": url,
        "attempted_at": now_iso(),
    }
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "lightkeeper-t03-query-log/1.0 (+evidence)"},
        )
        with urllib.request.urlopen(req, timeout=ASK_TIMEOUT_S) as resp:
            status = resp.status
            raw = resp.read(MAX_BODY_STORE + 1)
        entry["http_status"] = status
        truncated = len(raw) > MAX_BODY_STORE
        body = raw[:MAX_BODY_STORE].decode("utf-8", errors="replace")
        entry["body_truncated"] = truncated
        entry["body_verbatim"] = body
        entry["outcome"] = "ANSWERED" if status == 200 else f"ATTEMPTED-HTTP-{status}"
    except Exception as e:  # network error, timeout, etc. — recorded, never hidden
        entry["http_status"] = None
        entry["outcome"] = "ATTEMPTED-ERROR"
        entry["error"] = f"{type(e).__name__}: {e}"
    return entry


def cmd_run():
    with open(QUERIES_FILE) as f:
        queries = json.load(f)
    os.makedirs(RUNS_DIR, exist_ok=True)
    results = []
    for i, q in enumerate(queries):
        print(f"[{i+1}/{len(queries)}] {q['id']}: {q['question'][:60]}...", flush=True)
        results.append(ask_docs(q["page"], q["question"], q["goal"]))
        if i < len(queries) - 1:
            time.sleep(DELAY_BETWEEN_QUERIES_S)
    run = {
        "run_at": now_iso(),
        "runner": "scripts/query_log.py",
        "surface_note": (
            "GitBook ?ask= endpoint on docs.pharos.xyz (publicly reachable). "
            "Portal-embedded Docs MCP chat (ai.pharos.xyz) requires wallet sign-in "
            "and is not reachable by this runner — documented in evidence.md."
        ),
        "queries": results,
    }
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_path = os.path.join(RUNS_DIR, f"run-{ts}.json")
    with open(run_path, "w") as f:
        json.dump(run, f, indent=2)
    # evidence.json is the cumulative log (all runs concatenated)
    cumulative = []
    if os.path.exists(EVIDENCE_FILE):
        with open(EVIDENCE_FILE) as f:
            try:
                cumulative = json.load(f)
            except json.JSONDecodeError:
                cumulative = []
    if isinstance(cumulative, dict):
        cumulative = cumulative.get("runs", [])
    cumulative.append(run)
    with open(EVIDENCE_FILE, "w") as f:
        json.dump({"runs": cumulative}, f, indent=2)
    answered = sum(1 for r in results if r["outcome"] == "ANSWERED")
    print(f"run saved: {run_path}  ({answered}/{len(results)} ANSWERED)")


def cmd_check():
    if not os.path.exists(EVIDENCE_FILE):
        print("evidence.json MISSING")
        sys.exit(1)
    with open(EVIDENCE_FILE) as f:
        data = json.load(f)
    runs = data.get("runs", [])
    total = sum(len(r.get("queries", [])) for r in runs)
    answered = sum(
        1 for r in runs for q in r.get("queries", []) if q.get("outcome") == "ANSWERED"
    )
    print(f"runs={len(runs)} total_queries={total} answered={answered}")
    if total < 7:
        print("GATE: need >=7 documented queries")
        sys.exit(2)


def cmd_links():
    import re

    with open(LINKS_FILE) as f:
        text = f.read()
    raw_urls = re.findall(r"https?://[^\s)<>\]]+", text)
    urls = sorted({u.rstrip(".,;`*") for u in raw_urls})
    results = []
    for u in urls:
        try:
            req = urllib.request.Request(
                u,
                headers={"User-Agent": "lightkeeper-t03-link-check/1.0"},
                method="HEAD",
            )
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    code = resp.status
            except urllib.error.HTTPError as e:
                # some hosts reject HEAD; retry with GET
                if e.code in (403, 405):
                    req2 = urllib.request.Request(
                        u, headers={"User-Agent": "lightkeeper-t03-link-check/1.0"}
                    )
                    with urllib.request.urlopen(req2, timeout=20) as resp2:
                        code = resp2.status
                else:
                    code = e.code
            outcome = "OK" if code and code < 400 else f"HTTP-{code}"
        except Exception as e:
            outcome = f"ERROR {type(e).__name__}: {e}"
            code = None
        results.append({"url": u, "http": code, "outcome": outcome})
        print(f"{outcome:8s} {u}", flush=True)
    os.makedirs(os.path.dirname(LINK_CHECK_FILE), exist_ok=True)
    with open(LINK_CHECK_FILE, "w") as f:
        json.dump({"checked_at": now_iso(), "links": results}, f, indent=2)
    bad = [r for r in results if r["outcome"] != "OK"]
    print(f"{len(results)-len(bad)}/{len(results)} OK")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    {"run": cmd_run, "check": cmd_check, "links": cmd_links}[cmd]()
