#!/usr/bin/env python3
"""T02 — dedupe fixture tests (offline, no MCP, no network).

The dedupe key is txHash:logIndex (monitor.scan_range). Fixture logs are
modeled on the REAL Chain MCP get_logs shape (see
tasks/t02-event-log-monitor/proof/mcp-resubmission.json).

Key scenario: the SAME transaction observed at TWO DIFFERENT block numbers
(a reorg moved it, or the scanner re-read an overlapping window) must
produce exactly ONE alert candidate — the txHash identity survives the
block change, the old block:logIndex key did not.

Run: python3 tests/test_monitor_dedupe.py
"""
import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))
import monitor  # noqa: E402

FROM = "0x" + "11" * 20
TO = "0x" + "22" * 20
TX_A = "0x" + "ab" * 32
TX_B = "0x" + "cd" * 32


def make_log(txhash, block_number, log_index, value=1_000_000):
    return {
        "address": monitor.USDC,
        "blockHash": "0x" + "ef" * 32,
        "blockNumber": hex(block_number),
        "blockTimestamp": "0x6ad6e6a6",
        "data": hex(value),
        "logIndex": hex(log_index),
        "removed": False,
        "topics": [monitor.topic0(monitor.TRANSFER_SIG),
                   "0x" + "0" * 24 + FROM[2:],
                   "0x" + "0" * 24 + TO[2:]],
        "transactionHash": txhash,
        "transactionIndex": "0x0",
    }


class FakeMCP:
    """Stands in for ChainMCP.call('get_logs', ...) with fixture logs."""

    def __init__(self, logs):
        self._logs = logs

    def call(self, tool, arguments, _retried=False):
        assert tool == "get_logs", f"unexpected tool {tool}"
        frm, to = arguments["fromBlock"], arguments["toBlock"]
        return [lg for lg in self._logs
                if frm <= int(lg["blockNumber"], 16) <= to]


def fresh_state():
    return {"chain_id": monitor.CHAIN_ID, "cursor": None, "seen": []}


class TestDedupeKey(unittest.TestCase):
    def test_same_tx_at_two_blocks_yields_one_alert(self):
        # The same transfer (same txHash, same logIndex) appears at block
        # 100 (first inclusion) and again at block 101 (reorg re-inclusion /
        # overlapping rescan). Exactly one alert candidate may result.
        logs = [make_log(TX_A, 100, 0), make_log(TX_A, 101, 0)]
        state = fresh_state()
        found = monitor.scan_range(FakeMCP(logs), 100, 101, state, emit=False)
        self.assertEqual(len(found), 1,
                         f"same tx at two blocks must dedupe to 1, got {len(found)}")
        self.assertEqual(len(state["seen"]), 1)
        self.assertEqual(state["seen"][0], f"{TX_A}:0x0")

    def test_different_tx_same_block_and_index_both_alert(self):
        logs = [make_log(TX_A, 100, 0), make_log(TX_B, 100, 0)]
        state = fresh_state()
        found = monitor.scan_range(FakeMCP(logs), 100, 100, state, emit=False)
        self.assertEqual(len(found), 2)

    def test_same_tx_two_log_indexes_both_alert(self):
        # Two Transfer events inside ONE tx (different logIndex) are distinct.
        logs = [make_log(TX_A, 100, 0), make_log(TX_A, 100, 1)]
        state = fresh_state()
        found = monitor.scan_range(FakeMCP(logs), 100, 100, state, emit=False)
        self.assertEqual(len(found), 2)

    def test_rescan_same_range_is_idempotent(self):
        logs = [make_log(TX_A, 100, 0), make_log(TX_B, 100, 1)]
        state = fresh_state()
        first = monitor.scan_range(FakeMCP(logs), 100, 100, state, emit=False)
        second = monitor.scan_range(FakeMCP(logs), 100, 100, state, emit=False)
        self.assertEqual(len(first), 2)
        self.assertEqual(len(second), 0, "re-scan of the same range must emit nothing new")


if __name__ == "__main__":
    unittest.main()
