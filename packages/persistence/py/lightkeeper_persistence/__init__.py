"""@lightkeeper/persistence (L7) — durable state between runs.

Observations, watchlists, checkpoints, digests. Two backends, no server:

* :class:`JsonFileStore` — atomic (tmp + os.replace) JSON document store.
  Restart-safe: a kill -9 can never leave a half-written file.
* :class:`SqliteStore` — SQLite file backend with cursors, dedup sets and a
  key/value table. Every mutation commits — restart-safe.
* :class:`DedupSet` — in-memory dedup with optional file persistence.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time


class JsonFileStore:
    """Atomic JSON document store.

    ``save`` writes to ``path + ".tmp"`` then ``os.replace``s — readers
    never see a torn write, even on kill -9.
    """

    def __init__(self, path: str, default_factory=lambda: {}):
        self.path = path
        self._default_factory = default_factory

    def load(self):
        if not os.path.exists(self.path):
            return self._default_factory()
        with open(self.path, encoding="utf-8") as f:
            return json.load(f)

    def save(self, state) -> None:
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.path)


class SqliteStore:
    """SQLite file backend: cursors, dedup sets, key/value."""

    def __init__(self, path: str):
        self.path = path
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._conn = sqlite3.connect(path)
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)")
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS cursors (name TEXT PRIMARY KEY, v TEXT NOT NULL)")
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS seen (scope TEXT, item TEXT, "
            "PRIMARY KEY (scope, item))")
        self._conn.commit()

    def close(self):
        self._conn.close()

    # -- key/value --
    def kv_put(self, key: str, value) -> None:
        self._conn.execute("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)",
                           (key, json.dumps(value)))
        self._conn.commit()

    def kv_get(self, key: str, default=None):
        row = self._conn.execute("SELECT v FROM kv WHERE k = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    # -- cursors --
    def get_cursor(self, name: str, default=None):
        row = self._conn.execute("SELECT v FROM cursors WHERE name = ?",
                                 (name,)).fetchone()
        return json.loads(row[0]) if row else default

    def set_cursor(self, name: str, value) -> None:
        self._conn.execute("INSERT OR REPLACE INTO cursors (name, v) VALUES (?, ?)",
                           (name, json.dumps(value)))
        self._conn.commit()

    # -- dedup sets --
    def seen_add(self, scope: str, item: str) -> None:
        self._conn.execute("INSERT OR IGNORE INTO seen (scope, item) VALUES (?, ?)",
                           (scope, item))
        self._conn.commit()

    def seen_has(self, scope: str, item: str) -> bool:
        row = self._conn.execute("SELECT 1 FROM seen WHERE scope = ? AND item = ?",
                                 (scope, item)).fetchone()
        return row is not None

    def seen_count(self, scope: str) -> int:
        row = self._conn.execute("SELECT COUNT(*) FROM seen WHERE scope = ?",
                                 (scope,)).fetchone()
        return int(row[0])


class DedupSet:
    """In-memory dedup set with optional JSON file persistence."""

    def __init__(self, path: str | None = None):
        self.path = path
        self._seen: set[str] = set()
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self._seen = set(json.load(f))

    def add(self, item: str) -> bool:
        """Add ``item``; return True iff it was new."""
        if item in self._seen:
            return False
        self._seen.add(item)
        self._persist()
        return True

    def __contains__(self, item: str) -> bool:
        return item in self._seen

    def _persist(self):
        if self.path:
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(sorted(self._seen), f)
            os.replace(tmp, self.path)


__all__ = ["JsonFileStore", "SqliteStore", "DedupSet"]
