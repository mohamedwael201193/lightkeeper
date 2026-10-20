#!/usr/bin/env python3
"""T03 quote discipline + transcript structure tests (unittest).

Supersedes scripts/quote_check.py (kept as a thin wrapper around this suite).

Two disciplines, both enforced with non-zero exit on any mismatch:
1. QUOTE DISCIPLINE — every `>` quote block in evidence.md must appear,
   whitespace-normalized, in the verbatim Docs MCP answers of the latest
   transcript JSONL. A quote that matches no verbatim answer is a mismatch.
2. TRANSCRIPT STRUCTURE —
   - entries are numbered: ids Q1..Qn form a consecutive sequence
   - every entry's tool is in the allowlist {askQuestion,
     searchDocumentation, getPage} (sendFeedback NEVER appears)
   - every entry carries a question, an outcome, and (when ANSWERED) a
     non-empty verbatim answer
   - at least 10 verified quotes overall (>=10 requirement)

Quotes are extracted/verified by @lightkeeper/docs-grounding (L2), the
shared library, not by a per-task copy.

Run: python3 -m unittest tests.test_quotes   (or: python3 tests/test_quotes.py)
"""
import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
EVIDENCE_MD = os.path.join(TASK, "evidence.md")
TRANSCRIPT_DIR = os.path.join(TASK, "evidence", "transcripts")

REPO_ROOT = os.path.dirname(os.path.dirname(TASK))
sys.path.insert(0, os.path.join(REPO_ROOT, "packages", "docs-grounding", "py"))
from lightkeeper_docs_grounding import (  # noqa: E402
    extract_quote_blocks, normalize_quote, quote_verified,
)

ALLOWED_TOOLS = {"askQuestion", "searchDocumentation", "getPage"}
FORBIDDEN_TOOL = "sendFeedback"
MIN_QUOTES = 10


def load_evidence_quotes():
    with open(EVIDENCE_MD) as f:
        md = f.read()
    quotes = extract_quote_blocks(md)
    # Skip the top-of-file correction blockquote (meta-commentary, not an MCP answer)
    quotes = [q for q in quotes if "Correction (2026-10-19)" not in q]
    out = []
    for q in quotes:
        nq = normalize_quote(q)
        # Strip markdown quote-mark convention ("...") — not part of the answer
        if len(nq) >= 2 and nq.startswith('"') and nq.endswith('"'):
            nq = nq[1:-1].strip()
        if len(nq) >= 20:
            out.append(nq)
    return out


def latest_transcript_path():
    jl_files = sorted(f for f in os.listdir(TRANSCRIPT_DIR) if f.endswith(".jsonl"))
    if not jl_files:
        return None
    return os.path.join(TRANSCRIPT_DIR, jl_files[-1])


def load_transcript():
    path = latest_transcript_path()
    entries = []
    if path:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
    return path, entries


class TestQuoteDiscipline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.quotes = load_evidence_quotes()
        cls.path, cls.entries = load_transcript()
        cls.answers = [normalize_quote(e["answer_verbatim"])
                       for e in cls.entries if e.get("answer_verbatim")]

    def test_transcript_exists(self):
        self.assertIsNotNone(self.path, "no transcript JSONL in evidence/transcripts")
        self.assertTrue(self.entries, "latest transcript has no entries")

    def test_at_least_ten_quotes(self):
        self.assertGreaterEqual(
            len(self.quotes), MIN_QUOTES,
            f"only {len(self.quotes)} evidence.md quotes >= 20 chars; need >= {MIN_QUOTES}")

    def test_every_quote_verified_verbatim(self):
        self.assertTrue(self.answers, "no verbatim answers in transcript")
        failures = [q for q in self.quotes if not quote_verified(q, self.answers)]
        self.assertEqual(
            failures, [],
            "quote(s) NOT found verbatim in transcript answers: "
            + "; ".join(repr(f[:120]) for f in failures))


class TestTranscriptStructure(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path, cls.entries = load_transcript()

    def test_entries_are_numbered_consecutively(self):
        self.assertTrue(self.entries, "no transcript entries")
        nums = []
        for e in self.entries:
            m = re.match(r"^Q(\d+)-", e.get("id", ""))
            self.assertIsNotNone(m, f"entry id is not numbered (Q<n>-...): {e.get('id')!r}")
            nums.append(int(m.group(1)))
        self.assertEqual(nums, list(range(1, len(nums) + 1)),
                         f"entries must be numbered Q1..Qn consecutively, got {nums}")

    def test_tool_names_restricted_to_allowlist(self):
        for e in self.entries:
            self.assertIn(e.get("tool"), ALLOWED_TOOLS,
                          f"{e.get('id')}: tool {e.get('tool')!r} not in allowlist")
            self.assertNotEqual(e.get("tool"), FORBIDDEN_TOOL,
                                "sendFeedback must NEVER be called")

    def test_entries_carry_required_fields(self):
        for e in self.entries:
            self.assertTrue(e.get("question"), f"{e.get('id')}: missing question")
            self.assertTrue(e.get("outcome"), f"{e.get('id')}: missing outcome")
            if e.get("outcome") == "ANSWERED":
                self.assertTrue((e.get("answer_verbatim") or "").strip(),
                                f"{e.get('id')}: ANSWERED but empty verbatim answer")


if __name__ == "__main__":
    unittest.main()
