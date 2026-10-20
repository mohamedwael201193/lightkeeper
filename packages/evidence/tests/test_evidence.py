#!/usr/bin/env python3
"""Tests for @lightkeeper/evidence. No network needed."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_evidence import (
    EvidenceLog, MissingSourceIdentifiers, Record, redact, secrets_scan,
)


class TestRecord(unittest.TestCase):
    def test_refuses_records_without_source_identifiers(self):
        with self.assertRaises(MissingSourceIdentifiers):
            Record(fields={"id": "E1"}, sources={})
        with self.assertRaises(MissingSourceIdentifiers):
            Record(fields={"id": "E1"},
                   sources={"mcp_endpoint": "", "mcp_tool": None})

    def test_accepts_tx_hash_source(self):
        r = Record(fields={"id": "E1"}, sources={"tx_hash": "0xabc"})
        self.assertEqual(r.to_dict()["tx_hash"], "0xabc")

    def test_accepts_mcp_source(self):
        r = Record(fields={"id": "E1"},
                   sources={"mcp_endpoint": "https://mcp.pharos.xyz/mcp",
                            "mcp_tool": "get_chain_info"})
        d = r.to_dict()
        self.assertEqual(d["mcp_tool"], "get_chain_info")
        self.assertEqual(d["id"], "E1")


class TestSecretsScan(unittest.TestCase):
    def test_clean_text(self):
        self.assertEqual(secrets_scan("the chain id is 1672"), [])

    def test_hex_private_key_found(self):
        key = "0x" + "ab" * 32
        findings = secrets_scan(f"key={key}")
        self.assertTrue(any("hex-private-key" in f for f in findings))

    def test_redact(self):
        key = "0x" + "ab" * 32
        out = redact(f"key={key} ok")
        self.assertNotIn(key, out)
        self.assertIn("[REDACTED:hex-private-key]", out)

    def test_address_not_flagged(self):
        # a 20-byte address must NOT trip the 32-byte private-key pattern
        self.assertEqual(secrets_scan("0xc879c018db60520f4355c26ed1a6d572cdac1815"), [])


class TestEvidenceLog(unittest.TestCase):
    def test_emit_and_save(self):
        with tempfile.TemporaryDirectory() as td:
            log = EvidenceLog("T99")
            log.emit("docs-mcp-query",
                     sources={"mcp_endpoint": "https://docs.pharos.xyz/~gitbook/mcp",
                              "mcp_tool": "askQuestion"},
                     id="E1", label="DOC-GROUNDED")
            p = os.path.join(td, "evidence.json")
            log.save_json(p)
            doc = json.load(open(p))
            self.assertEqual(doc["task"], "T99")
            self.assertEqual(doc["records"][0]["mcp_tool"], "askQuestion")
            self.assertEqual(doc["records"][0]["id"], "E1")

    def test_emit_refuses_sourceless(self):
        log = EvidenceLog("T99")
        with self.assertRaises(MissingSourceIdentifiers):
            log.emit("docs-mcp-query", sources={}, id="E1")

    def test_render_markdown_from_records(self):
        log = EvidenceLog("T99")
        log.emit("docs-mcp-query",
                 sources={"mcp_tool": "askQuestion"},
                 id="E1", label="DOC-GROUNDED")
        md = log.render_markdown("T99 evidence")
        self.assertIn("# T99 evidence", md)
        self.assertIn("askQuestion", md)
        self.assertIn("DOC-GROUNDED", md)


if __name__ == "__main__":
    unittest.main(verbosity=2)
