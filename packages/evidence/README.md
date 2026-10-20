# @lightkeeper/evidence (L10)

The proof pipeline: every run emits records; evidence.md is rendered from
them, never hand-written. `Record` **refuses records without source
identifiers** — at least one non-empty source key (`mcp_endpoint`,
`mcp_tool`, `tx_hash`, `block`, `url`, …) is required or
`MissingSourceIdentifiers` is raised. `secrets_scan`/`redact` catch leaked
secrets before anything is written.

## API (`lightkeeper_evidence`)

- `Record(fields, sources)` — `.to_dict()`; raises `MissingSourceIdentifiers` on sourceless records
- `EvidenceLog(task_id)` — `.emit(kind, sources, **fields)`, `.save_json(path)`, `.render_markdown(title)`
- `secrets_scan(text) -> [findings]`, `redact(text)`

## Consumers

- `tasks/t04-doc-search-cli/evidence/run_evidence.py` — every battery record is built through `Record` + `secrets_scan`; `evidence.json` schema unchanged

## Test

`python3 tests/test_evidence.py` — 10 tests, offline.
