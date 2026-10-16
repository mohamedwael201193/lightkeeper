"""Unit tests for T19 invoice-to-payment agent.

Run:  cd tasks/t19-invoice-to-payment-agent && python3 -m unittest discover -s tests
"""

import json
import os
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.parsers import InvoiceError, parse  # noqa: E402
from agent.pay import DoublePaymentRefused, is_paid, load_stamps, stamp_payment  # noqa: E402
from agent.planner import build_payment_plan, render_review  # noqa: E402

SAMPLES = Path(__file__).resolve().parent.parent / "samples"

GOOD_ADDR = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"


def _inv(**kw):
    base = {
        "invoice_id": "INV-T",
        "payee": GOOD_ADDR,
        "amount": "1.25",
        "currency": "PHRS",
        "reference": "REF-T",
    }
    base.update(kw)
    return base


class TestFormats(unittest.TestCase):
    def test_json_valid(self):
        inv = parse((SAMPLES / "invoice-001.json").read_text())
        self.assertEqual(inv.invoice_id, "INV-2026-001")
        self.assertEqual(inv.amount_phrs, Decimal("0.001"))
        self.assertEqual(inv.source_format, "json")
        self.assertEqual(len(inv.line_items), 2)

    def test_csv_valid(self):
        inv = parse((SAMPLES / "invoice-002.csv").read_text())
        self.assertEqual(inv.invoice_id, "INV-2026-002")
        self.assertEqual(inv.source_format, "csv")

    def test_csv_valid_004_live_invoice(self):
        # The invoice that was actually settled on-chain (tx 0xc7ff…8bac66).
        inv = parse((SAMPLES / "invoice-004.csv").read_text())
        self.assertEqual(inv.invoice_id, "INV-2026-004")
        self.assertEqual(inv.source_format, "csv")
        self.assertEqual(inv.amount_phrs, Decimal("0.0005"))
        plan = build_payment_plan(inv)
        self.assertEqual(plan["amount_wei"], "500000000000000")

    def test_txt_valid(self):
        inv = parse((SAMPLES / "invoice-003.txt").read_text())
        self.assertEqual(inv.invoice_id, "INV-2026-003")
        self.assertEqual(inv.source_format, "txt")

    def test_format_autodetect_json(self):
        inv = parse(json.dumps(_inv()))
        self.assertEqual(inv.source_format, "json")

    def test_explicit_format_override(self):
        inv = parse((SAMPLES / "invoice-001.json").read_text(), fmt="json")
        self.assertEqual(inv.invoice_id, "INV-2026-001")


class TestValidation(unittest.TestCase):
    def _expect_flag(self, raw, fmt="json", needle=""):
        with self.assertRaises(InvoiceError) as ctx:
            parse(raw if fmt != "json" else json.dumps(raw), fmt=fmt)
        if needle:
            self.assertIn(needle, str(ctx.exception))

    def test_negative_amount_refused(self):
        with self.assertRaises(InvoiceError):
            parse((SAMPLES / "invoice-bad-amount.json").read_text())

    def test_zero_amount_refused(self):
        self._expect_flag(_inv(amount="0"), needle="not > 0")

    def test_bad_address_refused(self):
        with self.assertRaises(InvoiceError):
            parse((SAMPLES / "invoice-bad-address.csv").read_text(), fmt="csv")

    def test_wrong_currency_flagged(self):
        with self.assertRaises(InvoiceError) as ctx:
            parse((SAMPLES / "invoice-bad-currency.txt").read_text(), fmt="txt")
        self.assertIn("USD", str(ctx.exception))

    def test_missing_reference_flagged(self):
        with self.assertRaises(InvoiceError):
            parse((SAMPLES / "invoice-bad-missing.json").read_text())

    def test_line_item_mismatch_flagged(self):
        with self.assertRaises(InvoiceError) as ctx:
            parse((SAMPLES / "invoice-bad-mismatch.json").read_text())
        self.assertIn("mismatch", str(ctx.exception))

    def test_malformed_json_refused(self):
        with self.assertRaises(InvoiceError):
            parse("{not json", fmt="json")

    def test_csv_two_rows_refused(self):
        csv_text = (
            "invoice_id,payee,amount,currency,reference\n"
            f"INV-A,{GOOD_ADDR},0.1,PHRS,R-A\n"
            f"INV-B,{GOOD_ADDR},0.2,PHRS,R-B\n"
        )
        self._expect_flag(csv_text, fmt="csv", needle="exactly 1 invoice row")

    def test_txt_unknown_key_flagged(self):
        with self.assertRaises(InvoiceError):
            parse("INVOICE: X\nBANANA: 1\n", fmt="txt")

    def test_currency_case_insensitive(self):
        inv = parse(json.dumps(_inv(currency="phrs")))
        self.assertEqual(inv.currency, "PHRS")


class TestPlanAndReview(unittest.TestCase):
    def test_plan_line_items_and_wei(self):
        inv = parse((SAMPLES / "invoice-001.json").read_text())
        plan = build_payment_plan(inv)
        self.assertEqual(plan["amount_wei"], str(int(Decimal("0.001") * 10**18)))
        self.assertEqual(len(plan["line_items"]), 2)
        self.assertEqual(plan["chain_id"], 688689)

    def test_review_reads_human(self):
        inv = parse((SAMPLES / "invoice-001.json").read_text())
        review = render_review(build_payment_plan(inv))
        for needle in ("0.001 PHRS", GOOD_ADDR, "INV-2026-001", "LK-T19-DEMO-001"):
            self.assertIn(needle, review)
        self.assertIn("--confirm INV-2026-001", review)


class TestPaidStampIdempotency(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["T19_STAMP_FILE"] = str(Path(self.tmp.name) / "stamps.jsonl")

    def tearDown(self):
        del os.environ["T19_STAMP_FILE"]
        self.tmp.cleanup()

    def test_stamp_then_duplicate_refused(self):
        self.assertFalse(is_paid("INV-DUP"))
        stamp_payment({"invoice_id": "INV-DUP", "tx_hash": "0xabc"})
        self.assertTrue(is_paid("INV-DUP"))
        # second payment attempt for the same id must be refused
        stamps = load_stamps()
        self.assertIn("INV-DUP", stamps)
        # broadcast_payment refuses before touching the chain:
        import agent.pay as paymod

        plan = {
            "invoice_id": "INV-DUP",
            "payee": GOOD_ADDR,
            "amount_phrs": "0.001",
            "amount_wei": "1000000000000000",
            "currency": "PHRS",
            "reference": "R",
            "chain_id": 688689,
        }
        with self.assertRaises(DoublePaymentRefused):
            paymod.broadcast_payment(plan, "http://x", "0x00", "INV-DUP")

    def test_unpaid_invoice_not_flagged(self):
        self.assertFalse(is_paid("INV-NEVER-SEEN"))


if __name__ == "__main__":
    unittest.main()
