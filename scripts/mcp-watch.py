#!/usr/bin/env python3
"""mcp-watch.py — MCP staleness / drift watch for LIGHTKEEPER (WS1 #4).

Pulls the live tool spec from the hosted Chain + Docs MCP endpoints and
diffs it against evidence/mcp-watch/baseline-tools.json.

Alerts (exit 1) on ANY of:
  - tool ADDED / REMOVED / RENAMED on either server
  - inputSchema change (arg add/remove/rename, required-set change) per tool
  - protocolVersion switch (e.g. 2025-03-26 -> 2026-07-28)
  - serverInfo.version bump
  - frozen chain (get_block_number unchanged across --freeze-wait seconds)

Exit codes: 0 = no drift, 1 = drift detected (cron should alert),
            2 = infra error (cron stays silent; verify manually).

Uses the same tolerant SSE parsing + retry-with-backoff as
scripts/mcp-verify.sh (the Docs MCP drops ~40% of streams mid-flight).
Stdlib only.

Usage:
  python3 scripts/mcp-watch.py [--baseline PATH] [--json] [--freeze-wait SEC]
"""
from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import time
import urllib.request

DEFAULT_BASELINE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "evidence", "mcp-watch", "baseline-tools.json")


# ── tolerant SSE parsing + retry (same contract as mcp-verify.sh) ──────────
def _sse_messages(text):
    msgs, raws = [], []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith(":"):
            continue
        if s.startswith("data:"):
            payload = s[5:].strip()
            if not payload or payload == "[DONE]":
                continue
            raws.append(payload)
            try:
                msgs.append(json.loads(payload))
            except Exception:
                pass
    if not msgs and raws:
        try:
            msgs.append(json.loads("".join(raws)))
        except Exception:
            pass
    if not msgs:
        t = text.strip()
        if t.startswith("{"):
            try:
                msgs.append(json.loads(t))
            except Exception:
                pass
    return msgs


def post(url, body, headers=None, timeout=30, tries=8):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(
                url, data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json",
                         "Accept": "application/json, text/event-stream",
                         **(headers or {})},
                method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                sid = r.headers.get("mcp-session-id")
                raw = b""
                try:
                    while True:
                        chunk = r.read1() if hasattr(r, "read1") else r.read()
                        if not chunk:
                            break
                        raw += chunk
                except http.client.IncompleteRead as e:
                    raw += e.partial or b""
                text = raw.decode("utf-8", "replace")
                if raw.strip() and not _sse_messages(text):
                    raise ValueError(
                        f"truncated/unparseable response ({len(raw)} bytes)")
                return r.status, sid, text
        except Exception as e:
            last = e
            if attempt < tries - 1:
                time.sleep(min(3 * (attempt + 1), 20))
    raise RuntimeError(f"POST {url} failed after {tries} tries: {last}")


def _first_result(txt, ctx):
    msgs = _sse_messages(txt)
    if not msgs or not isinstance(msgs[0], dict) or "result" not in msgs[0]:
        raise RuntimeError(f"{ctx}: no JSON-RPC result in response")
    return msgs[0]["result"]


class Server:
    def __init__(self, url, protocol):
        self.url, self.protocol = url, protocol
        self.sid, self.init = self._init()

    def _init(self):
        _, sid, txt = post(self.url, {"jsonrpc": "2.0", "id": 1,
            "method": "initialize",
            "params": {"protocolVersion": self.protocol, "capabilities": {},
                       "clientInfo": {"name": "mcp-watch", "version": "1.0"}}})
        init = _first_result(txt, f"{self.url} initialize")
        h = {"Mcp-Session-Id": sid} if sid else {}
        try:
            post(self.url, {"jsonrpc": "2.0",
                            "method": "notifications/initialized"}, h)
        except Exception:
            pass
        return sid, init

    def tools(self):
        h = {"Mcp-Session-Id": self.sid} if self.sid else {}
        _, _, txt = post(self.url, {"jsonrpc": "2.0", "id": 2,
            "method": "tools/list", "params": {}}, h)
        res = _first_result(txt, f"{self.url} tools/list")
        return {t["name"]: t for t in res["tools"]}

    def call(self, name, arguments, rid=3):
        h = {"Mcp-Session-Id": self.sid} if self.sid else {}
        _, _, txt = post(self.url, {"jsonrpc": "2.0", "id": rid,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments}}, h)
        return _first_result(txt, f"{self.url} tools/call {name}")


