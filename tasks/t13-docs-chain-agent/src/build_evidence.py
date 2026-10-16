#!/usr/bin/env python3
"""Rebuild evidence/evidence.json from the saved transcripts (no broadcasts)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
T = ROOT / "evidence" / "transcripts"
WALLET = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
WPHRS = "0x838800b758277CC111B2d48Ab01e5E164f8E9471"

results = {m: json.loads((T / f"{m}.json").read_text()) for m in
           ["logs", "balance", "estimate", "failclosed"]}
logs_ex = results["logs"]["execution"]
txs = []
if logs_ex.get("deposit_tx"):
    txs.append({
        "purpose": "dust deposit 0.0005 PHRS -> WPHRS (real event-log footprint for Q3)",
        "hash": logs_ex["deposit_tx"],
        "block": logs_ex["deposit_block"],
        "gas_used": logs_ex["deposit_gas_used"],
        "gas_price_wei": logs_ex["deposit_gas_price_wei"],
        "status": logs_ex["deposit_status"],
        "explorer": f"https://atlantic.pharosscan.xyz/tx/{logs_ex['deposit_tx']}",
    })
if logs_ex.get("transfer_tx"):
    txs.append({
        "purpose": "dust transfer 0.0001 WPHRS self->self (real Transfer log for Q3)",
        "hash": logs_ex["transfer_tx"],
        "block": logs_ex["transfer_block"],
        "gas_used": logs_ex["transfer_gas_used"],
        "gas_price_wei": logs_ex.get("transfer_gas_price_wei") or 1000000001,
        "status": logs_ex["transfer_status"],
        "explorer": f"https://atlantic.pharosscan.xyz/tx/{logs_ex['transfer_tx']}",
    })

total_wei = sum(t["gas_used"] * t["gas_price_wei"] for t in txs)
total_phrs = total_wei / 10**18

evidence = {
    "task": "T13 Docs MCP + Chain MCP Agent",
    "network": "Pharos Atlantic testnet",
    "chain_id": 688689,
    "wallet": WALLET,
    "token": {"symbol": "WPHRS", "address": WPHRS, "decimals": 18},
    "transactions": txs,
    "spend_log": {
        "total_gas_wei": total_wei,
        "total_phrs": total_phrs,
        "budget_phrs": 0.15,
        "within_budget": total_phrs <= 0.15,
        "note": ("Balance/estimate/failclosed transcripts are read-only "
                 "(eth_call / eth_estimateGas): zero gas spent."),
    },
    "transcripts": {m: str(T / f"{m}.json") for m in results},
    "transcripts_ok": {m: results[m]["ok"] for m in results},
}
(ROOT / "evidence" / "evidence.json").write_text(json.dumps(evidence, indent=2))
print(json.dumps(evidence["spend_log"], indent=2))
for t in txs:
    print(t["purpose"], "->", t["explorer"])
print("evidence -> evidence/evidence.json")
sys.exit(0 if all(results[m]["ok"] for m in results) else 1)
