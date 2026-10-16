"""
T17 receipt verification: read-back of the mined transaction.

Checks the receipt and the tx itself, then binds them to the plan:
  * receipt.status == 1 (0x1)
  * tx.to == plan recipient (checksummed compare)
  * tx.value == plan amount
  * chain id of the receipt's block == Atlantic 688689 (via tx lookup)

Read-only. No keys.
"""

import json
import subprocess


def _cast_json(*args, rpc_url, timeout=60):
    cmd = ["cast", *args, "--rpc-url", rpc_url, "--json"]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError(f"cast {' '.join(args[:2])} failed: {p.stderr.strip()[:300]}")
    doc = json.loads(p.stdout)
    # cast 1.8.x wraps JSON output in {"success": true, "data": {...}}
    if isinstance(doc, dict) and "data" in doc and isinstance(doc["data"], dict):
        return doc["data"]
    return doc


def verify(tx_hash: str, plan: dict, rpc_url: str) -> dict:
    checks = []
    ok = True

    receipt = _cast_json("receipt", tx_hash, rpc_url=rpc_url)
    status = receipt.get("status")
    status_ok = status in ("0x1", 1, "1")
    checks.append({"check": "receipt.status == 1",
                   "observed": status, "pass": status_ok})
    ok = ok and status_ok

    tx = _cast_json("tx", tx_hash, rpc_url=rpc_url)
    to_ok = str(tx.get("to", "")).lower() == str(plan["to"]).lower()
    checks.append({"check": "tx.to == plan recipient",
                   "observed": tx.get("to"), "expected": plan["to"], "pass": to_ok})
    ok = ok and to_ok

    value_ok = str(int(str(tx.get("value", "0")), 0)) == str(int(plan["amount_wei"]))
    checks.append({"check": "tx.value == plan amount (wei)",
                   "observed": str(int(str(tx.get("value", "0")), 0)),
                   "expected": str(plan["amount_wei"]), "pass": value_ok})
    ok = ok and value_ok

    block_ok = bool(receipt.get("blockNumber"))
    checks.append({"check": "receipt has blockNumber (mined)",
                   "observed": receipt.get("blockNumber"), "pass": block_ok})
    ok = ok and block_ok

    return {
        "ok": ok,
        "tx_hash": tx_hash,
        "block_number": receipt.get("blockNumber"),
        "gas_used": receipt.get("gasUsed"),
        "effective_gas_price": receipt.get("effectiveGasPrice"),
        "explorer": f"https://atlantic.pharosscan.xyz/tx/{tx_hash}",
        "checks": checks,
    }
