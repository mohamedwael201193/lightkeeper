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

## Interactive surface (LIGHTKEEPER console — new)

- `apps/console/src/components/try/invoice-to-payment-agent.tsx` — Tier B:
  **paste invoice → extract → review → you sign in your wallet**.
- 4 extraction formats client-side, same no-guess rules as `parsers.py`:
  JSON, CSV (quote-aware), `KEY: value` (same keymap as the agent), plus a
  **free-text format** (pattern-located fields, every ambiguity flagged).
- Deepened extraction: ambiguity sensors — multiple distinct payee addresses
  → refused; non-PHRS currency mentions (USDC/USDT/USD…) → flagged, never
  converted; thousands separators → flagged.
- 3 clickable presets taken verbatim from this task's evidence: the real
  `invoice-001.json` (JSON), the real `invoice-003.txt` (plaintext), and the
  real deliberately-broken `invoice-bad-mismatch.json` (line-item total
  mismatch → flagged, payment impossible).
- MANDATORY review step: payee, amount, invoice id, reference; dust warning
  (> 0.01 PHRS) shown **amber as a warning, not an error**; `approve()` only
  on explicit click; visitor's wallet signs and sends on Pharos Atlantic only.
- Receipt labeled "Your tx — signed in your wallet." with explorer link.
- Honesty rule kept on the page: a native PHRS transfer has no memo bytes —
  the invoice reference is bound in the review and payment label, never faked
  on-chain. LIGHTKEEPER never sees or holds private keys.

## Source (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/86ce901/tasks/t19-invoice-to-payment-agent

## Demo / share links

- Live payment tx (Atlantic explorer):
  https://atlantic.pharosscan.xyz/tx/0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9
- Demo video: PENDING-VIDEO (script in VIDEO-GUIDE.md — now includes the
  console interactive demo: paste JSON → clean extraction → visitor-signed
  payment; broken invoice → flagged)
- Interactive console surface: https://lightkeeper-console.vercel.app
  (T19 lamp → "try it live": paste invoice, extract, review, sign in your wallet)

## On-chain evidence

- Payment tx: `0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9`
  — 0.001 PHRS, block 31491203, status success, Atlantic testnet (688689)
- Spend: 0.000021000021 PHRS gas (budget 0.15)
- Duplicate re-run: `REFUSED: invoice 'INV-2026-001' was already paid …
  Double-payment prevented.`
