#!/usr/bin/env python3
"""Tests for @lightkeeper/policy. No network needed."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_policy import (
    ALLOW, BLOCK, REFUSE, AuditLog, Decision, Rule, RuleResult, evaluate_rules,
)

POLICY = {"network": {"allowed_chain_id": 1672}, "limits": {"max": 100}}


def live(**kw):
    base = {"chain_id": 1672, "amount": 10}
    base.update(kw)
    return base


RULES = [
    Rule("RULE-NETWORK",
         lambda p, l: l["chain_id"] == int(p["network"]["allowed_chain_id"]),
         lambda p, l: f"live chainId={l['chain_id']} vs allowed={p['network']['allowed_chain_id']}"),
    Rule("RULE-AMOUNT",
         lambda p, l: l["amount"] <= int(p["limits"]["max"]),
         lambda p, l: f"amount={l['amount']} <= max={p['limits']['max']}"),
]


class TestEvaluateRules(unittest.TestCase):
    def test_allow(self):
        d = evaluate_rules(POLICY, live(), RULES, require_sections=("network", "limits"))
        self.assertEqual(d.decision, ALLOW)
        self.assertEqual(d.blocked, [])
        self.assertTrue(all(r.verdict == "PASS" for r in d.rules))

    def test_block_names_rule(self):
        d = evaluate_rules(POLICY, live(amount=500), RULES)
        self.assertEqual(d.decision, BLOCK)
        self.assertEqual(d.blocked, ["RULE-AMOUNT"])

    def test_missing_section_refuses(self):
        d = evaluate_rules({}, live(), RULES, require_sections=("network",))
        self.assertEqual(d.decision, REFUSE)
        self.assertIn("POLICY-COMPLETE", d.blocked)

    def test_no_rules_default_deny(self):
        d = evaluate_rules(POLICY, live(), [])
        self.assertEqual(d.decision, BLOCK)
        self.assertIn("DEFAULT-DENY", d.blocked)

    def test_raising_rule_fails_closed(self):
        bad = [Rule("RULE-BOOM", lambda p, l: 1 / 0, lambda p, l: "never")]
        d = evaluate_rules(POLICY, live(), bad)
        self.assertEqual(d.decision, BLOCK)
        self.assertIn("RULE-BOOM", d.blocked)
        self.assertIn("ZeroDivisionError", d.rules[0].detail)

    def test_to_legacy_shape(self):
        d = evaluate_rules(POLICY, live(amount=500), RULES)
        verdict, rules, blocked = d.to_legacy()
        self.assertEqual(verdict, BLOCK)
        self.assertIsInstance(rules[0], dict)
        self.assertEqual(rules[0]["rule"], "RULE-NETWORK")
        self.assertEqual(blocked, ["RULE-AMOUNT"])


class TestAuditLog(unittest.TestCase):
    def test_chain_verifies(self):
        with tempfile.TemporaryDirectory() as td:
            log = AuditLog(os.path.join(td, "audit.jsonl"))
            log.append({"decision": ALLOW, "action": "a1"})
            log.append({"decision": BLOCK, "action": "a2"})
            self.assertTrue(log.verify())

    def test_tamper_detected(self):
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "audit.jsonl")
            log = AuditLog(p)
            log.append({"decision": ALLOW})
            with open(p, "a", encoding="utf-8") as f:
                f.write(json.dumps({"decision": "HACK", "prev_hash": "nope",
                                    "hash": "nope"}) + "\n")
            self.assertFalse(log.verify())

    def test_empty_log_verifies(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertTrue(AuditLog(os.path.join(td, "x.jsonl")).verify())


if __name__ == "__main__":
    unittest.main(verbosity=2)
