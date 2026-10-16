#!/usr/bin/env python3
"""
T22 "Quoted vs Settled" probe.

Every gas tool quotes `eth_gasPrice`. LIGHTKEEPER's differentiator: it measures
what the chain ACTUALLY charged — the average `effectiveGasPrice` of the most
recently settled Atlantic transactions — and reports the quote-vs-settle gap
on real numbers. Pure reads (Tier A): no key, no broadcast, no cost.

Usage: probe_settled_price.py   (reads ATLANTIC_RPC_URL from env)
Writes evidence/settled-price.json.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
EVIDENCE = HERE / "evidence"

MAX_SCAN_BLOCKS = 60
MAX_RECEIPTS = 10
RPC_RETRIES = 3
RPC_RETRY_DELAY_S = 2


def rpc_call(rpc_url: str, method: str, params: list) -> object:
    """POST a JSON-RPC call with retry+backoff on transient failures."""
    last_err: Exception | None = None
    for attempt in range(RPC_RETRIES):
        try:
            p = subprocess.run(
                ["curl", "-s", "-m", "12", "-X", "POST", rpc_url,
                 "-H", "content-type: application/json",
                 "-d", json.dumps({"jsonrpc": "2.0", "id": 1,
                                   "method": method, "params": params})],
                capture_output=True, text=True, timeout=20,
            )
            if not p.stdout.strip():
                raise RuntimeError("empty response (transient)")
            body = json.loads(p.stdout)
            if "error" in body:
                raise RuntimeError(f"{method} error: {body['error']}")
            return body["result"]
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < RPC_RETRIES - 1:
                time.sleep(RPC_RETRY_DELAY_S * (attempt + 1))
    raise RuntimeError(f"{method} failed after {RPC_RETRIES} attempts: {last_err}")


def main() -> int:
    rpc_url = os.environ["ATLANTIC_RPC_URL"]
    quoted = int(rpc_call(rpc_url, "eth_gasPrice", []), 16)
    latest = int(rpc_call(rpc_url, "eth_blockNumber", []), 16)

    settled: list[dict] = []
    scanned = 0
    b = latest
    while len(settled) < MAX_RECEIPTS and scanned < MAX_SCAN_BLOCKS:
        blk = rpc_call(rpc_url, "eth_getBlockByNumber", [hex(b), True])
        scanned += 1
        if blk and blk.get("transactions"):
            for t in blk["transactions"]:
                h = t if isinstance(t, str) else t.get("hash")
                if not h or len(settled) >= MAX_RECEIPTS:
                    break
                rec = rpc_call(rpc_url, "eth_getTransactionReceipt", [h])
                if rec and rec.get("status") == "0x1":
                    settled.append({
                        "hash": h,
                        "block": int(rec["blockNumber"], 16),
                        "effective_gas_price_wei": int(rec["effectiveGasPrice"], 16),
                        "gas_used": int(rec["gasUsed"], 16),
                    })
        b -= 1

    avg = sum(s["effective_gas_price_wei"] for s in settled) // len(settled) if settled else 0
    snapshot = {
        "chain_id": 688689,
        "quoted_gas_price_wei": quoted,
        "latest_block_scanned": latest,
        "blocks_scanned": scanned,
        "settled_count": len(settled),
        "settled": settled,
        "avg_effective_gas_price_wei": avg,
        "gap_wei_per_gas": quoted - avg,
        "method": "latest-block-backwalk, full receipts, status==0x1 only",
        "note": ("The chain quotes eth_gasPrice but settles transactions at the "
                 "base fee (~1 gwei) when priority fees are 0. The optimizer's "
                 "honest savings math uses SETTLED numbers, not quoted ones."),
    }
    EVIDENCE.mkdir(exist_ok=True)
    (EVIDENCE / "settled-price.json").write_text(json.dumps(snapshot, indent=2))
    print(f"quoted {quoted} wei, avg settled {avg} wei, n={len(settled)}, "
          f"gap {quoted - avg} wei/gas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
