#!/usr/bin/env python3
"""Offline machine-check for the T04 accuracy audit (no network, no chain).

Run:  python3 -m unittest tests.test_accuracy_audit

Asserts the committed accuracy-audit/audit.json is a complete, all-PASS
record: every check present with its claim, method, evidence and verdict,
plus cross-consistency of the committed figures (the docs-claimed chain ID
equals the wire-verified chain ID).
"""
import json
import os
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIT = os.path.join(BASE, "accuracy-audit", "audit.json")

EXPECTED_CHECKS = ["A1", "A2", "A3", "A4", "A5"]


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
        self.assertEqual(r["task"], "T04")
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

    def test_docs_claim_matches_wire(self):
        """A2's docs-claimed chain ID == A3's wire-verified chain ID == 688689."""
        ev = {c["check"]: c["evidence"] for c in self.report["checks"]}
        self.assertEqual(ev["A2"]["docs_chain_id"], 688689)
        self.assertEqual(ev["A3"]["eth_chainId_dec"], 688689)
        self.assertEqual(
            ev["A3"]["rpc_url"], "https://atlantic.dplabs-internal.com"
        )

    def test_rpc_is_live(self):
        ev = {c["check"]: c["evidence"] for c in self.report["checks"]}
        self.assertGreater(ev["A4"]["block_number"], 0)


if __name__ == "__main__":
    unittest.main()
