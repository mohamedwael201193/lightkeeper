# @lightkeeper/persistence (L7)

Durable state between runs — observations, watchlists, checkpoints, digests.
SQLite file backend, no server. Restart-safe: every mutation is atomic or
committed, so kill -9 loses nothing and corrupts nothing.

## API (`lightkeeper_persistence`)

- `JsonFileStore(path, default_factory)` — `.load()`, `.save()` (tmp + `os.replace`, fsync)
- `SqliteStore(path)` — `.get_cursor/.set_cursor`, `.seen_add/.seen_has/.seen_count`, `.kv_get/.kv_put`, `.close()`
- `DedupSet(path=None)` — `.add()` returns newness, optional file persistence

## Consumers

- `tasks/t02-event-log-monitor/monitor.py` — `load_state`/`save_state` delegate to `JsonFileStore`; `state.json` schema unchanged

## Test

`python3 tests/test_persistence.py` — 10 tests, offline (incl. reopen-after-close restart test).
