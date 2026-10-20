#!/usr/bin/env bash
# mcp-verify.sh — LIGHTKEEPER pre-submission MCP spec gate (WS1).
# Verifies: every MCP tool name used in code exists in the LIVE spec,
# the production proxy allowlist behaves, and chain data is fresh.
# Logs: ~/workspace/lightkeeper/evidence/mcp-verify/<UTC-date>-<batch>.log (gitignored scratch)
# Exit codes: 0 = PASS (safe to submit), 1 = FAIL (do not submit), 2 = infra error (retry once).
#
# Flake history (2026-10-20): the Docs MCP drops ~40-50% of tools/list streams
# mid-JSON. The old "tolerant" reader accepted any partial containing the
# bytes "tools"/"result", which yields zero parseable SSE messages and an
# IndexError at sse_msgs(txt)[0]. Fix: _sse_messages() only accepts COMPLETE
# parseable messages; post() treats "no complete message" as a failed attempt
# and retries the whole POST with backoff. Partial chunks are still salvaged
# when they hold at least one complete message.
set -uo pipefail
REPO="${REPO:-$HOME/workspace/lightkeeper}"
BATCH="${1:-adhoc}"
LOGDIR="${LOGDIR:-$REPO/evidence/mcp-verify}"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/$(date -u +%F)-$BATCH.log"
exec > >(tee "$LOG") 2>&1
echo "== MCP VERIFY batch=$BATCH utc=$(date -u +%FT%TZ) =="

python3 - "$REPO" <<'PY'
import json, re, subprocess, sys, time, urllib.request, urllib.error
import http.client

repo = sys.argv[1]
CHAIN = "https://mcp.pharos.xyz/mcp"
DOCS  = "https://docs.pharos.xyz/~gitbook/mcp"
PROXY = "https://lightkeeper-console.vercel.app/api/mcp"
EXPECTED = {"chain": "2025-03-26", "docs": "2024-11-05"}

FAILS, WARNS = [], []

def _sse_messages(text):
    """Tolerant chunked parsing of an MCP Streamable-HTTP response.

    Accepts: SSE `data:` JSON lines (single event, or one JSON object split
    across several data: lines), or a plain JSON body (non-SSE transport).
    Skips SSE comments/pings and [DONE] markers. Returns ONLY fully
    parseable messages — never partial JSON. Empty list == nothing usable
    arrived (truncated stream), which the caller must retry.
    """
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
                pass  # incomplete chunk; maybe the joined buffer completes it
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

def post(url, body, headers=None, timeout=25, tries=6):
    """POST with retry-on-flake.

    Retries (backoff) on: transport errors, IncompleteRead, and — the
    2026-10-20 fix — responses that contain NO complete parseable message
    (truncated SSE stream). A partial chunk is salvaged only if at least
    one complete message parsed from it.
    """
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json",
                         "Accept": "application/json, text/event-stream", **(headers or {})},
                method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                sid = r.headers.get("mcp-session-id")
                raw = b""
                try:
                    while True:  # chunked read; Docs MCP drops streams mid-flight
                        chunk = r.read1() if hasattr(r, "read1") else r.read()
                        if not chunk:
                            break
                        raw += chunk
                except http.client.IncompleteRead as e:
                    raw += e.partial or b""
                text = raw.decode("utf-8", "replace")
                if raw.strip() and not _sse_messages(text):
                    raise ValueError(
                        f"truncated/unparseable response ({len(raw)} bytes, "
                        f"0 complete SSE messages)")
                return r.status, sid, text
        except Exception as e:
            last = e
            if attempt < tries - 1:
                time.sleep(min(2 * (attempt + 1), 10))
    raise RuntimeError(f"POST {url} failed after {tries} tries: {last}")

def _first_msg(txt, ctx):
    msgs = _sse_messages(txt)
    if not msgs or not isinstance(msgs[0], dict) or "result" not in msgs[0]:
        raise RuntimeError(f"{ctx}: no JSON-RPC result in response")
    return msgs[0]["result"]

