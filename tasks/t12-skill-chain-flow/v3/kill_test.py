#!/usr/bin/env python3
"""T12 v3 mandatory KILL-TESTS.

K1  Deny-all policy: the composed pipeline MUST halt at the T11 gate and
    the T08 dry-run stage MUST NEVER execute. The failure run is the proof:
    it is saved to run-logs/v3-kill-deny-all.json and asserted here.
K2  Schema-checked handoffs: a stage that returns a malformed handoff MUST
    abort the run before the next stage (offline, fake stages — the
    boundary machinery is the real one from @lightkeeper/skill-adapter).

Usage: python3 kill_test.py            # offline K2 + saved-record K1 asserts
       python3 kill_test.py --live     # also re-runs the deny-all pipeline
Exit 0: all kill-tests pass.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(REPO, "packages", "skill-adapter", "py"))
from lightkeeper_skill_adapter.composed import StageSpec, run_composed  # noqa: E402


def k2_schema_halt():
    import tempfile
    d = tempfile.mkdtemp()
    bad = os.path.join(d, "bad.py")
    open(bad, "w").write(
        'import json, sys\n'
        'json.dump({"decision": "MAYBE"}, '
        'open(sys.argv[sys.argv.index("--out") + 1], "w"))\n')
    never = os.path.join(d, "never.py")
    open(never, "w").write('raise SystemExit("must never run")\n')
    schema = {"required": ["decision"],
              "properties": {"decision": {"type": "string",
                                          "enum": ["ALLOW", "BLOCK", "REFUSE"]}}}
    stages = [
        StageSpec(task_id="fake-gate", name="gate",
                  cli=[sys.executable, bad, "--in", "{in}", "--out", "{out}"],
                  in_schema={}, out_schema=schema),
        StageSpec(task_id="fake-next", name="next",
                  cli=[sys.executable, never, "--in", "{in}", "--out", "{out}"],
                  in_schema={}, out_schema={}),
    ]
    run = run_composed(stages, {}, d, run_id="k2")
    assert run.halted_at == "gate", run.to_dict()
    assert len(run.stages) == 1, run.to_dict()
    print("K2 PASS: enum-violating handoff halted the run; next stage never ran")


def k1_assert_record(path):
    d = json.load(open(path))
    stages = [s["stage"] for s in d["stages"]]
    assert d["halted_at"] == "gate", d["halted_at"]
    assert "dry-run" not in stages, stages
    gate = [s for s in d["stages"] if s["stage"] == "gate"][0]
    assert gate["handoff_out"]["decision"] == "BLOCK", gate["handoff_out"]
    assert gate["handoff_out"]["blocked"] == ["DENY-ALL"]
    assert d["ok"] is False
    print(f"K1 PASS: deny-all halted at gate; dry-run never executed "
          f"(stages: {stages}); proof record: {path}")


def main():
    live = "--live" in sys.argv
    rec = os.path.join(HERE, "run-logs", "v3-kill-deny-all.json")
    if live:
        r = subprocess.run(
            [sys.executable, os.path.join(HERE, "composed_agent.py"),
             "--amount-usdc", "5", "--policy",
             os.path.join(HERE, "policy-deny-all.json"),
             "--label", "kill-deny-all"], capture_output=True, text=True,
            timeout=900)
        print(r.stdout.strip())
        assert r.returncode == 2, f"expected halt exit 2, got {r.returncode}"
    assert os.path.exists(rec), "deny-all proof record missing — run with --live first"
    k1_assert_record(rec)
    k2_schema_halt()
    print("kill-tests: ALL PASS")


if __name__ == "__main__":
    main()
