#!/usr/bin/env python3
"""Unit tests for the T12 preflight skill engine (evaluate) — no chain needed.
Run:  python3 -m pytest tests/test_policy.py -q   (or)   python3 tests/test_policy.py
"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from flow import evaluate, load_policy

POLICY = load_policy()
KEEPER = "0xf76e6b0920e9332ff4410f6dd53f01722abc71a3"
TARGET = "0xfc9fe952036bfe00f8bc5d9d2860c3750b834ad1"


def live(**kw):
    base = {"chain_id": 688689, "target": TARGET, "keeper_onchain": KEEPER,
            "value_wei": 10**14,          # 0.0001 PHRS (dust)
            "gas_price_wei": 10**9,        # 1 gwei
            "read_block": 100, "execute_block": 102}
    base.update(kw)
    return base


class TestSkillEngine(unittest.TestCase):
    def test_allow_dust(self):
        verdict, rules, blocked = evaluate(POLICY, live())
        self.assertEqual(verdict, "ALLOW", rules)
        self.assertEqual(blocked, [])
        self.assertTrue(all(r["verdict"] == "PASS" for r in rules))

    def test_block_over_limit(self):
        # 0.1 PHRS >> max_per_tx 0.005 PHRS
        verdict, rules, blocked = evaluate(POLICY, live(value_wei=10**17))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-AMOUNT", blocked)
        amount_rule = [r for r in rules if r["rule"] == "RULE-AMOUNT"][0]
        self.assertIn("100000000000000000", amount_rule["detail"])  # quotes live value

    def test_block_wrong_chain(self):
        verdict, _, blocked = evaluate(POLICY, live(chain_id=1672))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-NETWORK", blocked)

    def test_block_keeper_mismatch(self):
        verdict, _, blocked = evaluate(
            POLICY, live(keeper_onchain="0x000000000000000000000000000000000000dead"))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-KEEPER-CONSISTENCY", blocked)

    def test_block_stale_reads(self):
        verdict, _, blocked = evaluate(POLICY, live(read_block=100, execute_block=300))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-FRESHNESS", blocked)

    def test_block_high_gas(self):
        verdict, _, blocked = evaluate(POLICY, live(gas_price_wei=100 * 10**9))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-GAS", blocked)

    def test_block_wrong_target(self):
        verdict, _, blocked = evaluate(POLICY, live(target=KEEPER))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-DEST", blocked)

    def test_boundary_at_limit_allows(self):
        verdict, _, _ = evaluate(POLICY, live(value_wei=5 * 10**15))  # exactly 0.005
        self.assertEqual(verdict, "ALLOW")


if __name__ == "__main__":
    unittest.main(verbosity=2)
