"""
T17 Natural-Language Payment Agent — deterministic intent parser.

NO LLM, NO heuristics that guess. A small, explicit grammar:
    <verb> <amount> <token> to <0x-address>

Every parse returns either a confident `plan` or a `refusal` /
`clarification`. Ambiguous input is NEVER defaulted — it is refused with a
clear reason and the agent will not broadcast.

This module contains NO signing code and NO key handling (see tests).
"""

import hashlib
import json
import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------- constants

ATLANTIC_CHAIN_ID = 688689
NATIVE_TOKEN = "PHRS"
# Safety: one plan may never move more than this (dust-demo bound).
MAX_PLAN_PHRS_WEI = 150_000_000_000_000_000  # 0.15 PHRS

VERBS = ["send", "pay", "transfer", "remit", "wire"]
_VERB_RE = re.compile(r"\b(" + "|".join(VERBS) + r")\b", re.IGNORECASE)

_ADDR_RE = re.compile(r"0x[0-9a-fA-F]{40}")
# Bare 40-hex without 0x = malformed address (refused, not guessed).
_BARE_HEX40_RE = re.compile(r"(?<![0-9a-fA-Fx])\b[0-9a-fA-F]{40}\b(?![0-9a-fA-F])")

_NUMUNIT_RE = re.compile(r"(?P<num>\d+(?:\.\d{1,18})?)(?:\s*(?P<unit>[A-Za-z]{2,12}))?")
_PHRS_UNIT_RE = re.compile(r"^(phrs|pharos)$", re.IGNORECASE)

# Words that are units of something that is definitely NOT a token — a number
# carrying one of these is a stray number (ambiguous), not an unknown token.
NON_TOKEN_UNITS = {
    "minute", "minutes", "second", "seconds", "hour", "hours",
    "day", "days", "week", "weeks", "month", "months", "year", "years",
    "time", "times", "x",
}
# Common injection phrases are treated as UNTRUSTED SLOT INPUT: the parser only
# extracts slots; anything it cannot classify is refused as ambiguous.
_SUSPICIOUS_RE = re.compile(
    r"\b(ignore|override|disregard|bypass|previous instructions|system prompt|"
    r"you are now|pretend|jailbreak)\b",
    re.IGNORECASE,
)


