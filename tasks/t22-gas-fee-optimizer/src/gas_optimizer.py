"""
T22 Gas Fee Optimizer — core library.

Reads REAL fee data from the Atlantic testnet (chain 688689) and computes
speed tiers (slow / standard / fast) with an explicit, documented
methodology. No mocks: every number comes from RPC reads.
"""

from __future__ import annotations

import json
import subprocess
import time
from typing import Any

TIER_LABELS = ("slow", "standard", "fast")

# Tiers = percentiles of the observation window (see METHODOLOGY in README).
#   slow      = 25th percentile: price was at or below this in 1/4 of samples
#   standard  = 50th percentile (median): the "typical" price
#   fast      = 75th percentile: paying this beats 3/4 of recent samples
_TIER_PCTS = {"slow": 25, "standard": 50, "fast": 75}


def _percentile(sorted_vals: list[int], pct: float) -> int:
    """Nearest-rank percentile on integer wei values."""
    if not sorted_vals:
        raise ValueError("empty sample window")
    rank = max(1, int(__import__("math").ceil(pct / 100 * len(sorted_vals))))
    return sorted_vals[rank - 1]


def compute_tiers(samples: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Compute slow/standard/fast tiers from gas-price samples.

    samples: list of {"block": int, "gas_price_wei": int} — REAL RPC reads.
    Returns {"tiers": {slow, standard, fast} in wei, "method": str,
             "sample_count": int, "min_block": int, "max_block": int,
             "min_wei": int, "max_wei": int}.
    """
    prices = [int(s["gas_price_wei"]) for s in samples]
    blocks = [int(s["block"]) for s in samples]
    ordered = sorted(prices)
    tiers = {label: _percentile(ordered, _TIER_PCTS[label]) for label in TIER_LABELS}
    return {
        "tiers": tiers,
        "method": (
            "nearest-rank percentiles over the observation window: "
            "slow=p25, standard=p50(median), fast=p75"
        ),
        "sample_count": len(samples),
        "min_block": min(blocks),
        "max_block": max(blocks),
        "min_wei": min(prices),
        "max_wei": max(prices),
    }


def recommend_price(tiers: dict[str, int], urgency: str) -> tuple[int, str]:
    """Map urgency to a tier price. urgency in {low, medium, high}."""
    mapping = {"low": "slow", "medium": "standard", "high": "fast"}
    if urgency not in mapping:
        raise ValueError(f"urgency must be one of {sorted(mapping)}")
    tier = mapping[urgency]
    return tiers[tier], tier


def cast_json(args: list[str], rpc_url: str) -> Any:
    """Run cast with JSON output; raise with the RPC error on failure.

    `cast ... --json` wraps results in an envelope
    {"schema_version":1,"success":true,"data":...}; we return the data payload.
    """
    proc = subprocess.run(
        ["cast", *args, "--rpc-url", rpc_url],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"cast {' '.join(args)} failed: {proc.stderr.strip()}")
    parsed = json.loads(proc.stdout)
    if isinstance(parsed, dict) and "data" in parsed:
        return parsed["data"]
    return parsed


def read_block_number(rpc_url: str) -> int:
    return int(cast_json(["block-number", "--json"], rpc_url))


def read_gas_price(rpc_url: str) -> int:
    """REAL eth_gasPrice read in wei."""
    return int(cast_json(["gas-price", "--json"], rpc_url))
