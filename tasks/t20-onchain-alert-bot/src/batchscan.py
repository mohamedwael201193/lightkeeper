#!/usr/bin/env python3
"""t20-onchain-alert-bot — batched block fetcher for `watch.sh --catchup`.

Prints one JSON line per block on stdout:
    {"block": N, "txs": [{"hash": "0x..", "to": "0x.."|null, "value": "0x.."}]}
followed by a final sentinel line:
    {"done": true, "from": F, "to": T}

The watcher only trusts cursor advancement up to the last emitted block line,
and only reports "catchup done" if the sentinel arrives.

Batches 25 eth_getBlockByNumber(full=true) calls per HTTP POST over one
persistent connection, with retry + backoff. Plain-language errors on stderr;
nonzero exit on persistent failure. RPC URL from ATLANTIC_RPC_URL (env only).
"""
import json
import os
import sys
import time
import urllib.request

RPC = os.environ.get("ATLANTIC_RPC_URL")
if not RPC:
    sys.stderr.write("batchscan: FATAL: ATLANTIC_RPC_URL is not set (env only)\n")
    sys.exit(1)

if len(sys.argv) != 3:
    sys.stderr.write("usage: batchscan.py <from_block> <to_block>\n")
    sys.exit(1)

FROM, TO = int(sys.argv[1]), int(sys.argv[2])
BATCH = 25


def rpc_batch(payloads):
    data = json.dumps(payloads).encode()
    for attempt in range(1, 5):
        try:
            req = urllib.request.Request(
                RPC, data=data, headers={"content-type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                body = json.load(r)
            items = body if isinstance(body, list) else [body]
            return {p.get("id"): p for p in items}
        except Exception as e:  # noqa: BLE001 - plain-language retry notice
            wait = attempt * 5
            sys.stderr.write(
                f"batchscan: batch request failed (attempt {attempt}/4): {e}; "
                f"retrying in {wait}s\n"
            )
            time.sleep(wait)
    sys.stderr.write("batchscan: FATAL: batch request failed 4 times; giving up\n")
    sys.exit(1)


fetched = 0
for start in range(FROM, TO + 1, BATCH):
    end = min(start + BATCH - 1, TO)
    payloads = [
        {
            "jsonrpc": "2.0",
            "id": b,
            "method": "eth_getBlockByNumber",
            "params": [hex(b), True],
        }
        for b in range(start, end + 1)
    ]
    by_id = rpc_batch(payloads)
    for b in range(start, end + 1):
        resp = by_id.get(b) or {}
        if resp.get("error"):
            sys.stderr.write(
                f"batchscan: FATAL: RPC error for block {b}: {resp['error']}\n"
            )
            sys.exit(1)
        blk = resp.get("result") or {}
        txs = [
            {
                "hash": t.get("hash"),
                "to": t.get("to"),
                "value": t.get("value", "0x0"),
            }
            for t in (blk.get("transactions") or [])
        ]
        sys.stdout.write(json.dumps({"block": b, "txs": txs}) + "\n")
        fetched += 1
    sys.stderr.write(f"batchscan: fetched {fetched}/{TO - FROM + 1} blocks (up to {end})\n")
    sys.stdout.flush()

sys.stdout.write(json.dumps({"done": True, "from": FROM, "to": TO}) + "\n")
