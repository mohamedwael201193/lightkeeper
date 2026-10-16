# T19 — Official Requirements (quoted VERBATIM)

Source: `~/workspace/your_files/pharos-arena-MEGA.md`, section
"### T19 — Invoice-to-Payment Agent (Medium, 100 · Payments)".

## Official rubric

> **OFFICIAL:** (1) Extracts payee/amount/token-or-currency/reference from ≥2 invoice FORMATS. (2) Flags mismatches/missing fields instead of guessing. (3) Produces payment summary + UNSIGNED tx including the invoice reference. (4) Includes demo with SAMPLE invoices.

## Prescribed implementation

> **Implementation:** "≥2 FORMATS" = structurally different formats (JSON vs plaintext vs CSV) — ship 3 parser plugins. No-guess rule made structural (`None` → flagged, never defaulted). Unsigned-tx builder binds the invoice reference honestly: standard ERC-20 `transfer` carries no memo — document that rather than faking one (use the reference in the summary + a reference registry where the rubric allows).

## Required evidence

> **Evidence:** 3 format parsers, mismatch demo (deliberately broken invoice flagged), summary + unsigned tx, sample invoices, share link.

## Required video beats

> **Video:** invoice (format 1) → extracted fields → invoice (format 2) → broken invoice → flagged, not guessed → unsigned tx.

## Known risks

> **Risks:** memo-binding honesty (documented, not faked); currency ambiguity (ask/flag).

## Build-contract additions (task order, beyond official)

The task contract additionally requires, and this build ships:

1. Invoice input format (JSON + CSV examples in the repo) with validation
   (amount > 0, valid address, currency PHRS).
2. A parser that produces a payment plan with line items.
3. A REVIEW step (human-readable: "pay X to Y for invoice Z").
4. Explicit confirmation before any broadcast.
5. Real dust payment on Atlantic per approved invoice.
6. A paid-stamp record (JSONL, gitignored) preventing double-payment of the
   same invoice id.
7. Evidence: a sample invoice file + the payment tx + the paid-stamp +
   a re-run showing the duplicate correctly REFUSED.
8. Tests: parser/validation unit tests (incl. malformed invoices) +
   the live pay + duplicate-refusal run.

## How each official requirement is met

| # | Official requirement | Where it is met |
|---|---|---|
| 1 | payee/amount/currency/reference from ≥2 formats | `agent/parsers.py` — 3 plugins: JSON, CSV, plaintext; `samples/` has all three |
| 2 | flags mismatches/missing fields, never guesses | `_build()` raises `InvoiceError` on any missing/invalid field; no defaults anywhere |
| 3 | payment summary + UNSIGNED tx incl. invoice reference | `agent/planner.py` — `render_review()` + `build_unsigned_tx()`; reference bound as envelope metadata with an explicit honesty note (native PHRS transfer has no memo bytes) |
| 4 | demo with SAMPLE invoices | `samples/invoice-001.json`, `invoice-002.csv`, `invoice-003.txt` + 5 deliberately broken invoices |
