#!/usr/bin/env python3
"""
T17 Natural-Language Payment Agent — CLI.

Pipeline (each stage is a separate, inspectable command):
  new      "send 0.01 PHRS to 0x..."   -> runs/<id>/plan.json | clarification/refusal
  review   --run <id>                  -> validation + REVIEW CARD + unsigned tx
  confirm  --run <id> --phrase "..."   -> explicit CONFIRM <plan_id> gate
  send     --run <id>                  -> broadcast (confirmed only) + verify receipt

The agent NEVER broadcasts from `new`/`review`/`confirm`. `send` refuses unless
the explicit confirmation gate passed for the exact plan_id.

Env:
  ATLANTIC_DEPLOYER_KEY  private key of 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
                         (dust-broadcast only; read from env, never logged)
  ATLANTIC_RPC_URL       defaults to https://atlantic.dplabs-internal.com

Usage examples:
  python3 agent.py new --text "send 0.01 PHRS to 0xAbc..."
  python3 agent.py review --run abc123
  python3 agent.py confirm --run abc123 --phrase "CONFIRM 9f2c..."
  python3 agent.py send --run abc123
"""

import argparse
import json
import os
import secrets
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src import parse as P            # noqa: E402
from src import validate as V         # noqa: E402
from src import review as R           # noqa: E402
from src import gate as G             # noqa: E402
from src import broadcast as B        # noqa: E402
from src import verify as Vf          # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
RUNS = os.path.join(BASE, "runs")
DEPLOYER = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
DEFAULT_RPC = "https://atlantic.dplabs-internal.com"


def rpc_url() -> str:
    return os.environ.get("ATLANTIC_RPC_URL", DEFAULT_RPC)


def new_run() -> str:
    rid = secrets.token_hex(4)
    os.makedirs(os.path.join(RUNS, rid), exist_ok=True)
    return rid


def load_run(rid: str) -> dict:
    d = os.path.join(RUNS, rid)
    if not os.path.isdir(d):
        sys.exit(f"unknown run id: {rid}")
    out = {"dir": d, "id": rid}
    for name in ("parse.json", "review.json", "confirmed.json",
                 "executed.json", "receipt.json"):
        p = os.path.join(d, name)
        if os.path.exists(p):
            with open(p) as f:
                out[name.replace(".json", "")] = json.load(f)
    return out


