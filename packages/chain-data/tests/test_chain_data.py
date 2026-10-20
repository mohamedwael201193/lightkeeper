#!/usr/bin/env python3
"""Tests for @lightkeeper/chain-data. No network needed (except the optional
live smoke test, enabled with LK_LIVE_TESTS=1)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_chain_data import (
    LOGS_MAX_BLOCKS, MCP_URL, NETWORKS, ChainMCP, MCPError,
    assert_chain_id, chunk_ranges, network_for_chain_id, parse_block, parse_sse,
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
