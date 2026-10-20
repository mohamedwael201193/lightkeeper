#!/usr/bin/env python3
"""T12 v3 stage 4 - DRY-RUN (task t08) + Tier-B sign-yourself hand-off.

Runs ONLY after a policy ALLOW (the gate stage's out-schema carries the
decision and the orchestrator's gate halt stops the pipeline otherwise).

* Dry-run: real Chain MCP estimate_gas on the exact transfer calldata.
* Tier-B: builds the UNSIGNED transaction object for the user to sign in
  their own wallet. This stage never signs and never broadcasts — there is
  no private key anywhere in this composed agent.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
sys.path.insert(0, os.path.join(REPO, "packages", "chain-data", "py"))
from lightkeeper_chain_data import ChainMCP  # noqa: E402

TRANSFER_SEL = "a9059cbb"  # transfer(address,uint256)


def transfer_calldata(to_addr: str, amount_units: int) -> str:
    return ("0x" + TRANSFER_SEL
            + "000000000000000000000000" + to_addr[2:].lower()
            + format(amount_units, "064x"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="outp", required=True)
    ns = ap.parse_args()
    inp = json.load(open(ns.inp))
    if inp.get("decision") != "ALLOW":
        raise SystemExit("refusing dry-run: gate decision is %r, not ALLOW"
                         % inp.get("decision"))

    dec = int(inp["token_decimals"])
    amount_units = int(round(float(inp["amount_usdc"]) * (10 ** dec)))
    data = transfer_calldata(inp["destination"], amount_units)

    mcp = ChainMCP(client_name="lk-t12v3-dryrun").connect()
    try:
        est = mcp.call("estimate_gas", {"transaction": {
            "from": inp["holder"], "to": inp["token"], "data": data, "value": "0x0"}})
    finally:
        mcp.close()

    out = dict(inp)
    out.update({
        "stage": "dry-run",
        "dry_run": {
            "tool": "estimate_gas",
            "estimate": est,
            "note": "simulation only — no signature, no broadcast",
        },
        "tier_b_sign_yourself": {
            "instruction": "Review and sign this exact transaction in YOUR "
                           "own wallet (Tier B). The agent never signs.",
            "unsigned_tx": {
                "chain_id": 1672,
                "to": inp["token"],
                "from": inp["holder"],
                "value": "0x0",
                "data": data,
            },
        },
    })
    json.dump(out, open(ns.outp, "w"), indent=2)
    print("dry-run: estimate_gas -> %s" % json.dumps(est)[:200])


if __name__ == "__main__":
    main()
