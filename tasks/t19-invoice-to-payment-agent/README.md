<div style="background:#1414c8;padding:56px 32px;text-align:center;border-radius:4px;">
<div style="font-family:Didot,'Bodoni MT',Georgia,serif;color:#d9a821;font-size:44px;letter-spacing:0.35em;margin:0;">INVOICE&nbsp;ARM</div>
<div style="font-family:Didot,'Bodoni MT',Georgia,serif;color:#e8c766;font-size:15px;letter-spacing:0.5em;margin-top:10px;">T19 &middot; THE OCTOPUS PAYS ITS DEBTS</div>
<div style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.9;margin-top:22px;font-style:italic;">One tentacle reads the bill. One tentacle checks it twice.<br/>No coin leaves the lighthouse unreviewed.</div>
</div>

# T19 — Invoice-to-Payment Agent

A payment agent that turns an invoice file into a real on-chain payment on
Pharos Atlantic testnet — with a human review step, explicit confirmation,
and a paid-stamp ledger that makes double-payment impossible.

## 1. The flow

```
invoice file ──parse──▶ validated invoice ──plan──▶ REVIEW ("pay X to Y for invoice Z")
                                                      │
                                    unsigned tx built from live chain data
                                                      │
                              ──confirm──▶ broadcast (dust PHRS) ──▶ paid-stamp
```

1. **Parse** — one of 3 format plugins (JSON / CSV / plaintext) extracts
   `invoice_id`, `payee`, `amount`, `currency`, `reference`, optional line items.
2. **Validate** — amount > 0, payee is a real 0x-address, currency is PHRS.
   Anything else is **flagged, never guessed, never paid**.
3. **Review** — human-readable plan plus a real **unsigned tx** (nonce,
   gas price from live RPC) with the invoice reference bound as metadata.
4. **Confirm** — nothing broadcasts without `--confirm <invoice-id>`.
5. **Pay** — `cast send` under the shared nonce lock, dust amount, receipt observed.
6. **Stamp** — JSONL paid-stamp appended. Re-running the same invoice id
   is **REFUSED** — double-payment is structurally impossible.

## 2. Invoice formats

| Format | File | Parser |
|---|---|---|
| JSON | `samples/invoice-001.json` | `parse_json` |
| CSV | `samples/invoice-002.csv` | `parse_csv` (header `invoice_id,payee,amount,currency,reference[,memo][,line_items]`) |
| Plaintext | `samples/invoice-003.txt` | `parse_txt` (`KEY: value` lines) |

Auto-detection: `{` → JSON, `invoice_id,` header → CSV, otherwise plaintext.
`--format` overrides detection.

## 3. Validation rules (the no-guess doctrine)

- **amount** must parse as a number and be **> 0** — zero/negative refused.
- **payee** must match `0x` + 40 hex chars — anything else refused.
- **currency** must be `PHRS` (case-insensitive) — other currencies flagged,
  never converted or guessed.
- **missing field** → flagged with the field name; there are no defaults.
- **line-item total ≠ invoice amount** → mismatch flagged, not paid.
- **CSV with ≠ 1 row** → refused (one invoice per file).

Five deliberately broken samples in `samples/invoice-bad-*` prove every rule.

## 4. Usage

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t19-invoice-to-payment-agent
set -a; source ../../.env; set +a   # ATLANTIC_RPC_URL, DEPLOYER_PRIVATE_KEY, DEPLOYER_ADDRESS

python3 -m agent.cli parse  samples/invoice-001.json        # parse + validate → plan JSON
python3 -m agent.cli review samples/invoice-001.json        # review + unsigned tx (no broadcast)
python3 -m agent.cli pay    samples/invoice-001.json        # review, then REFUSES (no confirm)
python3 -m agent.cli pay    samples/invoice-001.json --confirm INV-2026-001
python3 -m agent.cli stamps                                  # paid-stamp ledger
```

## 5. Evidence (real, on Atlantic)

- **Payment tx #1 (JSON invoice):** `0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9`
  — 0.001 PHRS, block 31481475, status success.
  Explorer: https://atlantic.pharosscan.xyz/tx/0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9
- **Payment tx #2 (CSV invoice):** `0xc7fff61e404cb09a19f2319c26d034ae6f708ec2a98de81d229433226b8bac66`
  — 0.0005 PHRS, block 31486451, status success (2026-10-16, full
  parse→review→pay→stamp→refuse cycle proven on-chain for the CSV parser).
  Explorer: https://atlantic.pharosscan.xyz/tx/0xc7fff61e404cb09a19f2319c26d034ae6f708ec2a98de81d229433226b8bac66
- **Paid-stamps:** two records in gitignored `paid-stamps.jsonl` (excerpts in `evidence.md`).
- **Duplicate re-runs:** both invoices `REFUSED` with no second broadcast —
  double-payment is structurally impossible.
- **Malformed battery:** all 5 broken samples flagged with clear errors (see `evidence.md`).
- **Tests:** 20/20 pass — `python3 -m unittest discover -s tests`.
- **Spend:** 0.000042000042 PHRS gas (of 0.15 budget).

## 6. Honesty notes

- The invoice **reference is never faked on-chain**: a native PHRS transfer
  has no memo bytes. The reference is bound in the review, the unsigned-tx
  envelope metadata, and the paid-stamp — documented in `planner.py`.
- The demo payment is a **dust self-payment to the operator wallet**
  (0.001 PHRS) so no testnet funds are stranded; any valid payee works identically.
- No mock, no demo mode, no placeholder success anywhere. Every control that
  looks live executes on-chain or refuses with a stated reason.

## 7. Nonce safety

All 28 LIGHTKEEPER builders share one deployer key. Every broadcast runs as

```
flock /tmp/lk-nonce.lock cast send <args> --rpc-url ... --private-key ...
```

`cast send` waits for the receipt by default; no custom nonce scheme.

## 8. File map

```
agent/parsers.py    3 format plugins + strict validation (InvoiceError on anything wrong)
agent/planner.py    payment plan, render_review(), build_unsigned_tx() from live RPC
agent/pay.py        explicit-confirm gate, flock broadcast, paid-stamp idempotency
agent/cli.py        parse | review | pay [--confirm ID] | stamps
samples/            3 valid invoices (001 JSON paid on-chain, 002 CSV, 003 TXT)
                    + invoice-004.csv (CSV, paid on-chain 0xc7ff…8bac66)
                    + 5 deliberately broken ones
tests/              20 unit tests (formats, validation, plan/review, stamp idempotency)
evidence.md/.json   real tx hashes, spend log, curl-tested links
```

Design: `docs/OCTOPUS-DESIGN.md`. Official requirements: `REQUIREMENTS.md`.
