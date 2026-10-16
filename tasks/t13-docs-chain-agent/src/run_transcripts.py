#!/usr/bin/env python3
"""Run all T13 transcripts live (order: logs -> balance -> estimate -> failclosed),
then emit evidence.json with the spend log."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from doc_agent import run_transcript, MODES, WPHRS, WALLET  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "evidence" / "transcripts"
OUT.mkdir(parents=True, exist_ok=True)

ORDER = ["logs", "balance", "estimate", "failclosed"]
results = {}
for mode in ORDER:
    t = run_transcript(mode)
    (OUT / f"{mode}.json").write_text(json.dumps(t, indent=2))
    results[mode] = t
    print(f"[{mode}] ok={t['ok']} ran_at={t['ran_at_utc']}")

# ---- evidence.json: real tx hashes + spend log ----
logs_ex = results["logs"]["execution"]
txs = []
if logs_ex.get("deposit_tx"):
    txs.append({
        "purpose": "dust deposit 0.0005 PHRS -> WPHRS (create real event-log footprint for Q3)",
        "hash": logs_ex["deposit_tx"],
        "block": logs_ex["deposit_block"],
        "gas_used": logs_ex["deposit_gas_used"],
        "gas_price_wei": logs_ex["deposit_gas_price_wei"],
        "status": logs_ex["deposit_status"],
        "explorer": f"https://atlantic.pharosscan.xyz/tx/{logs_ex['deposit_tx']}",
    })
if logs_ex.get("transfer_tx"):
    txs.append({
        "purpose": "dust transfer 0.0001 WPHRS self->self (create real Transfer log for Q3)",
        "hash": logs_ex["transfer_tx"],
        "block": logs_ex["transfer_block"],
        "gas_used": logs_ex["transfer_gas_used"],
        "status": logs_ex["transfer_status"],
        "explorer": f"https://atlantic.pharosscan.xyz/tx/{logs_ex['transfer_tx']}",
    })

total_wei = sum(
    t["gas_used"] * t.get("gas_price_wei", 1000000001)
    for t in txs if "gas_used" in t and "gas_price_wei" in t
)
# transfer tx lacked effectiveGasPrice in our record; use deposit's price for it
for t in txs:
    if "gas_price_wei" not in t:
        t["gas_price_wei"] = 1000000001
        t["gas_price_note"] = "[INFERENCE] deposit-tx gas price reused; receipt did not store effectiveGasPrice"
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
        "note": "All other transcripts (balance, estimate, failclosed) are "
                "read-only: eth_call / eth_estimateGas cost no gas.",
    },
    "transcripts": {m: str(OUT / f"{m}.json") for m in ORDER},
    "transcripts_ok": {m: results[m]["ok"] for m in ORDER},
}
(ROOT / "evidence" / "evidence.json").write_text(json.dumps(evidence, indent=2))
print(json.dumps(evidence["spend_log"], indent=2))
print("evidence -> evidence/evidence.json")
sys.exit(0 if all(results[m]["ok"] for m in ORDER) else 1)
