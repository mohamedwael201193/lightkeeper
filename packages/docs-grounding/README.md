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
