#!/usr/bin/env python3
"""T12 v3 - COMPOSED AGENT: "Grounded Portfolio Action" (WS3 bet B).

Four tasks, invoked as tasks, through ONE uniform contract
(@lightkeeper/skill-adapter composed): every stage is a subprocess CLI
(--in/--out JSON), every handoff is schema-checked, and every sub-call
carries an x402 payment-intent ledger entry.

    T14 PROPOSE  (real Chain MCP reads at a pinned block)
      -> T13/T04 GROUND (live Docs MCP grounding verdict)
        -> T11 GATE (fail-closed policy; BLOCK/REFUSE halts the pipeline)
          -> T08 DRY-RUN (real estimate_gas) + Tier-B sign-yourself tx

No private keys anywhere. Nothing broadcasts. The dry-run stage refuses
to execute unless the gate's ALLOW is in its (schema-checked) handoff.

Usage:
    python3 composed_agent.py --amount-usdc 5 --label flagship-1
    python3 composed_agent.py --amount-usdc 5 --policy policy-deny-all.json --label kill-1
Exit 0: pipeline completed. Exit 2: pipeline halted (record is the proof).
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(TASK))
sys.path.insert(0, os.path.join(REPO, "packages", "skill-adapter", "py"))

from lightkeeper_skill_adapter.composed import StageSpec, run_composed  # noqa: E402

PY = sys.executable
STAGES_DIR = os.path.join(HERE, "stages")
RUN_LOGS = os.path.join(HERE, "run-logs")
DEFAULT_HOLDER = "0x936564245b69f5a293b42cbd752e0ee3bb68b470"  # T12's watched holder
DEFAULT_DESTINATION = "0x000000000000000000000000000000000000dEaD"

PROPOSE_OUT = {
    "required": ["pinned_block", "chain_id", "balance_usdc", "proposed_action", "token"],
    "properties": {
        "pinned_block": {"type": "integer"},
        "chain_id": {"type": "integer", "enum": [1672]},
        "balance_usdc": {"type": "string"},
        "token": {"type": "string"},
    },
}
GROUND_OUT = {
    "required": ["grounded", "grounding_verdict", "citations"],
    "properties": {
        "grounded": {"type": "boolean"},
        "grounding_verdict": {"type": "string",
                              "enum": ["grounded", "partial", "unknown"]},
        "citations": {"type": "array"},
    },
}
GATE_OUT = {
    "required": ["decision", "rules", "halt"],
    "properties": {
        "decision": {"type": "string", "enum": ["ALLOW", "BLOCK", "REFUSE"]},
        "halt": {"type": "boolean"},
    },
}
DRYRUN_OUT = {
    "required": ["dry_run", "tier_b_sign_yourself"],
    "properties": {
        "dry_run": {"type": "object"},
        "tier_b_sign_yourself": {"type": "object"},
    },
}


def build_stages(policy_path: str) -> list[StageSpec]:
    def stage_cli(script):
        return [PY, os.path.join(STAGES_DIR, script), "--in", "{in}", "--out", "{out}"]

    return [
        StageSpec(task_id="t14", name="propose",
                  cli=stage_cli("propose_t14.py"),
                  in_schema={"required": ["holder", "amount_usdc", "destination"],
                             "properties": {"holder": {"type": "string"},
                                            "amount_usdc": {"type": "string"},
                                            "destination": {"type": "string"}}},
                  out_schema=PROPOSE_OUT,
                  x402_amount="1000", x402_currency="USDC"),
        StageSpec(task_id="t13+t04", name="ground",
                  cli=stage_cli("ground_docs.py"),
                  in_schema=PROPOSE_OUT, out_schema=GROUND_OUT,
                  x402_amount="1000", x402_currency="USDC"),
        StageSpec(task_id="t11", name="gate",
                  cli=stage_cli("policy_gate.py") + ["--policy", policy_path],
                  in_schema=GROUND_OUT, out_schema=GATE_OUT,
                  x402_amount="1000", x402_currency="USDC"),
        StageSpec(task_id="t08", name="dry-run",
                  cli=stage_cli("dryrun_t08.py"),
                  in_schema=GATE_OUT, out_schema=DRYRUN_OUT,
                  x402_amount="1000", x402_currency="USDC"),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--holder", default=DEFAULT_HOLDER)
    ap.add_argument("--destination", default=DEFAULT_DESTINATION)
    ap.add_argument("--amount-usdc", default="5")
    ap.add_argument("--policy", default=os.path.join(HERE, "policy.json"))
    ap.add_argument("--label", default="run-1")
    ns = ap.parse_args()

    initial = {"holder": ns.holder, "destination": ns.destination,
               "amount_usdc": str(ns.amount_usdc)}
    run = run_composed(build_stages(ns.policy), initial, RUN_LOGS,
                       run_id=f"v3-{ns.label}")
    rec_path = os.path.join(RUN_LOGS, f"v3-{ns.label}.json")
    with open(rec_path, "w", encoding="utf-8") as f:
        json.dump(run.to_dict(), f, indent=2)

    print(f"run {run.run_id}: stages ok="
          f"{[s.ok for s in run.stages]} halted_at={run.halted_at or '-'}")
    if run.halt_reason:
        print(f"halt reason: {run.halt_reason}")
    print(f"x402 ledger entries: {len(run.payments)} "
          f"(per sub-call, settlement: intent-recorded)")
    print(f"record: {rec_path}")
    sys.exit(0 if not run.halted_at else 2)


if __name__ == "__main__":
    main()
