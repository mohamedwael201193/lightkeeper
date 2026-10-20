"""Payment plan + review + unsigned-tx builder for T19.

HONESTY NOTE (official requirement 3): a native PHRS transfer carries no
memo field, and neither does a standard ERC-20 `transfer`. The invoice
reference is bound to the payment in (a) the human-readable review,
(b) the off-chain unsigned-tx envelope metadata, and (c) the paid-stamp
record — never faked as on-chain bytes.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import asdict

from .parsers import Invoice

ATLANTIC_CHAIN_ID = 688689


def cast(*args: str) -> str:
    """Run cast, returning stripped stdout. Never logs secrets."""
    proc = subprocess.run(
        ["cast", *args],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"cast {' '.join(args[:2])} failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def build_payment_plan(invoice: Invoice) -> dict:
    """Produce the payment plan with line items from a validated invoice."""
    plan = {
        "invoice_id": invoice.invoice_id,
        "payee": invoice.payee,
        "amount_phrs": str(invoice.amount_phrs),
        "amount_wei": str(invoice.amount_wei),
        "currency": invoice.currency,
        "reference": invoice.reference,
        "memo": invoice.memo,
        "source_format": invoice.source_format,
        "chain_id": ATLANTIC_CHAIN_ID,
        "line_items": [
            {"description": i.description, "amount_phrs": str(i.amount_phrs)}
            for i in invoice.line_items
        ],
    }
    return plan


def render_review(plan: dict) -> str:
    """Human-readable REVIEW step: 'pay X to Y for invoice Z'."""
    lines = [
        "=" * 64,
        "  INVOICE PAYMENT — REVIEW REQUIRED",
        "=" * 64,
        f"  Pay      : {plan['amount_phrs']} {plan['currency']}",
        f"  To       : {plan['payee']}",
        f"  Invoice  : {plan['invoice_id']}  (ref: {plan['reference']})",
        f"  Chain    : Atlantic testnet ({plan['chain_id']})",
    ]
    if plan["memo"]:
        lines.append(f"  Memo     : {plan['memo']}")
    if plan["line_items"]:
        lines.append("  Line items:")
        for item in plan["line_items"]:
            lines.append(f"    - {item['description']}: {item['amount_phrs']} PHRS")
    lines += [
        "",
        "  Nothing has been broadcast. Re-run with",
        f"  --confirm {plan['invoice_id']}",
        "  to execute this payment on Atlantic.",
        "=" * 64,
    ]
    return "\n".join(lines)


def build_unsigned_tx(plan: dict, rpc_url: str, from_address: str) -> dict:
    """Build a real UNSIGNED native-transfer tx from live chain data.

    The invoice reference travels as envelope metadata (off-chain), because
    a native PHRS transfer has no memo bytes. Documented, not faked.
    """
    value_wei = int(plan["amount_wei"])
    to = plan["payee"]
    nonce = int(cast("nonce", from_address, "--rpc-url", rpc_url))
    gas_price = int(cast("gas-price", "--rpc-url", rpc_url))
    gas_limit = 21000  # exact for a native value transfer, no contract call
    unsigned = {
        "to": to,
        "from": from_address,
        "value": hex(value_wei),
        "value_wei": str(value_wei),
        "gas": hex(gas_limit),
        "gasPrice": hex(gas_price),
        "nonce": hex(nonce),
        "chainId": hex(ATLANTIC_CHAIN_ID),
        "data": "0x",
    }
    return {
        "unsigned_tx": unsigned,
        "invoice_reference": plan["reference"],
        "invoice_id": plan["invoice_id"],
        "reference_binding": (
            "OFF-CHAIN: native PHRS transfer carries no memo bytes; the "
            "invoice reference is recorded in the review, this envelope, "
            "and the paid-stamp — not faked on-chain."
        ),
    }


def envelope_json(envelope: dict) -> str:
    return json.dumps(envelope, indent=2)
