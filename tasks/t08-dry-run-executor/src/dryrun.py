#!/usr/bin/env python3
"""T08 Dry-Run Executor — the simulation gate.

Pipeline (layered, in order):
    1. validate      — address/sig sanity + chain-id must be Atlantic (688689)
    2. eth_call      — `cast call` surfaces revert reasons without broadcasting
    3. estimateGas    — `cast estimate`; failure -> exact revert reason, no gas
    4. gas price      — `cast gas-price` for the predicted-cost math
    5. state projection — before/after snapshots, marked "chain unmodified"
    6. receipt       — SimulationReceipt JSON; PASS or FAIL (blocked)

GATE ARCHITECTURE: this module STRUCTURALLY CANNOT broadcast.
It never reads secrets from the environment and never passes a key to cast.
Broadcasting lives in the separate `broadcast.py`, which only acts on a
SimulationReceipt whose status is PASS. A FAIL receipt cannot be broadcast.

Usage:
    python3 src/dryrun.py --rpc-url URL --from ADDR --to ADDR \\
        --sig "ping()" --out runs/receipt-B.json
"""

import argparse
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from revert_decode import extract_reason_from_cast_stderr  # noqa: E402

ATLANTIC_CHAIN_ID = 688689
GAS_SAFETY_FACTOR = 1.2
WEI_PER_PHRS = 10**18

# This module must never gain secret-reading or key-passing capability.
# Runtime tripwire: forbids the dangerous tokens without naming them literally
# (so the guard itself cannot trip the check).
def _guard_no_signer() -> None:
    src = Path(__file__).read_text()
    body = "\n".join(
        ln for ln in src.splitlines()
        if "guard_no_signer" not in ln and not ln.lstrip().startswith("#")
    )
    for tok in ("get" + "env", "os." + "environ", "--private" + "-key"):
        assert tok not in body, f"signer capability leaked into dry-run module: {tok}"


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120)


def is_address(a: str) -> bool:
    return bool(re.fullmatch(r"0x[0-9a-fA-F]{40}", a or ""))


def step_validate(rpc: str, from_addr: str, to: str, sig: str) -> dict:
    if not is_address(from_addr):
        raise ValueError(f"invalid --from address: {from_addr}")
    if not is_address(to):
        raise ValueError(f"invalid --to address: {to}")
    if not sig or "(" not in sig:
        raise ValueError(f"invalid --sig: {sig}")
    r = run(["cast", "chain-id", "--rpc-url", rpc])
    if r.returncode != 0:
        raise RuntimeError(f"could not read chain id: {r.stderr.strip()}")
    chain_id = int(r.stdout.strip())
    if chain_id != ATLANTIC_CHAIN_ID:
        raise RuntimeError(
            f"REFUSED: chain id {chain_id} is not Atlantic ({ATLANTIC_CHAIN_ID}). "
            "This executor only dry-runs on Atlantic testnet."
        )
    r = run(["cast", "block-number", "--rpc-url", rpc])
    if r.returncode != 0:
        raise RuntimeError(f"could not read block number: {r.stderr.strip()}")
    return {"chainId": chain_id, "blockNumber": int(r.stdout.strip())}


def snapshot_state(rpc: str, to: str) -> dict:
    """Read-only before/after snapshot. Probe-specific: count() + balance."""
    snap = {}
    r = run(["cast", "call", to, "count()(uint256)", "--rpc-url", rpc])
    snap["count"] = r.stdout.strip() if r.returncode == 0 else "n/a"
    r = run(["cast", "balance", to, "--rpc-url", rpc])
    snap["balanceWei"] = r.stdout.strip() if r.returncode == 0 else "n/a"
    return snap


