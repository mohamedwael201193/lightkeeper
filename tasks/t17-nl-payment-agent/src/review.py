"""
T17 review step: renders the human-readable summary shown BEFORE any unsigned
tx — and the unsigned-tx artifact itself.

The unsigned tx carries `"signed": false` and no signature fields exist
anywhere in this module. Rendering NEVER broadcasts.
"""

import json
import subprocess

ATLANTIC_CHAIN_ID = 688689


def wei_to_phrs(wei: int) -> str:
    w = int(wei)
    whole, frac = divmod(w, 10**18)
    return f"{whole}.{str(frac).zfill(18).rstrip('0') or '0'}"


def render_review_card(plan: dict, validation: dict, unsigned_tx: dict) -> str:
    lines = []
    lines.append("=" * 64)
    lines.append("  PAYMENT REVIEW — read carefully before confirming")
    lines.append("=" * 64)
    lines.append("")
    lines.append(f"  Action      : send native {plan['token']}")
    lines.append(f"  Amount      : {plan['amount_phrs']} PHRS")
    lines.append(f"  From        : {unsigned_tx['from']}")
    lines.append(f"  To          : {validation['recipient_checksummed']}")
    lines.append(f"  Chain       : Atlantic testnet (chain id {plan['chain_id']})")
    lines.append("")
    lines.append("  --- cost ---")
    lines.append(f"  Amount      : {wei_to_phrs(plan['amount_wei'])} PHRS")
    lines.append(f"  Est. gas    : {unsigned_tx['gas']} units @ "
                 f"{wei_to_phrs(validation['gas_price_wei'])} PHRS/gas")
    lines.append(f"  Est. max fee: {wei_to_phrs(validation['max_fee_wei'])} PHRS")
    lines.append(f"  Total debit : {wei_to_phrs(validation['total_cost_wei'])} PHRS")
    lines.append(f"  Balance     : {wei_to_phrs(validation['balance_wei'])} PHRS")
    lines.append("")
    lines.append("  --- unsigned transaction (NOT signed, NOT broadcast) ---")
    lines.append("  " + json.dumps(unsigned_tx, indent=2).replace("\n", "\n  "))
    lines.append("")
    lines.append("  To proceed you must type the exact confirmation phrase:")
    lines.append(f"    CONFIRM {unsigned_tx['plan_id']}")
    lines.append("  Anything else — including ambiguous or edited input — aborts.")
    lines.append("=" * 64)
    return "\n".join(lines)


def build_unsigned_tx(plan: dict, validation: dict, deployer: str, rpc_url: str) -> dict:
    """Build the unsigned-tx artifact. Read-only nonce lookup; no signing."""
    p = subprocess.run(
        ["cast", "nonce", deployer, "--rpc-url", rpc_url],
        capture_output=True, text=True, timeout=30)
    nonce = p.stdout.strip() if p.returncode == 0 else "pending-at-broadcast"
    return {
        "signed": False,
        "plan_id": plan_id_of(plan),
        "chainId": plan["chain_id"],
        "from": deployer,
        "to": validation["recipient_checksummed"],
        "value": hex(int(plan["amount_wei"])),
        "value_wei": str(plan["amount_wei"]),
        "gas": validation["gas_limit"],
        "gasPrice": validation["gas_price_wei"],
        "nonce": nonce,
        "data": "0x",
        "note": "unsigned: produced for human review; requires explicit "
                "CONFIRM <plan_id> before any broadcast",
    }


def plan_id_of(plan: dict) -> str:
    import hashlib
    blob = json.dumps({
        "action": plan["action"], "token": plan["token"],
        "amount_phrs": plan["amount_phrs"], "amount_wei": plan["amount_wei"],
        "to": plan["to"], "chain_id": plan["chain_id"],
    }, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()[:16]
