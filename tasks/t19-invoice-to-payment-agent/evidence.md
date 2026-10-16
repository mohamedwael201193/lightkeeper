# T19 — Evidence

All links below were curl-tested (HTTP 200) on 2026-10-16. All transactions
are on Pharos Atlantic testnet (chain 688689). No mocks anywhere.

## Live payment

| Field | Value |
|---|---|
| Invoice | `INV-2026-001` (`samples/invoice-001.json`) |
| Payee | `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` (operator wallet — dust self-payment, no funds stranded) |
| Amount | 0.001 PHRS = 1,000,000,000,000,000 wei |
| Tx hash | `0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9` |
| Explorer | https://atlantic.pharosscan.xyz/tx/0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9 |
| Block | 31491203 (`0x1e05e83`) |
| Status | `0x1` (success) |
| Gas used | 21000 (`0x5208`) |
| Effective gas price | 1,000,000,001 wei (`0x3b9aca01`) |
| Gas cost | 21,000,000,021,000 wei = **0.000021000021 PHRS** |
| Paid at (UTC) | 2026-10-16T04:11:16Z |

On-chain verification (independent of the agent): `cast tx` returns
`from`/`to` = operator wallet, `value` = `0x38d7ea4c68000`, receipt
`status` = `0x1`. Native value transfer — no input data, no memo bytes
(the invoice reference lives in the review + unsigned-tx envelope +
paid-stamp, documented in `agent/planner.py`).

## Spend log (budget ≤ 0.15 PHRS)

| Item | Cost (PHRS) |
|---|---|
| Payment value, tx 0xc927…c4f9 (returned to operator wallet) | 0.001 (not net spend) |
| Gas for tx 0xc927…c4f9 | 0.000021000021 |
| **Net spend** | **0.000021000021** |
| Budget remaining | 0.149978999979 |

## Paid-stamp (gitignored `paid-stamps.jsonl`, excerpt)

```json
{"invoice_id": "INV-2026-001", "tx_hash": "0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9", "payee": "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3", "amount_phrs": "0.001", "amount_wei": "1000000000000000", "currency": "PHRS", "reference": "LK-T19-DEMO-001", "chain_id": 688689, "status": "paid", "gas_used": "0x5208", "effective_gas_price_wei": "0x3b9aca01", "paid_at_utc": "2026-10-16T04:11:16Z", "explorer": "https://atlantic.pharosscan.xyz/tx/0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9"}
```

## Duplicate-refusal (re-run of the same invoice)

```
$ python3 -m agent.cli pay samples/invoice-001.json --confirm INV-2026-001
REFUSED: invoice 'INV-2026-001' was already paid (tx 0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9, stamped 2026-10-16T04:11:16Z). Double-payment prevented.
```

No second broadcast was attempted — the stamp check fires before `cast send`.

## Pay-without-confirmation (guardrail)

```
$ python3 -m agent.cli pay samples/invoice-001.json
Refusing to pay invoice 'INV-2026-001' without explicit confirmation. Re-run with --confirm INV-2026-001.
```

## Malformed-invoice battery (all refused/flagged, nothing paid)

| Sample | Result |
|---|---|
| `invoice-bad-amount.json` (amount −5.0) | `FLAGGED: … amount -5.0 PHRS is not > 0 — refused.` |
| `invoice-bad-address.csv` (payee `not-an-address`) | `FLAGGED: … is not a valid 0x-address … refused.` |
| `invoice-bad-currency.txt` (USD) | `FLAGGED: … currency 'USD' unsupported … never converted or guessed.` |
| `invoice-bad-missing.json` (no reference) | `FLAGGED: … missing required field 'reference' — flagged, not defaulted.` |
| `invoice-bad-mismatch.json` (items 0.0014 ≠ 0.001) | `FLAGGED: … line-item total 0.0014 PHRS != invoice amount 0.001 PHRS — mismatch flagged, not paid.` |

## Review + unsigned tx (real output, abbreviated)

```
Pay      : 0.001 PHRS
To       : 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
Invoice  : INV-2026-001  (ref: LK-T19-DEMO-001)
Chain    : Atlantic testnet (688689)
unsigned_tx: { to, value 0x38d7ea4c68000, gas 0x5208, gasPrice 0x2540be400,
               nonce 0x30, chainId 0xa8231, data 0x }
invoice_reference: LK-T19-DEMO-001   (envelope metadata — not on-chain bytes)
```

## Unit tests

`python3 -m unittest discover -s tests` → **19/19 pass** (formats ×5,
validation ×10 incl. all malformed cases, plan/review ×2, stamp idempotency ×2).
