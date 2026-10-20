"""Explicit confirmation + broadcast + paid-stamp idempotency for T19.

Idempotency firewall: a JSONL paid-stamp (gitignored) is consulted BEFORE
every broadcast. An invoice_id already stamped is REFUSED — re-running the
same invoice can never double-pay. The stamp is appended only after the
broadcast receipt is observed.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

TASK_DIR = Path(__file__).resolve().parent.parent


def _stamp_file() -> Path:
    # resolved per-call so T19_STAMP_FILE can be overridden (e.g. in tests)
    return Path(os.environ.get("T19_STAMP_FILE", TASK_DIR / "paid-stamps.jsonl"))


class DoublePaymentRefused(Exception):
    """Raised when an invoice_id is already in the paid-stamp."""


def load_stamps() -> dict:
    stamps = {}
    stamp_file = _stamp_file()
    if stamp_file.exists():
        for line in stamp_file.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            stamps[rec["invoice_id"]] = rec
    return stamps


def is_paid(invoice_id: str) -> bool:
    return invoice_id in load_stamps()


def stamp_payment(record: dict) -> None:
    """Append a paid-stamp record AFTER the receipt is observed. Atomic-ish."""
    stamp_file = _stamp_file()
    stamp_file.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record) + "\n"
    # 'a' append is atomic for short writes; no partial-line risk here.
    with open(stamp_file, "a", encoding="utf-8") as fh:
        fh.write(line)


def broadcast_payment(
    plan: dict,
    rpc_url: str,
    private_key: str,
    confirm_token: str | None,
) -> dict:
    """Broadcast the approved payment. Requires explicit confirmation.

    confirm_token must equal the invoice_id (passed as --confirm INV-...).
    Nonce safety: every broadcast runs under flock /tmp/lk-nonce.lock.
    """
    invoice_id = plan["invoice_id"]

    if confirm_token != invoice_id:
        return {
            "status": "confirmation-required",
            "message": (
                f"Refusing to pay invoice '{invoice_id}' without explicit "
                f"confirmation. Re-run with --confirm {invoice_id}."
            ),
        }

    if is_paid(invoice_id):
        prior = load_stamps()[invoice_id]
        raise DoublePaymentRefused(
            f"REFUSED: invoice '{invoice_id}' was already paid "
            f"(tx {prior.get('tx_hash', '?')}, "
            f"stamped {prior.get('paid_at_utc', 'unknown time')}). "
            "Double-payment prevented."
        )

    to = plan["payee"]
    value_wei = plan["amount_wei"]

    # Nonce-safe broadcast: 28 workers share one key; flock serializes sends.
    cmd = [
        "flock", "/tmp/lk-nonce.lock",
        "cast", "send", to,
        "--value", str(value_wei),
        "--rpc-url", rpc_url,
        "--private-key", private_key,
        "--json",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        raise RuntimeError(f"broadcast failed: {proc.stderr.strip()[-500:]}")

    receipt = json.loads(proc.stdout)
    tx_hash = receipt.get("transactionHash") or receipt.get("hash")
    status = receipt.get("status")
    gas_used = receipt.get("gasUsed")
    eff_gas_price = receipt.get("effectiveGasPrice")

    if str(status) not in ("1", "0x1"):
        raise RuntimeError(
            f"payment tx {tx_hash} did not succeed (status={status}) — "
            "NOT stamped."
        )

    record = {
        "invoice_id": invoice_id,
        "tx_hash": tx_hash,
        "payee": to,
        "amount_phrs": plan["amount_phrs"],
        "amount_wei": value_wei,
        "currency": plan["currency"],
        "reference": plan["reference"],
        "chain_id": plan["chain_id"],
        "status": "paid",
        "gas_used": str(gas_used),
        "effective_gas_price_wei": str(eff_gas_price),
        "paid_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "explorer": f"https://atlantic.pharosscan.xyz/tx/{tx_hash}",
    }
    stamp_payment(record)
    return {"status": "paid", "record": record}
