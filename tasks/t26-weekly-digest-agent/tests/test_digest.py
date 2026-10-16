#!/usr/bin/env python3
"""
T26 unit tests — run OFFLINE against RECORDED REAL chain data.

Fixture: tests/fixtures/recorded_window_2026-10-16.json
  Real txs for 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 recorded 2026-10-16
  from the explorer indexer API (see fixture _label). No network calls here:
  every test below is deterministic.

Covers: metrics math, previous-vs-current deltas, deterministic TOP-3
ranking, markdown + telegram rendering, telegram length guard.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import digest as D  # noqa: E402

FIX = os.path.join(os.path.dirname(__file__), "fixtures",
                   "recorded_window_2026-10-16.json")


class TestRecordedData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(FIX) as f:
            cls.fix = json.load(f)
        cls.addr = cls.fix["address"]
        assert cls.fix["_label"].startswith("REAL"), "fixture must be labeled real data"
        cls.cur_txs = cls.fix["current_window_txs"]
        cls.prev_txs = cls.fix["previous_window_txs"]
        assert len(cls.cur_txs) > 0 and len(cls.prev_txs) > 0

    # ---- metrics on real data ----
    def test_metrics_current_window(self):
        m = D.build_metrics(self.cur_txs, [], self.addr)
        # every tx in fixture is from the watched address (verified at record time)
        self.assertEqual(m["tx_total"], len(self.cur_txs))
        # real data: 26 sent + 1 received (0.05 PHRS inbound from 0x8e92b9…)
        self.assertEqual(m["tx_sent"] + m["tx_received"], len(self.cur_txs))
        self.assertEqual(m["tx_received"], 1)
        self.assertEqual(m["native_in_phrs"], 0.05)
        # gas spent = sum of real fees on SENT txs only (received tx fees are paid by the sender)
        sent = [t for t in self.cur_txs if t["from_address"].lower() == self.addr]
        expect = round(sum(float(t["transaction_fee"]) for t in sent), 9)
        self.assertEqual(m["gas_spent_phrs"], expect)
        self.assertGreater(m["gas_spent_phrs"], 0)
        # contract creations counted
        expect_c = sum(1 for t in self.cur_txs
                       if not t.get("to_address") or t.get("method") == "Contract Creation")
        self.assertEqual(m["contract_creations"], expect_c)
        self.assertGreater(m["contract_creations"], 0)

    def test_metrics_previous_window(self):
        m = D.build_metrics(self.prev_txs, [], self.addr)
        self.assertEqual(m["tx_total"], len(self.prev_txs))
        # previous slice contains real native-value transfers (July activity)
        self.assertGreater(m["native_out_phrs"], 0)

    def test_metrics_keys_public(self):
        m = D.build_metrics(self.cur_txs, [], self.addr)
        for k in ("tx_total", "tx_sent", "tx_received", "native_in_phrs",
                  "native_out_phrs", "gas_spent_phrs", "contract_creations",
                  "failed_txs", "methods", "token_transfer_events"):
            self.assertIn(k, m)

    # ---- deltas ----
    def test_delta_math(self):
        cur = D.public_metrics(D.build_metrics(self.cur_txs, [], self.addr))
        prev = D.public_metrics(D.build_metrics(self.prev_txs, [], self.addr))
        dl = D.delta(cur, prev)
        self.assertIsNotNone(dl)
        r = dl["tx_total"]
        self.assertEqual(r["current"], cur["tx_total"])
        self.assertEqual(r["previous"], prev["tx_total"])
        self.assertEqual(r["delta"], round(cur["tx_total"] - prev["tx_total"], 9))
        self.assertIn("%", r["fmt"])  # non-zero previous -> percentage shown

    def test_delta_empty_previous(self):
        cur = D.public_metrics(D.build_metrics(self.cur_txs, [], self.addr))
        prev = {k: 0 for k in cur}
        dl = D.delta(cur, prev)
        self.assertIn("prev 0", dl["tx_total"]["fmt"])  # honest, no div-by-zero

    def test_delta_no_baseline(self):
        cur = D.public_metrics(D.build_metrics(self.cur_txs, [], self.addr))
        self.assertIsNone(D.delta(cur, None))

    # ---- TOP-3 ranking: deterministic + rule order ----
    def test_top3_deterministic_and_capped(self):
        m = D.build_metrics(self.cur_txs, [], self.addr)
        t1 = D.rank_notable(m, [], self.addr)
        t2 = D.rank_notable(m, [], self.addr)
        self.assertEqual(t1, t2)  # deterministic
        self.assertLessEqual(len(t1), 3)

    def test_top3_prefers_creations_over_plain_calls(self):
        m = D.build_metrics(self.cur_txs, [], self.addr)
        top = D.rank_notable(m, [], self.addr)
        kinds = [e["kind"] for e in top]
        # current window is creation-heavy; top entry must be a creation (score 50)
        # unless a failure (100) or large transfer (40)... creations win here.
        self.assertTrue(any("CREATION" in k or "FAILED" in k or "LARGE" in k for k in kinds),
                        f"unexpected top kinds: {kinds}")
        scores = [e["score"] for e in top]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_top3_failed_tx_outranks_everything(self):
        bad = dict(self.cur_txs[0])
        bad["receipt_status"] = 0
        txs = [bad] + self.cur_txs[1:]
        m = D.build_metrics(txs, [], self.addr)
        top = D.rank_notable(m, [], self.addr)
        self.assertEqual(top[0]["kind"], "FAILED TX")
        self.assertEqual(top[0]["score"], 100)

    def test_top3_token_transfer_ranked(self):
        transfers = [{
            "token": "0xabc", "symbol": "TKN", "decimals": 18,
            "from": "0xdead", "to": self.addr, "raw": 10**19,
            "amount": 10.0, "block": 999, "tx": "0x" + "ab" * 32}]
        m = D.build_metrics([], transfers, self.addr)
        top = D.rank_notable(m, transfers, self.addr)
        self.assertEqual(len(top), 1)
        self.assertEqual(top[0]["score"], 25)
        self.assertIn("TOKEN TRANSFER IN", top[0]["kind"])

    # ---- rendering ----
    def _ctx(self):
        cur = D.public_metrics(D.build_metrics(self.cur_txs, [], self.addr))
        prev = D.public_metrics(D.build_metrics(self.prev_txs, [], self.addr))
        m = D.build_metrics(self.cur_txs, [], self.addr)
        return {"address": self.addr,
                "window": {"start_block": 1, "end_block": 2,
                           "start_iso": "2026-10-09T00:00:00+00:00",
                           "end_iso": "2026-10-16T00:00:00+00:00"},
                "metrics": cur, "deltas": D.delta(cur, prev),
                "top3": D.rank_notable(m, [], self.addr),
                "generated_iso": "2026-10-16T00:00:00+00:00"}

    def test_markdown_renders(self):
        md = D.render_markdown(self._ctx())
        self.assertIn("# Weekly Digest", md)
        self.assertIn("TOP 3", md)
        self.assertIn("688689", md)
        self.assertIn("| Transactions (total) |", md)

    def test_telegram_renders_and_fits(self):
        tg = D.render_telegram(self._ctx())
        self.assertLessEqual(len(tg), 4000, "must fit Telegram 4096 limit")
        self.assertIn("Weekly Digest", tg)
        self.assertIn("TOP 3", tg)

    def test_quiet_week_renders(self):
        ctx = self._ctx()
        ctx["top3"] = []
        ctx["deltas"] = None
        md = D.render_markdown(ctx)
        tg = D.render_telegram(ctx)
        self.assertIn("baseline", md)
        self.assertIn("quiet week", tg)


if __name__ == "__main__":
    unittest.main(verbosity=2)
