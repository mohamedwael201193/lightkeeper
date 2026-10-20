#!/usr/bin/env python3
"""Tests for @lightkeeper/skill-adapter. No network needed."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_skill_adapter import (
    ConfirmationMissing, SkillFailed, SkillResult, WriteGate, invoke_skill,
)


def ok_runner(name, args):
    assert name == "preflight"
    return {"verdict": "ALLOW", "echo": args["x"]}


def bad_runner(name, args):
    raise ValueError("boom")


class TestInvokeSkill(unittest.TestCase):
    def test_success(self):
        r = invoke_skill("preflight", {"x": 1}, ok_runner)
        self.assertTrue(r.ok)
        self.assertEqual(r.result, {"verdict": "ALLOW", "echo": 1})
        self.assertEqual(r.error, "")
        self.assertGreaterEqual(r.duration_s, 0.0)

    def test_error_captured_not_masked(self):
        r = invoke_skill("preflight", {}, bad_runner)
        self.assertFalse(r.ok)
        self.assertIn("ValueError", r.error)
        self.assertIn("boom", r.error)
        self.assertIsNone(r.result)

    def test_unwrap_ok(self):
        r = invoke_skill("preflight", {"x": 2}, ok_runner)
        self.assertEqual(r.unwrap()["echo"], 2)

    def test_unwrap_failed_raises(self):
        r = invoke_skill("preflight", {}, bad_runner)
        with self.assertRaises(SkillFailed):
            r.unwrap()

    def test_result_is_typed(self):
        r = invoke_skill("s", {}, lambda n, a: 42)
        self.assertIsInstance(r, SkillResult)
        self.assertEqual(r.name, "s")


class TestWriteGate(unittest.TestCase):
    def test_token_roundtrip(self):
        tok = WriteGate.new_token()
        WriteGate.require_confirmation(tok, tok)  # no raise

    def test_missing_token_refused(self):
        with self.assertRaises(ConfirmationMissing):
            WriteGate.require_confirmation(None, WriteGate.new_token())

    def test_wrong_token_refused(self):
        with self.assertRaises(ConfirmationMissing):
            WriteGate.require_confirmation("confirm-deadbeef", WriteGate.new_token())

    def test_tokens_unique(self):
        self.assertNotEqual(WriteGate.new_token(), WriteGate.new_token())


if __name__ == "__main__":
    unittest.main(verbosity=2)
