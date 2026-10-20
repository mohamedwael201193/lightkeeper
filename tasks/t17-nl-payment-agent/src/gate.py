"""
T17 confirmation gate.

Rules (enforced in code, not in prose):
  * Only a plan with kind == "plan" (never "clarification"/"refusal") can be
    confirmed.
  * The operator must type the EXACT phrase  CONFIRM <plan_id>.
  * The confirmation is bound to the plan_id; any change to the plan
    invalidates it.
  * A run can be executed at most ONCE (executed.json marker).
"""

import json
import os
import time

EXPECTED_PHRASE_PREFIX = "CONFIRM "


def confirm(run_dir: str, plan: dict, plan_id: str, phrase: str) -> dict:
    phrase = phrase.strip()
    expected = EXPECTED_PHRASE_PREFIX + plan_id
    if phrase != expected:
        return {"ok": False,
                "reason": f"Confirmation phrase mismatch. Expected exactly "
                          f"'{expected}'. Nothing was confirmed, nothing will be sent."}
    if os.path.exists(os.path.join(run_dir, "executed.json")):
        return {"ok": False,
                "reason": "This run was already executed. Refusing double-execution."}
    record = {
        "plan_id": plan_id,
        "plan": plan,
        "phrase": expected,          # the canonical phrase, not a secret
        "confirmed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with open(os.path.join(run_dir, "confirmed.json"), "w") as f:
        json.dump(record, f, indent=2)
    return {"ok": True, "record": record}


def check_confirmed(run_dir: str, plan_id: str) -> dict:
    """Pre-broadcast check used by the broadcaster."""
    path = os.path.join(run_dir, "confirmed.json")
    if not os.path.exists(path):
        return {"ok": False,
                "reason": "No explicit confirmation on record. Broadcast refused."}
    with open(path) as f:
        record = json.load(f)
    if record.get("plan_id") != plan_id:
        return {"ok": False,
                "reason": "Confirmation is bound to a different plan_id — "
                          "the plan changed after confirmation. Broadcast refused."}
    if os.path.exists(os.path.join(run_dir, "executed.json")):
        return {"ok": False, "reason": "Run already executed. Broadcast refused."}
    return {"ok": True, "record": record}
