#!/usr/bin/env python3
"""
T03 Docs MCP Onboarding — query-log runner (v2.0).

Replays the documented onboarding queries against the REAL Pharos Developer
Docs MCP — the public GitBook MCP endpoint at
https://docs.pharos.xyz/~gitbook/mcp — via MCP Streamable HTTP
(JSON-RPC 2.0 over POST, SSE response frames) and stores the verbatim
question -> answer log.

Tool used: `askQuestion` (question + goal). `sendFeedback` is NEVER invoked
(it would file a real report to the Pharos docs team).

HONESTY RULES (hard-coded, not just documented):
  - Every answer is stored VERBATIM (full text, never paraphrased).
  - The exact JSON-RPC payload, URL and timestamp are recorded per query.
  - A failed call is recorded as ATTEMPTED-ERROR with the exception, never as an answer.
  - If the MCP cannot answer, the log entry says so.
  - Nothing is invented, paraphrased-into-existence, or reconstructed.

Claim boundary (stated in README): this is the public GitBook Docs MCP
endpoint, NOT the login-gated ai.pharos.xyz portal session.

Usage:
  python3 query_log.py run        # ask all queries in queries.json -> evidence/runs/<ts>.json + transcript
  python3 query_log.py check      # verify evidence exists and print stats
  python3 query_log.py links      # curl-test every link in LINKS.md -> evidence/link_check.json
"""

import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
QUERIES_FILE = os.path.join(TASK, "queries.json")
RUNS_DIR = os.path.join(TASK, "evidence", "runs")
TRANSCRIPT_DIR = os.path.join(TASK, "evidence", "transcripts")
LINKS_FILE = os.path.join(TASK, "LINKS.md")
LINK_CHECK_FILE = os.path.join(TASK, "evidence", "link_check.json")

MCP_URL = "https://docs.pharos.xyz/~gitbook/mcp"
TOOL = "askQuestion"
DELAY_BETWEEN_QUERIES_S = 6
MAX_RETRIES = 5


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def git_info():
    """Read-only git metadata (commit + dirty flag)."""
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=TASK, capture_output=True, text=True,
            timeout=10,
        ).stdout.strip()
    except Exception:
        commit = "unknown"
    try:
        dirty = subprocess.run(
            ["git", "status", "--porcelain", "--", "."],
            cwd=TASK, capture_output=True, text=True, timeout=10,
        ).stdout.strip()
        dirty_flag = bool(dirty)
    except Exception:
        dirty_flag = None
    return commit, dirty_flag


class DocsMCP:
    """Minimal MCP Streamable-HTTP client for the Docs MCP (read tools only)."""

    def __init__(self):
        self.url = MCP_URL
        self._id = 0
        self._initialize()

    def _post(self, payload, timeout=90):
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            self.url, data=data, method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "User-Agent": "lightkeeper-t03-query-log/2.0 (+evidence)",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        events = []
        for line in raw.splitlines():
            if line.startswith("data:"):
                events.append(line[5:].strip())
        return events

    def _rpc(self, method, params, timeout=90):
        """POST with retry/backoff. The server drops ~30-40% of connections;
        it is stateless, so retrying is safe."""
        self._id += 1
        req_id = self._id
        payload = {"jsonrpc": "2.0", "id": req_id, "method": method,
                   "params": params}
        last_err = None
        for attempt in range(MAX_RETRIES):
            try:
                events = self._post(payload, timeout=timeout)
                for e in events:
                    try:
                        msg = json.loads(e)
                    except json.JSONDecodeError:
                        continue
                    if msg.get("id") == req_id:
                        if "error" in msg:
                            raise RuntimeError(f"MCP error: {msg['error']}")
                        return msg.get("result"), payload
                last_err = f"no matching id in {len(events)} SSE events"
            except Exception as e:  # noqa: BLE001 - recorded, never hidden
                last_err = f"{type(e).__name__}: {e}"
                time.sleep(2 ** attempt)
        raise RuntimeError(f"MCP call failed after {MAX_RETRIES} attempts: {last_err}")

    def _initialize(self):
        result, _ = self._rpc("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "lightkeeper-t03-query-log", "version": "2.0"},
        })
        info = (result or {}).get("serverInfo", {})
        self.server_name = info.get("name", "unknown")
        self.server_version = info.get("version", "unknown")

    def ask(self, question, goal):
        t0 = time.monotonic()
        result, payload = self._rpc("tools/call", {
            "name": TOOL,
            "arguments": {"question": question, "goal": goal},
        })
        latency_s = round(time.monotonic() - t0, 2)
        blocks = (result or {}).get("content", [])
        texts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
        return "\n".join(texts), latency_s, payload


