#!/usr/bin/env python3
"""Unit tests for the Threshold Guardian policy engine (T05).

All chain reads are monkeypatched — no network, no keys, no broadcasts.
The live refusal path is additionally exercised for real in run-logs/
(see mainnet-refusal.log: a genuine eth_chainId read against the Pharos
mainnet RPC, refused with exit code 3 and zero broadcast).
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import guardian as g  # noqa: E402

SENDER = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
TO = "0x000000000000000000000000000000000000dEaD"

POLICY = {
    "sender": SENDER,
    "network": {
        "allowed_chain_id": 688689,
        "allowed_name": "atlantic-testnet",
        "rpc_url": "https://example.invalid",
        "mainnet": {"chain_id": 1672, "name": "mainnet",
                    "rpc_url": "https://example.invalid", "enabled": False},
    },
    "limits": {
        "max_per_tx_phrs": "0.005",
        "max_per_window_phrs": "0.02",
        "window_minutes": 60,
        "max_gas_price_gwei": "50",
    },
    "behavior": {
        "fail_closed": True,
        "audit_log": os.devnull,
        "spend_ledger": os.path.join(tempfile.gettempdir(), "t05-test-ledger.jsonl"),
    },
}


def prop(wei):
    return {"sender": SENDER, "to": TO, "value_wei": wei}


class FakeChain:
    """Pretends to be the Atlantic RPC: chain 688689, rich sender, 10 gwei."""

    def __init__(self, balance_wei=g.WEI * 6, gas_wei=10 * 10**9,
                 chain_id_hex="0xa8231"):  # 0xa8231 = 688689 (Atlantic)
        self.balance_wei = balance_wei
        self.gas_wei = gas_wei
        self.chain_id_hex = chain_id_hex

    def __call__(self, rpc_url, method, params=None, timeout=20):
        if method == "eth_chainId":
            return self.chain_id_hex, None
        if method == "eth_getBalance":
            return hex(self.balance_wei), None
        if method == "eth_gasPrice":
            return hex(self.gas_wei), None
        return None, f"unexpected method {method}"


class TestPolicyEngine(unittest.TestCase):
    def setUp(self):
        os.environ["DEPLOYER_PRIVATE_KEY"] = "test-key-not-real"
        self._rpc = g.rpc_call
        self._cast = g.subprocess.run
        self.chain = FakeChain()
        g.rpc_call = self.chain

        def fake_run(cmd, **kw):
            class R:
                stdout = SENDER + "\n"
                stderr = ""
                returncode = 0
            assert cmd[:3] == ["cast", "wallet", "address"]
            return R()
        g.subprocess.run = fake_run
        # empty ledger each test
        open(POLICY["behavior"]["spend_ledger"], "w").close()

    def tearDown(self):
        g.rpc_call = self._rpc
        g.subprocess.run = self._cast
        os.environ.pop("DEPLOYER_PRIVATE_KEY", None)

    # -- amounts -----------------------------------------------------------
    def test_dec_to_wei_exact(self):
        self.assertEqual(g.dec_to_wei("0.005"), 5 * 10**15)
        self.assertEqual(g.dec_to_wei("1"), 10**18)
        self.assertEqual(g.dec_to_wei("0.0001"), 10**14)

    # -- FIRE path ----------------------------------------------------------
    def test_allow_small_transfer(self):
        trace, decision, refused = g.evaluate(POLICY, prop(10**14),
                                              "atlantic", None)
        self.assertEqual(decision, "ALLOW")
        self.assertFalse(refused)
        self.assertTrue(all(c["passed"] for c in trace))
        self.assertEqual(len(trace), 6)  # six independent conditions logged

    # -- HOLD paths ----------------------------------------------------------
    def test_block_above_threshold(self):
        trace, decision, refused = g.evaluate(POLICY, prop(5 * 10**16),  # 0.05
                                              "atlantic", None)
        self.assertEqual(decision, "BLOCK")
        th = next(c for c in trace if c["id"] == "threshold")
        self.assertFalse(th["passed"])
        self.assertIn("0.005", th["reason"])

    def test_block_exactly_at_boundary_above(self):
        trace, decision, _ = g.evaluate(POLICY, prop(5 * 10**15 + 1),
                                        "atlantic", None)
        self.assertEqual(decision, "BLOCK")

    def test_allow_exactly_at_threshold(self):
        trace, decision, _ = g.evaluate(POLICY, prop(5 * 10**15),
                                        "atlantic", None)
        self.assertEqual(decision, "ALLOW")

    def test_block_insufficient_balance(self):
        self.chain.balance_wei = 10**12  # nearly empty
        trace, decision, _ = g.evaluate(POLICY, prop(10**14), "atlantic", None)
        self.assertEqual(decision, "BLOCK")
        bal = next(c for c in trace if c["id"] == "balance")
        self.assertFalse(bal["passed"])

    def test_block_gas_spike(self):
        self.chain.gas_wei = 200 * 10**9  # 200 gwei, over the 50 cap
        trace, decision, _ = g.evaluate(POLICY, prop(10**14), "atlantic", None)
        self.assertEqual(decision, "BLOCK")
        gp = next(c for c in trace if c["id"] == "gas-price")
        self.assertFalse(gp["passed"])

    def test_block_rolling_window(self):
        # ledger already near the window cap; a further dust tx must BLOCK
        with open(POLICY["behavior"]["spend_ledger"], "w") as f:
            import time
            f.write(json.dumps({"ts_epoch": time.time(),
                                "value_wei": str(19 * 10**15)}) + "\n")
        trace, decision, _ = g.evaluate(POLICY, prop(2 * 10**15), "atlantic", None)
        self.assertEqual(decision, "BLOCK")
        th = next(c for c in trace if c["id"] == "threshold")
        self.assertIn("window", th["reason"].lower() + th["value"].lower()
                      or th["reason"])

    def test_fail_closed_on_stale_data(self):
        def dead(rpc_url, method, params=None, timeout=20):
            return None, "boom"
        g.rpc_call = dead
        trace, decision, _ = g.evaluate(POLICY, prop(10**14), "atlantic", None)
        self.assertEqual(decision, "BLOCK")  # never ALLOW on missing data
        net = next(c for c in trace if c["id"] == "network")
        self.assertFalse(net["passed"])
        self.assertIn("fail-closed", net["reason"])

    def test_wrong_chain_refused(self):
        self.chain.chain_id_hex = "0x688"  # 1672 = mainnet chain id shape
        trace, decision, _ = g.evaluate(POLICY, prop(10**14), "atlantic", None)
        self.assertEqual(decision, "BLOCK")
        net = next(c for c in trace if c["id"] == "network")
        self.assertIn("REFUSE", net["reason"])

    # -- mainnet firewall ----------------------------------------------------
    def test_mainnet_refused_outright_no_confirm(self):
        trace, decision, refused = g.evaluate(POLICY, prop(10**14),
                                              "mainnet", None)
        self.assertEqual(decision, "REFUSE")
        self.assertTrue(refused)
        net = next(c for c in trace if c["id"] == "network")
        self.assertFalse(net["passed"])
        self.assertIn("REFUSED", net["reason"])

    def test_mainnet_refused_even_with_confirmation(self):
        # the explicit re-confirmation path exists, but policy.mainnet.enabled
        # is false: refusal is unconditional. This is the documented firewall.
        trace, decision, refused = g.evaluate(
            POLICY, prop(10**14), "mainnet",
            confirm_mainnet="I UNDERSTAND THIS IS MAINNET")
        self.assertEqual(decision, "REFUSE")
        self.assertTrue(refused)

    # -- key binding ----------------------------------------------------------
    def test_missing_key_blocks(self):
        os.environ.pop("DEPLOYER_PRIVATE_KEY", None)
        trace, decision, _ = g.evaluate(POLICY, prop(10**14), "atlantic", None)
        self.assertEqual(decision, "BLOCK")
        self.assertFalse(trace[0]["passed"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
