#!/usr/bin/env python3
"""Fast scan: find the most recent FAILED (status 0) txs NOT from our wallet.
Unbuffered prints. Reads ATLANTIC_RPC_URL from env."""
import os, sys, json, requests

RPC = os.environ["ATLANTIC_RPC_URL"]
WALLET = "0xf76e6b0920e9332ff4410f6dd53f01722abc71a3"  # lowercase compare
DEPTH = int(sys.argv[1]) if len(sys.argv) > 1 else 300
WANT = int(sys.argv[2]) if len(sys.argv) > 2 else 3

def rpc(method, params):
    r = requests.post(RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=60)
    r.raise_for_status()
    d = r.json()
    if "error" in d:
        raise RuntimeError(d["error"])
    return d["result"]

latest = int(rpc("eth_blockNumber", []), 16)
print(f"latest={latest} depth={DEPTH} want={WANT}", flush=True)
found = []
for b in range(latest, max(latest - DEPTH, 0), -1):
    blk = rpc("eth_getBlockByNumber", [hex(b), True])
    if not blk:
        continue
    for tx in blk.get("transactions", []) or []:
        if tx.get("from", "").lower() == WALLET:
            continue
        rc = rpc("eth_getTransactionReceipt", [tx["hash"]])
        if rc and rc.get("status") == "0x0":
            print(json.dumps({
                "hash": tx["hash"], "block": b,
                "from": tx["from"], "to": tx.get("to"),
                "gas": int(tx["gas"], 16),
                "gasUsed": int(rc["gasUsed"], 16),
                "value": tx.get("value"),
                "input_len": len(tx.get("input", "0x")),
            }), flush=True)
            found.append(tx["hash"])
            if len(found) >= WANT:
                print("DONE", flush=True)
                sys.exit(0)
print("DONE-partial", len(found), flush=True)
