#!/usr/bin/env python3
"""
T02 Event/Log Monitor — polls Pharos Atlantic for events from LogEmitter.

Design (built to beat the contested T02 bar):
  - Chunked eth_getLogs via `cast logs`, <= 1000 blocks per call (node cap).
  - Persistent server-side cursor in state.json: last processed block +
    per-log seen set (blockNumber:logIndex). Survives kill -9 with NO
    re-emission: state is written (persist-before-emit) BEFORE any alert.
  - 2-block confirmation lag for reorg tolerance.
  - topic0 filters computed from event signatures at runtime (no hardcoded hashes).
  - Events decoded with `cast decode-event` into readable fields.

Usage:
  monitor.py run   [--poll-interval SEC] [--start-block N]
  monitor.py test  [--from-block N --to-block N]   # scan a known range, print + assert
  monitor.py topics                            # print topic0 signatures
"""
import json
import os
import subprocess
import sys
import time

RPC = os.environ.get("ATLANTIC_RPC_URL")
if not RPC:
    sys.exit("ATLANTIC_RPC_URL is not set")

ADDR = os.environ.get("LOGEMITTER_ADDR")
if not ADDR:
    sys.exit("LOGEMITTER_ADDR is not set")

CHUNK = 1000          # node get_logs range cap
CONFIRM_LAG = 2       # blocks behind tip (reorg tolerance)
DEFAULT_POLL = 8      # seconds between poll cycles

BASE = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE, "state.json")
POLL_LOG = os.path.join(BASE, "poll.log")
ALERTS_FILE = os.path.join(BASE, "alerts.jsonl")

# (name, canonical-signature, fields: (name, type, indexed)) — as declared in LogEmitter.sol
EVENTS = [
    ("Ping", "Ping(address,uint256,string)", [
        ("from", "address", True), ("value", "uint256", False), ("note", "string", False)]),
    ("Zap", "Zap(address,address,uint256)", [
        ("sender", "address", True), ("target", "address", True), ("amount", "uint256", False)]),
    ("Marker", "Marker(uint256,bytes32,bytes)", [
        ("id", "uint256", True), ("tag", "bytes32", False), ("payload", "bytes", False)]),
]

_topic_cache = {}


RPC_CMDS = {"block-number", "logs"}  # need --rpc-url; keccak/decode-event are local


def cast(*args):
    argv = ["cast", *args]
    if args and args[0] in RPC_CMDS:
        argv += ["--rpc-url", RPC]
    p = subprocess.run(argv, capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError(f"cast {' '.join(args)} failed: {p.stderr.strip()}")
    return p.stdout.strip()


def topic0(sig):
    if sig not in _topic_cache:
        _topic_cache[sig] = cast("keccak", sig)
    return _topic_cache[sig]


def block_number():
    return int(cast("block-number"))


def get_logs(topic, frm, to):
    out = cast(
        "logs", "--json",
        "--address", ADDR,
        "--from-block", str(frm), "--to-block", str(to),
        topic,  # cast logs takes the topic filter as a positional SIG_OR_TOPIC
    )
    return json.loads(out) if out else []


def decode_word(word, typ):
    """Decode one indexed topic word into a readable value."""
    w = word[2:] if word.startswith("0x") else word
    if typ == "address":
        return "0x" + w[-40:]
    if typ == "uint256":
        return str(int(w, 16))
    return "0x" + w  # bytes32


def decode(sig, fields, topics, data):
    """Decode one log; returns list of readable values in field order."""
    vals = [None] * len(fields)
    ti = 1
    for i, (name, typ, indexed) in enumerate(fields):
        if indexed:
            vals[i] = decode_word(topics[ti], typ)
            ti += 1
    # signature with `indexed` markers so cast skips topic-emitted params
    marked = sig.split("(")[0] + "(" + ",".join(
        f"{typ}{' indexed' if indexed else ''} {name}"
        for (name, typ, indexed) in fields
    ) + ")"
    out = cast("decode-event", "--sig", marked, data)
    plain = out.splitlines()
    j = 0
    for i, (name, typ, indexed) in enumerate(fields):
        if not indexed:
            vals[i] = plain[j]
            j += 1
    return vals


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"cursor": None, "seen": []}


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE_FILE)  # atomic persist-before-emit


def logline(msg):
    ts = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    line = f"{ts} {msg}"
    print(line, flush=True)
    with open(POLL_LOG, "a") as f:
        f.write(line + "\n")


