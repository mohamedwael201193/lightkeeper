# T19 — Arena Submission Pack (copy-paste ready)

## Title

LIGHTKEEPER T19 — Invoice-to-Payment Agent

## One-liner

Parses invoices in 3 formats, reviews them with a human-readable plan and a
real unsigned tx, then pays dust PHRS on Atlantic only after explicit
confirmation — with a paid-stamp ledger that makes double-payment impossible.

## Description

An invoice-to-payment agent for Pharos Atlantic testnet:

- **3 format parsers** (JSON, CSV, plaintext) extract payee / amount /
  currency / reference. Validation is strict: amount > 0, valid 0x address,
  currency PHRS — malformed invoices are flagged with clear errors, never
  guessed, never paid.
- **Payment plan with line items**; line-item total must equal the invoice
  amount or the invoice is flagged.
- **REVIEW step**: "Pay X PHRS to Y for invoice Z" plus a real **unsigned tx**
  built from live chain data (nonce, gas price). The invoice reference is
  bound as envelope metadata — documented honestly, because a native PHRS
  transfer has no memo bytes (never faked on-chain).
- **Explicit confirmation** (`--confirm <invoice-id>`) required before any
  broadcast; without it the agent refuses.
- **Real dust payment** on Atlantic (chain 688689), broadcast under the shared
  nonce lock, receipt observed before stamping.
- **Paid-stamp record** (JSONL, gitignored): re-running a paid invoice id is
  REFUSED — double-payment is structurally impossible.

Tests: 19/19 unit tests pass (formats, validation incl. 5 malformed invoices,
plan/review, stamp idempotency). Evidence: real tx, paid-stamp, duplicate
refusal transcript, malformed-invoice battery, curl-verified explorer links.

## Source (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/86ce901/tasks/t19-invoice-to-payment-agent

## Demo / share links

- Live payment tx (Atlantic explorer):
  https://atlantic.pharosscan.xyz/tx/0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9
- Demo video: PENDING-VIDEO (script in VIDEO-GUIDE.md)

## On-chain evidence

- Payment tx: `0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9`
  — 0.001 PHRS, block 31491203, status success, Atlantic testnet (688689)
- Spend: 0.000021000021 PHRS gas (budget 0.15)
- Duplicate re-run: `REFUSED: invoice 'INV-2026-001' was already paid …
  Double-payment prevented.`
