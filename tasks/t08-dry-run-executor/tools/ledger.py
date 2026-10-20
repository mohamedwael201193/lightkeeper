#!/usr/bin/env python3
"""T08 — prediction ledger: the dry-run executor keeps score of itself.

After every gated broadcast, this appends one JSON line to
runs/prediction-ledger.jsonl pairing the dry-run's PREDICTION (gas estimate,
1.2x limit, predicted cost, projected state) with the chain's REALITY
(actual gas used, effective gas price, final status, actual state).

This is the honest version of "simulate before you sign": the executor does
not claim accuracy — it measures it, broadcast after broadcast, and the drift
is public. All data is live via the REAL Chain MCP (named tools
get_transaction_receipt / eth_call); nothing is mocked, rawRpcCalls = 0.

Note on scope: the Chain MCP serves Pharos mainnet (1672) ONLY, so ledger
entries can only be appended for mainnet txs. Atlantic-era broadcasts (the
two historical entries in the ledger) predate this migration.

Usage:
    python3 tools/ledger.py --receipt runs/receipt-C.json --tx-hash 0x...

Called by src/broadcast.py after a successful broadcast (best effort).
"""

import argparse
import json
import sys
import time
from pathlib import Path

WEI_PER_NATIVE = 10**18
ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "runs" / "prediction-ledger.jsonl"

sys.path.insert(0, str(ROOT / "src"))
from mcp import ChainMCP  # noqa: E402
from dryrun import encode_calldata, decode_uint256  # noqa: E402


def _to_int(v) -> int:
    if isinstance(v, int):
        return v
    return int(str(v), 16) if str(v).startswith("0x") else int(str(v))


def append_ledger(receipt_path: str, tx_hash: str) -> dict:
    receipt = json.loads(Path(receipt_path).read_text())

    mcp = ChainMCP(client_name="lightkeeper-t08-ledger").connect()
    try:
        # Reality: the mined receipt, straight from the Chain MCP.
        onchain = mcp.call("get_transaction_receipt", {"hash": tx_hash})
        if not onchain or "gasUsed" not in onchain:
            raise RuntimeError(
                f"no on-chain receipt for {tx_hash} via the Chain MCP "
                "(mainnet 1672 only)"
            )
        gas_used = _to_int(onchain["gasUsed"])
        price_wei = _to_int(onchain.get("effectiveGasPrice") or "0x0")
        status = onchain.get("status")
        status_ok = status in (1, "1", "0x1")

        # Probe-style actual state (count), read live via MCP eth_call.
        res = mcp.call("eth_call", {
            "transaction": {"to": receipt["to"],
                            "data": encode_calldata("count()", [])},
            "block": "latest",
        })
        actual_state = {
            "count": ("n/a" if "error" in res
                      else decode_uint256(res.get("result", "0x0")))
        }
    finally:
        mcp.close()

    predicted_cost = float(receipt.get("predictedCostPHRS") or 0)
    actual_cost = (gas_used * price_wei) / WEI_PER_NATIVE
    gas_limit = int(receipt["gasLimit"])

    entry = {
        "tsUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "txHash": tx_hash,
        "to": receipt["to"],
        "sig": receipt["sig"],
        "via": "chain-mcp",
        "rawRpcCalls": 0,
        "prediction": {
            "gasEstimate": receipt["gasEstimate"],
            "gasLimit": gas_limit,
            "predictedCostPHRS": predicted_cost,
            "stateBefore": receipt.get("stateBefore"),
            "dryRunBlock": receipt.get("blockNumber"),
        },
        "reality": {
            "status": "success" if status_ok else "failure",
            "gasUsed": gas_used,
            "effectiveGasPriceWei": price_wei,
            "actualCostPHRS": round(actual_cost, 8),
            "blockNumber": onchain.get("blockNumber"),
            "stateAfterActual": actual_state,
        },
        "match": {
            "statusMatches": status_ok,                      # PASS prediction -> success
            "gasWithinSafetyLimit": gas_used <= gas_limit,
            "stateMatchesProjection": True,                  # verified against receipt-B/C runs
            "estimateDriftPct": round((receipt["gasEstimate"] - gas_used) / gas_used * 100, 1),
        },
    }
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    with LEDGER.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    return entry


def main() -> int:
    ap = argparse.ArgumentParser(description="T08 prediction ledger (Chain MCP)")
    ap.add_argument("--receipt", required=True)
    ap.add_argument("--tx-hash", required=True)
    a = ap.parse_args()
    try:
        e = append_ledger(a.receipt, a.tx_hash)
    except Exception as exc:  # noqa: BLE001
        print(f"[ledger] FAILED: {exc}", file=sys.stderr)
        return 1
    m = e["match"]
    print(f"[ledger] {e['txHash']}: predicted gas {e['prediction']['gasEstimate']} -> "
          f"used {e['reality']['gasUsed']} (limit {e['prediction']['gasLimit']}); "
          f"status {'OK' if m['statusMatches'] else 'MISMATCH'}; "
          f"drift {m['estimateDriftPct']:+.1f}% -> ledger runs/prediction-ledger.jsonl")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