def emit_alert(name, fields, meta):
    alert = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "event": name,
        "fields": {f[0]: v for f, v in zip([e[2] for e in EVENTS if e[0] == name][0], fields)},
        "blockNumber": meta["blockNumber"],
        "txHash": meta["transactionHash"],
        "logIndex": meta["logIndex"],
        "address": meta["address"],
    }
    with open(ALERTS_FILE, "a") as f:
        f.write(json.dumps(alert) + "\n")
    logline(
        f"ALERT {name} block={int(alert['blockNumber'],16) if isinstance(alert['blockNumber'],str) else alert['blockNumber']} "
        f"tx={alert['txHash']} fields={alert['fields']}"
    )
    return alert


def scan_range(frm, to, state, emit=True):
    """Scan [frm, to] inclusive in <=1000-block chunks; returns list of (name, parts, log)."""
    found = []
    cur = frm
    while cur <= to:
        end = min(cur + CHUNK - 1, to)
        for (name, sig, fields) in EVENTS:
            for lg in get_logs(topic0(sig), cur, end):
                key = f"{lg['blockNumber']}:{lg['logIndex']}"
                if key in state["seen"]:
                    continue
                state["seen"].append(key)  # mark seen BEFORE any emit (persist-before-emit)
                parts = decode(sig, fields, lg["topics"], lg["data"])
                if emit:
                    save_state(state)      # persist cursor+seen before the alert goes out
                    emit_alert(name, parts, lg)
                found.append((name, parts, lg))
        cur = end + 1
    return found


def cmd_run(poll_interval=DEFAULT_POLL, start_block=None):
    state = load_state()
    if state["cursor"] is None:
        state["cursor"] = (start_block if start_block is not None else block_number()) + 0
        save_state(state)
        logline(f"cursor initialized at block {state['cursor']}")
    logline(f"monitor started: addr={ADDR} confirm_lag={CONFIRM_LAG} interval={poll_interval}s cursor={state['cursor']}")
    while True:
        try:
            tip = block_number() - CONFIRM_LAG
            if tip > state["cursor"]:
                n = scan_range(state["cursor"] + 1, tip, state)
                state["cursor"] = tip
                save_state(state)
                logline(f"cycle done: scanned to {tip}, {n} new event(s) this cycle")
            else:
                logline(f"cycle: no new confirmed blocks (cursor={state['cursor']} tip={tip})")
        except Exception as e:  # noqa: BLE001 - monitor must not die on a transient RPC error
            logline(f"cycle error (backing off): {e}")
        time.sleep(poll_interval)


def cmd_test(frm, to, expected):
    state = {"cursor": None, "seen": []}
    found = scan_range(frm, to, state, emit=False)
    names = sorted(n for (n, _p, _l) in found)
    print(f"scanned blocks {frm}..{to}: found {len(found)} event(s): {names}")
    for (n, parts, lg) in found:
        bn = int(lg["blockNumber"], 16) if str(lg["blockNumber"]).startswith("0x") else int(lg["blockNumber"])
        print(f"  {n} block={bn} tx={lg['transactionHash']} logIndex={lg['logIndex']} decoded={parts}")
    assert names == sorted(expected), f"MISMATCH: expected {sorted(expected)}, got {names}"
    print("TEST PASS: exactly the expected events were found")


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    cmd = argv[0]
    if cmd == "run":
        interval = DEFAULT_POLL
        start = None
        for a in argv[1:]:
            if a.startswith("--poll-interval="):
                interval = int(a.split("=", 1)[1])
            elif a.startswith("--start-block="):
                start = int(a.split("=", 1)[1])
        cmd_run(interval, start)
    elif cmd == "test":
        frm = to = None
        expect = None
        for a in argv[1:]:
            if a.startswith("--from-block="):
                frm = int(a.split("=", 1)[1])
            elif a.startswith("--to-block="):
                to = int(a.split("=", 1)[1])
            elif a.startswith("--expect="):
                expect = a.split("=", 1)[1].split(",")
        assert frm is not None and to is not None, "test needs --from-block and --to-block"
        expected = expect if expect else [e[0] for e in EVENTS]
        cmd_test(frm, to, expected)
    elif cmd == "topics":
        for (name, sig, _f) in EVENTS:
            print(f"{name}: {sig} -> {topic0(sig)}")
    else:
        sys.exit(f"unknown command: {cmd}")


if __name__ == "__main__":
    main()
