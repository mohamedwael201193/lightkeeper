"""@lightkeeper/skill-adapter (L3) — typed boundary for invoking skills.

A "skill" is a named unit of agent work (a preflight check, a planner, a
monitor tick). This package is the only sanctioned way to invoke one:

* :func:`invoke_skill` runs the skill's runner and captures tool errors
  into a typed :class:`SkillResult` instead of masking them.
* :class:`WriteGate` — write paths additionally need a confirmation token;
  simulation paths can never broadcast (no signer is ever passed through).

The runner is plain Python here (``runner(name, args)``); the boundary —
typed result, captured errors, explicit write confirmation — is what the
library owns, not any particular transport.
"""
from __future__ import annotations

import secrets
import time
import traceback
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class SkillResult:
    """Typed outcome of one skill invocation."""
    name: str
    ok: bool
    result: Any = None
    error: str = ""
    duration_s: float = 0.0

    def unwrap(self) -> Any:
        """Return the result, or raise the captured error (never masked)."""
        if not self.ok:
            raise SkillFailed(f"skill {self.name!r} failed: {self.error}")
        return self.result


class SkillFailed(RuntimeError):
    """A skill invocation captured as failed — see SkillResult.error."""


class ConfirmationMissing(RuntimeError):
    """A write-path skill was invoked without its confirmation token."""


def invoke_skill(name: str, args: dict,
                 runner: Callable[[str, dict], Any]) -> SkillResult:
    """Invoke skill ``name`` via ``runner(name, args)``.

    The runner's exceptions are captured into ``SkillResult.error`` with a
    traceback tail — recorded, never masked, never silently swallowed.
    """
    t0 = time.monotonic()
    try:
        result = runner(name, args)
    except Exception as e:  # noqa: BLE001 — capture is the point
        tail = traceback.format_exc(limit=5)
        return SkillResult(name=name, ok=False,
                           error=f"{type(e).__name__}: {e}\n{tail}",
                           duration_s=time.monotonic() - t0)
    return SkillResult(name=name, ok=True, result=result,
                       duration_s=time.monotonic() - t0)


class WriteGate:
    """Write paths need an explicit confirmation token.

    Simulations and read paths never receive a token and therefore can
    never broadcast: there is no signer on this side of the boundary.
    """

    @staticmethod
    def new_token() -> str:
        return "confirm-" + secrets.token_hex(8)

    @staticmethod
    def require_confirmation(provided: str | None, expected: str) -> None:
        if not provided or not secrets.compare_digest(str(provided), expected):
            raise ConfirmationMissing(
                "write path refused: no (or wrong) confirmation token — "
                "simulation cannot broadcast"
            )


__all__ = [
    "SkillResult", "SkillFailed", "ConfirmationMissing",
    "invoke_skill", "WriteGate",
]