def schema_sig(tool):
    s = tool.get("inputSchema", {}) or {}
    props = sorted((s.get("properties") or {}).keys())
    required = sorted(s.get("required") or [])
    return {"properties": props, "required": required}


def diff_server(label, live_url, live_init, live_tools, base):
    drift = []
    if base["url"] != live_url:
        drift.append({"kind": "endpoint_changed", "server": label,
                      "was": base["url"], "now": live_url})
    bprot, lprot = base["protocolVersion"], live_init.get("protocolVersion")
    if bprot != lprot:
        drift.append({"kind": "protocol_switch", "server": label,
                      "was": bprot, "now": lprot})
    bver = (base["serverInfo"] or {}).get("version")
    lver = (live_init.get("serverInfo") or {}).get("version")
    if bver != lver:
        drift.append({"kind": "version_bump", "server": label,
                      "was": bver, "now": lver})
    bnames, lnames = set(base["tools"]), set(live_tools)
    for n in sorted(lnames - bnames):
        drift.append({"kind": "tool_added", "server": label, "tool": n})
    for n in sorted(bnames - lnames):
        drift.append({"kind": "tool_removed", "server": label, "tool": n})
    for n in sorted(bnames & lnames):
        bsig = schema_sig({"inputSchema": base["tools"][n].get("inputSchema")})
        lsig = schema_sig(live_tools[n])
        if bsig != lsig:
            drift.append({"kind": "schema_change", "server": label, "tool": n,
                          "was": bsig, "now": lsig})
    return drift


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", default=DEFAULT_BASELINE)
    ap.add_argument("--json", action="store_true",
                    help="emit machine-readable diff report")
    ap.add_argument("--freeze-wait", type=int, default=45,
                    help="seconds between the two block reads for the frozen-chain check")
    args = ap.parse_args()

    try:
        with open(args.baseline) as f:
            base = json.load(f)
    except Exception as e:
        print(f"mcp-watch: cannot read baseline {args.baseline}: {e}",
              file=sys.stderr)
        return 2

    try:
        chain = Server(base["chain"]["url"], base["chain"]["protocolVersion"])
        ctools = chain.tools()
        b1 = json.loads(chain.call("get_block_number", {})["content"][0]["text"])
        block_a = int(b1["blockNumber"])
        docs = Server(base["docs"]["url"], base["docs"]["protocolVersion"])
        dtools = docs.tools()
        time.sleep(args.freeze_wait)
        b2 = json.loads(chain.call("get_block_number", {})["content"][0]["text"])
        block_b = int(b2["blockNumber"])
    except RuntimeError as e:
        print(f"mcp-watch INFRA: {e}", file=sys.stderr)
        return 2

    drift = diff_server("chain", base["chain"]["url"], chain.init, ctools,
                        {"url": base["chain"]["url"],
                         "protocolVersion": base["chain"]["protocolVersion"],
                         "serverInfo": base["chain"]["serverInfo"],
                         "tools": {t["name"]: t for t in base["chain"]["tools"]}})
    drift += diff_server("docs", base["docs"]["url"], docs.init, dtools,
                         {"url": base["docs"]["url"],
                          "protocolVersion": base["docs"]["protocolVersion"],
                          "serverInfo": base["docs"]["serverInfo"],
                          "tools": {t["name"]: t for t in base["docs"]["tools"]}})
    if block_b <= block_a:
        drift.append({"kind": "frozen_block", "server": "chain",
                      "block_a": block_a, "block_b": block_b,
                      "wait_s": args.freeze_wait,
                      "note": "block number did not advance — chain feed may be stale"})

    report = {
        "checkedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "baseline": base.get("capturedAtUtc"),
        "drift": drift,
        "live": {
            "chain": {"serverInfo": chain.init.get("serverInfo"),
                      "protocolVersion": chain.init.get("protocolVersion"),
                      "tools": sorted(ctools), "block": block_b},
            "docs": {"serverInfo": docs.init.get("serverInfo"),
                     "protocolVersion": docs.init.get("protocolVersion"),
                     "tools": sorted(dtools)},
        },
    }
    if args.json:
        print(json.dumps(report, indent=1))
    else:
        if drift:
            print("MCP DRIFT DETECTED:")
            for d in drift:
                print(" -", json.dumps(d))
        else:
            print(f"OK — no drift. chain block {block_b}, "
                  f"chain tools {len(ctools)}, docs tools {len(dtools)}.")
    return 1 if drift else 0


if __name__ == "__main__":
    sys.exit(main())
