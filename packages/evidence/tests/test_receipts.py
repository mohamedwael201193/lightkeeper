#!/usr/bin/env python3
"""Tests for @lightkeeper/evidence receipts (WS3 bet A).

Offline, deterministic. Cross-verified against cast (foundry) — see
RECEIPTS.md: keccak256("totalSupply()") selector 0x18160ddd, and
address_from_privkey(0x01..01) == cast wallet address.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_evidence.receipts import (  # noqa: E402
    ANCHOR_LABEL_ABSENT, address_from_privkey, anchor_receipt_tx,
    broadcast_anchor, build_receipt, canonical_json, keccak256_hex,
    load_evidence_key, recover_address, sign_receipt, sign_receipt_hash,
)

THROWAWAY_KEY = bytes.fromhex("00" * 31 + "01")  # test-only key, never a real wallet


class TestKeccak(unittest.TestCase):
    def test_empty_vector(self):
        self.assertEqual(
            keccak256_hex(b""),
            "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")

    def test_abc_vector(self):
        self.assertEqual(
            keccak256_hex(b"abc"),
            "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45")

    def test_selector_matches_cast_claim(self):
        # The exact selector T13's Docs MCP claims for totalSupply().
        self.assertTrue(keccak256_hex(b"totalSupply()").startswith("18160ddd"))


class TestSecp256k1(unittest.TestCase):
    def test_address_for_unit_key(self):
        # cast wallet address --private-key 0x00..01
        self.assertEqual(address_from_privkey(THROWAWAY_KEY),
                         "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf")

    def test_sign_recover_roundtrip(self):
        h = bytes.fromhex("ab" * 32)
        sig = sign_receipt_hash(h, THROWAWAY_KEY)
        rec = recover_address(h, int(sig["r"], 16), int(sig["s"], 16), sig["v"] - 27)
        self.assertEqual(rec, sig["signer"])
        self.assertEqual(sig["signer"], address_from_privkey(THROWAWAY_KEY))

    def test_signature_deterministic(self):
        h = bytes.fromhex("cd" * 32)
        self.assertEqual(sign_receipt_hash(h, THROWAWAY_KEY),
                         sign_receipt_hash(h, THROWAWAY_KEY))

    def test_tampered_hash_recovers_other_address(self):
        h1, h2 = bytes.fromhex("ab" * 32), bytes.fromhex("ba" * 32)
        sig = sign_receipt_hash(h1, THROWAWAY_KEY)
        rec = recover_address(h2, int(sig["r"], 16), int(sig["s"], 16), sig["v"] - 27)
        self.assertNotEqual(rec, sig["signer"])

    def test_bad_key_rejected(self):
        with self.assertRaises(ValueError):
            sign_receipt_hash(b"\x00" * 32, b"\x01" * 31)


class TestCanonicalJson(unittest.TestCase):
    def test_key_order_irrelevant(self):
        a = {"b": 1, "a": {"y": 2, "x": 3}}
        b = {"a": {"x": 3, "y": 2}, "b": 1}
        self.assertEqual(canonical_json(a), canonical_json(b))

    def test_hash_changes_with_content(self):
        body = {"a": 1}
        self.assertNotEqual(keccak256_hex(canonical_json(body)),
                            keccak256_hex(canonical_json({"a": 2})))


class TestReceiptLifecycle(unittest.TestCase):
    def _build(self):
        return build_receipt(
            inputs={"intent": "verify USDC supply"},
            mcp_payloads=[{"tool": "get_chain_info", "arguments": {},
                           "result": {"chainId": 1672}}],
            pinned_block=20715582, endpoint="https://mcp.pharos.xyz/mcp",
            server_version="pharos-mcp-server 0.1.0", commit="de5666a",
            task="receipts-test")

    def test_anchor_absent_by_default(self):
        r = self._build()
        self.assertEqual(r.anchor["status"], ANCHOR_LABEL_ABSENT)

    def test_broadcast_without_key_never_invents_hash(self):
        old = os.environ.pop("LK_EVIDENCE_KEY", None)
        try:
            r = broadcast_anchor(self._build())
        finally:
            if old:
                os.environ["LK_EVIDENCE_KEY"] = old
        self.assertEqual(r.anchor["status"], "ABSENT")
        self.assertNotIn("tx_hash", r.anchor)

    def test_sign_and_save_roundtrip(self):
        r = sign_receipt(self._build(), THROWAWAY_KEY)
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "receipt.json")
            r.save(p)
            loaded = json.load(open(p))
        self.assertEqual(loaded["receipt_hash"], r.receipt_hash)
        self.assertEqual(loaded["signature"]["signer"],
                         address_from_privkey(THROWAWAY_KEY))

    def test_inputs_are_redacted(self):
        r = build_receipt(
            inputs={"note": "key 0x" + "ab" * 32}, mcp_payloads=[],
            pinned_block=1, endpoint="e", server_version="v", commit="c",
            task="redact-test")
        self.assertNotIn("ab" * 32, json.dumps(r.body))

    def test_load_key_from_env(self):
        old = os.environ.get("LK_EVIDENCE_KEY")
        os.environ["LK_EVIDENCE_KEY"] = "0x" + "00" * 31 + "01"
        try:
            self.assertEqual(load_evidence_key(), THROWAWAY_KEY)
        finally:
            if old:
                os.environ["LK_EVIDENCE_KEY"] = old
            else:
                os.environ.pop("LK_EVIDENCE_KEY", None)


if __name__ == "__main__":
    unittest.main(verbosity=2)
