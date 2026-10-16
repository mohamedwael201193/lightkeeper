#!/usr/bin/env python3
"""T13 tests: citation quality + fail-closed gate + LIVE re-verification
(read-only) of the three Q&A->execution transcripts' procedures.

The logs transcript's broadcasts are NOT repeated here (dust was already
spent once); instead the test re-queries eth_getLogs for the recorded
transfer block and asserts the same tx hash is returned — a read-only
re-execution of the transcript's verification step.
"""
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from doc_agent import build_answer, cast, cast_num, MODES, WALLET, WPHRS, TRANSFER_TOPIC  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TDIR = ROOT / "evidence" / "transcripts"


def load(mode):
    return json.loads((TDIR / f"{mode}.json").read_text())


class TestCitations(unittest.TestCase):
    def test_grounded_modes_cite_real_docs(self):
        for mode in ("balance", "estimate", "logs"):
            with self.subTest(mode=mode):
                _, cites = build_answer(MODES[mode][1], mode)
                grounded = [c for c in cites if c["label"] == "DOC-GROUNDED"]
                self.assertGreaterEqual(len(grounded), 1, f"{mode} has no DOC-GROUNDED citation")
                for c in grounded:
                    self.assertTrue(c["url"].startswith("https://docs.pharos.xyz/"))
                    self.assertEqual(c["retrieval_date"], "2026-10-16")
                    self.assertGreaterEqual(len(c["excerpt"]), 80)


class TestFailClosed(unittest.TestCase):
    def test_unknown_question_says_so(self):
        _, cites = build_answer(MODES["failclosed"][1], "failclosed")
        self.assertTrue(all(c["label"] == "UNVERIFIED" for c in cites))

    def test_no_execution_without_grounding(self):
        t = load("failclosed")
        self.assertTrue(t["ok"])
        self.assertFalse(t["execution"]["executed"])
        self.assertNotIn("0x", t["answer"])  # no invented addresses/hashes


class TestTranscriptQ1Balance(unittest.TestCase):
    def test_saved_transcript_ok(self):
        t = load("balance")
        self.assertTrue(t["ok"])
        self.assertEqual(t["execution"]["decimals_raw"], "18")

    def test_live_eth_call_still_works(self):
        r = cast("call", WPHRS, "balanceOf(address)(uint256)", WALLET)
        self.assertEqual(r.returncode, 0, r.stderr[:200])
        bal = cast_num(r.stdout)
        self.assertGreaterEqual(bal, 0)
        d = cast("call", WPHRS, "decimals()(uint8)")
        self.assertEqual(cast_num(d.stdout), 18)


class TestTranscriptQ2Estimate(unittest.TestCase):
    def test_saved_transcript_ok(self):
        t = load("estimate")
        self.assertTrue(t["ok"])
        self.assertGreater(t["execution"]["estimate_gas"], 0)

    def test_live_estimate_matches_procedure(self):
        r = cast("estimate", "--from", WALLET, WPHRS, "transfer(address,uint256)",
                 WALLET, "100000000000000")
        self.assertEqual(r.returncode, 0, r.stderr[:200])
        self.assertGreater(cast_num(r.stdout), 0)


class TestTranscriptQ3Logs(unittest.TestCase):
    def test_saved_transcript_matched(self):
        t = load("logs")
        self.assertTrue(t["ok"])
        ex = t["execution"]
        self.assertTrue(ex["matched_tx"])
        self.assertEqual(ex["deposit_status"], "0x1")
        self.assertEqual(ex["transfer_status"], "0x1")

    def test_live_requery_finds_same_log(self):
        t = load("logs")
        ex = t["execution"]
        b = ex["transfer_block"]
        r = cast("logs", "--json", "--from-block", str(b - 2), "--to-block", str(b + 2),
                 "--address", WPHRS, TRANSFER_TOPIC)
        self.assertEqual(r.returncode, 0, r.stderr[:200])
        logs = json.loads(r.stdout)
        hashes = {l["transactionHash"].lower() for l in logs}
        self.assertIn(ex["transfer_tx"].lower(), hashes,
                      "saved transfer tx not found in live eth_getLogs re-query")


class TestEvidence(unittest.TestCase):
    def test_evidence_json(self):
        ev = json.loads((ROOT / "evidence" / "evidence.json").read_text())
        self.assertEqual(ev["chain_id"], 688689)
        self.assertEqual(len(ev["transactions"]), 2)
        for tx in ev["transactions"]:
            self.assertTrue(tx["hash"].startswith("0x"))
            self.assertTrue(tx["explorer"].startswith("https://atlantic.pharosscan.xyz/tx/0x"))
        self.assertLessEqual(ev["spend_log"]["total_phrs"], 0.15)


if __name__ == "__main__":
    unittest.main(verbosity=2)