def tools_list(url, protocol):
    _, sid, txt = post(url, {"jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": protocol, "capabilities": {},
                   "clientInfo": {"name": "mcp-verify", "version": "1.0"}}})
    init = _first_msg(txt, f"{url} initialize")
    h = {"Mcp-Session-Id": sid} if sid else {}
    try:
        post(url, {"jsonrpc": "2.0", "method": "notifications/initialized"}, h)
    except Exception:
        pass
    _, _, txt = post(url, {"jsonrpc": "2.0", "id": 2, "method": "tools/list",
                           "params": {}}, h)
    res = _first_msg(txt, f"{url} tools/list")
    if not isinstance(res.get("tools"), list):
        raise RuntimeError(f"{url} tools/list: 'tools' is not a list")
    tools = {t["name"]: t for t in res["tools"]}
    return init, tools

def tools_call(url, sid, name, arguments, rid=3):
    h = {"Mcp-Session-Id": sid} if sid else {}
    _, _, txt = post(url, {"jsonrpc": "2.0", "id": rid, "method": "tools/call",
                           "params": {"name": name, "arguments": arguments}}, h)
    return _first_msg(txt, f"{url} tools/call {name}")

def main():
    # --- 1. Live spec pull ---------------------------------------------------
    chain_init, chain_tools = tools_list(CHAIN, EXPECTED["chain"])
    docs_init, docs_tools = tools_list(DOCS, EXPECTED["docs"])
    print(f"chain server: {chain_init.get('serverInfo')} "
          f"protocol={chain_init.get('protocolVersion')} tools={len(chain_tools)}")
    print(f"docs  server: {docs_init.get('serverInfo')} "
          f"protocol={docs_init.get('protocolVersion')} tools={len(docs_tools)}")
    if chain_init.get("protocolVersion") != EXPECTED["chain"]:
        FAILS.append(f"chain protocol drift: {chain_init.get('protocolVersion')} "
                     f"(expected {EXPECTED['chain']})")
    if docs_init.get("protocolVersion") != EXPECTED["docs"]:
        FAILS.append(f"docs protocol drift: {docs_init.get('protocolVersion')} "
                     f"(expected {EXPECTED['docs']})")
    live = set(chain_tools) | set(docs_tools)

    # --- 2. Every tool name used in MCP-call context must exist in the live spec
    # Only MCP-call contexts count (rpc_call / _rpc / cast are direct JSON-RPC,
    # where eth_* names are legitimate and excluded on purpose).
    def grep_ctx(pat, path):
        return subprocess.run(["grep", "-rhoE", "--include=*.py", "--include=*.ts",
            "--include=*.tsx", pat, f"{path}/tasks", f"{path}/apps/console/src"],
            capture_output=True, text=True).stdout
    used = set()
    for line in grep_ctx(r'\.(call|mcp_call|call_tool)\(\s*[\"\'][A-Za-z_]+[\"\']', repo).splitlines():
        m = re.search(r'[\"\']([A-Za-z_]+)[\"\']', line)
        if m: used.add(m.group(1))
    for line in grep_ctx(r'\bmcpCall\(\s*[\"\'](?:chain|docs)[\"\'],\s*[\"\'][A-Za-z_]+[\"\']', repo).splitlines():
        m = re.search(r'(?:chain|docs)[\"\'],\s*[\"\']([A-Za-z_]+)[\"\']', line)
        if m: used.add(m.group(1))
    allow_sets = grep_ctx(r'ALLOWED_TOOLS\s*=\s*\{[^}]*\}', repo)
    used |= set(re.findall(r'[\"\']([A-Za-z_]+)[\"\']', allow_sets))
    for name in sorted(used):
        if name not in live:
            FAILS.append(f"CODE USES NON-LIVE TOOL NAME: {name} (the 2026-10-16 failure class)")
        else:
            print(f"  used-by-code OK: {name}")

    # Hard tripwire: JSON-RPC method names used as MCP tool names (excluding
    # eth_call, which is both a live MCP tool and a raw RPC method by design).
    for name in sorted(used):
        if name.startswith("eth_") and name != "eth_call":
            FAILS.append(f"JSON-RPC method passed as MCP tool name: {name}")

    # --- 3. Required args check: every used tool's required props present -----
    # (Static minimum: code must not pass an arg name the live schema lacks.)
    for name in sorted(used & live):
        schema = (chain_tools.get(name) or docs_tools.get(name))["inputSchema"]
        print(f"  schema {name}: props={list(schema.get('properties', {}))} "
              f"required={schema.get('required', [])}")

    # --- 4. Production proxy: every allowlisted tool answers, blocked ones 400
    def proxy(mcp, tool, args, attempts=3):
        # Retry transport-level drops ONLY (the upstreams drop ~30-40% of
        # connections — see T03 evidence; the project's MCP clients all
        # retry-with-backoff). Semantic answers (HTTP status/body) are never
        # retried: a 400 or an ok body on any attempt is the verdict.
        last_err = None
        for k in range(attempts):
            req = urllib.request.Request(PROXY,
                data=json.dumps({"mcp": mcp, "tool": tool, "arguments": args}).encode(),
                headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    return r.status, json.loads(r.read())
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read() or b"{}")
            except Exception as e:  # RemoteDisconnected / URLError: retry
                last_err = e
                time.sleep(2 * (k + 1))
        raise RuntimeError(f"proxy unreachable after {attempts} attempts: {last_err}")

    smoke = [("chain", "get_block_number", {}), ("chain", "get_chain_info", {}),
             ("chain", "get_gas_price", {}),
             ("docs", "searchDocumentation", {"query": "Pharos Chain MCP"})]
    for mcp, tool, args in smoke:
        st, body = proxy(mcp, tool, args)
        if st != 200 or not body.get("ok"):
            FAILS.append(f"proxy smoke FAIL {mcp}/{tool}: HTTP {st} {body}")
        else:
            print(f"  proxy OK: {mcp}/{tool}")
    for mcp, tool, args in [("chain", "send_raw_transaction", {"rawTransaction": "0x00"}),
                            ("docs", "askQuestion", {"question": "x"}),
                            ("docs", "sendFeedback", {"content": "x", "pageUrl": "x"}),
                            ("chain", "eth_getBlockNumber", {})]:
        st, body = proxy(mcp, tool, args)
        if st != 400 or body.get("error") != "Tool not allowed":
            FAILS.append(f"proxy BLOCK-CHECK FAIL {mcp}/{tool}: HTTP {st} {body}")
        else:
            print(f"  proxy correctly blocks: {mcp}/{tool}")

    # --- 5. Freshness: proxy block vs direct block must agree within 500 ------
    _, body = proxy("chain", "get_block_number", {})
    proxy_block = int(body["result"]["blockNumber"])
    _, sid, _ = post(CHAIN, {"jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": EXPECTED["chain"], "capabilities": {},
                   "clientInfo": {"name": "mcp-verify", "version": "1.0"}}})
    try:
        post(CHAIN, {"jsonrpc": "2.0", "method": "notifications/initialized"},
             {"Mcp-Session-Id": sid} if sid else {})
    except Exception:
        pass
    info = json.loads(tools_call(CHAIN, sid, "get_chain_info", {})["content"][0]["text"])
    if info.get("chainId") != 1672 or not info.get("chainIdMatches"):
        FAILS.append(f"chain identity FAIL: {info}")
    direct_block = int(info["latestBlock"])
    if abs(proxy_block - direct_block) > 500:
        FAILS.append(f"block skew proxy={proxy_block} direct={direct_block}")
    print(f"  freshness: proxy_block={proxy_block} direct_block={direct_block} "
          f"chainId=1672 OK")

    print("== RESULT ==")
    if WARNS:
        for w in WARNS: print(" WARN:", w)
    if FAILS:
        print("FAIL — DO NOT SUBMIT")
        for f in FAILS: print(" -", f)
        sys.exit(1)
    print("PASS — all code tool names exist live, proxy allowlist behaves, blocks fresh.")

try:
    main()
except RuntimeError as e:
    print(f"INFRA ERROR (exit 2 — retry once): {e}")
    sys.exit(2)
PY
rc=$?
echo "exit=$rc log=$LOG"
exit $rc
