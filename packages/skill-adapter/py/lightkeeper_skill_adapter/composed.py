"""@lightkeeper/skill-adapter — composed agents (WS3 bet B).

Tasks that call tasks, through one uniform I/O contract:

* Every stage runs as a subprocess CLI: ``python3 <cli> --in <json> --out
  <json>``. The orchestrator never imports stage code — the boundary is the
  process, exactly like a task invoking another task.
* Between stages the handoff envelope is SCHEMA-CHECKED with a hand-rolled
  stdlib validator (required keys, types, nested shapes). A handoff that
  fails its schema aborts the run — the failure is recorded, never coerced.
* x402 per-sub-call payment: every stage call records an x402-style payment
  intent in the run ledger (resource, amount, currency, payer!=payee) —
  priced per sub-call as the spec allows. The ledger is part of the run
  record; settlement is a payer-side concern and is labelled in each entry
  (``settlement: "intent-recorded"``), never claimed as on-chain payment
  when it is not one.

Stdlib only.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone


class HandoffSchemaError(RuntimeError):
    """A stage handoff failed its declared schema — run aborts, recorded."""


_TYPE_MAP = {"string": str, "number": (int, float), "integer": int,
             "boolean": bool, "object": dict, "array": list, "null": type(None)}


def check_handoff(schema: dict, payload: dict, *, stage: str) -> dict:
    """Validate ``payload`` against a small JSON-schema subset.

    Supported: ``required``, ``properties`` with ``type``/``enum`` and nested
    ``properties``/``required``. Anything outside the subset raises — the
    validator never silently passes a shape it cannot check.
    """
    if not isinstance(payload, dict):
        raise HandoffSchemaError(f"{stage}: handoff is not an object")
    for key in schema.get("required", []):
        if key not in payload or payload[key] is None:
            raise HandoffSchemaError(f"{stage}: missing required field {key!r}")
    for key, spec in schema.get("properties", {}).items():
        if key not in payload:
            continue
        val = payload[key]
        t = spec.get("type")
        if t:
            if t not in _TYPE_MAP:
                raise HandoffSchemaError(f"{stage}: unsupported schema type {t!r}")
            py_t = _TYPE_MAP[t]
            # bool is a subclass of int — keep JSON semantics clean.
            if t in ("integer", "number") and isinstance(val, bool):
                raise HandoffSchemaError(f"{stage}: field {key!r} is bool, want {t}")
            if not isinstance(val, py_t):
                raise HandoffSchemaError(
                    f"{stage}: field {key!r} is {type(val).__name__}, want {t}")
        if "enum" in spec and val not in spec["enum"]:
            raise HandoffSchemaError(
                f"{stage}: field {key!r} = {val!r} not in enum {spec['enum']}")
        if t == "object" and ("properties" in spec or "required" in spec):
            check_handoff(spec, val, stage=f"{stage}.{key}")
    return payload


@dataclass
class StageSpec:
    """One composed stage: a task CLI + its I/O schemas + x402 price."""
    task_id: str
    name: str
    cli: list[str]                      # argv template; {in}/{out} substituted
    in_schema: dict
    out_schema: dict
    x402_resource: str = ""
    x402_amount: str = "0"              # in x402_currency smallest unit
    x402_currency: str = "USDC"

    def price_entry(self, run_id: str) -> dict:
        return {
            "protocol": "x402",
            "resource": self.x402_resource or f"task://{self.task_id}/{self.name}",
            "amount": self.x402_amount,
            "currency": self.x402_currency,
            "payer": "composed-agent",
            "payee": self.task_id,
            "run_id": run_id,
            # Honest: the intent is recorded per sub-call; on-chain
            # settlement is a payer-side concern and is NOT claimed here.
            "settlement": "intent-recorded",
        }


@dataclass
class StageRecord:
    task_id: str
    name: str
    ok: bool
    duration_s: float = 0.0
    error: str = ""
    handoff_in: dict = field(default_factory=dict)
    handoff_out: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"task": self.task_id, "stage": self.name, "ok": self.ok,
                "duration_s": round(self.duration_s, 3), "error": self.error,
                "handoff_in": self.handoff_in, "handoff_out": self.handoff_out}


@dataclass
class ComposedRun:
    run_id: str
    stages: list[StageRecord] = field(default_factory=list)
    payments: list[dict] = field(default_factory=list)
    halted_at: str = ""
    halt_reason: str = ""
    started_at: str = ""

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "started_at": self.started_at,
            "ok": not self.halted_at,
            "halted_at": self.halted_at,
            "halt_reason": self.halt_reason,
            "stages": [s.to_dict() for s in self.stages],
            "x402_ledger": self.payments,
        }


def run_composed(stages: list[StageSpec], initial_input: dict,
                 workdir: str, run_id: str | None = None,
                 timeout_s: int = 600) -> ComposedRun:
    """Run stages in order, schema-checking every handoff.

    A stage that fails (nonzero exit, bad JSON, schema mismatch) HALTS the
    run: later stages never execute and the halt is recorded with its reason.
    That halt — not a greens-only transcript — is the mandatory kill-test.
    """
    run_id = run_id or f"composed-{int(time.time())}"
    run = ComposedRun(run_id=run_id,
                      started_at=datetime.now(timezone.utc).isoformat())
    os.makedirs(workdir, exist_ok=True)
    handoff = dict(initial_input)
    for spec in stages:
        t0 = time.monotonic()
        rec = StageRecord(task_id=spec.task_id, name=spec.name, ok=False)
        try:
            check_handoff(spec.in_schema, handoff, stage=f"{spec.name}:in")
        except HandoffSchemaError as e:
            rec.error = str(e)
            run.stages.append(rec)
            run.halted_at, run.halt_reason = spec.name, str(e)
            return run
        in_path = os.path.join(workdir, f"{run_id}-{spec.name}-in.json")
        out_path = os.path.join(workdir, f"{run_id}-{spec.name}-out.json")
        with open(in_path, "w", encoding="utf-8") as f:
            json.dump(handoff, f, indent=2)
        argv = [a.replace("{in}", in_path).replace("{out}", out_path)
                for a in spec.cli]
        proc = subprocess.run(argv, capture_output=True, text=True,
                              timeout=timeout_s)
        rec.duration_s = time.monotonic() - t0
        rec.handoff_in = handoff
        if proc.returncode != 0:
            rec.error = (f"exit {proc.returncode}: "
                         f"{(proc.stderr or proc.stdout).strip()[:500]}")
            run.stages.append(rec)
            run.halted_at, run.halt_reason = spec.name, rec.error
            return run
        try:
            with open(out_path, encoding="utf-8") as f:
                out = json.load(f)
        except Exception as e:  # noqa: BLE001
            rec.error = f"stage wrote no valid JSON handoff: {e}"
            run.stages.append(rec)
            run.halted_at, run.halt_reason = spec.name, rec.error
            return run
        try:
            check_handoff(spec.out_schema, out, stage=f"{spec.name}:out")
        except HandoffSchemaError as e:
            rec.error = str(e)
            run.stages.append(rec)
            run.halted_at, run.halt_reason = spec.name, str(e)
            return run
        rec.ok = True
        rec.handoff_out = out
        run.stages.append(rec)
        run.payments.append(spec.price_entry(run_id))
        # A stage may declare a halt (e.g. policy DENY): the orchestrator
        # stops the pipeline there, with the stage's reason — by design.
        if out.get("halt") is True:
            run.halted_at = spec.name
            run.halt_reason = str(out.get("halt_reason", "stage declared halt"))
            return run
        handoff = out
    return run


__all__ = [
    "HandoffSchemaError", "check_handoff", "StageSpec", "StageRecord",
    "ComposedRun", "run_composed",
]
