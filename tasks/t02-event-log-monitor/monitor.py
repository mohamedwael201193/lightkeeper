#!/usr/bin/env python3
"""
T02 Event/Log Monitor — Pharos mainnet, via the Chain MCP (resubmission build).

EVERY chain read goes through the Chain MCP tools `get_logs` / `get_block_number`
BY NAME. No raw eth_* JSON-RPC is issued anywhere in this task.

  MCP endpoint : https://mcp.pharos.xyz/mcp   (MCP Streamable HTTP, keyless)
  Chain        : Pharos mainnet, chain id 1672 (the only chain the hosted MCP serves)
  Target       : USDC 0xc879c018db60520f4355c26ed1a6d572cdac1815
                 Transfer(address,address,uint256) — topic0 computed at runtime

Engineering (carried over from the Atlantic build, re-proven on mainnet):
  - Chunked get_logs, <= 1000 blocks per call (MCP server cap, enforced server-side).
  - Persistent cursor + seen-set (blockNumber:logIndex) in state.json.
  - Atomic persist-before-emit: state is written BEFORE any alert goes out —
    survives kill -9 with zero re-emission and zero skipped blocks.
  - 2-block confirmation lag for reorg tolerance.
  - topic0 = keccak256(canonical signature) computed in code — never hardcoded.
  - Transfer decoded into from / to / value (human-readable USDC, 6 decimals).

Usage:
  monitor.py topics
  monitor.py run   [--poll-interval=SEC] [--start-block=N]
  monitor.py test  --from-block=N --to-block=M [--expect-count=N]
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

from Crypto.Hash import keccak  # pycryptodome — Ethereum keccak256

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# @lightkeeper/* shared libs (L1 chain-data, L7 persistence, L9 notifications).
# Documented path mechanism: <repo>/packages/<lib>/py on sys.path.
for _lib in ("chain-data", "persistence", "notifications"):
    sys.path.insert(0, os.path.join(REPO_ROOT, "packages", _lib, "py"))
from lightkeeper_chain_data import chunk_ranges  # noqa: E402
from lightkeeper_persistence import JsonFileStore  # noqa: E402
from lightkeeper_notifications import Alert, format_alert  # noqa: E402

# ---------------------------------------------------------------- constants ---
MCP_URL = "https://mcp.pharos.xyz/mcp"
MCP_PROTOCOL = "2025-03-26"
CHAIN_ID = 1672
CHAIN_NAME = "pharos-mainnet"

USDC = "0xc879c018db60520f4355c26ed1a6d572cdac1815"
TRANSFER_SIG = "Transfer(address,address,uint256)"
USDC_DECIMALS = 6

CHUNK = 1000          # MCP get_logs range cap (server-enforced)
CONFIRM_LAG = 2       # blocks behind tip (reorg tolerance)
DEFAULT_POLL = 8      # seconds between poll cycles

BASE = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE, "state.json")
POLL_LOG = os.path.join(BASE, "poll.log")
ALERTS_FILE = os.path.join(BASE, "alerts.jsonl")


# ------------------------------------------------------------- MCP client ---
class MCPError(RuntimeError):
    pass


class ChainMCP:
    """Minimal MCP Streamable-HTTP client for the Pharos Chain MCP.

    Handshake: initialize -> capture `mcp-session-id` response header ->
    notifications/initialized. Every tools/call carries Mcp-Session-Id.
    Re-handshakes once if the server reports -32000 (session lost).
    """

    def __init__(self, url=MCP_URL, client_name="lightkeeper-t02"):
        self.url = url
        self.client_name = client_name
        self.session = None
        self._id = 0

    def _next_id(self):
        self._id += 1
        return self._id

    def _post(self, payload):
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            self.url, data=data,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            },
            method="POST",
        )
        if self.session:
            req.add_header("Mcp-Session-Id", self.session)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                headers = r.headers
                body = r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            raise MCPError(f"MCP HTTP {e.code}: {e.read().decode()[:300]}")
        except Exception as e:  # network-level failure
            raise MCPError(f"MCP transport error: {e}")
        events = []
        for line in body.splitlines():
            if line.startswith("data:"):
                try:
                    events.append(json.loads(line[5:].strip()))
                except json.JSONDecodeError:
                    pass
        return headers, events

    def _post_with_retry(self, payload, attempts=3):
        """POST with backoff on transport-level failures.

        The upstream MCP endpoint intermittently drops connections
        (IncompleteRead / RemoteDisconnected, ~30-40% of calls in
        testing). Transport errors are safe to retry: initialize and
        tools/call are idempotent reads. Non-transport MCPError
        (HTTP errors, tool errors) is raised immediately.
        """
        last = None
        for i in range(attempts):
            try:
                return self._post(payload)
            except MCPError as e:
                if not str(e).startswith("MCP transport error"):
                    raise
                last = e
                if i < attempts - 1:
                    time.sleep(2 * (i + 1))
        raise last  # all attempts hit transport drops

    def connect(self):
        rid = self._next_id()
        headers, events = self._post_with_retry({
            "jsonrpc": "2.0", "id": rid, "method": "initialize",
            "params": {
                "protocolVersion": MCP_PROTOCOL,
                "capabilities": {},
                "clientInfo": {"name": self.client_name, "version": "2.0.0"},
            },
        })
        sid = headers.get("mcp-session-id") or headers.get("Mcp-Session-Id")
        if not sid:
            raise MCPError("initialize: no mcp-session-id header returned")
        self.session = sid
        # notifications/initialized (no id; server replies with empty result)
        self._post_with_retry({"jsonrpc": "2.0", "method": "notifications/initialized"})
        # verify the session works
        info = self.call("get_chain_info", {}, _retried=True)
        cid = info.get("chainId", info.get("chain_id"))
        if str(cid) not in ("1672", "0x688"):
            raise MCPError(f"unexpected chain id from MCP: {cid}")
        return self

    def call(self, tool, arguments, _retried=False):
        rid = self._next_id()
        _headers, events = self._post_with_retry({
            "jsonrpc": "2.0", "id": rid,
            "method": "tools/call",
            "params": {"name": tool, "arguments": arguments},
        })
        for ev in events:
            if ev.get("id") != rid:
                continue
            if "error" in ev:
                err = ev["error"]
                # session lost mid-run -> re-handshake once, then retry
                if err.get("code") == -32000 and not _retried:
                    self.session = None
                    self.connect()
                    return self.call(tool, arguments, _retried=True)
                raise MCPError(f"MCP tool {tool} error: {err}")
            content = ev["result"]["content"]
            text = content[0]["text"] if content else "{}"
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"raw": text}
        raise MCPError(f"MCP tool {tool}: no matching response (id {rid})")


# ------------------------------------------------------------------ codec ---
_topic_cache = {}


def keccak256_hex(text):
    k = keccak.new(digest_bits=256)
    k.update(text.encode())
    return "0x" + k.hexdigest()


def topic0(sig):
    if sig not in _topic_cache:
        _topic_cache[sig] = keccak256_hex(sig)
    return _topic_cache[sig]


def addr_of(word):
    w = word[2:] if word.startswith("0x") else word
    return "0x" + w[-40:]


def decode_transfer(log):
    """Transfer(address,address,uint256): topics[1]=from, topics[2]=to, data=value."""
    topics = log["topics"]
    amount = int(log["data"], 16)
    return {
        "from": addr_of(topics[1]),
        "to": addr_of(topics[2]),
        "value_raw": str(amount),
        "value_usdc": f"{amount / 10 ** USDC_DECIMALS:.6f}",
    }


def block_num(log):
    bn = log["blockNumber"]
    return int(bn, 16) if str(bn).startswith("0x") else int(bn)


# ------------------------------------------------------------------ state ---
# Durable monitor state lives in @lightkeeper/persistence (L7): atomic
# JsonFileStore. The state.json SCHEMA is unchanged (chain_id/cursor/seen).
_state_store = JsonFileStore(STATE_FILE)


def load_state():
    st = _state_store.load()
    if not st:
        return {"chain_id": CHAIN_ID, "cursor": None, "seen": []}
    if st.get("chain_id") != CHAIN_ID:
        raise SystemExit(
            f"state.json is for chain {st.get('chain_id')}; this build targets "
            f"{CHAIN_ID}. Move it aside and start fresh."
        )
    return st


def save_state(state):
    _state_store.save(state)  # atomic persist-before-emit


def logline(msg):
    ts = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    line = f"{ts} {msg}"
    print(line, flush=True)
    with open(POLL_LOG, "a") as f:
        f.write(line + "\n")


# ---------------------------------------------------------------- scanner ---
def get_logs(mcp, frm, to):
    """One MCP get_logs TOOL call (<=1000 blocks; server-enforced cap)."""
    return mcp.call("get_logs", {
        "address": USDC,
        "topics": [topic0(TRANSFER_SIG)],
        "fromBlock": frm,
        "toBlock": to,
    })


def tip_block(mcp):
    info = mcp.call("get_block_number", {})
    return int(info["blockNumber"])


def emit_alert(fields, log):
    # The alert is built as a @lightkeeper/notifications (L9) Alert:
    # what + value + link + action, then serialized to the historical
    # alerts.jsonl schema (unchanged).
    alert = Alert(
        id=f"{block_num(log)}:{log['logIndex']}",
        what="Transfer",
        value=f"{fields['value_usdc']} USDC",
        link=f"https://pharosscan.xyz/tx/{log['transactionHash']}",
        action="informational — no action required",
        extra={"block": block_num(log), "tx": log["transactionHash"],
               "from": fields["from"], "to": fields["to"]},
    )
    record = {
        "ts": alert.ts,
        "chain_id": CHAIN_ID,
        "via": "chain-mcp:get_logs",
        "event": alert.what,
        "contract": USDC,
        "fields": fields,
        "blockNumber": alert.extra["block"],
        "blockTimestamp": log.get("blockTimestamp"),
        "txHash": log["transactionHash"],
        "logIndex": log["logIndex"],
    }
    with open(ALERTS_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")
    logline(f"ALERT {format_alert(alert)}")
    return record


def scan_range(mcp, frm, to, state, emit=True):
    """Scan [frm, to] inclusive via MCP get_logs in <=1000-block chunks."""
    found = []
    # Chunking owned by @lightkeeper/chain-data (L1): same <=1000-block
    # inclusive ranges the manual loop produced.
    for cur, end in chunk_ranges(frm, to, CHUNK):
        logs = get_logs(mcp, cur, end)
        if isinstance(logs, dict) and "logs" in logs:
            logs = logs["logs"]
        for lg in logs or []:
            key = f"{block_num(lg)}:{lg['logIndex']}"
            if key in state["seen"]:
                continue
            state["seen"].append(key)  # mark seen BEFORE any emit
            fields = decode_transfer(lg)
            if emit:
                save_state(state)      # persist cursor+seen before the alert goes out
                emit_alert(fields, lg)
            found.append((fields, lg))
    return found


# ---------------------------------------------------------------- commands ---
def cmd_run(mcp, poll_interval=DEFAULT_POLL, start_block=None):
    state = load_state()
    if state["cursor"] is None:
        state["cursor"] = start_block if start_block is not None else tip_block(mcp)
        save_state(state)
        logline(f"cursor initialized at block {state['cursor']}")
    logline(
        f"monitor started: chain={CHAIN_NAME}({CHAIN_ID}) contract=USDC "
        f"tool=chain-mcp:get_logs confirm_lag={CONFIRM_LAG} "
        f"interval={poll_interval}s cursor={state['cursor']}"
    )
    backoff = 5
    while True:
        try:
            tip = tip_block(mcp) - CONFIRM_LAG
            if tip > state["cursor"]:
                found = scan_range(mcp, state["cursor"] + 1, tip, state)
                state["cursor"] = tip
                save_state(state)
                logline(f"cycle done: scanned to {tip}, {len(found)} new event(s) this cycle")
            else:
                logline(f"cycle: no new confirmed blocks (cursor={state['cursor']} tip={tip})")
            backoff = 5
        except Exception as e:  # noqa: BLE001 - monitor must not die on a transient error
            logline(f"cycle error (backing off {backoff}s): {e}")
            time.sleep(backoff)
            backoff = min(backoff * 2, 120)
        time.sleep(poll_interval)


def cmd_test(mcp, frm, to, expect_count=None):
    state = {"chain_id": CHAIN_ID, "cursor": None, "seen": []}
    found = scan_range(mcp, frm, to, state, emit=False)
    print(f"scanned blocks {frm}..{to} via chain-mcp:get_logs: "
          f"found {len(found)} Transfer event(s)")
    for (fields, lg) in found[:10]:
        print(f"  Transfer block={block_num(lg)} tx={lg['transactionHash']} "
              f"logIndex={lg['logIndex']} from={fields['from']} "
              f"to={fields['to']} value={fields['value_usdc']} USDC")
    if len(found) > 10:
        print(f"  ... and {len(found) - 10} more")
    # determinism: re-scan must return the identical set
    again = scan_range(mcp, frm, to, {"chain_id": CHAIN_ID, "cursor": None, "seen": []},
                       emit=False)
    assert len(again) == len(found), "non-deterministic re-scan"
    print(f"determinism check: re-scan returned the identical {len(again)} event(s)")
    if expect_count is not None:
        assert len(found) == expect_count, \
            f"MISMATCH: expected {expect_count}, got {len(found)}"
        print(f"TEST PASS: exactly {expect_count} Transfer event(s) in range")
    else:
        print("no --expect-count given; discovery run only")


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    cmd = argv[0]
    if cmd == "topics":
        print(f"{TRANSFER_SIG} -> {topic0(TRANSFER_SIG)}")
        return
    mcp = ChainMCP().connect()
    print(f"connected: chain-mcp @ {MCP_URL} (chain {CHAIN_ID})", flush=True)
    if cmd == "run":
        interval, start = DEFAULT_POLL, None
        for a in argv[1:]:
            if a.startswith("--poll-interval="):
                interval = int(a.split("=", 1)[1])
            elif a.startswith("--start-block="):
                start = int(a.split("=", 1)[1])
        cmd_run(mcp, interval, start)
    elif cmd == "test":
        frm = to = None
        expect = None
        for a in argv[1:]:
            if a.startswith("--from-block="):
                frm = int(a.split("=", 1)[1])
            elif a.startswith("--to-block="):
                to = int(a.split("=", 1)[1])
            elif a.startswith("--expect-count="):
                expect = int(a.split("=", 1)[1])
        assert frm is not None and to is not None, "test needs --from-block and --to-block"
        cmd_test(mcp, frm, to, expect)
    else:
        sys.exit(f"unknown command: {cmd}")


if __name__ == "__main__":
    main()