def cmd_new(args):
    rid = new_run()
    d = os.path.join(RUNS, rid)
    result = P.parse(args.text)
    doc = P.result_to_dict(result)
    doc["input"] = args.text
    doc["run_id"] = rid
    doc["created_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(os.path.join(d, "parse.json"), "w") as f:
        json.dump(doc, f, indent=2)

    print(f"run id: {rid}")
    if doc["kind"] == "plan":
        print(f"PARSED OK — plan_id {doc['plan_id']}")
        print(json.dumps(doc["plan"], indent=2))
        for w in doc["warnings"]:
            print(f"warning: {w}")
        print("\nNext: review the plan with")
        print(f"  python3 agent.py review --run {rid}")
    elif doc["kind"] == "clarification":
        print("CLARIFICATION NEEDED — no plan produced, nothing will be sent.")
        print(f"reason:   {doc['reason']}")
        print(f"question: {doc['clarification_question']}")
    else:
        print("REFUSED — no plan produced, nothing will be sent.")
        print(f"reason:   {doc['reason']}")
        print(f"question: {doc['clarification_question']}")
    return rid


def cmd_review(args):
    run = load_run(args.run)
    parsed = run.get("parse")
    if not parsed:
        sys.exit("no parse.json — run `new` first")
    if parsed["kind"] != "plan":
        print(f"Cannot review: parse kind is '{parsed['kind']}'.")
        print(f"reason: {parsed['reason']}")
        print("Resolve the clarification/refusal first — there is no plan to review.")
        sys.exit(2)
    plan, plan_id = parsed["plan"], parsed["plan_id"]

    try:
        vrep = V.validate(plan, DEPLOYER, rpc_url())
    except V.ValidationError as e:
        print(f"VALIDATION ERROR: {e}")
        sys.exit(3)
    vdoc = V.report_to_dict(vrep)

    unsigned = R.build_unsigned_tx(plan, vdoc, DEPLOYER, rpc_url())
    review_doc = {"run_id": args.run, "plan": plan, "plan_id": plan_id,
                  "validation": vdoc, "unsigned_tx": unsigned,
                  "reviewed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    with open(os.path.join(run["dir"], "review.json"), "w") as f:
        json.dump(review_doc, f, indent=2)

    print(R.render_review_card(plan, vdoc, unsigned))
    if not vdoc["ok"]:
        print("\nVALIDATION FAILED — this plan cannot proceed to confirmation.")
        sys.exit(4)
    print("\nValidation passed. Confirm explicitly with:")
    print(f"  python3 agent.py confirm --run {args.run} --phrase \"CONFIRM {plan_id}\"")
    print("(The confirmation phrase is the plan hash — it binds to this exact plan.)")


def cmd_confirm(args):
    run = load_run(args.run)
    parsed = run.get("parse")
    if not parsed or parsed["kind"] != "plan":
        sys.exit("refusing: no valid plan in this run")
    res = G.confirm(run["dir"], parsed["plan"], parsed["plan_id"], args.phrase)
    if not res["ok"]:
        print(f"CONFIRMATION REJECTED: {res['reason']}")
        sys.exit(5)
    print("CONFIRMED — explicit human confirmation recorded:")
    print(json.dumps(res["record"], indent=2))
    print("\nNothing has been broadcast yet. To broadcast:")
    print(f"  python3 agent.py send --run {args.run}")


def cmd_send(args):
    run = load_run(args.run)
    parsed = run.get("parse")
    reviewed = run.get("review")
    if not parsed or parsed["kind"] != "plan" or not reviewed:
        sys.exit("refusing: run has no reviewed plan")
    plan, plan_id = parsed["plan"], parsed["plan_id"]

    print("Broadcast gate checks… (key loaded from env, never printed)")
    res = B.broadcast(run["dir"], plan, plan_id, DEPLOYER, rpc_url(),
                      reviewed["validation"])
    if not res["ok"]:
        print(f"BROADCAST REFUSED at stage '{res['stage']}': {res['reason']}")
        sys.exit(6)
    txh = res["executed"]["tx_hash"]
    print(f"broadcast OK — tx {txh}")
    print("verifying receipt (read-back)…")
    vres = Vf.verify(txh, plan, rpc_url())
    with open(os.path.join(run["dir"], "receipt.json"), "w") as f:
        json.dump({**res["executed"], "verification": vres}, f, indent=2)
    for c in vres["checks"]:
        mark = "PASS" if c["pass"] else "FAIL"
        print(f"  [{mark}] {c['check']}: {c.get('observed')}")
    if vres["ok"]:
        print(f"\nRECEIPT VERIFIED: {vres['explorer']}")
    else:
        print("\nRECEIPT VERIFICATION FAILED — investigate before reusing this run.")
        sys.exit(7)


def main():
    ap = argparse.ArgumentParser(description="T17 natural-language payment agent")
    sub = ap.add_subparsers(dest="cmd", required=True)

    n = sub.add_parser("new", help="parse free text into a plan (or clarification/refusal)")
    n.add_argument("--text", required=True)
    n.set_defaults(fn=cmd_new)

    r = sub.add_parser("review", help="validate + render human-readable review card")
    r.add_argument("--run", required=True)
    r.set_defaults(fn=cmd_review)

    c = sub.add_parser("confirm", help="explicit CONFIRM <plan_id> gate")
    c.add_argument("--run", required=True)
    c.add_argument("--phrase", required=True)
    c.set_defaults(fn=cmd_confirm)

    s = sub.add_parser("send", help="broadcast only if explicitly confirmed, then verify")
    s.add_argument("--run", required=True)
    s.set_defaults(fn=cmd_send)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
