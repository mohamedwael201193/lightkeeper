#!/usr/bin/env python3
"""Tests for pharos-docs (T04 Doc-Search CLI).

Run: python3 tests/test_cli.py   (stdlib only, no network, no chain)

Core contract under test: the CLI NEVER improvises. When the index has no
covering passage it must label the result UNVERIFIED and refuse to answer
(exit code 2) instead of inventing content.
"""
import json
import os
import subprocess
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(BASE, "pharos-docs")
INDEX = os.path.join(BASE, "index", "index.json")
CORPUS_FULL = os.path.join(BASE, "corpus", "llms-full.txt")
CORPUS_LLMS = os.path.join(BASE, "corpus", "llms.txt")


def run(*args):
    r = subprocess.run([CLI, *args], capture_output=True, text=True, timeout=120)
    return r.returncode, r.stdout, r.stderr


class TestMissPath(unittest.TestCase):
    """The honest-miss gate: no covering passage -> UNVERIFIED, exit 2."""

    def test_off_topic_query_is_unverified(self):
        code, out, _ = run("what is the birthday of the Pharos CEO")
        self.assertEqual(code, 2, out)
        self.assertIn("LABEL: UNVERIFIED", out)
        self.assertIn("No good answer found", out)

    def test_uncovered_dev_query_is_unverified(self):
        # "Raspberry Pi" never appears in the docs; the CLI must not answer
        # about it from generic node material.
        code, out, _ = run("how do I run a Pharos node on a Raspberry Pi")
        self.assertEqual(code, 2, out)
        self.assertIn("LABEL: UNVERIFIED", out)

    def test_miss_never_invents_content(self):
        code, out, _ = run("what is the daily withdrawal limit of the Pharos faucet in PROS")
        self.assertEqual(code, 2)
        self.assertNotIn("ANSWER (quoted verbatim", out)
        self.assertIn("will not", out)  # "will not improvise an answer"

    def test_high_threshold_forces_miss(self):
        code, out, _ = run("--min-score", "999999", "how do I deploy a contract?")
        self.assertEqual(code, 2, out)
        self.assertIn("LABEL: UNVERIFIED", out)

    def test_miss_json_shape(self):
        code, out, _ = run("--json", "what is the birthday of the Pharos CEO")
        self.assertEqual(code, 2)
        d = json.loads(out)
        self.assertEqual(d["label"], "UNVERIFIED")
        self.assertEqual(d["citations"], [])
        self.assertTrue(d["note"])


class TestGroundedAnswers(unittest.TestCase):
    """Grounded answers carry DOC-GROUNDED + URL + date + verbatim excerpt."""

    def test_deploy_question_grounded(self):
        code, out, _ = run("how do I deploy a contract?")
        self.assertEqual(code, 0, out)
        self.assertIn("LABEL: DOC-GROUNDED", out)
        self.assertIn("https://docs.pharos.xyz/", out)
        self.assertIn("retrieved 2026-10-16", out)

    def test_chain_id_answer_contains_real_value(self):
        code, out, _ = run("what is the Atlantic testnet chain id and RPC url")
        self.assertEqual(code, 0, out)
        self.assertIn("688689", out)  # Atlantic Testnet ChainID from the live docs

    def test_inference_always_labeled(self):
        code, out, _ = run("which oracle should I use for price feeds on Pharos")
        self.assertEqual(code, 0, out)
        self.assertIn("[INFERENCE]", out)

    def test_excerpts_are_verbatim_from_corpus(self):
        # Every quoted excerpt in --json must be traceable to the fetched corpus:
        # the excerpt must be a prefix of its indexed passage, and a long
        # alphanumeric-only run from the excerpt must exist in the corpus after
        # the same markdown-chrome stripping the indexer applies (no words
        # altered or added anywhere in the pipeline).
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "build_index", os.path.join(BASE, "src", "build_index.py"))
        bi = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bi)
        corpus = open(CORPUS_FULL, encoding="utf-8").read() + "\n" + open(CORPUS_LLMS, encoding="utf-8").read()
        corpus_flat = "".join(ch.lower() for ch in bi.clean_text(corpus) if ch.isalnum())
        idx = json.load(open(INDEX, encoding="utf-8"))
        code, out, _ = run("--json", "how do I bridge USDC from Ethereum to Pharos")
        self.assertEqual(code, 0)
        d = json.loads(out)
        self.assertTrue(d["citations"])
        for c in d["citations"]:
            matches = [p for p in idx["passages"]
                       if p["page_url"] == c["page_url"] and p["text"].startswith(c["excerpt"])]
            self.assertTrue(matches,
                            "excerpt is not a prefix of any indexed passage from %s" % c["page_url"])
            run40 = "".join(ch.lower() for ch in c["excerpt"] if ch.isalnum())[:80]
            self.assertIn(run40, corpus_flat,
                          "excerpt content not found in the fetched corpus")

    def test_citation_urls_are_live_doc_pages(self):
        code, out, _ = run("--json", "how do I install the Pharos MCP server")
        self.assertEqual(code, 0)
        d = json.loads(out)
        for c in d["citations"]:
            self.assertTrue(c["page_url"].startswith("https://docs.pharos.xyz/") or
                            c["page_url"].startswith("https://www.pharos.xyz/"), c["page_url"])
            self.assertRegex(c["retrieved"], r"^\d{4}-\d{2}-\d{2}$")

    def test_deterministic(self):
        _, out1, _ = run("how do I deploy a contract?")
        _, out2, _ = run("how do I deploy a contract?")
        self.assertEqual(out1, out2)

    def test_no_mock_or_placeholder_content(self):
        for q in ["how do I deploy a contract?",
                  "what is the birthday of the Pharos CEO",
                  "which oracle should I use for price feeds on Pharos"]:
            _, out, _ = run(q)
            low = out.lower()
            self.assertNotIn("mock", low)
            self.assertNotIn("placeholder", low)
            self.assertNotIn("lorem", low)
            self.assertNotIn("todo:", low)


class TestIndexIntegrity(unittest.TestCase):
    def test_index_exists_and_covers_docs(self):
        idx = json.load(open(INDEX, encoding="utf-8"))
        self.assertGreaterEqual(idx["passage_count"], 400)
        urls = {p["page_url"] for p in idx["passages"]}
        self.assertGreaterEqual(len(urls), 70)
        self.assertIn("https://docs.pharos.xyz/getting-started/network/atlantic-testnet", urls)

    def test_no_thin_http_wrapper(self):
        # The CLI must not shell out to curl/the ?ask= endpoint at answer time.
        src = open(CLI, encoding="utf-8").read()
        self.assertNotIn("?ask=", src)
        self.assertNotIn("curl", src)
        self.assertNotIn("urllib", src)
        self.assertNotIn("requests", src)


if __name__ == "__main__":
    unittest.main(verbosity=2)
