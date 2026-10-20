#!/usr/bin/env python3
"""Tests for @lightkeeper/persistence. No network needed."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_persistence import DedupSet, JsonFileStore, SqliteStore


class TestJsonFileStore(unittest.TestCase):
    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as td:
            s = JsonFileStore(os.path.join(td, "state.json"))
            state = {"chain_id": 1672, "cursor": 123, "seen": ["1:2"]}
            s.save(state)
            self.assertEqual(s.load(), state)

    def test_default_when_missing(self):
        with tempfile.TemporaryDirectory() as td:
            s = JsonFileStore(os.path.join(td, "missing.json"),
                              default_factory=lambda: {"cursor": None})
            self.assertEqual(s.load(), {"cursor": None})

    def test_atomic_no_tmp_left(self):
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "s.json")
            s = JsonFileStore(p)
            s.save({"a": 1})
            self.assertFalse(os.path.exists(p + ".tmp"))
            self.assertEqual(s.load(), {"a": 1})

    def test_overwrite(self):
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "s.json")
            s = JsonFileStore(p)
            s.save({"cursor": 1})
            s.save({"cursor": 2})
            self.assertEqual(s.load()["cursor"], 2)


class TestSqliteStore(unittest.TestCase):
    def test_cursors(self):
        with tempfile.TemporaryDirectory() as td:
            db = SqliteStore(os.path.join(td, "s.db"))
            try:
                self.assertIsNone(db.get_cursor("tip"))
                db.set_cursor("tip", 998877)
                self.assertEqual(db.get_cursor("tip"), 998877)
            finally:
                db.close()

    def test_kv(self):
        with tempfile.TemporaryDirectory() as td:
            db = SqliteStore(os.path.join(td, "s.db"))
            try:
                db.kv_put("watchlist", ["0xabc"])
                self.assertEqual(db.kv_get("watchlist"), ["0xabc"])
                self.assertEqual(db.kv_get("nope", "dflt"), "dflt")
            finally:
                db.close()

    def test_dedup_sets(self):
        with tempfile.TemporaryDirectory() as td:
            db = SqliteStore(os.path.join(td, "s.db"))
            try:
                self.assertFalse(db.seen_has("logs", "100:0"))
                db.seen_add("logs", "100:0")
                db.seen_add("logs", "100:0")  # idempotent
                self.assertTrue(db.seen_has("logs", "100:0"))
                self.assertFalse(db.seen_has("logs", "100:1"))
                self.assertEqual(db.seen_count("logs"), 1)
            finally:
                db.close()

    def test_restart_safe(self):
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "s.db")
            db = SqliteStore(p)
            db.set_cursor("tip", 42)
            db.seen_add("logs", "42:0")
            db.close()
            db2 = SqliteStore(p)  # reopen like a restarted process
            try:
                self.assertEqual(db2.get_cursor("tip"), 42)
                self.assertTrue(db2.seen_has("logs", "42:0"))
            finally:
                db2.close()


class TestDedupSet(unittest.TestCase):
    def test_add_returns_newness(self):
        d = DedupSet()
        self.assertTrue(d.add("x"))
        self.assertFalse(d.add("x"))
        self.assertIn("x", d)
        self.assertNotIn("y", d)

    def test_file_persistence(self):
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "seen.json")
            d = DedupSet(p)
            d.add("a")
            d2 = DedupSet(p)  # reload like a restarted process
            self.assertIn("a", d2)
            self.assertFalse(d2.add("a"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
