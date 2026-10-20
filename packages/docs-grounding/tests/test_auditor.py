#!/usr/bin/env python3
"""Tests for the Fleet-wide Grounding Auditor (WS3 bet F). Fully offline:
every live dependency is an injected callable — the network is faked."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_docs_grounding.auditor import (  # noqa: E402
    BAIT_BATTERY, CheckResult, DocsMCPError, build_scorecard,
    classifies_as_refusal, onchain_reread, render_scorecard_md,
    reverify_quotes, run_bait_battery)


class TestRefusalClassification(unittest.TestCase):
    def test_refusals_detected(self):
        for a in ("The docs do not mention this feature.",
                  "No information found in the documentation.",
                  "This is not covered by the available docs.",
                  # The Docs MCP's actual phrasing, observed in the live
                  # 2026-10-20 fleet audit transcripts:
                  "I cannot find information about a GRT exchange rate in the docs."):
            self.assertTrue(classifies_as_refusal(a), a)

    def test_confident_answers_not_refusals(self):
        self.assertFalse(classifies_as_refusal(
            "Use the following steps: 1. Open the faucet page..."))
        self.assertFalse(classifies_as_refusal(""))


class TestQuoteReverify(unittest.TestCase):
    def test_pass_and_fail(self):
        quotes = [
            {"task": "t04", "check_id": "Q1", "source_url": "u1", "quote": "Chain ID 688689"},
            {"task": "t04", "check_id": "Q2", "source_url": "u1", "quote": "stale old text"},
        ]
        out = reverify_quotes(quotes, lambda url: "The Chain ID 688689 is here.")
        self.assertEqual([r.verdict for r in out], ["PASS", "FAIL"])
        self.assertTrue(out[1].fix)  # honest: failures carry fixes

    def test_fetch_error_is_error_not_skip(self):
        def boom(url):
            raise RuntimeError("connection reset")
        out = reverify_quotes(
            [{"task": "t04", "check_id": "Q1", "source_url": "u1", "quote": "x"}], boom)
        self.assertEqual(out[0].verdict, "ERROR")

    def test_pages_fetched_once(self):
        calls = []
        out = reverify_quotes(
            [{"task": "t", "check_id": f"Q{i}", "source_url": "u1", "quote": "x"}
             for i in range(3)], lambda url: calls.append(url) or "x")
        self.assertEqual(len(calls), 1)
        self.assertEqual([r.verdict for r in out], ["PASS"] * 3)


class TestBaitBattery(unittest.TestCase):
    def test_refusal_scores_pass_answer_scores_fail(self):
        def asker(q, goal):
            return "This is not in the documentation." if "GRT" in q else \
                "The rate is 0.5 GRT per block; claim via the rebate portal."
        batt = [
            {"check_id": "B1", "topic": "GRT tokens", "question": "GRT claim rate?",
             "goal": "x"},
            {"check_id": "B2", "topic": "other invented thing",
             "question": "other?", "goal": "x"},
        ]
        out = run_bait_battery(asker, batt, task="t99")
        self.assertEqual([r.verdict for r in out], ["PASS", "FAIL"])
        self.assertIn("answer_excerpt", out[1].evidence)  # transcript published

    def test_asker_error_is_error(self):
        out = run_bait_battery(lambda q, g: 1 / 0, BAIT_BATTERY[:1], task="t99")
        self.assertEqual(out[0].verdict, "ERROR")

    def test_sendfeedback_hard_blocked(self):
        from lightkeeper_docs_grounding.auditor import DocsMCP
        c = DocsMCP()
        with self.assertRaises(DocsMCPError):
            c.call("sendFeedback", {"feedback": "x"})


class TestOnchainReread(unittest.TestCase):
    def test_exact_match_pass_drift_fail(self):
        checks = [
            {"task": "t13", "check_id": "C1", "tool": "eth_call",
             "arguments": {"to": "0xusdc", "data": "0x313ce567", "block": 123},
             "recorded_result": {"value": "0x06"}},
            {"task": "t13", "check_id": "C2", "tool": "eth_call",
             "arguments": {"to": "0xusdc", "data": "0x313ce567", "block": 123},
             "recorded_result": {"value": "0x06"}},
        ]

        def caller(tool, args):
            return {"value": "0x06"} if args["block"] == 123 else {"value": "0x07"}
        out = onchain_reread(checks, caller)
        self.assertEqual([r.verdict for r in out], ["PASS", "PASS"])

        def drifter(tool, args):
            return {"value": "0x07"}
        out = onchain_reread(checks, drifter)
        self.assertEqual([r.verdict for r in out], ["FAIL", "FAIL"])
        self.assertTrue(all(r.fix for r in out))


class TestScorecardHonesty(unittest.TestCase):
    def test_sub100_published_with_fixes(self):
        results = [
            CheckResult("quotes", "t04", "Q1", "PASS", "ok"),
            CheckResult("quotes", "t04", "Q2", "FAIL", "drifted", fix="re-cite the page"),
            CheckResult("bait", "fleet", "B1", "ERROR", "transport", fix="re-run"),
        ]
        card = build_scorecard(results, "unittest")
        self.assertEqual(card["score_pct"], 50.0)  # sub-100, published
        self.assertEqual(card["checks_total"], 3)
        self.assertEqual(card["checks_scored"], 2)  # ERROR excluded from score, still listed
        self.assertEqual(card["fix_list"], ["[t04/Q2] re-cite the page"])
        self.assertIn("honest_rule", card)
        md = render_scorecard_md(card)
        self.assertIn("50.0%", md)
        self.assertIn("Fix list", md)


if __name__ == "__main__":
    unittest.main(verbosity=2)
