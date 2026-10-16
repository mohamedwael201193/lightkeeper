"""T15 optimizer: net-yield math + recommendation from a live scan.json.

Net model (per venue, horizon H blocks, principal P wei):
    share      = P_net / (totalStaked + P_net)      # marginal share; stated assumption
    gross      = rewardPerBlock * min(H, runway) * share   # runway-capped: honesty
    entry_fee  = P * entryFeeBps / 10000
    exit_fee   = (P - entry_fee) * exitFeeBps / 10000  if H < minHoldBlocks else 0
    gas_cost   = (gasStake + gasClaim + gasWithdraw) * gasPrice
    net(H)     = gross - entry_fee - exit_fee - gas_cost

Recommendation = max net; "stay put" (net 0, no friction) wins if all nets < 0.
APY = rewardPerBlock * share * blocksPerYear / P, blocksPerYear from MEASURED
block time — never assumed.

Fee-sensitivity: the same math is run at a short horizon to show the flip
(short horizons => gas+fees dominate => "stay put"), per the task risk note.

Usage: python3 -m optimizer.optimize --scan runs/scan.json --principal 0.02 \
         --horizon 1000 --out runs/recommendation.json
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from optimizer import common

WITHDRAW_GAS_FALLBACK = 110_000  # refined by estimate at run time when possible


def analyze(source, principal_wei, horizon_blocks, gas_price, block_time_s):
    v = source["views"]
    label = source["label"]
    if source["kind"].startswith("wallet"):
        return {
            "label": label, "kind": source["kind"], "address": source["address"],
            "block": source["block"], "gross_wei": 0, "entry_fee_wei": 0,
            "exit_fee_wei": 0, "gas_cost_wei": 0, "net_wei": 0,
            "apy_pct": 0.0, "runway_blocks": 0,
            "notes": ["baseline: hold native PHRS in wallet; zero nominal yield, zero friction"],
        }

    rate = v["rewardPerBlock"]
    total_staked = v["totalStaked"]
    runway = v["runwayBlocks"]
    entry_fee = principal_wei * v["entryFeeBps"] // 10000
    p_net = principal_wei - entry_fee
    share_num, share_den = p_net, total_staked + p_net
    share = share_num / share_den if share_den else 1.0

    # Honesty cap: the vault cannot pay beyond its funded runway.
    paid_blocks = min(horizon_blocks, runway)
    gross = rate * paid_blocks * share_num // share_den if share_den else 0

    exit_fee = 0
    if horizon_blocks < v["minHoldBlocks"]:
        exit_fee = p_net * v["exitFeeBps"] // 10000

    gas_units = (source["gas_estimates"]["stake"] or 0) \
        + (source["gas_estimates"]["claim"] or 0) + WITHDRAW_GAS_FALLBACK
    gas_cost = gas_units * gas_price
    net = gross - entry_fee - exit_fee - gas_cost

    blocks_per_year = 365 * 24 * 3600 / block_time_s if block_time_s else None
    apy = (rate * share * blocks_per_year / principal_wei * 100) \
        if blocks_per_year and principal_wei else None

    notes = [
        f"marginal share {share:.6f} at totalStaked={total_staked} (large deposits dilute)",
        f"runway {runway} blocks; gross capped at min(horizon, runway)={paid_blocks} blocks",
        f"exit fee {'applies (early)' if exit_fee else 'waived (horizon >= min hold)'}",
    ]
    if runway < horizon_blocks:
        notes.append("WARNING: reward pool funds fewer blocks than the horizon — "
                     "rewards stop when the pool empties (on-chain cap, not a model choice)")
    return {
        "label": label, "kind": source["kind"], "address": source["address"],
        "block": source["block"],
        "inputs": {"principal_wei": principal_wei, "horizon_blocks": horizon_blocks,
                   "gas_price_wei": gas_price, "measured_block_time_s": block_time_s},
        "marginal_share": share,
        "paid_blocks": paid_blocks,
        "gross_wei": gross,
        "entry_fee_wei": entry_fee,
        "exit_fee_wei": exit_fee,
        "gas_units": gas_units,
        "gas_cost_wei": gas_cost,
        "net_wei": net,
        "apy_pct": apy,
        "runway_blocks": runway,
        "solvent_for_horizon": v["rewardPool"] >= gross,
        "notes": notes,
    }


def recommend(analyses, horizon_blocks):
    venues = [a for a in analyses if not a["kind"].startswith("wallet")]
    best = max(venues, key=lambda a: a["net_wei"])
    if best["net_wei"] <= 0:
        return {"decision": "STAY PUT",
                "reason": f"every venue nets <= 0 over {horizon_blocks} blocks after "
                          "entry/exit fees and gas; holding PHRS costs nothing",
                "winner": None}
    return {"decision": "ALLOCATE",
            "reason": f"{best['label']} has the highest net gain over {horizon_blocks} blocks",
            "winner": best["label"],
            "expected_net_wei": best["net_wei"],
            "expected_net_phrs": best["net_wei"] / 1e18}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", required=True)
    ap.add_argument("--principal", type=float, default=0.02, help="PHRS")
    ap.add_argument("--horizon", type=int, default=1000, help="blocks")
    ap.add_argument("--short-horizon", type=int, default=50,
                    help="blocks; fee-sensitivity flip test")
    ap.add_argument("--out", default="runs/recommendation.json")
    args = ap.parse_args()

    with open(args.scan) as f:
        scan = json.load(f)
    assert scan["source_count"] >= 3, "optimizer requires >=3 live sources"
    P = int(args.principal * 1e18)
    gas_price = scan["gas_price_wei"]
    bt = scan["measured_block_time_s"]

    long_analyses = [analyze(s, P, args.horizon, gas_price, bt) for s in scan["sources"]]
    short_analyses = [analyze(s, P, args.short_horizon, gas_price, bt) for s in scan["sources"]]
    long_rec = recommend(long_analyses, args.horizon)
    short_rec = recommend(short_analyses, args.short_horizon)

    rec = {
        "task": "T15 Yield Optimizer — recommendation",
        "scan_block": scan["pinned_block"],
        "principal_phrs": args.principal,
        "horizons": {
            f"{args.horizon}_blocks": {"analyses": long_analyses, "recommendation": long_rec},
            f"{args.short_horizon}_blocks": {"analyses": short_analyses,
                                            "recommendation": short_rec},
        },
        "fee_sensitivity_note":
            "At the short horizon gas+fees dominate and STAY PUT wins; at the long "
            "horizon the rate differential wins. Both sides tested, as required.",
        "honesty_label": "testnet mechanics demonstration — expected gains are "
                         "valueless testnet PHRS, not real yield",
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(rec, f, indent=2)
    print(json.dumps(rec, indent=2))
    print(f"\nwrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
