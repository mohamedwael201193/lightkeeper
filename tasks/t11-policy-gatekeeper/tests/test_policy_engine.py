#!/usr/bin/env python3
"""Unit tests for the T11 policy engine. Hermetic: no RPC, no subprocess,
no network. Live deny/approve paths are exercised separately via the CLI
and recorded in run-logs/ + audit/check-log.jsonl."""
import copy
import datetime
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import gatekeeper as g

HERE = os.path.dirname(os.path.abspath(__file__))
POLICY = json.load(open(os.path.join(HERE, "..", "policy.json")))

SELF = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
SINK = "0x000000000000000000000000000000000000dEaD"
IN_WINDOW = datetime.datetime(2026, 10, 16, 4, 30,
                              tzinfo=datetime.timezone.utc)  # 04:30 UTC in [2,8)
OUT_WINDOW = datetime.datetime(2026, 10, 16, 12, 0,
                               tzinfo=datetime.timezone.utc)  # outside


def base_action(**kw):
    a = {"type": "native_transfer", "network": "atlantic",
         "chain_id": 688689, "to": SINK, "value_wei": "1000000000000000"}
    a.update(kw)
    return a


def evaluate(action, policy=None, now=IN_WINDOW, last=None):
    return g.evaluate_action(action, policy or copy.deepcopy(POLICY),
                             now=now, last_approved_iso=last)


class TestRuleTypes(unittest.TestCase):
    def test_happy_path_approves_with_stamp(self):
        d, results, reasons, stamp = evaluate(base_action())
        self.assertEqual(d, "APPROVE")
        self.assertEqual(reasons, [])
        self.assertTrue(all(r["result"] == "PASS" for r in results))
        self.assertIsNotNone(stamp)
        self.assertEqual(stamp["decision"], "APPROVE")
        self.assertEqual(stamp["action_hash"], g.action_hash_of(base_action()))
        self.assertEqual(stamp["policy_hash"], g.policy_hash(POLICY))

    def test_action_allowlist_denies_deploy(self):
        d, results, reasons, stamp = evaluate(
            base_action(type="deploy", to=SELF))
        self.assertEqual(d, "DENY")
        self.assertIsNone(stamp)
        rules = [r["rule"] for r in results if r["result"] == "FAIL"]
        self.assertIn("action_allowlist", rules)
        self.assertIn("action_allowlist",
                      [x["rule"] for x in reasons])

    def test_selector_allowlist_denies_unknown_selector(self):
        d, results, reasons, _ = evaluate(base_action(
            type="contract_call", selector="0xdeadbeef", value_wei="0"))
        self.assertEqual(d, "DENY")
        self.assertIn("selector_allowlist",
                      [r["rule"] for r in results if r["result"] == "FAIL"])

    def test_selector_allowlist_passes_known_selector(self):
        d, _, _, _ = evaluate(base_action(
            type="contract_call", selector="0xa9059cbb", value_wei="0"))
        self.assertEqual(d, "APPROVE")

    def test_token_allowlist_denies_unlisted_token(self):
        d, results, _, _ = evaluate(base_action(
            type="erc20_transfer", token="0x1234567890123456789012345678901234567890",
            value_wei="0"))
        self.assertEqual(d, "DENY")
        self.assertIn("token_allowlist",
                      [r["rule"] for r in results if r["result"] == "FAIL"])

    def test_destination_allowlist_denies_stranger(self):
        d, results, reasons, _ = evaluate(base_action(
            to="0x1111111111111111111111111111111111111111"))
        self.assertEqual(d, "DENY")
        self.assertIn("destination_allowlist",
                      [r["rule"] for r in results if r["result"] == "FAIL"])
        self.assertTrue(any("destination_allowlist" in str(x) for x in reasons))

    def test_per_action_cap_denies_oversize(self):
        d, results, _, _ = evaluate(
            base_action(value_wei="999000000000000000"))  # 0.999 PHRS > 0.01 cap
        self.assertEqual(d, "DENY")
        self.assertIn("per_action_caps",
                      [r["rule"] for r in results if r["result"] == "FAIL"])

    def test_time_window_denies_outside(self):
        d, results, _, _ = evaluate(base_action(), now=OUT_WINDOW)
        self.assertEqual(d, "DENY")
        self.assertIn("time_window",
                      [r["rule"] for r in results if r["result"] == "FAIL"])

    def test_cooldown_denies_rapid_repeat(self):
        recent = (IN_WINDOW - datetime.timedelta(seconds=10)).isoformat()
        d, results, _, _ = evaluate(base_action(), last=recent)
        self.assertEqual(d, "DENY")
        self.assertIn("cooldown",
                      [r["rule"] for r in results if r["result"] == "FAIL"])

    def test_cooldown_passes_after_wait(self):
        old = (IN_WINDOW - datetime.timedelta(seconds=3600)).isoformat()
        d, _, _, _ = evaluate(base_action(), last=old)
        self.assertEqual(d, "APPROVE")


