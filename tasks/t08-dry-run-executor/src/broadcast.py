#!/usr/bin/env python3
"""T08 — the ONLY module allowed to broadcast.

Gate contract:
  * Loads a SimulationReceipt JSON produced by src/dryrun.py.
  * Broadcasts ONLY if receipt.status == "PASS".
  * Replays the EXACT parameters from the receipt (to/sig/args/value) and
    uses the receipt's 1.2x gasLimit — never a hand-picked number.
  * Any other status (FAIL / ERROR / missing) -> EXECUTION REFUSED, non-zero
    exit, and the refusal is appended to runs/blocked-execution.log.

Nonce safety (28 workers share one key): every broadcast goes through
`flock /tmp/lk-nonce.lock cast send ...`. No custom nonce scheme.

Usage:
    python3 src/broadcast.py --receipt runs/receipt-B.json \\
        --rpc-url "$ATLANTIC_RPC_URL" --key-env DEPLOYER_PRIVATE_KEY

The key is read from the environment at runtime (transient use only);
it is NEVER printed, logged, or written to disk.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path


def refuse(receipt_path: str, reason: str, log_path: Path) -> int:
    msg = (f"[{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}] "
           f"EXECUTION REFUSED receipt={receipt_path} reason={reason}\n")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a") as f:
        f.write(msg)
    print(msg.strip())
    return 2


def main() -> int:
    ap = argparse.ArgumentParser(description="T08 gated broadcaster (PASS tickets only)")
    ap.add_argument("--receipt", required=True)
    ap.add_argument("--rpc-url", required=True)
    ap.add_argument("--key-env", default="DEPLOYER_PRIVATE_KEY")
    ap.add_argument("--log", default="runs/blocked-execution.log")
    a = ap.parse_args()

    log_path = Path(a.log)
    try:
        receipt = json.loads(Path(a.receipt).read_text())
    except Exception as exc:  # noqa: BLE001
        return refuse(a.receipt, f"unreadable receipt: {exc}", log_path)

    status = receipt.get("status")
    if status != "PASS":
        return refuse(
            a.receipt,
            f"ticket status is '{status}' (need PASS); "
            f"revertReason={receipt.get('revertReason')}",
            log_path,
        )
    # Migration guard (2026-10-20): dryrun.py now issues Chain MCP tickets on
    # Pharos mainnet (chainId 1672). This broadcast path is the Atlantic
    # `cast send` path (chain 688689) — refusing a mainnet ticket here rather
    # than sending it to the wrong chain.
    if receipt.get("chainId") not in (None, 688689):
        return refuse(
            a.receipt,
            f"ticket chainId is {receipt.get('chainId')} (Pharos mainnet via Chain MCP); "
            "this broadcaster only sends on Atlantic (688689) — refusing",
            log_path,
        )
    for field in ("to", "sig", "gasLimit"):
        if receipt.get(field) in (None, ""):
            return refuse(a.receipt, f"PASS ticket missing field '{field}'", log_path)

    key = os.environ.get(a.key_env, "")
    if not key:
        return refuse(a.receipt, f"env {a.key_env} not set", log_path)

    cmd = [
        "flock", "/tmp/lk-nonce.lock",
        "cast", "send", receipt["to"], receipt["sig"], *receipt.get("sigArgs", []),
        "--from", receipt["from"],
        "--rpc-url", a.rpc_url,
        "--private-key", key,
        "--gas-limit", str(receipt["gasLimit"]),
    ]
    if str(receipt.get("valueWei", "0")) != "0":
        cmd += ["--value", str(receipt["valueWei"])]

    print(f"[broadcast] ticket PASS; replaying receipt from {a.receipt}")
    print(f"[broadcast] to={receipt['to']} sig={receipt['sig']} "
          f"gasLimit={receipt['gasLimit']} (1.2x estimate)")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    # Key hygiene: never let the key (or anything resembling it) into output.
    print(r.stdout)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        return 1
    # Prediction ledger: the executor keeps score of its own accuracy.
    # Best effort — the tx already landed; a ledger failure must not fail
    # the broadcast result.
    m = re.search(r"transactionHash\s+(0x[0-9a-fA-F]{64})", r.stdout)
    if m:
        tx_hash = m.group(1)
        ledger_py = Path(__file__).resolve().parent.parent / "tools" / "ledger.py"
        lr = subprocess.run(
            [sys.executable, str(ledger_py), "--receipt", a.receipt,
             "--tx-hash", tx_hash],
            capture_output=True, text=True, timeout=180,
        )
        if lr.stdout.strip():
            print(lr.stdout.strip())
        if lr.returncode != 0:
            print(f"[ledger] warning (non-fatal): {lr.stderr.strip()}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
