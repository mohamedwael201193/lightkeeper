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

## Receipts (WS3 bet A) — `lightkeeper_evidence.receipts` + `verify_receipt.py`

Independently verifiable receipts: canonical-JSON body (inputs, exact MCP
payloads, pinned block, endpoint + server version, commit) → pure-Python
Keccak-256 (cross-checked against `cast keccak`) → EIP-191 signature with a
pure-Python secp256k1/RFC-6979 implementation (cross-checked against
`cast wallet address`). Key is env-injected ONLY (`LK_EVIDENCE_KEY`).

- `python3 verify_receipt.py <receipt.json>` — dependency-free verifier:
  recomputes the hash, recovers the signer, opens the anchor tx when one
  exists, and RE-ISSUES the recorded MCP payloads (pinned where pinnable).
- Anchor: Atlantic testnet machinery is built; without a founder-approved
  funded keypair the anchor is honestly `ABSENT`/`PENDING` — never a
  placeholder tx hash. Live demo: `demo/live_receipt_demo.py` (throwaway
  demo key, env-injected) → `demo/live-receipt.json`, verifier PASS.
- `python3 tests/test_receipts.py` — 15 tests, offline.
