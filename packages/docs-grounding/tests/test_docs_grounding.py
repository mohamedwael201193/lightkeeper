#!/usr/bin/env python3
"""Tests for @lightkeeper/docs-grounding. No network needed."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_docs_grounding import (
    Citation, GroundingVerdict, UnwillingToImprovise,
    citation_md, extract_quote_blocks, ground_answer, normalize_quote,
    quote_verified, require_grounding,
)


class TestCitations(unittest.TestCase):
    def test_citation_requires_source_url(self):
        with self.assertRaises(ValueError):
            Citation(source_url="")

    def test_citation_stamps_retrieved_at(self):
        c = Citation(source_url="https://docs.pharos.xyz/x", quote="hi")
        self.assertTrue(c.retrieved_at)


class TestVerdicts(unittest.TestCase):
    def test_grounded_with_quote(self):
        c = Citation(source_url="https://docs.pharos.xyz/x", quote="the chain id is 1672")
        self.assertEqual(ground_answer([c]), GroundingVerdict.GROUNDED)

    def test_partial_without_quote(self):
        c = Citation(source_url="https://docs.pharos.xyz/x")
        self.assertEqual(ground_answer([c]), GroundingVerdict.PARTIAL)

    def test_unknown_without_citations(self):
        self.assertEqual(ground_answer([]), GroundingVerdict.UNKNOWN)


class TestRequireGrounding(unittest.TestCase):
    def test_refuses_to_improvise(self):
        with self.assertRaises(UnwillingToImprovise):
            require_grounding([])
        with self.assertRaises(UnwillingToImprovise):
            require_grounding([Citation(source_url="https://docs.pharos.xyz/x")])

    def test_passes_grounded(self):
        cs = [Citation(source_url="https://docs.pharos.xyz/x", quote="q")]
        self.assertEqual(require_grounding(cs), cs)


class TestQuotes(unittest.TestCase):
    def test_normalize(self):
        self.assertEqual(normalize_quote("a  \n  b"), "a b")

    def test_extract_blocks(self):
        md = "# t\n\n> line one\n> line two\n\ntext\n\n> second block\n"
        self.assertEqual(extract_quote_blocks(md), ["line one\nline two", "second block"])

    def test_extract_none(self):
        self.assertEqual(extract_quote_blocks("# no quotes\n"), [])

    def test_quote_verified_verbatim(self):
        self.assertTrue(quote_verified("chain  id  is 1672",
                                       ["the chain id is 1672, see docs"]))

    def test_quote_verified_miss(self):
        self.assertFalse(quote_verified("something else", ["the chain id is 1672"]))

    def test_quote_verified_empty_quote(self):
        self.assertFalse(quote_verified("   ", ["anything"]))

    def test_citation_md(self):
        c = Citation(source_url="https://docs.pharos.xyz/x", quote="hi")
        md = citation_md(c)
        self.assertIn("https://docs.pharos.xyz/x", md)
        self.assertIn("hi", md)


if __name__ == "__main__":
    unittest.main(verbosity=2)