class TestMainnetRefusal(unittest.TestCase):
    def test_mainnet_refused_not_denied(self):
        d, results, reasons, stamp = evaluate(
            base_action(network="mainnet", chain_id=1672))
        self.assertEqual(d, "REFUSED_MAINNET")
        self.assertIsNone(stamp)
        detail_blob = " ".join(r["detail"] for r in results)
        self.assertIn("re-confirmation", detail_blob)

    def test_unknown_chain_denied_by_firewall(self):
        d, results, _, _ = evaluate(base_action(chain_id=1))
        self.assertEqual(d, "DENY")
        self.assertIn("network_firewall",
                      [r["rule"] for r in results if r["result"] == "FAIL"])

    def test_mainnet_evaluation_is_pure_no_subprocess(self):
        # evaluate_action must never touch the network: prove by replacing
        # every side-effecting callable with one that explodes.
        orig = (g.subprocess, g.rpc_call)
        def boom(*a, **k):
            raise AssertionError("side effect attempted on mainnet path")
        g.rpc_call = boom
        orig_run = g.subprocess.run
        g.subprocess.run = boom
        try:
            d, _, _, _ = evaluate(base_action(network="mainnet", chain_id=1672))
            self.assertEqual(d, "REFUSED_MAINNET")
        finally:
            g.rpc_call = orig[1]
            g.subprocess.run = orig_run


class TestFailClosed(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old_audit = g.AUDIT_PATH
        g.AUDIT_PATH = os.path.join(self.tmp, "check-log.jsonl")

    def tearDown(self):
        g.AUDIT_PATH = self.old_audit

    def test_missing_policy_refuses(self):
        with self.assertRaises(SystemExit) as cm:
            g.load_policy("/nonexistent/policy.json")
        self.assertEqual(cm.exception.code, g.EXIT_REFUSE)

    def test_corrupt_policy_refuses(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json",
                                         delete=False) as f:
            f.write("{not json")
            p = f.name
        try:
            with self.assertRaises(SystemExit) as cm:
                g.load_policy(p)
            self.assertEqual(cm.exception.code, g.EXIT_REFUSE)
        finally:
            os.unlink(p)

    def test_policy_missing_key_refuses(self):
        bad = copy.deepcopy(POLICY)
        del bad["rules"]
        with tempfile.NamedTemporaryFile("w", suffix=".json",
                                         delete=False) as f:
            json.dump(bad, f)
            p = f.name
        try:
            with self.assertRaises(SystemExit) as cm:
                g.load_policy(p)
            self.assertEqual(cm.exception.code, g.EXIT_REFUSE)
        finally:
            os.unlink(p)


class TestStampNoBypass(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old_audit = g.AUDIT_PATH
        g.AUDIT_PATH = os.path.join(self.tmp, "check-log.jsonl")

    def tearDown(self):
        g.AUDIT_PATH = self.old_audit

    def _approved_stamp(self):
        d, _, _, stamp = evaluate(base_action())
        self.assertEqual(d, "APPROVE")
        g.append_audit(POLICY["policy_id"], g.policy_hash(POLICY),
                       base_action(), "APPROVE", [], [],
                       stamp["stamp_hash"])
        return stamp

    def test_valid_stamp_passes(self):
        stamp = self._approved_stamp()
        ok, _ = g.valid_stamp(stamp, base_action(), POLICY, IN_WINDOW)
        self.assertTrue(ok)

    def test_expired_stamp_rejected(self):
        stamp = self._approved_stamp()
        late = datetime.datetime(2026, 10, 16, 6, 0,
                                 tzinfo=datetime.timezone.utc)
        ok, why = g.valid_stamp(stamp, base_action(), POLICY, late)
        self.assertFalse(ok)
        self.assertIn("expired", why)

    def test_stamp_for_other_action_rejected(self):
        stamp = self._approved_stamp()
        other = base_action(value_wei="2000000000000000")
        ok, why = g.valid_stamp(stamp, other, POLICY, IN_WINDOW)
        self.assertFalse(ok)
        self.assertIn("different action", why)

    def test_tampered_stamp_rejected(self):
        stamp = self._approved_stamp()
        stamp["expires_at"] = "2099-01-01T00:00:00+00:00"
        ok, _ = g.valid_stamp(stamp, base_action(), POLICY, IN_WINDOW)
        self.assertFalse(ok)

    def test_stamp_without_audit_entry_rejected(self):
        d, _, _, stamp = evaluate(base_action())
        self.assertEqual(d, "APPROVE")
        # deliberately NOT appended to the audit log
        ok, why = g.valid_stamp(stamp, base_action(), POLICY, IN_WINDOW)
        self.assertFalse(ok)
        self.assertIn("audit", why)


class TestAuditChain(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.old_audit = g.AUDIT_PATH
        g.AUDIT_PATH = os.path.join(self.tmp, "check-log.jsonl")

    def tearDown(self):
        g.AUDIT_PATH = self.old_audit

    def test_chain_verifies_and_detects_tamper(self):
        for i in range(3):
            g.append_audit("p", "h", {"i": i}, "DENY", [], [], None)
        ok, msg = g.verify_audit()
        self.assertTrue(ok)
        self.assertIn("3 entries", msg)
        # tamper with one entry
        with open(g.AUDIT_PATH) as f:
            lines = f.read().splitlines()
        e = json.loads(lines[1])
        e["decision"] = "APPROVE"
        lines[1] = g.canon(e)
        with open(g.AUDIT_PATH, "w") as f:
            f.write("\n".join(lines) + "\n")
        ok, msg = g.verify_audit()
        self.assertFalse(ok)
        self.assertIn("tamper", msg)


if __name__ == "__main__":
    unittest.main(verbosity=2)