@dataclass
class Plan:
    action: str = "send"
    token: str = NATIVE_TOKEN
    amount_phrs: str = ""          # exact decimal string, no float
    amount_wei: int = 0
    to: str = ""
    chain_id: int = ATLANTIC_CHAIN_ID

    def canonical(self) -> dict:
        return {
            "action": self.action,
            "token": self.token,
            "amount_phrs": self.amount_phrs,
            "amount_wei": self.amount_wei,
            "to": self.to,
            "chain_id": self.chain_id,
        }

    def plan_id(self) -> str:
        blob = json.dumps(self.canonical(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(blob.encode()).hexdigest()[:16]


@dataclass
class ParseResult:
    ok: bool
    plan: Plan | None = None
    kind: str = ""                 # "plan" | "clarification" | "refusal"
    reason: str = ""               # human-readable why
    clarification_question: str = ""
    warnings: list = field(default_factory=list)


def _to_wei(amount_str: str) -> int:
    """Exact decimal-string -> wei conversion. No floats, ever."""
    if "." in amount_str:
        whole, frac = amount_str.split(".", 1)
        frac = (frac + "0" * 18)[:18]
    else:
        whole, frac = amount_str, "0" * 18
    return int(whole) * 10**18 + int(frac)


def parse(text: str) -> ParseResult:
    raw = text.strip()
    if not raw:
        return ParseResult(False, kind="refusal",
                           reason="Empty input: nothing to parse.",
                           clarification_question="What payment should I prepare?")

    warnings = []
    if _SUSPICIOUS_RE.search(raw):
        warnings.append(
            "Input contains instruction-like phrases; they are treated as "
            "untrusted slot input and ignored for control purposes.")

    # ---- 1. verb ---------------------------------------------------------
    verbs = {m.group(1).lower() for m in _VERB_RE.finditer(raw)}
    if len(verbs) == 0:
        return ParseResult(False, kind="clarification",
                           reason="No payment verb found (expected one of: %s)."
                                  % ", ".join(VERBS),
                           clarification_question="What action? (send / pay / transfer)",
                           warnings=warnings)
    if len(verbs) > 1:
        return ParseResult(False, kind="refusal",
                           reason="Conflicting action verbs: %s. I will not guess which one you mean."
                                  % ", ".join(sorted(verbs)),
                           clarification_question="Which single action did you mean?",
                           warnings=warnings)
    action = "send"  # all verbs map to a native transfer plan

    # ---- 2. destination ---------------------------------------------------
    addrs = _ADDR_RE.findall(raw)
    bare = _BARE_HEX40_RE.findall(raw)
    # exclude bare matches that are substrings of a full 0x address
    bare = [b for b in bare if ("0x" + b) not in addrs and not any(b in a for a in addrs)]
    if bare:
        return ParseResult(False, kind="refusal",
                           reason="Found 40 hex chars without a 0x prefix ('%s…'). "
                                  "Addresses must be full 0x-prefixed checksummed-style "
                                  "hex; I will not guess the missing prefix."
                                  % bare[0][:10],
                           clarification_question="Please paste the full 0x address.",
                           warnings=warnings)
    if len(addrs) == 0:
        return ParseResult(False, kind="clarification",
                           reason="No 0x destination address found.",
                           clarification_question="Which 0x address should receive the payment?",
                           warnings=warnings)
    if len(addrs) > 1:
        return ParseResult(False, kind="refusal",
                           reason="Multiple destination addresses found (%d). I will not "
                                  "pick one for you." % len(addrs),
                           clarification_question="Which single address is the recipient?",
                           warnings=warnings)
    to = addrs[0]

    # ---- 3. amount + token ------------------------------------------------
    # Strip the address first so its hex is never read as a number.
    no_addr = _ADDR_RE.sub(" ", raw)
    no_addr = _BARE_HEX40_RE.sub(" ", no_addr)

    phrs_amounts: list[str] = []
    unknown_token_units: list[str] = []
    stray_numbers: list[str] = []
    for m in _NUMUNIT_RE.finditer(no_addr):
        num, unit = m.group("num"), m.group("unit")
        if unit is None:
            # Number with no unit: only harmless if it is a dust decimal that
            # clearly attaches to the verb region — we do NOT guess; any
            # bare number is a stray and makes the plan ambiguous.
            stray_numbers.append(num)
        elif _PHRS_UNIT_RE.match(unit):
            phrs_amounts.append(num)
        elif unit.lower() in NON_TOKEN_UNITS:
            # "in 2 minutes", "3 times" — clearly not a token amount.
            stray_numbers.append(f"{num} {unit}")
        else:
            unknown_token_units.append(f"{num} {unit}")

    if unknown_token_units:
        return ParseResult(False, kind="clarification",
                           reason="Unknown token unit(s): %s. I only move native PHRS; "
                                  "I will not map an unknown token to a default."
                                  % ", ".join(unknown_token_units),
                           clarification_question="Which token? (I support native PHRS only)",
                           warnings=warnings)
    if stray_numbers:
        return ParseResult(False, kind="refusal",
                           reason="Ambiguous extra number(s) with no token: %s. I will not "
                                  "guess whether one of them is the amount."
                                  % ", ".join(stray_numbers),
                           clarification_question="Please restate the payment as '<amount> PHRS to <0x address>'.",
                           warnings=warnings)
    if len(phrs_amounts) == 0:
        return ParseResult(False, kind="clarification",
                           reason="No amount found (expected '<number> PHRS').",
                           clarification_question="How much PHRS should I prepare?",
                           warnings=warnings)
    if len(phrs_amounts) > 1:
        return ParseResult(False, kind="refusal",
                           reason="Multiple PHRS amounts found: %s. I will not pick one."
                                  % ", ".join(phrs_amounts),
                           clarification_question="Which single amount is the payment?",
                           warnings=warnings)

    amount_str = phrs_amounts[0]
    wei = _to_wei(amount_str)
    if wei <= 0:
        return ParseResult(False, kind="refusal",
                           reason="Amount must be greater than zero (got '%s')." % amount_str,
                           clarification_question="What positive amount should I prepare?",
                           warnings=warnings)
    if wei > MAX_PLAN_PHRS_WEI:
        return ParseResult(False, kind="refusal",
                           reason="Amount %s PHRS exceeds this agent's per-plan safety cap "
                                  "of 0.15 PHRS (dust-demo bound). Refused."
                                  % amount_str,
                           clarification_question="Please use an amount ≤ 0.15 PHRS.",
                           warnings=warnings)

    plan = Plan(amount_phrs=amount_str, amount_wei=wei, to=to)
    return ParseResult(True, plan=plan, kind="plan", warnings=warnings)


def result_to_dict(r: ParseResult) -> dict:
    d = {"ok": r.ok, "kind": r.kind, "reason": r.reason,
         "clarification_question": r.clarification_question, "warnings": r.warnings}
    if r.plan:
        d["plan"] = r.plan.canonical()
        d["plan_id"] = r.plan.plan_id()
    return d
