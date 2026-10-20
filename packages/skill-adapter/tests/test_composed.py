#!/usr/bin/env python3
"""Tests for @lightkeeper/skill-adapter composed agents (WS3 bet B). Offline:
stage CLIs are fake python scripts written to a temp dir — the boundary
(subprocess + JSON files + schemas) is the real one."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_skill_adapter.composed import (  # noqa: E402
    HandoffSchemaError, StageSpec, check_handoff, run_composed)

GOOD_STAGE = '''
import json, sys
inp = json.load(open(sys.argv[sys.argv.index("--in") + 1]))
out = dict(inp); out["echo"] = inp["msg"]; out["v"] = 1
json.dump(out, open(sys.argv[sys.argv.index("--out") + 1], "w"))
'''
BAD_SCHEMA_STAGE = '''
import json, sys
json.dump({"wrong": True}, open(sys.argv[sys.argv.index("--out") + 1], "w"))
'''
HALT_STAGE = '''
import json, sys
inp = json.load(open(sys.argv[sys.argv.index("--in") + 1]))
out = dict(inp); out["halt"] = True; out["halt_reason"] = "gate said no"
json.dump(out, open(sys.argv[sys.argv.index("--out") + 1], "w"))
'''


def spec(name, script, out_schema):
    return StageSpec(task_id="fake", name=name,
                     cli=[sys.executable, script, "--in", "{in}", "--out", "{out}"],
                     in_schema={}, out_schema=out_schema,
                     x402_amount="10", x402_currency="USDC")


class TestSchema(unittest.TestCase):
    def test_valid(self):
        check_handoff({"required": ["a"], "properties": {"a": {"type": "integer"}}},
                      {"a": 3}, stage="s")

    def test_missing_required(self):
        with self.assertRaises(HandoffSchemaError):
            check_handoff({"required": ["a"]}, {}, stage="s")

    def test_wrong_type(self):
        with self.assertRaises(HandoffSchemaError):
            check_handoff({"properties": {"a": {"type": "string"}}}, {"a": 1}, stage="s")

    def test_bool_is_not_integer(self):
        with self.assertRaises(HandoffSchemaError):
            check_handoff({"properties": {"a": {"type": "integer"}}}, {"a": True}, stage="s")

    def test_enum(self):
        with self.assertRaises(HandoffSchemaError):
            check_handoff({"properties": {"d": {"enum": ["ALLOW"]}}},
                          {"d": "MAYBE"}, stage="s")

    def test_nested_object(self):
        schema = {"properties": {"tx": {"type": "object",
                                        "required": ["to"],
                                        "properties": {"to": {"type": "string"}}}}}
        check_handoff(schema, {"tx": {"to": "0x1"}}, stage="s")
        with self.assertRaises(HandoffSchemaError):
            check_handoff(schema, {"tx": {}}, stage="s")


class TestOrchestrator(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.good = self._write("good.py", GOOD_STAGE)
        self.bad = self._write("bad.py", BAD_SCHEMA_STAGE)
        self.halt = self._write("halt.py", HALT_STAGE)

    def _write(self, name, body):
        p = os.path.join(self.dir, name)
        open(p, "w").write(body)
        return p

    def test_two_stage_run_and_x402(self):
        stages = [spec("a", self.good, {"required": ["echo"]}),
                  spec("b", self.good, {"required": ["echo"]})]
        run = run_composed(stages, {"msg": "hi"}, self.dir, run_id="t1")
        self.assertFalse(run.halted_at)
        self.assertEqual([s.ok for s in run.stages], [True, True])
        self.assertEqual(len(run.payments), 2)
        for p in run.payments:
            self.assertEqual(p["protocol"], "x402")
            self.assertEqual(p["settlement"], "intent-recorded")

    def test_schema_violation_halts_before_next_stage(self):
        stages = [spec("bad", self.bad, {"required": ["echo"]}),
                  spec("never", self.good, {"required": ["echo"]})]
        run = run_composed(stages, {"msg": "hi"}, self.dir, run_id="t2")
        self.assertEqual(run.halted_at, "bad")
        self.assertEqual(len(run.stages), 1)  # second stage never ran
        self.assertIn("missing required field", run.halt_reason)

    def test_declared_halt_stops_pipeline(self):
        stages = [spec("gate", self.halt, {}),
                  spec("never", self.good, {"required": ["echo"]})]
        run = run_composed(stages, {"msg": "hi"}, self.dir, run_id="t3")
        self.assertEqual(run.halted_at, "gate")
        self.assertEqual(run.halt_reason, "gate said no")
        self.assertEqual(len(run.stages), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
