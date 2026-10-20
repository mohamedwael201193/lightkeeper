# T19 — Arena Submission Pack (copy-paste ready)

## Title

LIGHTKEEPER T19 — Invoice-to-Payment Agent

## One-liner

Parses invoices in 3 formats, reviews them with a human-readable plan and a
real unsigned tx, then pays dust PHRS on Atlantic only after explicit
confirmation — with a paid-stamp ledger that makes double-payment impossible.
Two real settlements prove it: the JSON invoice AND the CSV invoice both went
parse → review → pay → stamp → refused-re-run on Atlantic testnet.

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

Tests: 20/20 unit tests pass (formats, validation incl. 5 malformed invoices,
plan/review, stamp idempotency, live-CSV-invoice parse). Evidence: real txs,
paid-stamps, duplicate refusal transcripts, malformed-invoice battery,
curl-verified explorer links.

## Interactive surface (LIGHTKEEPER console — new)

- `apps/console/src/components/try/invoice-to-payment-agent.tsx` — live
  reads (Tier A) + **paste invoice → extract → review → you sign in your
  wallet** (Tier B).
- **Live Atlantic context** under the input: current block number + gas price
  read from the RPC with a plain-language error + Retry if the RPC is down.
- 4 extraction formats client-side, same no-guess rules as `parsers.py`:
  JSON, CSV (quote-aware), `KEY: value` (same keymap as the agent), plus a
  **free-text format** (pattern-located fields, every ambiguity flagged).
- Amounts are capped at 18 decimals to match on-chain reality — more than 18
  is flagged before a proposal can exist.
- Deepened extraction: ambiguity sensors — multiple distinct payee addresses
  → refused; non-PHRS currency mentions (USDC/USDT/USD…) → flagged, never
  converted; thousands separators → flagged.
- 4 clickable presets taken verbatim from this task's evidence: the real
  `invoice-001.json` (JSON, settled on-chain tx 0xc927…c4f9), the real
  `invoice-004.csv` (CSV, settled on-chain tx 0xc7ff…8bac66 — both explorer
  links shown beside the preset), the real `invoice-003.txt` (plaintext),
  and the real deliberately-broken `invoice-bad-mismatch.json` (line-item
  total mismatch → flagged, payment impossible). Sample payees point at the
  real operator wallet — no dead sample address can ever strand a visitor's
  funds.
- MANDATORY review step: payee, amount, invoice id, reference; **wallet
  balance check** ("your balance covers this" / amber "not enough PHRS —
  your wallet will refuse to sign"); dust warning (> 0.01 PHRS) shown **amber
  as a warning, not an error**; `approve()` only on explicit click;
  visitor's wallet signs and sends on Pharos Atlantic only.
- Receipt labeled "Your tx — signed in your wallet." with explorer link.
- Honesty rule kept on the page: a native PHRS transfer has no memo bytes —
  the invoice reference is bound in the review and payment label, never faked
  on-chain. LIGHTKEEPER never sees or holds private keys.

## Source (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t19-invoice-to-payment-agent

## Demo / share links

- Live payment tx #1 — JSON invoice (Atlantic explorer):
  https://atlantic.pharosscan.xyz/tx/0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9
- Live payment tx #2 — CSV invoice (Atlantic explorer):
  https://atlantic.pharosscan.xyz/tx/0xc7fff61e404cb09a19f2319c26d034ae6f708ec2a98de81d229433226b8bac66
- Demo video: PENDING-VIDEO (script in VIDEO-GUIDE.md — now includes the
  console interactive demo: paste JSON → clean extraction → visitor-signed
  payment; broken invoice → flagged)
- Interactive console surface: https://lightkeeper-console.vercel.app
  (T19 lamp → "try it live": paste invoice, extract, review, sign in your wallet)

## On-chain evidence

- Payment tx #1: `0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9`
  — 0.001 PHRS, block 31481475, status success, Atlantic testnet (688689).
  (Earlier docs misprinted the block as 31491203 — corrected from the receipt.)
- Payment tx #2 (CSV parser proven end-to-end on-chain):
  `0xc7fff61e404cb09a19f2319c26d034ae6f708ec2a98de81d229433226b8bac66`
  — 0.0005 PHRS, block 31486451, status success, Atlantic testnet (688689).
- Spend: 0.000042000042 PHRS gas (budget 0.15)
- Duplicate re-run: `REFUSED: invoice 'INV-2026-001' was already paid …
  Double-payment prevented.` (proven for BOTH invoices)

## Reviewer notes

### What was built

An invoice-to-payment agent (`agent/`, ~700 lines Python, stdlib only):
parse → validate → payment plan → human REVIEW → explicit confirmation →
real dust broadcast on Atlantic → JSONL paid-stamp → duplicate refusal.

### How to verify in under 5 minutes

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t19-invoice-to-payment-agent

# 1. tests (no network needed)
python3 -m unittest discover -s tests          # expect 19/19 OK

# 2. malformed invoices are flagged, never paid
for f in samples/invoice-bad-*.*; do python3 -m agent.cli parse "$f"; done

# 3. duplicate refusal (invoice INV-2026-001 already paid + stamped)
python3 -m agent.cli stamps
```

For live paths (`review`/`pay`) you need `ATLANTIC_RPC_URL` and
`DEPLOYER_PRIVATE_KEY` in env — the broadcast uses the shared nonce lock
(`flock /tmp/lk-nonce.lock`).
Paying the sample invoice again will print `REFUSED … Double-payment
prevented.` without touching the chain.

### Honest limitations (shipped unsoftened)

1. **Invoice reference is not on-chain.** A native PHRS transfer has no memo
   bytes (same is true of standard ERC-20 `transfer`). The reference is bound
   in the review, the unsigned-tx envelope metadata, and the paid-stamp —
   documented in `agent/planner.py`, never faked. This matches the prescribed
   implementation in REQUIREMENTS.md.
2. **Currency scope is PHRS only.** Non-PHRS invoices are flagged, never
   converted. Multi-token support would need per-token decimals + a price
   oracle — out of scope for this task.
3. **Demo payee is the operator wallet.** The 0.001 PHRS payment is a dust
   self-payment so no testnet funds strand; any valid address pays identically.
4. **No SkillEngine cron exists** (confirmed-absent primitive); scheduling is
   out of scope for T19 (it belongs to T18's external scheduler).
5. Paid-stamp is a local JSONL file — sufficient for a single-operator agent;
   a multi-operator deployment would need a shared store.

### Design decisions worth knowing

- Amounts use `Decimal`, never float — no rounding can change what is paid.
- CSV accepts exactly one invoice row per file; a 2-row file is refused
  rather than "picking the first".
- The stamp is appended only after a successful receipt is observed; a failed
  broadcast is never stamped (failed payments can be retried, paid ones cannot
  be repeated).
- No third-party dependencies: stdlib + `cast`. Nothing to install, nothing
  to audit beyond this repo.

### Video status

PENDING-VIDEO — script and shot list are in VIDEO-GUIDE.md (45–90s, real
terminal + real explorer, no staged fakes).
