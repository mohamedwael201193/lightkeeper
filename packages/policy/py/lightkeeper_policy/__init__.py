"""@lightkeeper/policy (L5) — the pre-execution gate.

Fail-closed by construction:

* missing policy sections -> REFUSE (never assume a default),
* a policy with no rules -> BLOCK (default-deny: no rule = no action),
* any failing rule -> BLOCK with per-rule reasons.

Rule authors write :class:`Rule` objects (``check`` + ``detail``); the
library evaluates them and returns a :class:`Decision`. :class:`AuditLog`
is the append-only, hash-chained JSONL trail of every decision — approve
AND deny.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable

ALLOW = "ALLOW"
BLOCK = "BLOCK"
REFUSE = "REFUSE"


@dataclass
class RuleResult:
    rule: str
    verdict: str  # "PASS" | "FAIL"
    detail: str

    def to_dict(self) -> dict:
        return {"rule": self.rule, "verdict": self.verdict, "detail": self.detail}


@dataclass
class Decision:
    decision: str  # ALLOW | BLOCK | REFUSE
    rules: list[RuleResult] = field(default_factory=list)
    blocked: list[str] = field(default_factory=list)

    def to_legacy(self):
        """The (verdict, [rule-dicts], blocked) tuple tasks historically used."""
        return (self.decision, [r.to_dict() for r in self.rules], list(self.blocked))


@dataclass
class Rule:
    """One named gate: ``check(policy, live) -> bool`` and a human
    ``detail(policy, live) -> str`` that quotes the live values."""
    name: str
    check: Callable[[dict, dict], bool]
    detail: Callable[[dict, dict], str]


def evaluate_rules(policy: dict, live: dict, rules: list[Rule],
                   require_sections: tuple[str, ...] = ()) -> Decision:
    """Evaluate ``rules`` against ``(policy, live)``. Fail-closed.

    * Any missing ``require_sections`` entry in ``policy`` -> REFUSE.
    * Empty ``rules`` -> BLOCK (default-deny).
    * A rule whose ``check`` raises -> treated as FAIL (fail-closed), with
      the exception quoted in the detail — never silently passed.
    """
    missing = [s for s in require_sections if s not in policy]
    if missing:
        return Decision(
            decision=REFUSE,
            rules=[RuleResult(rule="POLICY-COMPLETE", verdict="FAIL",
                              detail=f"policy missing sections: {missing} — refusing")],
            blocked=["POLICY-COMPLETE"],
        )
    if not rules:
        return Decision(
            decision=BLOCK,
            rules=[RuleResult(rule="DEFAULT-DENY", verdict="FAIL",
                              detail="no rules defined — default deny")],
            blocked=["DEFAULT-DENY"],
        )
    results: list[RuleResult] = []
    ok = True
    for rule in rules:
        try:
            passed = bool(rule.check(policy, live))
            detail = rule.detail(policy, live)
        except Exception as e:  # noqa: BLE001 — fail-closed, quote the error
            passed = False
            detail = f"rule {rule.name} raised {type(e).__name__}: {e} — failing closed"
        results.append(RuleResult(rule=rule.name,
                                  verdict="PASS" if passed else "FAIL",
                                  detail=detail))
        ok = ok and passed
    blocked = [r.rule for r in results if r.verdict == "FAIL"]
    return Decision(decision=ALLOW if ok else BLOCK, rules=results, blocked=blocked)


class AuditLog:
    """Append-only, hash-chained JSONL audit trail of every decision."""

    def __init__(self, path: str):
        self.path = path
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    def _last_hash(self) -> str:
        if not os.path.exists(self.path):
            return "GENESIS"
        last = "GENESIS"
        with open(self.path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    last = json.loads(line).get("hash", last)
        return last

    def append(self, entry: dict[str, Any]) -> dict[str, Any]:
        stamped = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            **entry,
            "prev_hash": self._last_hash(),
        }
        body = json.dumps(stamped, sort_keys=True)
        stamped["hash"] = hashlib.sha256(body.encode()).hexdigest()
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(stamped) + "\n")
        return stamped

    def verify(self) -> bool:
        """True iff the hash chain is intact from GENESIS."""
        prev = "GENESIS"
        if not os.path.exists(self.path):
            return True
        with open(self.path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                if rec.get("prev_hash") != prev:
                    return False
                h = rec.pop("hash")
                if hashlib.sha256(json.dumps(rec, sort_keys=True).encode()).hexdigest() != h:
                    return False
                prev = h
        return True


__all__ = [
    "ALLOW", "BLOCK", "REFUSE",
    "RuleResult", "Decision", "Rule",
    "evaluate_rules", "AuditLog",
]
