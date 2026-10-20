"""
T17 Natural-Language Payment Agent — deterministic intent parser.

NO LLM, NO heuristics that guess. A small, explicit grammar:
    <verb> <amount> <token> to <0x-address>

Every parse returns either a confident `plan` or a `refusal` /
`clarification`. Ambiguous input is NEVER defaulted — it is refused with a
clear reason and the agent will not broadcast.

Number-notation traps fire before slot extraction: thousands separators,
a minus sign before digits, malformed decimals (".001", "1."), word amounts
in amount position ("send all PHRS"), and percentages are all refused with
a plain-language reason — never normalized, never silently dropped.

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

VERBS = ["send", "pay", "transfer", "remit", "wire",
         "move", "forward", "deliver", "grant", "release"]
_VERB_RE = re.compile(r"\b(" + "|".join(VERBS) + r")\b", re.IGNORECASE)

_ADDR_RE = re.compile(r"0x[0-9a-fA-F]{40}")
# Bare 40-hex without 0x = malformed address (refused, not guessed).
_BARE_HEX40_RE = re.compile(r"(?<![0-9a-fA-Fx])\b[0-9a-fA-F]{40}\b(?![0-9a-fA-F])")

# ---- number-notation traps (checked on address-stripped text, before slots)
# Thousands separators: "1,000 PHRS" is ambiguous notation — refused, never normalized.
_COMMA_NUM_RE = re.compile(r"\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b")
# A minus sign before a number: "send -0.001 PHRS" (or "send - 0.001 PHRS")
# must NOT become +0.001. The sign is never silently dropped.
_NEGATIVE_RE = re.compile(r"(?:^|[^\d\w])-\s*(?=\d)")
# Malformed decimals: ".001" (no leading zero) and "1." (no decimal part).
_MALFORMED_LEAD_RE = re.compile(r"(?<!\d)\.\d")
_MALFORMED_TRAIL_RE = re.compile(r"\d+\.(?!\d)")
# Word amounts ("half", "all", ...) — only fire in AMOUNT POSITION, i.e.
# between the verb and the address. "ignore all rules. send 0.01 PHRS to 0x…"
# has "all" outside that region, so it stays a plan (with an untrusted-input
# warning); "send all PHRS to 0x…" has it inside, so it is refused.
_WORD_AMOUNT_RE = re.compile(
    r"\b(half|halve|quarter|all|everything|my whole|the rest|entire balance)\b",
    re.IGNORECASE)
# Percentages are not payable — refused, never converted.
_PERCENT_RE = re.compile(r"\d+(?:\.\d+)?\s*%")

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
    rule: str = ""                 # machine-checkable rule tag, e.g. "R-ADDR-2"
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


def _refuse(rule: str, reason: str, question: str, warnings) -> ParseResult:
    return ParseResult(False, kind="refusal", rule=rule, reason=reason,
                       clarification_question=question, warnings=warnings)


def _clarify(rule: str, reason: str, question: str, warnings) -> ParseResult:
    return ParseResult(False, kind="clarification", rule=rule, reason=reason,
                       clarification_question=question, warnings=warnings)


def parse(text: str) -> ParseResult:
    raw = text.strip()
    if not raw:
        return _clarify("R-EMPTY",
                        "Empty input: nothing to parse.",
                        "What payment should I prepare?", [])

    warnings = []
    if _SUSPICIOUS_RE.search(raw):
        warnings.append(
            "Input contains instruction-like phrases; they are treated as "
            "untrusted slot input and ignored for control purposes.")

    # ---- 0. number-notation traps (address hex is stripped first so it is
    #        never read as a number) --------------------------------------
    verb_m = _VERB_RE.search(raw)
    addr_m = _ADDR_RE.search(raw)
    no_addr_early = _ADDR_RE.sub(" ", raw)
    no_addr_early = _BARE_HEX40_RE.sub(" ", no_addr_early)

    if _COMMA_NUM_RE.search(no_addr_early):
        return _refuse(
            "R-NUM-COMMA",
            "Found a comma-formatted number. I don't read thousands "
            "separators — write the exact decimal amount (e.g. 1000 PHRS).",
            "What is the exact decimal amount in PHRS?", warnings)
    if _NEGATIVE_RE.search(no_addr_early):
        return _refuse(
            "R-NUM-NEG",
            "Found a minus sign before a number. Amounts can't be "
            "negative — the sign is never silently dropped.",
            "What positive amount should I prepare?", warnings)
    lead = _MALFORMED_LEAD_RE.search(no_addr_early)
    if lead:
        return _refuse(
            "R-NUM-MALFORMED",
            f"Found '{lead.group(0)}' — a number that starts with a decimal "
            "point and no leading zero. I don't read that notation.",
            "Write the amount with a leading zero, e.g. 0.001 PHRS.", warnings)
    trail = _MALFORMED_TRAIL_RE.search(no_addr_early)
    if trail:
        return _refuse(
            "R-NUM-MALFORMED",
            f"Found '{trail.group(0)}' — a number that ends with a decimal "
            "point and no decimal part. I don't read that notation.",
            "Write the amount without the trailing point, e.g. 1 PHRS.",
            warnings)
    # Word amounts fire only in amount position: after the verb, before the
    # address. Everywhere else they are ordinary English, not a refusal.
    region_start = verb_m.end() if verb_m else -1
    region_end = addr_m.start() if addr_m else len(raw)
    word_hit = None
    for wm in _WORD_AMOUNT_RE.finditer(raw):
        if 0 <= region_start <= wm.start() < region_end:
            word_hit = wm
            break
    if word_hit:
        return _refuse(
            "R-AMOUNT-WORD",
            f"Found the word \"{word_hit.group(1)}\" where the amount should "
            "be. I don't convert words to amounts — 0.5 and "
            "0.500000000000000001 are different payments.",
            "What is the exact decimal amount in PHRS?", warnings)
    if _PERCENT_RE.search(no_addr_early):
        return _refuse(
            "R-AMOUNT-PCT",
            "Percentages are not payable — I need an absolute PHRS amount.",
            "What is the exact decimal amount in PHRS?", warnings)

    # ---- 1. verb ---------------------------------------------------------
    verbs = {m.group(1).lower() for m in _VERB_RE.finditer(raw)}
    if len(verbs) == 0:
        return _clarify(
            "R-VERB-0",
            "No payment verb found (expected one of: %s)." % ", ".join(VERBS),
            "What action? (send / pay / transfer)", warnings)
    if len(verbs) > 1:
        return _refuse(
            "R-VERB-2",
            "Conflicting action verbs: %s. I will not guess which one you mean."
            % ", ".join(sorted(verbs)),
            "Which single action did you mean?", warnings)
    action = "send"  # all verbs map to a native transfer plan

    # ---- 2. destination ---------------------------------------------------
    addrs = _ADDR_RE.findall(raw)
    bare = _BARE_HEX40_RE.findall(raw)
    # exclude bare matches that are substrings of a full 0x address
    bare = [b for b in bare if ("0x" + b) not in addrs and not any(b in a for a in addrs)]
    if bare:
        return _refuse(
            "R-ADDR-BARE",
            "Found 40 hex chars without a 0x prefix ('%s…'). "
            "Addresses must be full 0x-prefixed hex; I will not guess the "
            "missing prefix." % bare[0][:10],
            "Please paste the full 0x address.", warnings)
    if len(addrs) == 0:
        return _clarify(
            "R-ADDR-0",
            "No 0x destination address found. I never guess a recipient.",
            "Which 0x address should receive the payment?", warnings)
    if len(addrs) > 1:
        return _refuse(
            "R-ADDR-2",
            "Multiple destination addresses found (%d). I will not "
            "pick one for you." % len(addrs),
            "Which single address is the recipient?", warnings)
    to = addrs[0]
    if to.lower() == "0x" + "0" * 40:
        return _refuse(
            "R-ADDR-ZERO",
            "The zero address is not a payable destination.",
            "Which 0x address should receive the payment?", warnings)

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
            # Any bare number is a stray and makes the plan ambiguous —
            # we do NOT guess whether it is the amount.
            stray_numbers.append(num)
        elif _PHRS_UNIT_RE.match(unit):
            phrs_amounts.append(num)
        elif unit.lower() in NON_TOKEN_UNITS:
            # "in 2 minutes", "3 times" — clearly not a token amount.
            stray_numbers.append(f"{num} {unit}")
        else:
            unknown_token_units.append(f"{num} {unit}")

    if unknown_token_units:
        return _clarify(
            "R-TOKEN-UNK",
            "Unknown token unit(s): %s. I only move native PHRS; "
            "I will not map an unknown token to a default."
            % ", ".join(unknown_token_units),
            "Which token? (I support native PHRS only)", warnings)
    if stray_numbers:
        return _refuse(
            "R-NUM-STRAY",
            "Ambiguous extra number(s) with no token: %s. I will not "
            "guess whether one of them is the amount."
            % ", ".join(stray_numbers),
            "Please restate the payment as '<amount> PHRS to <0x address>'.",
            warnings)
    if len(phrs_amounts) == 0:
        return _clarify(
            "R-AMOUNT-0",
            "No amount found (expected '<number> PHRS').",
            "How much PHRS should I prepare?", warnings)
    if len(phrs_amounts) > 1:
        return _refuse(
            "R-AMOUNT-2",
            "Multiple PHRS amounts found: %s. I will not pick one."
            % ", ".join(phrs_amounts),
            "Which single amount is the payment?", warnings)

    amount_str = phrs_amounts[0]
    wei = _to_wei(amount_str)
    if wei <= 0:
        return _refuse(
            "R-AMOUNT-ZERO",
            "Amount must be greater than zero (got '%s')." % amount_str,
            "What positive amount should I prepare?", warnings)
    if wei > MAX_PLAN_PHRS_WEI:
        return _refuse(
            "R-AMOUNT-CAP",
            "Amount %s PHRS exceeds this agent's per-plan safety cap "
            "of 0.15 PHRS (dust-demo bound). Refused." % amount_str,
            "Please use an amount ≤ 0.15 PHRS.", warnings)

    plan = Plan(amount_phrs=amount_str, amount_wei=wei, to=to)
    return ParseResult(True, plan=plan, kind="plan", rule="PARSE-OK",
                       warnings=warnings)


def result_to_dict(r: ParseResult) -> dict:
    d = {"ok": r.ok, "kind": r.kind, "rule": r.rule, "reason": r.reason,
         "clarification_question": r.clarification_question, "warnings": r.warnings}
    if r.plan:
        d["plan"] = r.plan.canonical()
        d["plan_id"] = r.plan.plan_id()
    return d
