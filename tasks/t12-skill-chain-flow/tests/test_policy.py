#!/usr/bin/env python3
"""Unit tests for the T12 v2 preflight skill engine (evaluate) — no chain needed.
Run:  python3 -m pytest tests/test_policy.py -q   (or)   python3 tests/test_policy.py
"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from flow import evaluate, load_policy

POLICY = load_policy()

# 1 USDC = 10**6 base units (6 decimals, read live from the contract)
U = 10**6


def live(**kw):
    base = {"chain_id": 1672,
            "usdc_balance": 16279 * U, "usdc_balance_human": "16279.0",
            "amount_base": 100 * U, "amount_human": "100",
            "gas_price_wei": 10**9,          # 1 gwei
            "read_block": 100, "verify_block": 102}
    base.update(kw)
    return base


class TestSkillEngine(unittest.TestCase):
    def test_allow_small_amount(self):
        verdict, rules, blocked = evaluate(POLICY, live())
        self.assertEqual(verdict, "ALLOW", rules)
        self.assertEqual(blocked, [])
        self.assertTrue(all(r["verdict"] == "PASS" for r in rules))

    def test_block_insufficient_balance(self):
        # 1,000,000 USDC >> live 16,279 USDC balance
        verdict, rules, blocked = evaluate(POLICY, live(amount_base=1_000_000 * U,
                                                        amount_human="1000000"))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-BALANCE", blocked)
        bal_rule = [r for r in rules if r["rule"] == "RULE-BALANCE"][0]
        # the rule must QUOTE the live balance, not an assumption
        self.assertIn("16279", bal_rule["detail"])

    def test_block_wrong_chain(self):
        verdict, _, blocked = evaluate(POLICY, live(chain_id=688689))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-NETWORK", blocked)

    def test_block_stale_reads(self):
        verdict, _, blocked = evaluate(POLICY, live(read_block=100, verify_block=300))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-FRESHNESS", blocked)

    def test_block_high_gas(self):
        verdict, _, blocked = evaluate(POLICY, live(gas_price_wei=100 * 10**9))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-GAS", blocked)

    def test_boundary_exact_balance_allows(self):
        # amount == balance exactly: rule is >=, not >
        verdict, _, _ = evaluate(POLICY, live(amount_base=16279 * U,
                                              amount_human="16279"))
        self.assertEqual(verdict, "ALLOW")

    def test_boundary_one_unit_over_blocks(self):
        verdict, _, blocked = evaluate(POLICY, live(amount_base=16279 * U + 1,
                                                    amount_human="16279.000001"))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-BALANCE", blocked)

    def test_zero_balance_blocks_any_spend(self):
        verdict, _, blocked = evaluate(POLICY, live(usdc_balance=0,
                                                    usdc_balance_human="0"))
        self.assertEqual(verdict, "BLOCK")
        self.assertIn("RULE-BALANCE", blocked)


if __name__ == "__main__":
    unittest.main(verbosity=2)
