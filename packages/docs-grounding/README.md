# @lightkeeper/docs-grounding (L2)

Every technical assertion cites a canonical doc URL. Citation objects,
`grounded`/`partial`/`unknown` verdicts, and a hard rule: the library
**refuses to improvise** (`require_grounding` raises `UnwillingToImprovise`
unless the answer is fully grounded).

## API (`lightkeeper_docs_grounding`)

- `Citation(source_url, quote="", retrieved_at="")`
- `ground_answer(citations) -> GroundingVerdict`
- `require_grounding(citations)` — raises `UnwillingToImprovise` unless GROUNDED
- `extract_quote_blocks(md)`, `normalize_quote(s)`, `quote_verified(quote, transcripts)`
- `citation_md(c)`

## Consumers

- `tasks/t03-docs-mcp-onboarding/scripts/quote_check.py` — block extraction,
  normalization, and verbatim verification of evidence.md quotes

## Test

`python3 tests/test_docs_grounding.py` — 14 tests, offline.

## Fleet-wide Grounding Auditor (WS3 bet F) — `lightkeeper_docs_grounding.auditor`

Generalizes the T04/T13 accuracy audits fleet-wide. Three LIVE batteries:
(1) quote re-verification — cited pages re-fetched via the Docs MCP at
audit time, verbatim quotes asserted; (2) bait battery — 6 invented-topic
questions whose only correct answer is "not in the docs" (refusal
classifier; transcripts published); (3) independent on-chain re-read at a
pinned block via the Chain MCP. `sendFeedback` is hard-blocked.

    python3 run_fleet_audit.py   # writes fleet-scorecard.json / .md

Latest scorecard (2026-10-20, live): **92.9% (13/14)** — one real FAIL
(BAIT-1: the Docs MCP answered an invented "time-travel snapshot" question
by redirecting to a real node-rollback procedure instead of refusing).
Published as measured, with the fix list — the battery is never shrunk.

`python3 tests/test_auditor.py` — 10 tests, offline.
