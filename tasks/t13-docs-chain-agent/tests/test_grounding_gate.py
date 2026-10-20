#!/usr/bin/env python3
"""T13 — cited-page grounding gate tests (offline; FakeDocs stands in for
the Docs MCP getPage tool with fixture page bodies).

The gate in src/doc_agent.py:
  - fetches every cited URL via getPage (bounded fan-out)
  - a function counts as DOCUMENTED only on an EXACT whole-token name match
    in a fetched page — substrings of longer identifiers do NOT count
  - fetch failures fail closed (unverified, not documented)

Run: python3 tests/test_grounding_gate.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from doc_agent import page_names_function, grounding_gate  # noqa: E402


class FakeDocs:
    def __init__(self, pages):
        self.pages = pages  # url -> page text OR Exception instance
        self.calls = []

    def call(self, tool, arguments):
        assert tool == "getPage", f"gate may only call getPage, got {tool}"
        url = arguments["url"]
        self.calls.append(url)
        val = self.pages[url]
        if isinstance(val, Exception):
            raise val
        return {"text": val}


def cite(url):
    return {"label": "DOC-GROUNDED", "url": url, "retrieval_date": "2026-10-20",
            "section": "x", "excerpt": "x"}


class TestExactNameMatch(unittest.TestCase):
    def test_whole_token_matches(self):
        self.assertTrue(page_names_function("Call totalSupply() to read it", "totalSupply"))
        self.assertTrue(page_names_function("`balanceOf` returns uint256", "balanceOf"))

    def test_substring_of_longer_identifier_does_not_match(self):
        # "decimals" inside "decimalsOf" / "xdecimals" must NOT ground it
        self.assertFalse(page_names_function("decimalsOf(token)", "decimals"))
        self.assertFalse(page_names_function("mydecimalsfield", "decimals"))

    def test_absent_name(self):
        self.assertFalse(page_names_function("The feed table lists addresses.", "latestAnswer"))


class TestGroundingGate(unittest.TestCase):
    A = "https://docs.pharos.xyz/a"
    B = "https://docs.pharos.xyz/b"

    def test_documented_when_a_cited_page_names_it(self):
        docs = FakeDocs({self.A: "nothing relevant", self.B: "use totalSupply() here"})
        gate = grounding_gate(docs, [cite(self.A), cite(self.B)], "totalSupply")
        self.assertTrue(gate["documented"])
        self.assertEqual([p["names_function"] for p in gate["pages"]], [False, True])
        self.assertEqual(docs.calls, [self.A, self.B])

    def test_not_documented_when_no_page_names_it(self):
        docs = FakeDocs({self.A: "totalSupplyish stuff", self.B: "feeds and oracles"})
        gate = grounding_gate(docs, [cite(self.A), cite(self.B)], "totalSupply")
        self.assertFalse(gate["documented"])

    def test_fetch_failure_fails_closed(self):
        docs = FakeDocs({self.A: RuntimeError("connection dropped")})
        gate = grounding_gate(docs, [cite(self.A)], "totalSupply")
        self.assertFalse(gate["documented"])
        self.assertIn("fetch_error", gate["pages"][0])

    def test_no_citations_means_not_documented(self):
        gate = grounding_gate(FakeDocs({}), [], "totalSupply")
        self.assertFalse(gate["documented"])
        self.assertEqual(gate["pages"], [])


if __name__ == "__main__":
    unittest.main()
