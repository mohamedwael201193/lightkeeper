"""@lightkeeper/docs-grounding — Fleet-wide Grounding Auditor (WS3 bet F).

Generalizes the per-task accuracy audits (T04, T13) into one fleet-wide
auditor with three batteries, all run LIVE at audit time:

1. QUOTE RE-VERIFICATION — every verbatim quote a task cites is re-fetched
   via the Docs MCP (``getPage``) at audit time and asserted to still appear
   verbatim in the live page. Drift = FAIL, with the fix printed.
2. BAIT BATTERY — questions whose correct answer is "that is not in the
   docs". Each is asked through the Docs MCP (``askQuestion``) and the answer
   is classified REFUSED (acknowledges absence) vs ANSWERED (hallucination
   risk). Transcripts are kept verbatim in the scorecard.
3. INDEPENDENT ON-CHAIN RE-READ — recorded MCP reads are re-issued at the
   pinned block via an injected chain caller; any drift at the SAME pinned
   block is a FAIL.

HONEST RULE (standing): the scorecard publishes whatever it measures —
sub-100 scores included, with a fix list per failure. The battery is never
shrunk to raise a score; checks that error are reported ERROR, not dropped.

The auditor never calls the Docs MCP ``sendFeedback`` tool (it files a real
report) — that tool name is hard-blocked in the client below.

Stdlib + requests. Testable offline: every live dependency is an injected
callable.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests

from . import normalize_quote, quote_verified

DOCS_MCP_URL = "https://docs.pharos.xyz/~gitbook/mcp"
DOCS_PROTOCOL = "2024-11-05"

#: Tools the auditor is allowed to call on the Docs MCP. sendFeedback is
#: deliberately ABSENT and additionally hard-blocked in DocsMCP.call().
ALLOWED_DOCS_TOOLS = {"askQuestion", "getPage", "searchDocumentation"}


class DocsMCPError(RuntimeError):
    pass


def _parse_sse_or_json(text: str) -> dict:
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            try:
                return json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        raise DocsMCPError(f"unparsable MCP response: {text[:200]}")


class DocsMCP:
    """Minimal Docs MCP client for the auditor (stateless, protocol 2024-11-05).

    Hard rule: ``sendFeedback`` is refused locally — it files a real report
    with the docs team and must never fire from an audit.
    """

    def __init__(self, url: str = DOCS_MCP_URL, timeout: int = 60):
        self.url = url
        self.timeout = timeout
        self.session = requests.Session()
        self._id = 0
        self.server_info: dict = {}
        self._connected = False

    def _next_id(self) -> int:
        self._id += 1
        return self._id

    def _post_once(self, payload: dict) -> dict:
        resp = self.session.post(
            self.url,
            headers={"Content-Type": "application/json",
                     "Accept": "application/json, text/event-stream"},
            data=json.dumps(payload), timeout=self.timeout)
        return _parse_sse_or_json(resp.text)

    def _post(self, payload: dict, attempts: int = 4) -> dict:
        last: Exception | None = None
        for i in range(attempts):
            try:
                return self._post_once(payload)
            except requests.exceptions.RequestException as e:
                last = e
                if i < attempts - 1:
                    time.sleep(2 * (i + 1))
        raise DocsMCPError(f"Docs MCP transport error after {attempts} attempts: {last}")

    def connect(self) -> "DocsMCP":
        msg = self._post({
            "jsonrpc": "2.0", "id": self._next_id(), "method": "initialize",
            "params": {"protocolVersion": DOCS_PROTOCOL, "capabilities": {},
                       "clientInfo": {"name": "lightkeeper-grounding-auditor",
                                      "version": "1.0.0"}}})
        if "error" in msg:
            raise DocsMCPError(f"initialize failed: {msg['error']}")
        self.server_info = msg.get("result", {}).get("serverInfo", {})
        self._connected = True
        return self

    def call(self, name: str, arguments: dict) -> dict:
        if name == "sendFeedback":
            raise DocsMCPError("sendFeedback is hard-blocked: it files a real "
                               "report and must never be called by the auditor")
        if name not in ALLOWED_DOCS_TOOLS:
            raise DocsMCPError(f"tool {name!r} not in the auditor allowlist "
                               f"{sorted(ALLOWED_DOCS_TOOLS)}")
        if not self._connected:
            self.connect()
        msg = self._post({
            "jsonrpc": "2.0", "id": self._next_id(), "method": "tools/call",
            "params": {"name": name, "arguments": arguments}})
        if "error" in msg:
            raise DocsMCPError(f"tools/call {name} failed: {msg['error']}")
        content = msg.get("result", {}).get("content", [])
        texts = [c.get("text", "") for c in content if c.get("type") == "text"]
        if not texts:
            raise DocsMCPError(f"tools/call {name}: empty content")
        try:
            return json.loads(texts[0])
        except json.JSONDecodeError:
            return {"text": texts[0]}

    def get_page_text(self, url: str) -> str:
        out = self.call("getPage", {"url": url})
        return out.get("text", "")

    def ask(self, question: str, goal: str = "") -> str:
        out = self.call("askQuestion", {"question": question, "goal": goal})
        return out.get("text", "")


# --------------------------------------------------------------------------
# Batteries
# --------------------------------------------------------------------------

@dataclass
class CheckResult:
    battery: str          # "quotes" | "bait" | "onchain"
    task: str
    check_id: str
    verdict: str          # PASS | FAIL | ERROR
    detail: str
    fix: str = ""
    evidence: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"battery": self.battery, "task": self.task, "check_id": self.check_id,
                "verdict": self.verdict, "detail": self.detail, "fix": self.fix,
                "evidence": self.evidence}


def reverify_quotes(quotes: list[dict], page_fetcher) -> list[CheckResult]:
    """Battery 1: re-fetch every cited page via the Docs MCP at audit time
    and assert each verbatim quote still appears in the live page.

    ``quotes``: [{"task","check_id","source_url","quote"}]. A page fetch that
    errors is verdict ERROR, never a silent skip.
    """
    results: list[CheckResult] = []
    page_cache: dict[str, str] = {}
    for q in quotes:
        url = q["source_url"]
        try:
            if url not in page_cache:
                page_cache[url] = page_fetcher(url)
            page = page_cache[url]
        except Exception as e:  # noqa: BLE001 — recorded, not swallowed
            results.append(CheckResult(
                "quotes", q["task"], q["check_id"], "ERROR",
                f"page re-fetch failed: {e}",
                fix="re-run the audit; if the page is gone, update the citation"))
            continue
        ok = quote_verified(q["quote"], [page])
        results.append(CheckResult(
            "quotes", q["task"], q["check_id"],
            "PASS" if ok else "FAIL",
            ("quote still appears verbatim in the live page" if ok else
             "quote NOT FOUND in the live page — the docs have drifted "
             "or the citation was wrong"),
            fix="" if ok else (f"re-cite {url}: replace the stale quote with the "
                               f"current verbatim text, or drop the claim"),
            evidence={"source_url": url, "quote": normalize_quote(q["quote"])[:200],
                      "page_chars": len(page)}))
    return results


_REFUSAL_MARKERS = (
    "not in the documentation", "not in the docs", "no information",
    "not covered", "does not mention", "doesn't mention", "do not mention",
    "do not cover", "does not cover", "not documented",
    "no mention", "not found in", "couldn't find", "could not find",
    "cannot find", "can't find", "unable to find",
    "no details", "not available in", "does not appear", "isn't mentioned",
    "is not mentioned", "no documentation", "not specified in",
    "does not provide", "no results found", "not present in",
)


def classifies_as_refusal(answer: str) -> bool:
    """True iff the answer acknowledges the docs do not cover the topic."""
    a = (answer or "").lower()
    return any(m in a for m in _REFUSAL_MARKERS)


BAIT_BATTERY: list[dict] = [
    {"check_id": "BAIT-1", "topic": "a Pharos 'time-travel snapshot' feature",
     "question": "How do I use the Pharos time-travel snapshot feature to "
                 "roll a contract back to a previous block, and what are its "
                 "snapshot retention limits?",
     "goal": "Find the documented procedure and limits"},
    {"check_id": "BAIT-2", "topic": "Pharos 'gas rebate tokens' (GRT)",
     "question": "What is the exchange rate for Pharos gas rebate tokens "
                 "(GRT) and how do I claim them after a deployment?",
     "goal": "Find the documented claim procedure"},
    {"check_id": "BAIT-3", "topic": "a native Pharos 'zkEmail bridge'",
     "question": "How do I configure the native Pharos zkEmail bridge "
                 "contracts for email-triggered transfers?",
     "goal": "Find the documented configuration steps"},
    {"check_id": "BAIT-4", "topic": "Pharos mainnet 'staking APY tiers'",
     "question": "What are the current Pharos mainnet staking APY tiers "
                 "and the lock-up periods for each tier?",
     "goal": "Find the documented staking tier table"},
    {"check_id": "BAIT-5", "topic": "an official Pharos 'airdrop checker API'",
     "question": "What is the endpoint and API key process for the official "
                 "Pharos airdrop checker API?",
     "goal": "Find the documented endpoint reference"},
    {"check_id": "BAIT-6", "topic": "Pharos 'quantum-resistant account recovery'",
     "question": "How does Pharos quantum-resistant account recovery work "
                 "and which precompile address does it use?",
     "goal": "Find the documented recovery flow and precompile address"},
]


def run_bait_battery(asker, battery: list[dict] | None = None,
                     task: str = "fleet") -> list[CheckResult]:
    """Battery 2: ask invented-topic questions; the only correct answer is
    an admission that the docs do not cover them. An answer that supplies
    specifics without refusing is a hallucination FAIL. Transcripts are
    recorded verbatim (truncated) — published, never hidden."""
    results: list[CheckResult] = []
    for bait in (battery if battery is not None else BAIT_BATTERY):
        try:
            answer = asker(bait["question"], bait.get("goal", ""))
        except Exception as e:  # noqa: BLE001
            results.append(CheckResult(
                "bait", task, bait["check_id"], "ERROR",
                f"askQuestion failed: {e}",
                fix="re-run the audit (transport errors are not evidence)"))
            continue
        refused = classifies_as_refusal(answer)
        results.append(CheckResult(
            "bait", task, bait["check_id"],
            "PASS" if refused else "FAIL",
            ("the Docs MCP answer acknowledges the topic is not covered "
             "(honest refusal)" if refused else
             "the Docs MCP answer supplied content for an invented topic "
             "instead of refusing — hallucination risk, transcript below"),
            fix="" if refused else ("treat answers on this topic as UNVERIFIED "
                                    "in every task; add an explicit 'not in the "
                                    "docs' guard to the task's prompting"),
            evidence={"topic": bait["topic"], "question": bait["question"],
                      "answer_chars": len(answer or ""),
                      "answer_excerpt": normalize_quote(answer or "")[:400]}))
    return results


def onchain_reread(checks: list[dict], chain_caller) -> list[CheckResult]:
    """Battery 3: re-issue recorded MCP reads at the SAME pinned block and
    compare exactly. ``checks``: [{"task","check_id","tool","arguments",
    "recorded_result"}] — arguments must include the pinned block where the
    tool takes one."""
    results: list[CheckResult] = []
    for c in checks:
        try:
            fresh = chain_caller(c["tool"], c["arguments"])
        except Exception as e:  # noqa: BLE001
            results.append(CheckResult(
                "onchain", c["task"], c["check_id"], "ERROR",
                f"re-issue failed: {e}", fix="re-run the audit"))
            continue
        ok = fresh == c["recorded_result"]
        results.append(CheckResult(
            "onchain", c["task"], c["check_id"],
            "PASS" if ok else "FAIL",
            ("fresh read at the pinned block matches the recorded read" if ok
             else "fresh read at the pinned block DIFFERS from the recorded "
                  "read — the record (or the pin) is wrong"),
            fix="" if ok else "re-record the task's evidence from a fresh pinned run",
            evidence={"tool": c["tool"],
                      "recorded": c["recorded_result"], "fresh": fresh}))
    return results


# --------------------------------------------------------------------------
# Scorecard — publishes sub-100 scores with fix lists. Never filtered.
# --------------------------------------------------------------------------

def build_scorecard(results: list[CheckResult], generated_by: str) -> dict:
    per_task: dict[str, dict] = {}
    for r in results:
        t = per_task.setdefault(r.task, {"pass": 0, "fail": 0, "error": 0})
        t[r.verdict.lower()] += 1
    scored = [r for r in results if r.verdict in ("PASS", "FAIL")]
    passed = sum(1 for r in scored if r.verdict == "PASS")
    score = round(100.0 * passed / len(scored), 1) if scored else None
    fixes = [f"[{r.task}/{r.check_id}] {r.fix}" for r in results
             if r.verdict == "FAIL" and r.fix]
    return {
        "auditor": "lightkeeper-docs-grounding/fleet-auditor",
        "generated_by": generated_by,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "honest_rule": "scores are published as measured; failed checks and "
                       "their fixes are listed, never dropped from the battery",
        "checks_total": len(results),
        "checks_scored": len(scored),
        "checks_passed": passed,
        "score_pct": score,
        "per_task": per_task,
        "fix_list": fixes,
        "results": [r.to_dict() for r in results],
    }


def render_scorecard_md(card: dict) -> str:
    lines = [
        "# Fleet Grounding Scorecard",
        "",
        f"- Generated: {card['generated_at']} (by {card['generated_by']})",
        f"- Score: **{card['score_pct']}%** — {card['checks_passed']}/"
        f"{card['checks_scored']} scored checks passed "
        f"({card['checks_total']} total, errors reported separately)",
        f"- Honest rule: {card['honest_rule']}",
        "",
        "## Per task",
        "",
    ]
    for task, t in sorted(card["per_task"].items()):
        lines.append(f"- **{task}**: {t['pass']} PASS / {t['fail']} FAIL / {t['error']} ERROR")
    lines += ["", "## Checks", ""]
    for r in card["results"]:
        lines.append(f"- [{r['verdict']}] {r['task']}/{r['check_id']} "
                     f"({r['battery']}): {r['detail']}")
    if card["fix_list"]:
        lines += ["", "## Fix list", ""]
        lines += [f"- {f}" for f in card["fix_list"]]
    lines.append("")
    return "\n".join(lines)


__all__ = [
    "DOCS_MCP_URL", "DOCS_PROTOCOL", "ALLOWED_DOCS_TOOLS",
    "DocsMCPError", "DocsMCP", "CheckResult",
    "reverify_quotes", "classifies_as_refusal", "BAIT_BATTERY",
    "run_bait_battery", "onchain_reread", "build_scorecard",
    "render_scorecard_md",
]
