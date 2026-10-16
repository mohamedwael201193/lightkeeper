"""T21 threshold-filter + honesty unit tests (no network; rpc_batch/rpc_call are monkeypatched)."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import whale_watch as ww  # noqa: E402

CHAIN = ww.CHAIN_ID

A1 = "0x1111111111111111111111111111111111111111"
A2 = "0x2222222222222222222222222222222222222222"
A3 = "0x3333333333333333333333333333333333333333"
A4 = "0x4444444444444444444444444444444444444444"
A5 = "0x5555555555555555555555555555555555555555"


def base_cfg(**over):
    cfg = {
        "watchlist": [
            {"address": A1, "label": "alpha (test)"},
            {"address": A2, "label": "beta (test)"},
            {"address": A3, "label": "gamma (test)"},
            {"address": A4, "label": "delta (test)"},
            {"address": A5, "label": "epsilon (test)"},
        ],
        "native_threshold_phrs": 0.05,
        "threshold_justification": "unit-test config",
        "tokens": [],
    }
    cfg.update(over)
    return cfg


def fresh_state():
    return {"seen_events": [], "last_scanned_block": None}


def tx(h, frm, to, wei):
    return {"hash": h, "from": frm, "to": to, "value": hex(wei)}


def fake_blocks_batch(blocks):
    """Monkeypatch target for whale_watch.rpc_batch: {(method,params)->block}."""
    def _rpc(rpc_url, calls, **kw):
        out = {}
        for i, (method, params) in enumerate(calls):
            if method == "eth_getBlockByNumber":
                b = int(params[0], 16)
                out[i] = {"number": params[0], "transactions": blocks.get(b, [])}
            else:
                raise AssertionError(f"unexpected method {method}")
        return out
    return _rpc


class TestNativeThreshold:
    def test_at_threshold_is_whale(self, monkeypatch):
        cfg = base_cfg()
        monkeypatch.setattr(ww, "rpc_batch", fake_blocks_batch({100: [tx("0xaaa", A1, A2, int(0.05 * 1e18))]}))
        matches, total = ww.scan_native("http://x", cfg, 100, 100, fresh_state(), verbose=False)
        assert total == 1
        assert len(matches) == 1
        assert matches[0]["tx_hash"] == "0xaaa"
        assert matches[0]["value_phrs"] == pytest.approx(0.05)

    def test_below_threshold_excluded(self, monkeypatch):
        cfg = base_cfg()
        monkeypatch.setattr(ww, "rpc_batch", fake_blocks_batch({100: [tx("0xbbb", A1, A2, int(0.049999 * 1e18))]}))
        matches, total = ww.scan_native("http://x", cfg, 100, 100, fresh_state(), verbose=False)
        assert total == 1
        assert matches == []

    def test_dust_excluded(self, monkeypatch):
        cfg = base_cfg()
        txs = [tx(f"0x{i:04x}", A1, A2, int(0.0001 * 1e18)) for i in range(5)]
        monkeypatch.setattr(ww, "rpc_batch", fake_blocks_batch({100: txs}))
        matches, total = ww.scan_native("http://x", cfg, 100, 100, fresh_state(), verbose=False)
        assert total == 5
        assert matches == []


class TestDedupe:
    def test_repeat_event_not_re_emitted(self, monkeypatch):
        cfg = base_cfg()
        blocks = {100: [tx("0xccc", A1, A2, int(1 * 1e18))]}
        monkeypatch.setattr(ww, "rpc_batch", fake_blocks_batch(blocks))
        state = fresh_state()
        m1, _ = ww.scan_native("http://x", cfg, 100, 100, state, verbose=False)
        assert len(m1) == 1
        state["seen_events"].append(m1[0]["event_key"])
        m2, _ = ww.scan_native("http://x", cfg, 100, 100, state, verbose=False)
        assert m2 == []


class TestRanking:
    def test_ranked_largest_first(self):
        ms = [
            {"kind": "native", "value_phrs": 0.05, "tx_hash": "0xs"},
            {"kind": "native", "value_phrs": 2.5, "tx_hash": "0xl"},
            {"kind": "token", "value_tokens": 10.0, "tx_hash": "0xt"},
            {"kind": "native", "value_phrs": 0.5, "tx_hash": "0xm"},
        ]
        ranked = ww.rank_matches(ms)
        assert [m["tx_hash"] for m in ranked] == ["0xt", "0xl", "0xm", "0xs"]


class TestConfigValidation:
    def test_fewer_than_five_rejected(self):
        cfg = base_cfg(watchlist=[{"address": A1, "label": "only"}])
        errs = ww.validate_config(cfg)
        assert any(">=5" in e for e in errs)

    def test_missing_label_rejected(self):
        cfg = base_cfg()
        cfg["watchlist"][0] = {"address": A1}
        errs = ww.validate_config(cfg)
        assert any("label" in e for e in errs)

    def test_nonpositive_threshold_rejected(self):
        assert ww.validate_config(base_cfg(native_threshold_phrs=0))

    def test_valid_config_passes(self):
        assert ww.validate_config(base_cfg()) == []


class TestLabelHonesty:
    def test_known_address_uses_config_label(self):
        cfg = base_cfg()
        assert "alpha (test)" in ww.display_addr(cfg, A1)

    def test_unknown_address_never_invented(self):
        cfg = base_cfg()
        unknown = "0x9999999999999999999999999999999999999999"
        disp = ww.display_addr(cfg, unknown)
        assert "9999…9999" in disp
        assert "unlabeled" in disp
        # no invented identity words
        for word in ["whale", "exchange", "founder", "bot", "bridge"]:
            assert word not in disp.lower()

    def test_none_to_is_contract_creation(self):
        assert "contract creation" in ww.display_addr(base_cfg(), None)


class TestTokenScan:
    def _log(self, frm, to, value, h="0xlog1", idx="0x0", block=100):
        pad = lambda a: "0x" + "0" * 24 + a[2:]  # noqa: E731
        return {
            "transactionHash": h,
            "logIndex": idx,
            "blockNumber": hex(block),
            "address": "0xtoken",
            "topics": [ww.TRANSFER_TOPIC, pad(frm), pad(to)],
            "data": hex(value),
        }

    def test_decode_transfer_log(self):
        log = self._log(A1, A2, 7 * 10**18)
        frm, to, value = ww.decode_transfer_log(log)
        assert frm == A1.lower()
        assert to == A2.lower()
        assert value == 7 * 10**18

    def test_per_token_threshold(self, monkeypatch):
        cfg = base_cfg(tokens=[{
            "symbol": "TST", "contract": "0xtoken000000000000000000000000000000000001",
            "decimals": 18, "threshold_tokens": 100.0,
        }])
        big = self._log(A1, A2, 150 * 10**18)
        small = self._log(A1, A2, 50 * 10**18, h="0xlog2")
        def fake_rpc(url, method, params, **kw):
            assert method == "eth_getLogs"
            return [big, small]
        monkeypatch.setattr(ww, "rpc_call", fake_rpc)
        matches = ww.scan_token_transfers("http://x", cfg, 100, 100, fresh_state(), verbose=False)
        assert len(matches) == 1
        assert matches[0]["value_tokens"] == pytest.approx(150.0)
        assert matches[0]["kind"] == "token"


class TestSummary:
    def test_summary_view_counts_all_watched(self):
        cfg = base_cfg()
        matches = [
            {"kind": "native", "tx_hash": "0x1", "block_number": 5, "from": A2, "to": A1,
             "value_phrs": 1.0},
            {"kind": "native", "tx_hash": "0x2", "block_number": 7, "from": A1, "to": A3,
             "value_phrs": 0.5},
        ]
        s = ww.build_summary(cfg, matches, 1, 10)
        assert s[A1.lower()]["whale_in"] == 1
        assert s[A1.lower()]["whale_out"] == 1
        assert s[A1.lower()]["total_in_phrs"] == pytest.approx(1.0)
        assert s[A1.lower()]["total_out_phrs"] == pytest.approx(0.5)
        assert s[A1.lower()]["last_block"] == 7
        # quiet address has honest zeros
        assert s[A4.lower()]["whale_in"] == 0
        assert s[A4.lower()]["last_block"] is None
        # all five present
        assert len(s) == 5

    def test_report_marks_self_seeded(self):
        cfg = base_cfg()
        m = {"kind": "native", "tx_hash": "0xseed", "block_number": 9, "from": A1, "to": A2,
             "value_phrs": 0.05, "self_seeded": True}
        s = ww.build_summary(cfg, [m], 1, 10)
        md = ww.render_report(cfg, [m], s, 1, 10, 1, "test", "2026-01-01T00:00:00Z")
        assert "SELF-SEEDED" in md
        assert "0xseed" in md


class TestYamlAddressQuirk:
    def test_unquoted_hex_address_parsed_as_int_still_valid(self):
        # PyYAML parses an unquoted all-hex 0x... address as an int.
        cfg = base_cfg()
        cfg["watchlist"][0] = {"address": int(A1, 16), "label": "int addr (test)"}
        assert ww.validate_config(cfg) == []
        assert ww.norm_addr(int(A1, 16)) == A1.lower()

    def test_real_config_loads(self):
        cfg = ww.load_config()
        assert len(cfg["watchlist"]) >= 5
        assert cfg["native_threshold_phrs"] == 0.05

    def test_unquoted_tx_hash_parsed_as_int_still_matched(self):
        h = "0xf566e34c25ca3c32dc4f6c687b7345501ea8da065398d71e9b87bc246371ba70"
        assert ww.norm_hash(int(h, 16)) == h
        assert ww.norm_hash(h) == h
