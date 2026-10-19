"""T15 unsigned-tx preparation: build a deposit tx for USER SIGNATURE ONLY.

KEY HYGIENE (enforced by tests/test_optimizer.py::test_no_signing_code):
  - this module NEVER imports secret key material, NEVER signs, NEVER broadcasts;
  - output carries NO signature fields (no v/r/s) and "signed": false;
  - the operator's live evidence run used `cast send` OUTSIDE this module,
    under the arena's flock nonce lock, with dust amounts on Atlantic only.

Usage: python3 -m optimizer.prepare --scan runs/scan.json --venue OctopusVault-Kraken \
         --principal 0.02 --out runs/unsigned_deposit.json
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from optimizer import common

_STAKE_SELECTOR = "0x3a4b66f1"  # stake() — verified below against cast


def build_unsigned_deposit(to_address, principal_wei, gas_units, gas_price_wei,
                           chain_id=688689):
    assert chain_id == 688689, "Atlantic testnet only"
    assert principal_wei > 0, "principal must be dust-positive"
    return {
        "to": to_address,
        "data": _STAKE_SELECTOR,
        "value": str(principal_wei),
        "value_phrs": principal_wei / 1e18,
        "chainId": chain_id,
        "gas": gas_units,
        "maxFeePerGas": str(gas_price_wei),
        "maxPriorityFeePerGas": "0",
        "signed": False,
        "signer": "USER — agent never holds keys; sign in your own wallet",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", required=True)
    ap.add_argument("--venue", required=True, help="venue label substring")
    ap.add_argument("--principal", type=float, default=0.02)
    ap.add_argument("--out", default="runs/unsigned_deposit.json")
    args = ap.parse_args()

    # Verify the selector is really stake() — never hard-code blindly.
    sel = common._cast_local("sig", "stake()").strip()
    assert sel == _STAKE_SELECTOR, f"selector drift: {sel}"

    with open(args.scan) as f:
        scan = json.load(f)
    src = next(s for s in scan["sources"] if args.venue.lower() in s["label"].lower())
    if src["kind"].startswith("wallet"):
        sys.exit("cannot build a deposit tx for the stay-put baseline")

    tx = build_unsigned_deposit(
        src["address"], int(args.principal * 1e18),
        src["gas_estimates"]["stake"], scan["gas_price_wei"])
    doc = {
        "task": "T15 Yield Optimizer — unsigned deposit transaction",
        "venue": src["label"],
        "venue_address": src["address"],
        "scan_block": scan["pinned_block"],
        "unsigned_tx": tx,
        "how_to_sign": "Paste into any wallet (Rabby/MetaMask) on Pharos Atlantic "
                       "(chain 688689) and sign yourself. The agent cannot and will not sign.",
        "honesty_label": "testnet mechanics demonstration",
    }
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(doc, f, indent=2)
    print(json.dumps(doc, indent=2))
    print(f"\nwrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
