#!/usr/bin/env python3
"""T12 v3 stage 1 — PROPOSE (task t14, portfolio-informed proposal).

Real Chain MCP reads only: pinned block, holder USDC balanceOf + PROS
balance. Emits the proposal handoff. No keys, no signing, no broadcast.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
sys.path.insert(0, os.path.join(REPO, "packages", "chain-data", "py"))
from lightkeeper_chain_data import ChainMCP, assert_chain_id  # noqa: E402

USDC = "0xc879c018db60520f4355c26ed1a6d572cdac1815"
BALANCEOF_SEL = "0x70a08231"
DECIMALS_SEL = "0x313ce567"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="outp", required=True)
    ns = ap.parse_args()
    inp = json.load(open(ns.inp))
    holder = inp["holder"]
    amount = str(inp["amount_usdc"])

    mcp = ChainMCP(client_name="lk-t12v3-propose").connect()
    try:
        info = mcp.get_chain_info()
        assert_chain_id(info.get("chainId"), 1672, what="propose chain")
        block = mcp.get_block_number()
        dec_raw = mcp.call("eth_call", {"transaction": {"to": USDC, "data": DECIMALS_SEL},
                                         "block": block})
        dec = int(dec_raw.get("result", "0x0"), 16)
        bal_raw = mcp.call("eth_call", {
            "transaction": {"to": USDC,
                            "data": BALANCEOF_SEL + "000000000000000000000000" + holder[2:].lower()},
            "block": block})
        bal_units = int(bal_raw.get("result", "0x0"), 16)
    finally:
        mcp.close()

    out = dict(inp)
    out.update({
        "stage": "propose",
        "token": USDC,
        "token_decimals": dec,
        "balance_units": str(bal_units),
        "balance_usdc": f"{bal_units / (10 ** dec):.6f}",
        "pinned_block": block,
        "chain_id": 1672,
        "chain_endpoint": "https://mcp.pharos.xyz/mcp",
        "proposed_action": {
            "type": "erc20_transfer",
            "token": USDC,
            "to": inp.get("destination", ""),
            "amount_usdc": amount,
        },
    })
    json.dump(out, open(ns.outp, "w"), indent=2)
    print(f"propose: holder balance {out['balance_usdc']} USDC @ block {block}; "
          f"proposal {amount} USDC")


if __name__ == "__main__":
    main()