def cmd_run():
    with open(QUERIES_FILE) as f:
        queries = json.load(f)
    os.makedirs(RUNS_DIR, exist_ok=True)
    os.makedirs(TRANSCRIPT_DIR, exist_ok=True)

    mcp = DocsMCP()
    print(f"MCP server: {mcp.server_name} v{mcp.server_version} @ {MCP_URL}",
          flush=True)
    commit, dirty = git_info()

    entries = []
    for i, q in enumerate(queries):
        print(f"[{i+1}/{len(queries)}] {q['id']}: {q['question'][:60]}...",
              flush=True)
        entry = {
            "id": q["id"],
            "surface": "developer-docs-mcp",
            "mcp_endpoint": MCP_URL,
            "mcp_server": mcp.server_name,
            "mcp_server_version": mcp.server_version,
            "tool": TOOL,
            "question": q["question"],
            "goal": q["goal"],
            "attempted_at": now_iso(),
        }
        try:
            answer, latency, payload = mcp.ask(q["question"], q["goal"])
            entry["latency_s"] = latency
            entry["jsonrpc_payload"] = payload
            entry["answer_verbatim"] = answer
            entry["outcome"] = "ANSWERED" if answer.strip() else "EMPTY-ANSWER"
        except Exception as e:  # noqa: BLE001
            entry["outcome"] = "ATTEMPTED-ERROR"
            entry["error"] = f"{type(e).__name__}: {e}"
        entries.append(entry)
        if i < len(queries) - 1:
            time.sleep(DELAY_BETWEEN_QUERIES_S)

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    latencies = sorted(e.get("latency_s", 0) for e in entries
                       if "latency_s" in e)
    run = {
        "run_at": now_iso(),
        "runner": "scripts/query_log.py (v2.0, real Docs MCP)",
        "mcp_endpoint": MCP_URL,
        "mcp_server": mcp.server_name,
        "mcp_server_version": mcp.server_version,
        "tool": TOOL,
        "git_commit": commit,
        "git_dirty": dirty,
        "latency_p50_s": (latencies[len(latencies)//2] if latencies else None),
        "latency_p90_s": (latencies[int(len(latencies)*0.9)] if latencies else None),
        "queries": entries,
    }
    run_path = os.path.join(RUNS_DIR, f"run-mcp-{ts}.json")
    with open(run_path, "w") as f:
        json.dump(run, f, indent=2)

    # Raw transcript (JSONL, one verbatim Q&A per line)
    jl_path = os.path.join(TRANSCRIPT_DIR, f"transcript-{ts}.jsonl")
    with open(jl_path, "w") as f:
        for e in entries:
            f.write(json.dumps({
                "id": e["id"], "attempted_at": e["attempted_at"],
                "question": e["question"], "goal": e["goal"],
                "tool": TOOL, "mcp_endpoint": MCP_URL,
                "outcome": e["outcome"],
                "answer_verbatim": e.get("answer_verbatim"),
            }, ensure_ascii=False) + "\n")

    # Rendered transcript (markdown)
    md_path = os.path.join(TRANSCRIPT_DIR, f"transcript-{ts}.md")
    with open(md_path, "w") as f:
        f.write(f"# T03 Docs MCP onboarding — verbatim transcript\n\n")
        f.write(f"Run: {run['run_at']} · endpoint `{MCP_URL}` · "
                f"server `{mcp.server_name}` v{mcp.server_version} · "
                f"tool `{TOOL}` · commit `{commit[:12]}` "
                f"(dirty: {dirty})\n\n")
        for e in entries:
            f.write(f"## {e['id']}\n\n**Q:** {e['question']}\n\n"
                    f"**Goal:** {e['goal']}\n\n")
            if e["outcome"] == "ANSWERED":
                f.write(f"**A (verbatim, {e['latency_s']}s):**\n\n"
                        f"> {e['answer_verbatim'].replace(chr(10), chr(10) + '> ')}\n\n")
            else:
                f.write(f"**Outcome:** {e['outcome']}"
                        f"{' — ' + e.get('error', '') if e.get('error') else ''}\n\n")
            f.write("---\n\n")

    # Proof JSON (stamped, regenerable claim)
    proof_path = os.path.join(RUNS_DIR, f"proof-{ts}.json")
    with open(proof_path, "w") as f:
        json.dump({
            "task": "t03-docs-mcp-onboarding",
            "run_at": run["run_at"],
            "mcp_endpoint": MCP_URL,
            "mcp_server": mcp.server_name,
            "mcp_server_version": mcp.server_version,
            "tool": TOOL,
            "command": "python3 scripts/query_log.py run",
            "git_commit": commit,
            "git_dirty": dirty,
            "queries_total": len(entries),
            "queries_answered": sum(1 for e in entries
                                    if e["outcome"] == "ANSWERED"),
            "latency_p50_s": run["latency_p50_s"],
            "latency_p90_s": run["latency_p90_s"],
            "artifacts": {
                "raw_run": os.path.basename(run_path),
                "transcript_jsonl": os.path.basename(jl_path),
                "transcript_md": os.path.basename(md_path),
            },
            "claim": ("All onboarding queries were made through the Developer "
                      "Docs MCP (public GitBook MCP endpoint, no auth) via the "
                      "askQuestion tool; Q&A logged verbatim."),
        }, f, indent=2)

    answered = sum(1 for e in entries if e["outcome"] == "ANSWERED")
    print(f"run saved: {run_path}")
    print(f"transcript: {jl_path} / {md_path}")
    print(f"proof: {proof_path}")
    print(f"({answered}/{len(entries)} ANSWERED, "
          f"p50={run['latency_p50_s']}s p90={run['latency_p90_s']}s)")


def cmd_check():
    runs = sorted(f for f in os.listdir(RUNS_DIR)
                  if f.startswith("run-mcp-")) if os.path.isdir(RUNS_DIR) else []
    if not runs:
        print("no MCP runs found — run: python3 scripts/query_log.py run")
        sys.exit(1)
    latest = os.path.join(RUNS_DIR, runs[-1])
    with open(latest) as f:
        data = json.load(f)
    total = len(data["queries"])
    answered = sum(1 for q in data["queries"]
                   if q.get("outcome") == "ANSWERED")
    print(f"latest={runs[-1]} total={total} answered={answered} "
          f"p50={data.get('latency_p50_s')}s p90={data.get('latency_p90_s')}s")
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
                headers={"User-Agent": "lightkeeper-t03-link-check/2.0"},
                method="HEAD",
            )
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    code = resp.status
            except urllib.error.HTTPError as e:
                if e.code in (403, 405):
                    req2 = urllib.request.Request(
                        u,
                        headers={"User-Agent": "lightkeeper-t03-link-check/2.0"},
                    )
                    with urllib.request.urlopen(req2, timeout=20) as resp2:
                        code = resp2.status
                else:
                    code = e.code
            outcome = "OK" if code and code < 400 else f"HTTP-{code}"
        except Exception as e:  # noqa: BLE001
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
    cmds = {"run": cmd_run, "check": cmd_check, "links": cmd_links}
    if cmd in ("-h", "--help", "help"):
        print(__doc__.strip())
        sys.exit(0)
    if cmd not in cmds:
        print(f"Unknown command {cmd!r}. Choose one of: run, check, links.",
              file=sys.stderr)
        sys.exit(2)
    cmds[cmd]()
