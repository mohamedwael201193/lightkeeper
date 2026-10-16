#!/usr/bin/env python3
"""
T22 Gas Fee Optimizer — demo driver.

Runs the full official-requirement loop against Atlantic testnet (chain 688689):

  1. Track gas price over time (agent-side eth_gasPrice polling, block-pinned) -> history
  2. Compute speed tiers (slow/standard/fast) with documented methodology
  3. Job A (favorable window): tx with deadline, submitted when gas <= slow tier
  4. Job B (deadline-forced): tx with deadline, threshold below market -> submitted
     at deadline minus SUBMIT_MARGIN on the freshest sample (NEVER missed, never
     silently held past deadline)
  5. Report actual gas paid (receipt effectiveGasPrice) vs price at request time

Usage: run_demo.py   (reads ATLANTIC_RPC_URL, DEPLOYER_PRIVATE_KEY from env)

Secrets are read from env only — never printed, never written to files.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from gas_optimizer import (  # noqa: E402
    compute_tiers,
    read_block_number,
    read_gas_price,
    recommend_price,
)

HERE = Path(__file__).resolve().parent.parent
EVIDENCE = HERE / "evidence"

SAMPLE_COUNT = 12          # eth_gasPrice polls
SAMPLE_INTERVAL_S = 4      # seconds between polls
SUBMIT_MARGIN_S = 10       # deadline fail-safe margin: at the margin we submit
                           # on the freshest sample, abort loudly, never hold
DUST_VALUE_ETHER = "0.00001"
DEFAULT_WALLET = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"


def wei_to_gwei(w: int) -> float:
    return w / 1e9


def broadcast_dust(wallet: str, gas_price_wei: int, rpc_url: str, key: str) -> str:
    """Send a real dust self-transfer under the shared nonce lock.

    Returns the tx hash. `cast send` waits for the receipt by default.
    """
    cmd = (
        "flock /tmp/lk-nonce.lock cast send "
        f"{wallet} --value {DUST_VALUE_ETHER}ether "
        f"--gas-price {gas_price_wei} "
        f'--rpc-url "$ATLANTIC_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY"'
    )
    proc = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True,
        timeout=180,
        env={**os.environ, "ATLANTIC_RPC_URL": rpc_url, "DEPLOYER_PRIVATE_KEY": key},
    )
    if proc.returncode != 0:
        raise RuntimeError(f"broadcast failed: {proc.stderr.strip()[-500:]}")
    hashes = [t for t in proc.stdout.replace("\n", " ").split()
              if t.startswith("0x") and len(t) == 66]
    if not hashes:
        raise RuntimeError(f"no tx hash in cast output: {proc.stdout[:500]}")
    return hashes[-1]


def cast_receipt(tx_hash: str, rpc_url: str) -> dict:
    proc = subprocess.run(
        ["cast", "receipt", tx_hash, "--json", "--rpc-url", rpc_url],
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"receipt fetch failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def run_job(name: str, deadline_s: int, favorable_threshold_wei: int,
            submit_price_wei: int, wallet: str, rpc_url: str, key: str) -> dict:
    """Hold a dust tx until gas is favorable OR the deadline arrives.

    Fail-safe (per the build plan): once `deadline - SUBMIT_MARGIN_S` passes,
    submit immediately on the freshest known sample. A missing-data failure
    aborts LOUDLY — it never silently holds.
    """
    t0 = time.time()
    req_price = read_gas_price(rpc_url)
    while True:
        elapsed = time.time() - t0
        px = read_gas_price(rpc_url)
        if px <= favorable_threshold_wei:
            reason = "favorable_window"
            print(f"[{name}] favorable at t+{elapsed:.1f}s "
                  f"({px} wei <= threshold {favorable_threshold_wei}) -> broadcasting at {submit_price_wei} wei")
            break
        if elapsed >= deadline_s - SUBMIT_MARGIN_S:
            reason = "deadline_reached_forced_submit"
            print(f"[{name}] deadline margin at t+{elapsed:.1f}s "
                  f"(gas {px} wei never <= {favorable_threshold_wei}) -> "
                  f"forced submit at {submit_price_wei} wei. Deadline NEVER missed.")
            break
        time.sleep(2)
    elapsed = time.time() - t0
    tx_hash = broadcast_dust(wallet, submit_price_wei, rpc_url, key)
    rec = cast_receipt(tx_hash, rpc_url)
    eff = int(rec["effectiveGasPrice"], 16)
    gas_used = int(rec["gasUsed"], 16)
    return {
        "job": name,
        "deadline_s": deadline_s,
        "threshold_wei": favorable_threshold_wei,
        "submit_reason": reason,
        "submit_elapsed_s": round(elapsed, 1),
        "price_at_request_wei": req_price,
        "submitted_gas_price_wei": submit_price_wei,
        "tx_hash": tx_hash,
        "effective_gas_price_wei": eff,
        "gas_used": gas_used,
        "cost_wei": eff * gas_used,
        "block_number": int(rec["blockNumber"], 16),
    }


def main() -> int:
    rpc_url = os.environ["ATLANTIC_RPC_URL"]
    key = os.environ["DEPLOYER_PRIVATE_KEY"]
    wallet = os.environ.get("WALLET", DEFAULT_WALLET)
    EVIDENCE.mkdir(exist_ok=True)
    started = time.time()

    # ---- Phase 1: gas-price history (official req 1) ----
    print(f"[1] sampling eth_gasPrice {SAMPLE_COUNT}x ...")
    samples = []
    for i in range(SAMPLE_COUNT):
        block = read_block_number(rpc_url)
        price = read_gas_price(rpc_url)
        samples.append({"block": block, "gas_price_wei": price})
        print(f"    sample {i+1:2d}: block {block} gasPrice {price} wei ({wei_to_gwei(price):.4f} gwei)")
        if i < SAMPLE_COUNT - 1:
            time.sleep(SAMPLE_INTERVAL_S)
    (EVIDENCE / "fee-snapshot.json").write_text(json.dumps({
        "chain_id": 688689,
        "rpc_method": "eth_gasPrice (agent-side polling, each sample block-pinned)",
        "samples": samples,
    }, indent=2))

    # ---- Phase 2: tiers ----
    tier_info = compute_tiers(samples)
    tiers = tier_info["tiers"]
    (EVIDENCE / "tier-table.json").write_text(json.dumps(tier_info, indent=2))
    print("[2] tiers:", {k: f"{wei_to_gwei(v):.4f} gwei" for k, v in tiers.items()})
    std_price, std_tier = recommend_price(tiers, "medium")
    print(f"[2] recommended ({std_tier}) price: {std_price} wei")

    # ---- Phases 3+4: the two jobs (official reqs 2, 3, 4) ----
    job_a = run_job("A-favorable-window", deadline_s=45,
                    favorable_threshold_wei=tiers["slow"],
                    submit_price_wei=std_price,
                    wallet=wallet, rpc_url=rpc_url, key=key)
    # Threshold of 1 wei is deliberately below any real market price: this job
    # simulates a market that never becomes favorable within the window, so the
    # deadline-forced path is what gets exercised.
    job_b = run_job("B-deadline-forced", deadline_s=30,
                    favorable_threshold_wei=1,
                    submit_price_wei=std_price,
                    wallet=wallet, rpc_url=rpc_url, key=key)

    # ---- Phase 5: paid-vs-requested + savings report ----
    report = {
        "chain_id": 688689,
        "total_elapsed_s": round(time.time() - started, 1),
        "tiers_wei": tiers,
        "jobs": [job_a, job_b],
        "savings_vs_fast_tier": [
            {
                "job": j["job"],
                "fast_tier_wei": tiers["fast"],
                "paid_effective_wei": j["effective_gas_price_wei"],
                "saved_per_gas_wei": tiers["fast"] - j["effective_gas_price_wei"],
                "saved_total_wei": (tiers["fast"] - j["effective_gas_price_wei"]) * j["gas_used"],
            }
            for j in (job_a, job_b)
        ],
    }
    (EVIDENCE / "job-reports.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
