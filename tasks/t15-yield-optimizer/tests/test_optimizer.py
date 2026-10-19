"""Unit tests for the T15 optimizer net math + key-hygiene gate.

Run: python3 -m pytest tests/ -q   (or: python3 tests/test_optimizer.py)
"""
import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from optimizer import optimize, prepare

TASK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FAKE_VAULT = {
    "label": "Vault-Test", "kind": "builder-deployed staking vault",
    "address": "0x0000000000000000000000000000000000000001", "block": 1,
    "views": {"rewardPerBlock": 1_000, "entryFeeBps": 100, "exitFeeBps": 100,
              "minHoldBlocks": 400, "totalStaked": 0, "rewardPool": 10**18,
              "runwayBlocks": 10**6},
    "gas_estimates": {"stake": 100_000, "claim": 60_000, "withdraw": 0},
}
WALLET = {
    "label": "Stay-put baseline", "kind": "wallet holding native PHRS",
    "address": "0xUser", "block": 1,
    "views": {"rewardPerBlock": 0, "entryFeeBps": 0, "exitFeeBps": 0,
              "minHoldBlocks": 0, "totalStaked": 0, "rewardPool": 0,
              "runwayBlocks": 0},
    "gas_estimates": {"stake": 0, "claim": 0, "withdraw": 0},
}
P = 10**18          # 1 PHRS principal
GAS = 10 * 10**9    # 10 gwei
BT = 2.0            # 2 s blocks


class TestNetMath(unittest.TestCase):
    def test_net_formula_long_horizon(self):
        a = optimize.analyze(FAKE_VAULT, P, 1000, GAS, BT)
        # gross = 1000*1000*1.0 = 1e6 ; entry = 1% of 1e18 = 1e16
        # exit waived (1000 >= 400) ; gas = (1e5+6e4+1.1e5)*1e10 = 2.7e15
        self.assertEqual(a["gross_wei"], 1_000_000)
        self.assertEqual(a["entry_fee_wei"], 10**16)
        self.assertEqual(a["exit_fee_wei"], 0)
        self.assertEqual(a["gas_cost_wei"], 270_000 * GAS)
        self.assertEqual(a["net_wei"], 1_000_000 - 10**16 - 270_000 * GAS)

    def test_exit_fee_applies_when_early(self):
        a = optimize.analyze(FAKE_VAULT, P, 100, GAS, BT)
        # exit fee = (1e18 - 1e16) * 100bps = 9.9e15
        self.assertEqual(a["exit_fee_wei"], (P - 10**16) * 100 // 10000)
        self.assertLess(a["net_wei"], 0)

    def test_runway_cap(self):
        thin = dict(FAKE_VAULT)
        thin["views"] = dict(FAKE_VAULT["views"], runwayBlocks=50)
        a = optimize.analyze(thin, P, 1000, GAS, BT)
        self.assertEqual(a["paid_blocks"], 50)
        self.assertEqual(a["gross_wei"], 50_000)
        # pool 1e18 covers the capped gross -> solvent for the *capped* horizon
        self.assertTrue(a["solvent_for_horizon"])
        broke = dict(FAKE_VAULT)
        broke["views"] = dict(FAKE_VAULT["views"], runwayBlocks=50, rewardPool=1000)
        b = optimize.analyze(broke, P, 1000, GAS, BT)
        self.assertEqual(b["gross_wei"], 50_000)
        self.assertFalse(b["solvent_for_horizon"])

    def test_stay_put_wins_when_all_negative(self):
        rec = optimize.recommend(
            [optimize.analyze(FAKE_VAULT, P, 100, GAS, BT),
             optimize.analyze(WALLET, P, 100, GAS, BT)], 100)
        self.assertEqual(rec["decision"], "STAY PUT")
        self.assertIsNone(rec["winner"])

    def test_winner_picked_on_net(self):
        rich = dict(FAKE_VAULT)
        rich["views"] = dict(FAKE_VAULT["views"], rewardPerBlock=10**15)
        rec = optimize.recommend(
            [optimize.analyze(FAKE_VAULT, P, 1000, GAS, BT),
             optimize.analyze(rich, P, 1000, GAS, BT),
             optimize.analyze(WALLET, P, 1000, GAS, BT)], 1000)
        self.assertEqual(rec["decision"], "ALLOCATE")
        self.assertEqual(rec["winner"], "Vault-Test")

    def test_apr_uses_measured_block_time(self):
        a = optimize.analyze(FAKE_VAULT, P, 1000, GAS, BT)
        # 1000 wei/block * 1.0 share * (31536000/2) blocks/yr / 1e18 * 100
        self.assertAlmostEqual(a["apy_pct"], 1000 * 15_768_000 / 1e18 * 100, places=6)

    def test_wallet_baseline_is_zero(self):
        a = optimize.analyze(WALLET, P, 1000, GAS, BT)
        self.assertEqual(a["net_wei"], 0)
        self.assertEqual(a["gas_cost_wei"], 0)


class TestUnsignedTx(unittest.TestCase):
    def test_unsigned_shape(self):
        tx = prepare.build_unsigned_deposit("0xV", 10**16, 120_000, GAS)
        self.assertEqual(tx["chainId"], 688689)
        self.assertFalse(tx["signed"])
        self.assertNotIn("v", tx)
        self.assertNotIn("r", tx)
        self.assertNotIn("s", tx)
        self.assertEqual(tx["data"], "0x3a4b66f1")

    def test_rejects_mainnet(self):
        with self.assertRaises(AssertionError):
            prepare.build_unsigned_deposit("0xV", 10**16, 120_000, GAS, chain_id=1672)


class TestKeyHygiene(unittest.TestCase):
    """CI grep gate: no signing material anywhere in optimizer/ or contracts."""

    FORBIDDEN = re.compile(
        r"private[\s_-]?key|signTransaction|wallet\.sign|eth_sign|"
        r"personal_sign|DEPLOYER_PRIVATE_KEY|mnemonic|keystore",
        re.IGNORECASE)

    def _walk(self, root, exts):
        hits = []
        for dp, _, fns in os.walk(root):
            if "runs" in dp or ".git" in dp:
                continue
            for fn in fns:
                if any(fn.endswith(e) for e in exts):
                    p = os.path.join(dp, fn)
                    with open(p, errors="ignore") as f:
                        for i, line in enumerate(f, 1):
                            if self.FORBIDDEN.search(line):
                                hits.append(f"{p}:{i}: {line.strip()[:80]}")
        return hits

    def test_no_signing_code_in_optimizer(self):
        self.assertEqual(self._walk(os.path.join(TASK_DIR, "optimizer"), (".py",)), [])

    def test_no_signing_code_in_contracts(self):
        self.assertEqual(self._walk(os.path.join(TASK_DIR, "src"), (".sol",)), [])

    def test_no_secrets_in_docs(self):
        hits = self._walk(TASK_DIR, (".md", ".json", ".yaml"))
        # evidence.json may contain tx hashes (public) but never keys
        key_hits = [h for h in hits if "PRIVATE" in h.upper() or "mnemonic" in h.lower()]
        self.assertEqual(key_hits, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
