#!/usr/bin/env python3
"""
Idempotency + scheduling unit tests for tide.py (T18).

These are PURE LOGIC tests: no network, no broadcasts. Chain-touching
functions (validate_payment, broadcast_native) are monkeypatched where a
full tick is simulated. The double-tick test is the unit-level proof that a
paid installment can never be paid twice.

Run:  python3 tests/test_idempotency.py
      (or: python3 -m unittest discover -s tests)
"""

import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import tide  # noqa: E402


def make_sched(**kw):
    now = int(time.time())
    sched = {
        "schedule_id": "test-sched",
        "label": "unit test schedule",
        "recipient": "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
        "token": "PHRS",
        "token_type": "native",
        "amount_phrs": "0.0005",
        "interval": "weekly",
        "start_time": now - 3600,  # installment 0 already due
        "max_runs": 4,
        "stop_conditions": {"expires_at": None, "min_balance_after_phrs": "1.0"},
        "control": {"paused": False, "cancelled": False},
    }
    sched.update(kw)
    return sched


class TideTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        # redirect tide's file paths into the sandbox
        self._cfg = tide.CONFIG_PATH
        self._state = tide.STATE_PATH
        self._audit = tide.AUDIT_PATH
        tide.CONFIG_PATH = os.path.join(self.tmp.name, "schedule.json")
        tide.STATE_PATH = os.path.join(self.tmp.name, "state.jsonl")
        tide.AUDIT_PATH = os.path.join(self.tmp.name, "audit.log")
        self.sched = make_sched()
        with open(tide.CONFIG_PATH, "w") as f:
            json.dump(self.sched, f)

    def tearDown(self):
        tide.CONFIG_PATH = self._cfg
        tide.STATE_PATH = self._state
        tide.AUDIT_PATH = self._audit

    # -- pure scheduling -------------------------------------------------

    def test_first_installment_due(self):
        recs = tide.load_state()
        n = tide.due_installment(self.sched, recs, int(time.time()))
        self.assertEqual(n, 0)

    def test_future_start_nothing_due(self):
        s = make_sched(start_time=int(time.time()) + 86400)
        n = tide.due_installment(s, [], int(time.time()))
        self.assertIsNone(n)

    def test_max_runs_exhausted(self):
        recs = []
        for n in range(4):
            recs.append({"schedule_id": "test-sched", "installment": n,
                         "status": "paid", "tx_hash": f"0x{'%02d' % n}"})
        n = tide.due_installment(self.sched, recs, int(time.time()) + 10**7)
        self.assertIsNone(n)

    def test_expiry_stops_schedule(self):
        s = make_sched(stop_conditions={"expires_at": int(time.time()) - 10,
                                        "min_balance_after_phrs": "1.0"})
        n = tide.due_installment(s, [], int(time.time()))
        self.assertIsNone(n)

    def test_next_payment_reported(self):
        nxt = tide.next_payment(self.sched, [], int(time.time()))
        self.assertIsNotNone(nxt)
        self.assertEqual(nxt[0], 1)  # installment 0 due now; next future is 1

    # -- idempotency -----------------------------------------------------

    def _stub_chain(self, tc, fail_validation=False):
        """Stub the two chain-touching functions; count broadcasts."""
        calls = {"broadcasts": 0}

        def fake_validate(sched, rpc, sender):
            if fail_validation:
                raise tide.TideError("INSUFFICIENT BALANCE (stub)")
            return (500_000_000_000_000, 210_000_000_000_000, 6_000_000_000_000_000_000)

        def fake_broadcast(rpc, key, to, amount_wei):
            calls["broadcasts"] += 1
            return f"0xstub{'%06d' % calls['broadcasts']}"

        def fake_tx_status(rpc, h):
            return ("0x1", 12345)

        tc._orig = (tide.validate_payment, tide.broadcast_native,
                    tide.tx_status, tide.wallet_address)
        tide.validate_payment = fake_validate
        tide.broadcast_native = fake_broadcast
        tide.tx_status = fake_tx_status
        tide.wallet_address = lambda: "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
        tc.addCleanup(lambda: self._restore(tc))
        return calls

    def _restore(self, tc):
        (tide.validate_payment, tide.broadcast_native,
         tide.tx_status, tide.wallet_address) = tc._orig

    def _run_tick(self):
        os.environ.setdefault("ATLANTIC_RPC_URL", "stub")
        os.environ.setdefault("DEPLOYER_PRIVATE_KEY", "stub")
        return tide.main(["tick"])

    def test_double_tick_pays_exactly_once(self):
        calls = self._stub_chain(self)
        rc1 = self._run_tick()
        rc2 = self._run_tick()
        rc3 = self._run_tick()
        self.assertEqual(rc1, 0)
        self.assertEqual(rc2, 0)
        self.assertEqual(rc3, 0)
        self.assertEqual(calls["broadcasts"], 1, "double-pay detected!")
        recs = tide.load_state()
        paid = [r for r in recs if r.get("status") == "paid"]
        self.assertEqual(len(paid), 1)

    def test_sequential_installments_each_paid_once(self):
        calls = self._stub_chain(self)
        # make installment 1 due as well by pushing start back 2 weeks
        s = make_sched(start_time=int(time.time()) - 2 * 7 * 24 * 3600)
        with open(tide.CONFIG_PATH, "w") as f:
            json.dump(s, f)
        self._run_tick()
        self._run_tick()
        self.assertEqual(calls["broadcasts"], 2)
        recs = tide.load_state()
        paid_ns = sorted(r["installment"] for r in recs if r.get("status") == "paid")
        self.assertEqual(paid_ns, [0, 1])

    def test_failed_installment_never_broadcasts(self):
        calls = self._stub_chain(self, fail_validation=True)
        rc = self._run_tick()
        self.assertEqual(rc, 2)
        self.assertEqual(calls["broadcasts"], 0)
        recs = tide.load_state()
        failed = [r for r in recs if r.get("status") == "failed"]
        self.assertEqual(len(failed), 1)

    def test_broadcast_unknown_blocks_retry(self):
        # a dangling broadcast whose hash is unknown on-chain must NOT retry
        recs = [{"schedule_id": "test-sched", "installment": 0,
                 "status": "broadcast", "tx_hash": "0xdeadbeef"}]
        for r in recs:
            tide.append_state(r)

        def fake_tx_status(rpc, h):
            return (None, None)  # unknown on chain

        calls = self._stub_chain(self)
        orig_status = tide.tx_status
        tide.tx_status = fake_tx_status
        self.addCleanup(lambda: setattr(tide, "tx_status", orig_status))
        rc = self._run_tick()
        self.assertEqual(rc, 0)
        self.assertEqual(calls["broadcasts"], 0,
                         "retried an unknown broadcast — double-pay risk!")
        recs = tide.load_state()
        self.assertEqual(tide.latest_status(recs, "test-sched", 0), "broadcast-unknown")

    # -- control ---------------------------------------------------------

    def test_paused_schedule_skips(self):
        calls = self._stub_chain(self)
        tide.main(["pause"])
        rc = self._run_tick()
        self.assertEqual(rc, 0)
        self.assertEqual(calls["broadcasts"], 0)

    def test_cancelled_schedule_skips(self):
        calls = self._stub_chain(self)
        tide.main(["cancel"])
        rc = self._run_tick()
        self.assertEqual(rc, 0)
        self.assertEqual(calls["broadcasts"], 0)

    def test_pause_resume_cycle(self):
        self._stub_chain(self)
        self.assertEqual(tide.main(["pause"]), 0)
        self.assertEqual(tide.main(["resume"]), 0)
        with open(tide.CONFIG_PATH) as f:
            ctrl = json.load(f)["control"]
        self.assertFalse(ctrl["paused"])
        self.assertFalse(ctrl["cancelled"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
