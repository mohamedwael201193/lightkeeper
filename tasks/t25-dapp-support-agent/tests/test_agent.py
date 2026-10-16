#!/usr/bin/env python3
"""T25 test suite: every transcript is re-run live and asserted against
direct chain queries (cast). No mocks. Fails loudly on any mismatch.

Run:  set -a; source ~/workspace/lightkeeper/.env; set +a
      python3 tests/test_agent.py
"""
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
AGENT = os.path.join(SRC, "support_agent.py")
RPC = os.environ.get("ATLANTIC_RPC_URL")
DEPLOYER = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"

# Real, mined Atlantic txs (see evidence.md for provenance)
TX_REVERT_REASON = "0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23"
TX_OUT_OF_GAS = "0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf"
TX_PANIC = "0x2c78309c41ce0bd53f611ac5a1ad5e2bfa0e29b7f5e3514b9f0a429c2dcab048"
TX_SUCCESS = "0x48adea8bae24bcc9fa94f175e7a86c424c483f804599ada1dfd72a6ad5aec9e7"  # TestReverter deploy


def cast(*args):
    p = subprocess.run(["cast", *args, "--rpc-url", RPC],
                       capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        raise AssertionError(f"cast {' '.join(args)} failed: {p.stderr[:300]}")
    return p.stdout.strip()


def agent(*args):
    env = dict(os.environ)
    p = subprocess.run([sys.executable, AGENT, *args, "--json"],
                       capture_output=True, text=True, timeout=120, env=env,
                       cwd=SRC)
    if p.returncode != 0:
        raise AssertionError(f"agent {' '.join(args)} failed: {p.stderr[:300]}")
    return json.loads(p.stdout)


def receipt_field(txh, field):
    return cast("receipt", txh, "|", "grep", field) if False else None


def get_receipt(txh):
    out = cast("receipt", txh)
    d = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            d[parts[0]] = " ".join(parts[1:])
    return d


class TestDiagnoseMatchesChain(unittest.TestCase):
    def test_revert_with_reason(self):
        got = agent("diagnose", TX_REVERT_REASON)
        rc = get_receipt(TX_REVERT_REASON)
        self.assertEqual(got["verdict"], "revert_with_reason")
        self.assertEqual(got["status"], 0)
        self.assertEqual(got["block"], int(rc["blockNumber"]))
        self.assertEqual(got["gas_used"], int(rc["gasUsed"]))
        self.assertEqual(got["revert_detail"], "SUPPORT-DIAG: intentional revert with reason")
        self.assertIn("DOC-GROUNDED", got["label"])

    def test_out_of_gas(self):
        got = agent("diagnose", TX_OUT_OF_GAS)
        rc = get_receipt(TX_OUT_OF_GAS)
        txinfo = cast("tx", TX_OUT_OF_GAS)
        gas_limit = int([l.split()[1] for l in txinfo.splitlines() if l.startswith("gasLimit")][0])
        self.assertEqual(got["verdict"], "out_of_gas")
        self.assertEqual(got["gas_used"], got["gas_limit"])
        self.assertEqual(got["gas_used"], int(rc["gasUsed"]))
        self.assertEqual(got["gas_limit"], gas_limit)
        self.assertIn("faqs.md", got["citation"]["source"])

    def test_panic_revert(self):
        got = agent("diagnose", TX_PANIC)
        self.assertEqual(got["verdict"], "revert_panic")
        self.assertIn("0x11", got["revert_detail"])
        self.assertIn("INFERENCE", got["label"])

    def test_success_path(self):
        got = agent("diagnose", TX_SUCCESS)
        rc = get_receipt(TX_SUCCESS)
        self.assertEqual(got["verdict"], "success")
        self.assertEqual(got["status"], 1)
        self.assertEqual(got["block"], int(rc["blockNumber"]))

    def test_not_found_path(self):
        got = agent("diagnose", "0x" + "ab" * 32)
        self.assertEqual(got["verdict"], "not_found")


class TestAccountMatchesChain(unittest.TestCase):
    def test_account_report(self):
        got = agent("account", DEPLOYER)
        self.assertEqual(got["verdict"], "account_report")
        chain_bal = int(cast("balance", DEPLOYER).split()[0])
        chain_nonce = int(cast("nonce", DEPLOYER).split()[0])
        # NOTE: the deployer wallet is shared by all 28 LIGHTKEEPER builders, so its
        # balance drifts as other agents' txs mine between reads. Tolerance 0.1 PHRS
        # keeps the assertion meaningful (catches unit/decimal bugs) without flaking.
        self.assertAlmostEqual(got["balance_phrs"] * 1e18, chain_bal, delta=1e17)
        # nonce only moves forward on the shared wallet; agent read happened first
        self.assertLessEqual(got["tx_count_nonce"], chain_nonce)
        self.assertFalse(got["is_contract"])


class TestDocGroundedQA(unittest.TestCase):
    def test_covered_question_cited(self):
        got = agent("ask", "What is the Atlantic testnet chain ID?")
        self.assertEqual(got["verdict"], "answered")
        c = got["citation"]
        self.assertTrue(c["source"].startswith("https://docs.pharos.xyz/"))
        self.assertEqual(c["fetched"], "2026-10-16")
        self.assertIn("688689", c["excerpt"])
        self.assertIn("DOC-GROUNDED", got["label"])

    def test_uncovered_question_says_so(self):
        got = agent("ask", "How do I run a confidential transaction on Pharos?")
        self.assertEqual(got["verdict"], "not_covered")
        self.assertIn("UNVERIFIED", got["label"])
        self.assertIn("won't improvise", got["plain"])


if __name__ == "__main__":
    if not RPC:
        sys.exit("ATLANTIC_RPC_URL not set — source ~/workspace/lightkeeper/.env first")
    unittest.main(verbosity=2)
