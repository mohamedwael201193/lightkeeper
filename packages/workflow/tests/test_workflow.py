#!/usr/bin/env python3
"""Tests for @lightkeeper/workflow. No network, no chain needed."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_workflow import (
    GateFailure, PermanentFailure, RetryPolicy, Saga, SagaLedger, TransientFailure,
)


class TestRetryPolicy(unittest.TestCase):
    def test_permanent_compensates(self):
        self.assertEqual(RetryPolicy().decide("permanent", 0), ("compensate",))

    def test_transient_retries_with_backoff_and_bump(self):
        p = RetryPolicy(max_retries=3, backoff_s=(5, 15, 45), gas_bump=1.20)
        kind, delay, mult = p.decide("transient", 0)
        self.assertEqual(kind, "retry")
        self.assertEqual(delay, 5)
        self.assertAlmostEqual(mult, 1.20)

    def test_transient_gives_up_after_max(self):
        p = RetryPolicy(max_retries=3)
        self.assertEqual(p.decide("transient", 3), ("give_up",))

    def test_unknown_kind_raises(self):
        with self.assertRaises(ValueError):
            RetryPolicy().decide("mystery", 0)

    def test_delay_for_clamps(self):
        p = RetryPolicy(backoff_s=(5,))
        self.assertEqual(p.delay_for(99), 5)

    def test_gas_multiplier(self):
        p = RetryPolicy(gas_bump=1.20)
        self.assertAlmostEqual(p.gas_multiplier(0), 1.0)
        self.assertAlmostEqual(p.gas_multiplier(2), 1.44)


class TestSaga(unittest.TestCase):
    def _saga(self, td):
        return Saga("run-1", os.path.join(td, "ledger.jsonl"),
                    RetryPolicy(max_retries=2, backoff_s=(0, 0), gas_bump=1.0))

    def test_happy_path(self):
        with tempfile.TemporaryDirectory() as td:
            calls = []
            s = self._saga(td)
            s.add_step("a", lambda: calls.append("a"))
            s.add_step("b", lambda: calls.append("b"))
            res = s.run()
            self.assertTrue(res["ok"])
            self.assertEqual(calls, ["a", "b"])
            self.assertEqual(res["compensations"], [])

    def test_transient_retried_then_succeeds(self):
        with tempfile.TemporaryDirectory() as td:
            tries = []
            def flaky():
                tries.append(1)
                if len(tries) < 3:
                    raise TransientFailure("dropped")
                return "ok"
            s = self._saga(td)
            s.add_step("flaky", flaky)
            s.run()
            self.assertEqual(len(tries), 3)

    def test_transient_exhaustion_raises(self):
        with tempfile.TemporaryDirectory() as td:
            s = self._saga(td)
            s.add_step("doomed", lambda: (_ for _ in ()).throw(TransientFailure("x")))
            with self.assertRaises(TransientFailure):
                s.run()

    def test_permanent_triggers_compensation_in_reverse(self):
        with tempfile.TemporaryDirectory() as td:
            order = []
            s = self._saga(td)
            s.add_step("one", lambda: order.append("one"),
                       compensate=lambda: order.append("comp-one"))
            s.add_step("two", lambda: order.append("two"),
                       compensate=lambda: order.append("comp-two"))
            def bad():
                raise PermanentFailure("mined 0x0")
            s.add_step("three", bad, compensate=lambda: order.append("comp-three"))
            with self.assertRaises(PermanentFailure):
                s.run()
            # compensations run in reverse, only for completed steps
            self.assertEqual(order, ["one", "two", "comp-two", "comp-one"])

    def test_gate_failure_compensates(self):
        with tempfile.TemporaryDirectory() as td:
            comped = []
            s = self._saga(td)
            s.add_step("one", lambda: None, compensate=lambda: comped.append("one"))
            def gated():
                raise GateFailure("post-state disagrees")
            s.add_step("two", gated)
            with self.assertRaises(GateFailure):
                s.run()
            self.assertEqual(comped, ["one"])

    def test_resume_skips_confirmed_steps(self):
        with tempfile.TemporaryDirectory() as td:
            lp = os.path.join(td, "ledger.jsonl")
            s1 = Saga("run-1", lp, RetryPolicy(backoff_s=(0,)))
            ran = []
            s1.add_step("a", lambda: ran.append("a"))
            s1.run()
            # second saga over the same ledger: step a is idempotently skipped
            s2 = Saga("run-1", lp, RetryPolicy(backoff_s=(0,)))
            s2.add_step("a", lambda: ran.append("a-again"))
            s2.add_step("b", lambda: ran.append("b"))
            res = s2.run()
            self.assertEqual(ran, ["a", "b"])
            self.assertIn("a", res["steps"])


class TestSagaLedger(unittest.TestCase):
    def test_completed_steps(self):
        with tempfile.TemporaryDirectory() as td:
            lp = os.path.join(td, "l.jsonl")
            led = SagaLedger(lp)
            led.append("a", "CONFIRMED")
            led.append("b", "RUNNING")
            self.assertEqual(led.completed_steps(), {"a"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
