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
- Anchor: **ANCHORED (2026-10-20).** The canonical receipt
  `anchor-receipt.json` (body pinned to Pharos mainnet block 20719428,
  built from live Chain MCP `get_chain_info`/`get_block_number` calls) is
  signed by the founder-approved evidence key
  (`0xd81a77d7becb7dd16c412c9dafac511c7dcd65bb`) and its hash is embedded
  in the calldata of Atlantic tx
  `0x567e1775066afc4a9819436763fe29502e095226d220f5e465c2c003fdd69168`
  (block 31648678, status success, chain 688689). One honest footnote:
  the RPC dropped the broadcast response mid-submit; the transaction
  itself mined, and was recovered on-chain by a sender+nonce block scan,
  with the receipt body reconstructed byte-identically — the hash match
  is the proof. `verify_receipt.py anchor-receipt.json` → PASS on all
  four checks (hash, signer, anchor tx, MCP payloads re-issued).
  Without a configured key the machinery still reports honestly:
  `ABSENT`/`PENDING` — never a placeholder tx hash. Live demo:
  `demo/live_receipt_demo.py` (throwaway demo key, env-injected) →
  `demo/live-receipt.json`, verifier PASS.
- `python3 tests/test_receipts.py` — 15 tests, offline.
