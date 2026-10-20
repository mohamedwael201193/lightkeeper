#!/usr/bin/env python3
"""Offline machine-check for the T13 accuracy audit (no network, no chain).

Run:  python3 -m unittest tests.test_accuracy_audit

Asserts the committed accuracy-audit/audit.json is a complete, all-PASS
record, and cross-checks the committed figures: the independently computed
selectors equal the canonical values, the live decimals read is 6, and the
live price sits in the stablecoin band.
"""
import json
import os
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIT = os.path.join(BASE, "accuracy-audit", "audit.json")

EXPECTED_CHECKS = ["B1", "B2", "B3", "B4", "B5", "B6"]

CANONICAL_SELECTORS = {
    "totalSupply()": "0x18160ddd",
    "decimals()": "0x313ce567",
    "balanceOf(address)": "0x70a08231",
    "latestAnswer()": "0x50d25bcd",
}


class TestAccuracyAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(AUDIT):
            raise unittest.SkipTest(
                "accuracy-audit/audit.json not built yet "
                "(run accuracy-audit/run_audit.py)"
            )
        with open(AUDIT, encoding="utf-8") as f:
            cls.report = json.load(f)

    def test_report_shape(self):
        r = self.report
        self.assertEqual(r["task"], "T13")
        self.assertIn("generated_at", r)
        self.assertIn("method", r)
        for c in r["checks"]:
            for field in ("check", "claim", "method", "evidence", "verdict"):
                self.assertIn(field, c, f"check {c.get('check')} missing {field}")

    def test_all_checks_present_and_pass(self):
        got = [c["check"] for c in self.report["checks"]]
        self.assertEqual(got, EXPECTED_CHECKS)
        for c in self.report["checks"]:
            self.assertEqual(
                c["verdict"], "PASS", f"{c['check']} did not PASS: {c['evidence']}"
            )
        self.assertTrue(self.report["all_pass"])

    def test_computed_selectors_are_canonical(self):
        ev = {c["check"]: c["evidence"] for c in self.report["checks"]}
        self.assertEqual(ev["B2"]["computed"], CANONICAL_SELECTORS)

    def test_live_decimals_is_6(self):
        ev = {c["check"]: c["evidence"] for c in self.report["checks"]}
        self.assertEqual(ev["B3"]["decimals"], 6)
        self.assertEqual(
            ev["B3"]["contract"], "0xc879c018db60520f4355c26ed1a6d572cdac1815"
        )

    def test_live_price_in_stablecoin_band(self):
        ev = {c["check"]: c["evidence"] for c in self.report["checks"]}
        price = ev["B6"]["price_usd"]
        self.assertGreaterEqual(price, 0.98)
        self.assertLessEqual(price, 1.02)

    def test_live_supply_near_pinned_figure(self):
        ev = {c["check"]: c["evidence"] for c in self.report["checks"]}
        supply = ev["B4"]["supply_usdc"]
        pinned = ev["B4"]["pinned_usdc_2026_10_20"]
        self.assertGreater(supply, 0)
        self.assertLessEqual(abs(supply - pinned) / pinned, 0.05)


if __name__ == "__main__":
    unittest.main()
