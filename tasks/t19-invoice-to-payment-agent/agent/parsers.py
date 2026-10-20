"""Invoice parsers for T19 — Invoice-to-Payment Agent.

Three structurally different format parsers: JSON, CSV, plaintext.
No-guess rule is structural: a missing or invalid field produces a
flagged error, never a default. Validation is hard: amount > 0,
EIP-55-format payee address, currency == PHRS.
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

SUPPORTED_CURRENCY = "PHRS"
WEI_PER_PHRS = 10**18

# strict 0x + 40 hex chars (accepts any case; cast normalizes on send)
ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


class InvoiceError(Exception):
    """A flagged, human-readable invoice problem. Never guessed, never paid."""


@dataclass
class LineItem:
    description: str
    amount_phrs: Decimal


@dataclass
class Invoice:
    invoice_id: str
    payee: str
    amount_phrs: Decimal
    currency: str
    reference: str
    memo: str = ""
    line_items: list = field(default_factory=list)
    source_format: str = ""

    @property
    def amount_wei(self) -> int:
        return int(self.amount_phrs * WEI_PER_PHRS)

    def review_line(self) -> str:
        return (
            f"Pay {self.amount_phrs} PHRS to {self.payee} "
            f"for invoice {self.invoice_id} (ref: {self.reference})"
        )


def _require(raw: dict, key: str, invoice_id: str) -> str:
    val = raw.get(key)
    if val is None or (isinstance(val, str) and not val.strip()):
        raise InvoiceError(
            f"invoice '{invoice_id}': missing required field '{key}' — "
            "flagged, not defaulted."
        )
    return val.strip() if isinstance(val, str) else val


def _validate_amount(raw_amount, invoice_id: str) -> Decimal:
    try:
        amount = Decimal(str(raw_amount).strip())
    except (InvalidOperation, AttributeError):
        raise InvoiceError(
            f"invoice '{invoice_id}': amount '{raw_amount}' is not a number — "
            "flagged, not defaulted."
        )
    if amount <= 0:
        raise InvoiceError(
            f"invoice '{invoice_id}': amount {amount} PHRS is not > 0 — "
            "refused. Never pays zero or negative."
        )
    return amount


def _validate_payee(raw_payee, invoice_id: str) -> str:
    payee = str(raw_payee).strip()
    if not ADDRESS_RE.match(payee):
        raise InvoiceError(
            f"invoice '{invoice_id}': payee '{payee}' is not a valid "
            "0x-address (expected 0x + 40 hex chars) — refused."
        )
    return payee


def _validate_currency(raw_currency, invoice_id: str) -> str:
    currency = str(raw_currency).strip().upper()
    if currency != SUPPORTED_CURRENCY:
        raise InvoiceError(
            f"invoice '{invoice_id}': currency '{raw_currency}' unsupported — "
            f"this agent pays {SUPPORTED_CURRENCY} on Atlantic only. "
            "Flagged, never converted or guessed."
        )
    return currency


def _build(raw: dict, source_format: str) -> Invoice:
    invoice_id = str(raw.get("invoice_id") or "").strip()
    if not invoice_id:
        raise InvoiceError(
            f"{source_format} invoice: missing required field 'invoice_id' — "
            "flagged, not defaulted."
        )
    payee = _validate_payee(_require(raw, "payee", invoice_id), invoice_id)
    amount = _validate_amount(_require(raw, "amount", invoice_id), invoice_id)
    currency = _validate_currency(_require(raw, "currency", invoice_id), invoice_id)
    reference = _require(raw, "reference", invoice_id)

    items = []
    raw_items = raw.get("line_items") or []
    if isinstance(raw_items, str):
        raw_items = [raw_items]
    for entry in raw_items:
        if isinstance(entry, dict):
            desc = entry.get("description", "")
            items.append(
                LineItem(
                    description=str(desc),
                    amount_phrs=_validate_amount(
                        entry.get("amount", "0"), invoice_id
                    ),
                )
            )
        else:
            items.append(LineItem(description=str(entry), amount_phrs=Decimal("0")))

    if items:
        total = sum(i.amount_phrs for i in items)
        if total != amount:
            raise InvoiceError(
                f"invoice '{invoice_id}': line-item total {total} PHRS != "
                f"invoice amount {amount} PHRS — mismatch flagged, not paid."
            )

    return Invoice(
        invoice_id=invoice_id,
        payee=payee,
        amount_phrs=amount,
        currency=currency,
        reference=str(reference),
        memo=str(raw.get("memo") or ""),
        line_items=items,
        source_format=source_format,
    )


def parse_json(text: str) -> Invoice:
    """Parse a JSON invoice document."""
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as exc:
        raise InvoiceError(f"JSON invoice: malformed JSON ({exc}) — refused.")
    if not isinstance(raw, dict):
        raise InvoiceError("JSON invoice: top-level value must be an object — refused.")
    return _build(raw, "json")


def parse_csv(text: str) -> Invoice:
    """Parse a CSV invoice: header invoice_id,payee,amount,currency,reference[,memo][,line_items].

    line_items, when present, is a ';'-separated list of 'description=amount' pairs.
    """
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise InvoiceError("CSV invoice: no data rows — refused.")
    if len(rows) > 1:
        raise InvoiceError(
            f"CSV invoice: expected exactly 1 invoice row, found {len(rows)} — "
            "refused (one invoice per file)."
        )
    raw = dict(rows[0])
    line_items_raw = (raw.get("line_items") or "").strip()
    items = []
    if line_items_raw:
        for pair in line_items_raw.split(";"):
            if "=" not in pair:
                raise InvoiceError(
                    f"CSV invoice: malformed line_items entry '{pair}' "
                    "(expected 'description=amount') — refused."
                )
            desc, amt = pair.split("=", 1)
            items.append({"description": desc.strip(), "amount": amt.strip()})
    raw["line_items"] = items
    return _build(raw, "csv")


# plaintext: KEY: value lines; keys INVOICE / PAYEE / AMOUNT / CURRENCY / REFERENCE / MEMO
_TXT_KEYMAP = {
    "INVOICE": "invoice_id",
    "INVOICE_ID": "invoice_id",
    "PAYEE": "payee",
    "TO": "payee",
    "AMOUNT": "amount",
    "CURRENCY": "currency",
    "REFERENCE": "reference",
    "REF": "reference",
    "MEMO": "memo",
}


def parse_txt(text: str) -> Invoice:
    """Parse a plaintext KEY: value invoice."""
    raw: dict = {}
    seen = 0
    for lineno, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            raise InvoiceError(
                f"TXT invoice line {lineno}: '{line}' has no 'KEY: value' "
                "separator — refused."
            )
        key, value = line.split(":", 1)
        mapped = _TXT_KEYMAP.get(key.strip().upper())
        if mapped is None:
            raise InvoiceError(
                f"TXT invoice line {lineno}: unknown key '{key.strip()}' — "
                "flagged (known: INVOICE, PAYEE, AMOUNT, CURRENCY, "
                "REFERENCE, MEMO)."
            )
        raw[mapped] = value.strip()
        seen += 1
    if seen == 0:
        raise InvoiceError("TXT invoice: no KEY: value lines found — refused.")
    return _build(raw, "txt")


def parse(text: str, fmt: str | None = None) -> Invoice:
    """Auto-detect (or force) invoice format and parse it."""
    if fmt is None:
        stripped = text.lstrip()
        if stripped.startswith("{"):
            fmt = "json"
        elif re.match(r"(?im)^\s*invoice_id\s*,", stripped):
            fmt = "csv"
        else:
            fmt = "txt"
    fmt = fmt.lower()
    if fmt == "json":
        return parse_json(text)
    if fmt == "csv":
        return parse_csv(text)
    if fmt == "txt":
        return parse_txt(text)
    raise InvoiceError(f"unknown invoice format '{fmt}' — refused.")
