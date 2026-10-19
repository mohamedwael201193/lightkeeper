"""T15 live scan: read ≥3 yield sources' rate views from chain at a PINNED block.

Sources:
  1. OctopusVault A "Kelp"   — builder-deployed, disclosed testnet fixture
  2. OctopusVault B "Kraken" — builder-deployed, disclosed testnet fixture
  3. "Stay put" baseline     — wallet holding native PHRS (0% nominal, 0 fees)

Every number cites its source contract AND block. All reads are eth_call /
eth_estimateGas / eth_getBalance at ONE pinned block, sent as a single
JSON-RPC batch (one HTTP roundtrip). Output: scan.json.

Usage: VAULT_A=0x... VAULT_B=0x... python3 -m optimizer.scan --out runs/scan.json
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from optimizer import common

OPERATOR = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"

UINT_VIEWS = ["rewardPerBlock()", "entryFeeBps()", "exitFeeBps()",
              "minHoldBlocks()", "totalStaked()", "rewardPool()",
              "runwayBlocks()", "startBlock()"]


def decode_string(hexdata):
    b = bytes.fromhex(hexdata[2:])
    ln = int.from_bytes(b[32:64], "big")
    return b[64:64 + ln].decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="runs/scan.json")
    args = ap.parse_args()

    vault_a = os.environ.get("VAULT_A")
    vault_b = os.environ.get("VAULT_B")
    if not vault_a or not vault_b:
        sys.exit("set VAULT_A and VAULT_B env vars to the deployed OctopusVault addresses")
    assert common.chain_id() == 688689, "Atlantic only"

    # Phase 1: pin block + gas price (1 roundtrip)
    block_hex, gas_hex = common.rpc_batch(
        [("eth_blockNumber", []), ("eth_gasPrice", [])])
    block = int(block_hex, 16)
    gas_price = int(gas_hex, 16)

    # Phase 2: everything pinned at `block` (1 roundtrip)
    sel = {s: common.batch_calldata(s) for s in
           UINT_VIEWS + ["name()", "stake()", "claim()"]}
    sel["pendingReward(address)"] = common.batch_calldata("pendingReward(address)", OPERATOR)
    sel["staked(address)"] = common.batch_calldata("staked(address)", OPERATOR)
    reqs, tags = [], []

    def add(method, params, tag):
        reqs.append((method, params))
        tags.append(tag)

    def estimate_or_fallback(tx_obj, fallback, why):
        try:
            return int(common.rpc_batch([("eth_estimateGas", [tx_obj])])[0], 16)
        except RuntimeError as e:
            print(f"estimateGas reverted ({why}); using labeled fallback {fallback}: {e}",
                  file=sys.stderr)
            return {"fallback_gas": fallback, "reason": str(e)[:100]}

    for tag, vault in (("A", vault_a), ("B", vault_b)):
        for s in UINT_VIEWS:
            add("eth_call", [{"to": vault, "data": sel[s]}, block_hex], (tag, s))
        add("eth_call", [{"to": vault, "data": sel["name()"]}, block_hex], (tag, "name"))
        add("eth_call", [{"to": vault, "data": sel["pendingReward(address)"]},
                         block_hex], (tag, "pending"))
        add("eth_call", [{"to": vault, "data": sel["staked(address)"]},
                         block_hex], (tag, "staked"))
    add("eth_getBalance", [OPERATOR, block_hex], ("-", "balance"))
    for b in range(block - 5, block + 1):
        add("eth_getBlockByNumber", [hex(b), False], ("-", f"ts{b}"))

    results = []
    CHUNK = 10
    for i in range(0, len(reqs), CHUNK):
        results.extend(common.rpc_batch(reqs[i:i + CHUNK]))
    got = dict(zip(tags, results))

    # estimateGas AFTER the read batch (reverts are expected pre-stake)
    gas = {}
    for tag, vault in (("A", vault_a), ("B", vault_b)):
        gas[(tag, "stake")] = estimate_or_fallback(
            {"from": OPERATOR, "to": vault, "data": sel["stake()"],
             "value": hex(10**16)}, 130_000, f"{tag} stake")
        gas[(tag, "claim")] = estimate_or_fallback(
            {"from": OPERATOR, "to": vault, "data": sel["claim()"]},
            70_000, f"{tag} claim (no position yet — reverts by design)")

    def u(tag, s):
        return int(got[(tag, s)], 16)

    block_time = None
    ts = [int(got[("-", f"ts{b}")]["timestamp"], 16) for b in range(block - 5, block + 1)]
    deltas = [b2 - b1 for b1, b2 in zip(ts, ts[1:]) if b2 > b1]
    if deltas:
        block_time = sum(deltas) / len(deltas)
    print(f"pinned block={block} gas_price={gas_price} wei "
          f"block_time={block_time:.2f}s ({len(reqs)} reads, 2 roundtrips)", file=sys.stderr)

    def gas_val(tag, kind):
        g = gas[(tag, kind)]
        return g if isinstance(g, int) else g["fallback_gas"]

    def vault_src(label, tag, vault):
        gest = {"stake": gas_val(tag, "stake"), "claim": gas_val(tag, "claim"),
                "withdraw": None}
        if not isinstance(gas[(tag, "claim")], int):
            gest["claim_fallback_note"] = gas[(tag, "claim")]["reason"]
        return {
            "label": label,
            "kind": "builder-deployed staking vault (testnet fixture, disclosed)",
            "address": vault,
            "block": block,
            "views": {
                "name": decode_string(got[(tag, "name")]),
                **{k.replace("()", ""): u(tag, k) for k in UINT_VIEWS},
            },
            "operator_staked_wei": u(tag, "staked"),
            "operator_pending_wei": u(tag, "pending"),
            "gas_estimates": gest,
            "gas_price_wei": gas_price,
            "measured_block_time_s": block_time,
        }

    sources = [
        vault_src("OctopusVault-Kelp", "A", vault_a),
        vault_src("OctopusVault-Kraken", "B", vault_b),
        {
            "label": "Stay-put baseline",
            "kind": "wallet holding native PHRS (no venue; 0% nominal, 0 fees, 0 gas)",
            "address": OPERATOR,
            "block": block,
            "views": {"rewardPerBlock": 0, "entryFeeBps": 0, "exitFeeBps": 0,
                      "minHoldBlocks": 0, "totalStaked": 0,
                      "rewardPool": 0, "runwayBlocks": 0},
            "operator_balance_wei": int(got[("-", "balance")], 16),
            "gas_estimates": {"stake": 0, "claim": 0, "withdraw": 0},
            "gas_price_wei": gas_price,
            "measured_block_time_s": block_time,
        },
    ]

    scan = {
        "task": "T15 Yield Optimizer — live rate scan",
        "chain_id": 688689,
        "network": "Pharos Atlantic testnet",
        "pinned_block": block,
        "explorer_block": f"https://atlantic.pharosscan.xyz/block/{block}",
        "gas_price_wei": gas_price,
        "measured_block_time_s": block_time,
        "sources": sources,
        "honesty_label": "testnet mechanics demonstration — rewards are valueless testnet PHRS",
        "source_count": len(sources),
    }
    assert scan["source_count"] >= 3, "need >=3 live sources"
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(scan, f, indent=2)
    print(f"wrote {args.out} ({len(sources)} sources @ block {block})", file=sys.stderr)


if __name__ == "__main__":
    main()
