#!/usr/bin/env python3
"""Tests for @lightkeeper/chain-data. No network needed (except the optional
live smoke test, enabled with LK_LIVE_TESTS=1)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_chain_data import (
    LOGS_MAX_BLOCKS, MCP_URL, NETWORKS, ChainMCP, MCPError, RateLimited,
    TokenBucket, assert_chain_id, chunk_ranges, network_for_chain_id,
    parse_block, parse_retry_after, parse_sse,
)


class TestNetworkTable(unittest.TestCase):
    def test_pharos_mainnet_identity(self):
        net = network_for_chain_id(1672)
        self.assertEqual(net["name"], "pharos-mainnet")
        self.assertEqual(net["mcp_url"], MCP_URL)

    def test_atlantic_identity(self):
        net = network_for_chain_id(688689)
        self.assertEqual(net["name"], "atlantic-testnet")
        self.assertEqual(net["chain_id"], 688689)

    def test_unknown_chain_raises(self):
        with self.assertRaises(MCPError):
            network_for_chain_id(1)


class TestAssertChainId(unittest.TestCase):
    def test_match_int(self):
        self.assertEqual(assert_chain_id(1672, 1672), 1672)

    def test_match_hex_string(self):
        self.assertEqual(assert_chain_id("0x688", 1672), 1672)

    def test_mismatch_raises_fail_closed(self):
        with self.assertRaises(MCPError) as ctx:
            assert_chain_id(688689, 1672)
        self.assertIn("mismatch", str(ctx.exception))

    def test_garbage_raises(self):
        with self.assertRaises(MCPError):
            assert_chain_id("not-a-chain", 1672)


class TestChunkRanges(unittest.TestCase):
    def test_even_split(self):
        self.assertEqual(list(chunk_ranges(0, 1999, 1000)), [(0, 999), (1000, 1999)])

    def test_remainder(self):
        self.assertEqual(list(chunk_ranges(5, 2500, 1000)),
                         [(5, 1004), (1005, 2004), (2005, 2500)])

    def test_single_chunk(self):
        self.assertEqual(list(chunk_ranges(10, 20, 1000)), [(10, 20)])

    def test_default_cap(self):
        chunks = list(chunk_ranges(0, 2500))
        self.assertTrue(all(b - a + 1 <= LOGS_MAX_BLOCKS for a, b in chunks))
        self.assertEqual(chunks[-1][1], 2500)

    def test_empty_range(self):
        self.assertEqual(list(chunk_ranges(10, 5, 1000)), [])

    def test_bad_size(self):
        with self.assertRaises(ValueError):
            list(chunk_ranges(0, 10, 0))


class TestParseBlock(unittest.TestCase):
    def test_int(self):
        self.assertEqual(parse_block(123), 123)

    def test_hex(self):
        self.assertEqual(parse_block("0x7b"), 123)

    def test_decimal_string(self):
        self.assertEqual(parse_block("123"), 123)


class TestParseSse(unittest.TestCase):
    def test_parses_data_line(self):
        text = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n'
        self.assertEqual(parse_sse(text, 200)["result"], {"ok": True})

    def test_skips_bad_data_lines(self):
        text = 'data: not json\ndata: {"a": 1}\n'
        self.assertEqual(parse_sse(text, 200), {"a": 1})

    def test_no_data_frame_raises(self):
        with self.assertRaises(MCPError):
            parse_sse("event: ping\n\n", 200)


class TestChainMCPClient(unittest.TestCase):
    def test_client_name_honored(self):
        c = ChainMCP(client_name="lightkeeper-t99")
        self.assertEqual(c.client_name, "lightkeeper-t99")
        self.assertEqual(c.url, MCP_URL)

    def test_session_header_included_after_handshake(self):
        c = ChainMCP()
        c._session_id = "abc123"
        self.assertEqual(c._headers()["Mcp-Session-Id"], "abc123")

    def test_no_session_header_before_handshake(self):
        c = ChainMCP()
        self.assertNotIn("Mcp-Session-Id", c._headers())


@unittest.skipUnless(os.environ.get("LK_LIVE_TESTS") == "1", "live MCP smoke test")
class TestLiveMCP(unittest.TestCase):
    def test_live_handshake_and_chain_info(self):
        c = ChainMCP(client_name="lightkeeper-lib-test").connect()
        try:
            info = c.get_chain_info()
            assert_chain_id(info.get("chainId"), 1672, what="live chain")
            blk = c.get_block_number()
            self.assertGreater(blk, 0)
        finally:
            c.close()


class _FakeClock:
    def __init__(self):
        self.now = 1000.0
        self.sleeps = []

    def time(self):
        return self.now

    def sleep(self, s):
        self.sleeps.append(s)
        self.now += s


class TestTokenBucket(unittest.TestCase):
    def test_burst_then_wait(self):
        fc = _FakeClock()
        b = TokenBucket(rate_per_s=2.0, burst=2.0, clock=fc.time, sleep=fc.sleep)
        self.assertEqual(b.acquire(), 0.0)
        self.assertEqual(b.acquire(), 0.0)
        # bucket empty: 1 token at 2/s costs 0.5s
        self.assertAlmostEqual(b.acquire(), 0.5)
        self.assertEqual(fc.sleeps, [0.5])

    def test_refill_over_time(self):
        fc = _FakeClock()
        b = TokenBucket(rate_per_s=1.0, burst=1.0, clock=fc.time, sleep=fc.sleep)
        b.acquire()
        fc.now += 1.0  # idle a second -> token refilled
        self.assertEqual(b.acquire(), 0.0)

    def test_bad_params(self):
        with self.assertRaises(ValueError):
            TokenBucket(rate_per_s=0)
        with self.assertRaises(ValueError):
            TokenBucket(burst=0.5)
        b = TokenBucket(burst=1.0)
        with self.assertRaises(ValueError):
            b.acquire(2.0)


class TestRetryAfterParsing(unittest.TestCase):
    def test_seconds_form(self):
        self.assertEqual(parse_retry_after("7"), 7.0)
        self.assertEqual(parse_retry_after("0"), 0.0)

    def test_http_date_form(self):
        from email.utils import formatdate
        now = 1_700_000_000.0
        self.assertAlmostEqual(
            parse_retry_after(formatdate(now + 30, usegmt=True), now=now), 30.0, places=0)

    def test_garbage_and_absent(self):
        self.assertIsNone(parse_retry_after(None))
        self.assertIsNone(parse_retry_after(""))
        self.assertIsNone(parse_retry_after("soon"))


class _FakeResp:
    def __init__(self, status, headers=None, text=""):
        self.status_code = status
        self.headers = headers or {}
        self.text = text


class TestRetryAfterHonored(unittest.TestCase):
    def _client(self, responses):
        c = ChainMCP(pacer=TokenBucket(rate_per_s=1000.0, burst=1000.0))
        calls = {"n": 0}

        class FakeSession:
            def post(self, url, headers=None, data=None, timeout=None):
                r = responses[min(calls["n"], len(responses) - 1)]
                calls["n"] += 1
                return r

            def close(self):
                pass

        c.session = FakeSession()
        return c, calls

    def test_429_then_success_sleeps_retry_after(self):
        ok = _FakeResp(200, text='data: {"jsonrpc":"2.0","id":1,"result":{}}\n')
        c, calls = self._client([_FakeResp(429, {"Retry-After": "0"}), ok])
        slept = []
        import lightkeeper_chain_data as mod
        orig = mod.time.sleep
        mod.time.sleep = slept.append
        try:
            out = c._post({"jsonrpc": "2.0", "id": 1, "method": "x"})
        finally:
            mod.time.sleep = orig
        self.assertEqual(out["result"], {})
        self.assertEqual(calls["n"], 2)
        self.assertEqual(slept, [0.0])  # exactly the server's Retry-After

    def test_persistent_429_raises_ratelimited(self):
        c, calls = self._client([_FakeResp(429, {"Retry-After": "0"})])
        import lightkeeper_chain_data as mod
        orig = mod.time.sleep
        mod.time.sleep = lambda s: None
        try:
            with self.assertRaises(RateLimited) as ctx:
                c._post({"jsonrpc": "2.0", "id": 1, "method": "x"})
        finally:
            mod.time.sleep = orig
        self.assertEqual(ctx.exception.retry_after_s, 0.0)
        self.assertEqual(calls["n"], 4)  # 1 initial + 3 honored retries


if __name__ == "__main__":
    unittest.main(verbosity=2)