def main() -> int:
    _guard_no_signer()
    ap = argparse.ArgumentParser(description="T08 dry-run executor (simulation only)")
    ap.add_argument("--rpc-url", required=True)
    ap.add_argument("--from", dest="from_addr", required=True)
    ap.add_argument("--to", required=True)
    ap.add_argument("--sig", required=True)
    ap.add_argument("--args", nargs="*", default=[], help="extra sig args")
    ap.add_argument("--value", default="0", help="wei to send with the call")
    ap.add_argument("--out", required=True, help="SimulationReceipt JSON path")
    a = ap.parse_args()

    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    receipt: dict = {
        "tool": "t08-dry-run-executor",
        "schema": "SimulationReceipt/1",
        "startedUtc": started,
        "from": a.from_addr,
        "to": a.to,
        "sig": a.sig,
        "sigArgs": a.args,
        "valueWei": a.value,
        "gasSafetyFactor": GAS_SAFETY_FACTOR,
        "chainModified": False,  # dry-run NEVER modifies chain state
    }

    try:
        # 1. validation
        net = step_validate(a.rpc_url, a.from_addr, a.to, a.sig)
        receipt.update(net)

        # 2. eth_call — surfaces the revert reason without broadcasting
        call_cmd = ["cast", "call", a.to, a.sig, *a.args,
                    "--from", a.from_addr, "--rpc-url", a.rpc_url]
        if a.value != "0":
            call_cmd += ["--value", a.value]
        call_r = run(call_cmd)
        receipt["callStdout"] = call_r.stdout.strip()[:200]
        receipt["callOk"] = call_r.returncode == 0

        # 3. estimateGas — failure here carries the exact revert reason
        est_cmd = ["cast", "estimate", a.to, a.sig, *a.args,
                   "--from", a.from_addr, "--rpc-url", a.rpc_url]
        if a.value != "0":
            est_cmd += ["--value", a.value]
        est_r = run(est_cmd)

        before = snapshot_state(a.rpc_url, a.to)
        receipt["stateBefore"] = before
        receipt["stateBeforeNote"] = "on-chain read; chain unmodified by dry-run"

        if est_r.returncode == 0:
            gas_est = int(est_r.stdout.strip())
            gas_limit = math.ceil(gas_est * GAS_SAFETY_FACTOR)
            gp = run(["cast", "gas-price", "--rpc-url", a.rpc_url])
            gas_price = int(gp.stdout.strip())
            cost_wei = gas_limit * gas_price
            receipt["status"] = "PASS"
            receipt["gasEstimate"] = gas_est
            receipt["gasLimit"] = gas_limit
            receipt["gasPriceWei"] = gas_price
            receipt["predictedCostWei"] = cost_wei
            receipt["predictedCostPHRS"] = cost_wei / WEI_PER_PHRS
            receipt["revertReason"] = None
            receipt["stateAfterProjected"] = {
                **before,
                "note": "projected: ping() increments count by 1; "
                        "boom() leaves state unchanged (it reverts)",
            }
        else:
            reason = extract_reason_from_cast_stderr(est_r.stderr)
            receipt["status"] = "FAIL"
            receipt["gasEstimate"] = None
            receipt["gasLimit"] = None
            receipt["gasPriceWei"] = None
            receipt["predictedCostWei"] = None
            receipt["predictedCostPHRS"] = None
            receipt["revertReason"] = reason or "reverted (reason not parsed)"
            receipt["estimateStderrTail"] = est_r.stderr.strip().splitlines()[-3:]
            receipt["stateAfterProjected"] = {
                **before,
                "note": "projected: revert -> state unchanged",
            }

        receipt["stateAfterNote"] = "projection only; chain unmodified by dry-run"
    except Exception as exc:  # noqa: BLE001 - a dry-run must always emit a receipt
        receipt["status"] = "ERROR"
        receipt["error"] = str(exc)

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(receipt, indent=2) + "\n")

    status = receipt.get("status")
    if status == "PASS":
        print(f"[dry-run] PASS  gas={receipt['gasEstimate']} "
              f"limit(1.2x)={receipt['gasLimit']} "
              f"predictedCost={receipt['predictedCostPHRS']:.8f} PHRS")
    elif status == "FAIL":
        print(f"[dry-run] FAIL  revert reason: {receipt['revertReason']}")
        print("[dry-run] GATE: execution BLOCKED — no broadcast will be attempted.")
    else:
        print(f"[dry-run] {status}: {receipt.get('error')}")
    print(f"[dry-run] receipt -> {out}")
    return 0 if status in ("PASS", "FAIL") else 1


if __name__ == "__main__":
    raise SystemExit(main())
