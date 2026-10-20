#!/usr/bin/env python3
"""T12 v3 stage 3 - GATE (task t11 policy gatekeeper).

Evaluates the grounded proposal against the policy file with
@lightkeeper/policy (fail-closed). BLOCK or REFUSE declares a halt:
the orchestrator stops the pipeline here — the dry-run stage never runs.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
sys.path.insert(0, os.path.join(REPO, "packages", "policy", "py"))
from lightkeeper_policy import Rule, evaluate_rules


def make_rules():
    return [
        Rule(
            name="GROUNDED-REQUIRED",
            check=lambda policy, live: bool(live.get("grounded")),
            detail=lambda policy, live: (
                "docs grounding verdict=%s" % live.get("grounding_verdict"))),
        Rule(
            name="AMOUNT-UNDER-CAP",
            check=lambda policy, live: float(live.get("amount_usdc", 0)) <= float(policy["max_amount_usdc"]),
            detail=lambda policy, live: (
                "proposed %s USDC <= cap %s USDC" % (
                    live.get("amount_usdc"), policy["max_amount_usdc"]))),
        Rule(
            name="BALANCE-COVERS",
            check=lambda policy, live: float(live.get("balance_usdc", 0)) >= float(live.get("amount_usdc", 0)),
            detail=lambda policy, live: (
                "holder balance %s USDC vs proposed %s USDC" % (
                    live.get("balance_usdc"), live.get("amount_usdc")))),
        Rule(
            name="CHAIN-IDENTITY",
            check=lambda policy, live: live.get("chain_id") == 1672,
            detail=lambda policy, live: (
                "chain_id=%s (expected 1672, live from Chain MCP)" % live.get("chain_id"))),
        Rule(
            name="DESTINATION-ALLOWLISTED",
            check=lambda policy, live: live.get("destination") in policy.get("allowed_destinations", []),
            detail=lambda policy, live: (
                "destination %s in allowlist" % live.get("destination"))),
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="outp", required=True)
    ap.add_argument("--policy", default=os.path.join(TASK, "policy.json"))
    ns = ap.parse_args()
    inp = json.load(open(ns.inp))
    policy = json.load(open(ns.policy))

    if policy.get("deny_all") is True:
        # Explicit deny-all: every action BLOCKs regardless of the live data.
        from lightkeeper_policy import Decision, RuleResult
        decision = Decision(
            decision="BLOCK",
            rules=[RuleResult(rule="DENY-ALL", verdict="FAIL",
                              detail="policy.deny_all=true — every action blocked")],
            blocked=["DENY-ALL"])
    else:
        decision = evaluate_rules(
            policy, inp, make_rules(),
            require_sections=("max_amount_usdc", "allowed_destinations", "policy_id"))

    out = dict(inp)
    out.update({
        "stage": "gate",
        "decision": decision.decision,
        "rules": [r.to_dict() for r in decision.rules],
        "blocked": list(decision.blocked),
        "policy_id": policy.get("policy_id"),
        "halt": decision.decision != "ALLOW",
        "halt_reason": ("policy gate " + decision.decision +
                        ((" — blocked by: " + ", ".join(decision.blocked)) if decision.blocked else "")),
    })
    json.dump(out, open(ns.outp, "w"), indent=2)
    print("gate: decision=%s blocked=%s" % (decision.decision, decision.blocked))


if __name__ == "__main__":
    main()
