#!/usr/bin/env python3
"""Scan back N blocks for contract creations from the deployer wallet and
identify T25's TestReverter by the SUPPORT-DIAG marker in runtime code.
Reads ATLANTIC_RPC_URL from env. Prints findings only."""
import os, sys, json, requests

RPC = os.environ["ATLANTIC_RPC_URL"]
WALLET = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
MARKER = "535550504f52542d44494147"  # hex("SUPPORT-DIAG")
DEPTH = int(sys.argv[1]) if len(sys.argv) > 1 else 400

def rpc(method, params):
    r = requests.post(RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=60)
    r.raise_for_status()
    d = r.json()
    if "error" in d:
        raise RuntimeError(d["error"])
    return d["result"]

latest = int(rpc("eth_blockNumber", []), 16)
print("latest:", latest, "| scanning back", DEPTH, "blocks")
for b in range(latest, max(latest - DEPTH, 0), -1):
    blk = rpc("eth_getBlockByNumber", [hex(b), True])
    if not blk:
        continue
    for tx in blk.get("transactions", []) or []:
        if tx.get("from", "").lower() == WALLET.lower() and tx.get("to") is None:
            rc = rpc("eth_getTransactionReceipt", [tx["hash"]])
            addr = rc.get("contractAddress") if rc else None
            code = rpc("eth_getCode", [addr, "latest"]) if addr else "0x"
            mine = MARKER.lower() in code.lower()
            tag = " <== T25 TestReverter" if mine else ""
            print(f"block {b} nonce {int(tx['nonce'],16)} tx {tx['hash']} -> {addr} codeLen {len(code)}{tag}")
print("done")
