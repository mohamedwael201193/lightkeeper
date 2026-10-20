"""@lightkeeper/workflow (L6) — durable multi-step saga state machine.

What the library owns:

* Failure taxonomy: :class:`TransientFailure` (safe to retry),
  :class:`PermanentFailure` (never retried — compensate), :class:`GateFailure`
  (confirmed but post-state disagrees — compensate).
* :class:`RetryPolicy` — backoff schedule + gas-bump multiplier, pure and
  unit-testable.
* :class:`SagaLedger` — append-only JSONL run log; idempotency: completed
  steps are never re-executed on resume.
* :class:`Saga` — runs registered steps; on permanent failure runs
  compensating actions in reverse order. Compensation is honest: finalized
  work cannot be undone, so compensation is a *forward* action (refund,
  revoke) — never a fake rollback.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable


class TransientFailure(Exception):
    """Dropped receipt / RPC error — safe to retry."""


class PermanentFailure(Exception):
    """Mined 0x0 revert or failed precheck — never retried, compensate."""


class GateFailure(Exception):
    """Step confirmed but the post-state gate disagrees — compensate."""


@dataclass
class RetryPolicy:
    """Pure retry policy: attempt 0 is the first try."""
    max_retries: int = 3
    backoff_s: tuple[float, ...] = (5, 15, 45)
    gas_bump: float = 1.20

    def delay_for(self, attempt: int) -> float:
        """Backoff seconds before retrying after ``attempt`` failed."""
        return self.backoff_s[min(attempt, len(self.backoff_s) - 1)]

    def gas_multiplier(self, attempt: int) -> float:
        """Gas-price multiplier for ``attempt`` (+20% per attempt)."""
        return self.gas_bump ** attempt

    def decide(self, kind: str, attempt: int):
        """Pure decision table.

        Returns ``("retry", delay_s, gas_mult_next)``, ``("give_up",)`` or
        ``("compensate",)``. ``gas_mult_next`` is the multiplier the *next*
        attempt should use.
        """
        if kind == "permanent":
            return ("compensate",)
        if kind == "transient":
            if attempt < self.max_retries:
                return ("retry", self.delay_for(attempt), self.gas_bump ** (attempt + 1))
            return ("give_up",)
        raise ValueError(f"unknown failure kind: {kind!r}")


class SagaLedger:
    """Append-only JSONL ledger for one saga run directory."""

    def __init__(self, path: str):
        self.path = path
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    def append(self, step: str, state: str, detail: str = "") -> dict:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "step": step,
            "state": state,
            "detail": detail,
        }
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
        return entry

    def completed_steps(self) -> set[str]:
        """Steps that reached a terminal CONFIRMED state — never re-run."""
        done: set[str] = set()
        if not os.path.exists(self.path):
            return done
        with open(self.path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                e = json.loads(line)
                if e.get("state") == "CONFIRMED":
                    done.add(e.get("step"))
        return done


@dataclass
class Step:
    name: str
    fn: Callable[[], Any]
    compensate: Callable[[], Any] | None = None


class Saga:
    """Multi-step workflow with retry + honest compensation."""

    def __init__(self, run_id: str, ledger_path: str,
                 retry: RetryPolicy | None = None):
        self.run_id = run_id
        self.ledger = SagaLedger(ledger_path)
        self.retry = retry or RetryPolicy()
        self._steps: list[Step] = []
        self.compensations_run: list[str] = []

    def add_step(self, name: str, fn: Callable[[], Any],
                 compensate: Callable[[], Any] | None = None) -> "Saga":
        self._steps.append(Step(name, fn, compensate))
        return self

    def run(self) -> dict:
        """Run all steps. Returns a result dict; raises on unrecoverable
        failure AFTER compensations have run."""
        done = self.ledger.completed_steps()
        executed: list[Step] = []
        for step in self._steps:
            if step.name in done:
                self.ledger.append(step.name, "SKIPPED",
                                   "already CONFIRMED in a previous run — idempotent resume")
                executed.append(step)
                continue
            self.ledger.append(step.name, "RUNNING")
            try:
                self._run_step_with_retry(step)
            except (PermanentFailure, GateFailure) as e:
                self.ledger.append(step.name, "FAILED_PERMANENT", str(e))
                self._compensate(executed)
                raise
            self.ledger.append(step.name, "CONFIRMED")
            executed.append(step)
        return {"run_id": self.run_id, "ok": True,
                "steps": [s.name for s in executed],
                "compensations": self.compensations_run}

    def _run_step_with_retry(self, step: Step) -> Any:
        last: Exception | None = None
        for attempt in range(self.retry.max_retries + 1):
            try:
                return step.fn()
            except PermanentFailure:
                raise
            except TransientFailure as e:
                last = e
                kind, *rest = self.retry.decide("transient", attempt)
                if kind == "retry":
                    delay = rest[0]
                    self.ledger.append(step.name, "RETRYING",
                                       f"attempt={attempt} retrying in {delay}s: {e}")
                    time.sleep(delay)
                    continue
                raise TransientFailure(
                    f"{step.name}: exhausted retries ({last})") from last
        raise TransientFailure(f"{step.name}: exhausted retries ({last})")

    def _compensate(self, executed: list[Step]) -> None:
        for step in reversed(executed):
            if step.compensate is None:
                continue
            try:
                step.compensate()
                self.compensations_run.append(step.name)
                self.ledger.append(step.name, "COMPENSATED",
                                   "forward compensating action executed")
            except Exception as e:  # noqa: BLE001 — record, keep compensating
                self.ledger.append(step.name, "COMPENSATION_FAILED", str(e))


__all__ = [
    "TransientFailure", "PermanentFailure", "GateFailure",
    "RetryPolicy", "SagaLedger", "Step", "Saga",
]
