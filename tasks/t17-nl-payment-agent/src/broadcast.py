"""
T17 broadcaster — the ONLY module allowed to touch a private key, and only
behind the explicit confirmation gate.

Hard rules:
  * Key comes from the ATLANTIC_DEPLOYER_KEY env var (never argv, never files
    inside the repo, never printed, never logged).
  * Broadcast happens ONLY if gate.check_confirmed() passes for this exact
    plan_id AND chain-id == 688689 AND the run has not executed before.
  * The cast invocation is wrapped in `flock /tmp/lk-nonce.lock` so the 28
    LIGHTKEEPER workers sharing one key never collide on nonces.
  * The command line is NEVER echoed to logs/transcripts.
"""

import json
import os
import subprocess
import time

ATLANTIC_CHAIN_ID = 688689
NONCE_LOCK = "/tmp/lk-nonce.lock"


def _get_key() -> str:
    key = os.environ.get("ATLANTIC_DEPLOYER_KEY", "")
    if not key:
        raise RuntimeError("ATLANTIC_DEPLOYER_KEY is not set — refusing to broadcast.")
    return key


def broadcast(run_dir: str, plan: dict, plan_id: str, deployer: str,
              rpc_url: str, validation: dict) -> dict:
    from . import gate  # local import keeps broadcaster importable standalone

    gate_ok = gate.check_confirmed(run_dir, plan_id)
    if not gate_ok["ok"]:
        return {"ok": False, "stage": "gate", "reason": gate_ok["reason"]}

    # Re-assert chain identity at broadcast time (mainnet confusion firewall).
    p = subprocess.run(["cast", "chain-id", "--rpc-url", rpc_url],
                       capture_output=True, text=True, timeout=30)
    chain_id = int(p.stdout.strip()) if p.returncode == 0 else -1
    if chain_id != ATLANTIC_CHAIN_ID:
        return {"ok": False, "stage": "chain",
                "reason": f"REFUSED: chain id {chain_id} != Atlantic {ATLANTIC_CHAIN_ID}."}

    # Re-check balance covers amount + fresh gas price at broadcast time.
    p = subprocess.run(["cast", "balance", deployer, "--rpc-url", rpc_url],
                       capture_output=True, text=True, timeout=30)
    balance = int(p.stdout.strip()) if p.returncode == 0 else 0
    p = subprocess.run(["cast", "gas-price", "--rpc-url", rpc_url],
                       capture_output=True, text=True, timeout=30)
    gas_price = int(p.stdout.strip()) if p.returncode == 0 else 0
    need = int(plan["amount_wei"]) + gas_price * int(validation["gas_limit"])
    if balance < need:
        return {"ok": False, "stage": "balance",
                "reason": f"REFUSED: balance {balance} wei < needed {need} wei."}

    # Nonce-safe, receipt-waiting broadcast. Key is passed via env-derived
    # argv but the command line is never printed anywhere.
    key = _get_key()
    cmd = ["flock", NONCE_LOCK, "cast", "send", plan["to"],
           "--value", str(plan["amount_wei"]),
           "--rpc-url", rpc_url, "--private-key", key]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if p.returncode != 0:
        err = p.stderr.strip()[:500]
        return {"ok": False, "stage": "broadcast",
                "reason": f"cast send failed: {err}"}

    tx_hash = None
    for line in p.stdout.splitlines():
        if "transactionHash" in line:
            tx_hash = line.split()[-1].strip().strip('"')
    if not tx_hash:
        return {"ok": False, "stage": "broadcast",
                "reason": "cast send succeeded but no transactionHash in output.",
                "stdout_tail": p.stdout[-500:]}

    executed = {
        "plan_id": plan_id,
        "tx_hash": tx_hash,
        "chain_id": chain_id,
        "gas_price_wei": str(gas_price),
        "executed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with open(os.path.join(run_dir, "executed.json"), "w") as f:
        json.dump(executed, f, indent=2)
    return {"ok": True, "executed": executed}
