#!/usr/bin/env python3
"""Tests for pharos-docs (T04 Doc-Search CLI), rebuilt on the Developer Docs MCP.

Run:  python3 -m unittest tests.test_cli        (offline machine-checks;
                                                 no network, no chain)
      python3 -m unittest tests.test_cli.Live   (live: hits the real Docs MCP)

Core contracts under test:
1. The CLI NEVER improvises: when no MCP result covers the question it labels
   the result UNVERIFIED and refuses to answer (exit code 2).
2. Machine-checked citations: every quoted excerpt in the committed evidence
   is a VERBATIM substring of the raw MCP response it came from
   (evidence/raw/<id>.txt). No paraphrase can pass as a quote.
3. The CLI only ever calls the allowed Docs MCP tools (searchDocumentation,
   getPage, askQuestion) -- never sendFeedback, never raw page scraping.
"""
import json
import os
import subprocess
import sys
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(BASE, "pharos-docs")
EVIDENCE = os.path.join(BASE, "evidence", "evidence.json")
RAW_DIR = os.path.join(BASE, "evidence", "raw")

sys.path.insert(0, os.path.join(BASE, "src"))
from docs_mcp import ALLOWED_TOOLS  # noqa: E402


def run(*args, timeout=300):
    r = subprocess.run([CLI, *args], capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout, r.stderr


class TestMachineCheck(unittest.TestCase):
    """Offline: every committed citation is verbatim from its raw MCP log."""

    @classmethod
    def setUpClass(cls):
        if not os.path.exists(EVIDENCE):
            raise unittest.SkipTest("evidence/evidence.json not built yet "
                                    "(run evidence/run_evidence.py)")

    def _captured(self):
        doc = json.load(open(EVIDENCE, encoding="utf-8"))
        return [r for r in doc["records"] if r.get("raw_log")]

    def test_every_excerpt_is_verbatim_from_raw_mcp_response(self):
        records = self._captured()
        self.assertTrue(records, "no captured records in evidence.json")
        checked = 0
        for rec in records:
            raw_path = os.path.join(BASE, rec["raw_log"])
            self.assertTrue(os.path.exists(raw_path), "missing raw log for " + rec["id"])
            raw = open(raw_path, encoding="utf-8").read()
            for cit in rec["citations"]:
                excerpt = cit["excerpt"]
                self.assertTrue(excerpt, "empty excerpt in " + rec["id"])
                # The quote must appear VERBATIM in the raw MCP response.
                # Whitespace-normalized comparison tolerates the card's
                # "> " line-prefix rendering only.
                norm_raw = " ".join(raw.split())
                norm_ex = " ".join(excerpt.split())
                self.assertIn(
                    norm_ex, norm_raw,
                    "excerpt NOT verbatim in raw MCP response (%s): %r"
                    % (rec["id"], excerpt[:120]))
                checked += 1
        self.assertGreater(checked, 0, "no citations checked -- evidence is empty?")

    def test_every_citation_points_at_docs_pharos(self):
        for rec in self._captured():
            for cit in rec["citations"]:
                self.assertTrue(
                    cit["page_url"].startswith("https://docs.pharos.xyz/"),
                    "citation URL not a docs page: " + cit["page_url"])

    def test_tool_names_are_mcp_tools_only(self):
        for rec in self._captured():
            self.assertIn(rec["mcp_tool"], ALLOWED_TOOLS,
                          "non-MCP tool used: " + rec["mcp_tool"])
            self.assertNotEqual(rec["mcp_tool"], "sendFeedback")
        self.assertEqual(ALLOWED_TOOLS, {"searchDocumentation", "getPage", "askQuestion"})

    def test_miss_records_carry_no_citations(self):
        for rec in self._captured():
            if rec["label"] == "UNVERIFIED":
                self.assertEqual(rec["citations"], [])
                self.assertEqual(rec["exit_code"], 2)


class TestSourceHygiene(unittest.TestCase):
    """The llms-full.txt index approach is gone: no corpus, no index files."""

    def test_no_local_index_machinery(self):
        for dead in ["index/index.json", "corpus/llms-full.txt", "corpus/llms.txt",
                     "src/build_index.py", "fetch_corpus.sh"]:
            self.assertFalse(os.path.exists(os.path.join(BASE, dead)),
                             "stale index artifact still present: " + dead)

    def test_cli_source_mentions_mcp_not_index(self):
        src = open(CLI, encoding="utf-8").read()
        self.assertIn("docs.pharos.xyz/~gitbook/mcp", src)
        self.assertNotIn("index/index.json", src)
        self.assertNotIn("llms-full", src)


@unittest.skipUnless(os.environ.get("T04_LIVE"), "live MCP tests need T04_LIVE=1")
class TestNearMissBattery(unittest.TestCase):
    """Adversarial miss battery: 10 near-miss questions.

    Each question is worded to LOOK like a documented Pharos topic (real
    product vocabulary, plausible feature names) while asking about
    something the Pharos docs do not cover at all. A CLI that improvises —
    or that grounds an answer in an adjacent-but-different page — fails
    here. For EVERY question the CLI must:
      - exit 2
      - label the result UNVERIFIED
      - attach ZERO citations
      - smuggle no content: no DOC-GROUNDED label, no answer body, no
        invented steps/numbers/addresses in the output
    """

    NEAR_MISSES = [
        "how do I stake PROS tokens in the Pharos mobile app wallet",
        "what is the APY for lending USDC on the Pharos lending protocol",
        "how do I mine PHRS tokens with a graphics card at home",
        "how do I buy Pharos gift cards with a credit card",
        "what is the monthly salary of a Pharos core developer",
        "how do I recover a lost seed phrase through Pharos customer support",
        "which Pharos NFT collection currently has the highest floor price",
        "how do I short PROS tokens on the Pharos perpetuals exchange",
        "what is the street address of the Pharos foundation headquarters",
        "how do I enable two-factor authentication on the validator dashboard",
    ]

    def test_ten_near_misses_all_refuse(self):
        self.assertEqual(len(self.NEAR_MISSES), 10)
        for q in self.NEAR_MISSES:
            with self.subTest(question=q):
                code, out, _err = run("--json", q)
                self.assertEqual(code, 2, f"near-miss must exit 2: {q!r} -> {out[:200]}")
                d = json.loads(out)
                self.assertEqual(d["label"], "UNVERIFIED", q)
                self.assertEqual(d["citations"], [], q)
                # no smuggled content: nothing that reads as an answer
                self.assertNotIn("DOC-GROUNDED", out)
                body = (d.get("answer") or "").strip()
                self.assertTrue(
                    body == "" or "will not improvise" in body or "UNVERIFIED" in body,
                    f"near-miss carried smuggled answer content: {body[:160]!r}")


@unittest.skipUnless(os.environ.get("T04_LIVE"), "live MCP tests need T04_LIVE=1")
class Live(unittest.TestCase):
    """Live: real queries against the real Docs MCP. Slow/flaky by nature
    (the endpoint drops connections; the client retries)."""

    def test_grounded_query(self):
        code, out, _ = run("--json", "what is the Atlantic testnet chain id and RPC url")
        self.assertEqual(code, 0, out)
        d = json.loads(out)
        self.assertEqual(d["label"], "DOC-GROUNDED")
        self.assertTrue(d["citations"])
        self.assertEqual(d["mcp_tool"], "searchDocumentation")
        self.assertIn("688689", json.dumps(d))

    def test_miss_query_refuses(self):
        code, out, _ = run("what is the birthday of the Pharos CEO")
        self.assertEqual(code, 2, out)
        self.assertIn("LABEL: UNVERIFIED", out)
        self.assertIn("will not improvise", out)

    def test_miss_never_invents_content(self):
        code, out, _ = run("--json", "how do I run a Pharos node on a Raspberry Pi")
        self.assertEqual(code, 2)
        d = json.loads(out)
        self.assertEqual(d["label"], "UNVERIFIED")
        self.assertEqual(d["citations"], [])

    def test_getpage_mode(self):
        code, out, _ = run("--page", "https://docs.pharos.xyz/getting-started/network/atlantic-testnet")
        self.assertEqual(code, 0, out)
        self.assertIn("688689", out)

    def test_ask_mode(self):
        code, out, _ = run("--json", "--ask", "what is the Atlantic testnet chain id")
        self.assertEqual(code, 0, out)
        d = json.loads(out)
        self.assertEqual(d["mcp_tool"], "askQuestion")
        self.assertIn("688689", d["answer"])


if __name__ == "__main__":
    unittest.main()
