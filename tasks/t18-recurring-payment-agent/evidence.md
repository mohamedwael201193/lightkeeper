# T18 Evidence — Recurring Payment Agent (TIDE)

All evidence below is REAL: one live Atlantic testnet broadcast plus
captured transcripts. No mocks, no staged successes.

## Live installment (the one real tx)

| Field | Value |
|---|---|
| Schedule | `tide-demo-01` — weekly, 0.0005 PHRS native, recipient = operator wallet `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` (self-payment dust; funds stay in the shared test wallet) |
| Installment | 0 (due 2026-10-16T00:00:00Z) |
| Tx hash | `0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10` |
| Explorer | https://atlantic.pharosscan.xyz/tx/0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10 (curl: HTTP 200) |
| Block | 31481497 |
| Receipt | status `0x1`, from = to = `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` |
| Value (on-chain) | 500000000000000 wei = **0.0005 PHRS** (verified via `cast tx --json`) |
| Fee (on-chain) | 21000 gas × 1000000001 wei = **0.000021 PHRS** |
| Chain | 688689 (Atlantic) — chain-ID guard passed |
| Sender nonce | 55 |

## Idempotency proof (re-run transcript)

Immediate second `tick` after the paid installment:

```
SKIP: no installment due — next payment: installment 1 at 2026-10-23T00:00:00+00:00
```

No second broadcast. Raw transcript: `evidence/03-tick-skip-rerun.txt`.

## Full tick sequence (transcripts in `evidence/`)

| Step | File | Result |
|---|---|---|
| status before | `01-status-before.txt` | installment 0 DUE, history + next payment shown |
| live tick | `02-tick-paid.txt` | PAID — real tx above |
| re-run tick | `03-tick-skip-rerun.txt` | SKIP — idempotency proven |
| pause → tick | `04-pause.txt` | paused; tick prints `SKIP: schedule 'tide-demo-01' is paused` |
| resume | `05-resume.txt` | resumed |
| cancel | `06-cancel.txt` | cancelled (no unpaid installment can ever pay) |
| final status | `07-status-final.txt` | history board: #0 `paid` + explorer link, #1–3 `CANCELLED`, next payment: none |

## Unit tests

`tests/test_idempotency.py` — 12/12 pass, pure logic, no network:

- double-tick pays exactly once (3 ticks → 1 broadcast)
- sequential installments each paid once
- failed installment (insufficient balance) never broadcasts
- `broadcast-unknown` blocks auto-retry (double-pay risk eliminated)
- expiry / max_runs / pause / resume / cancel semantics

## Spend log

| Item | PHRS |
|---|---|
| Installment 0 value | 0.000500 |
| Installment 0 fee | 0.000021 |
| **Total** | **0.000521** |
| Budget cap | 0.150000 |
| Remaining | 0.149479 |

One broadcast total. The schedule was cancelled after evidence capture, so
no further spend is possible from it.

## Schedule config + state

- `config/schedule.json` — the exact schedule used (committed).
- `config/schedule.example.json` — blank template for operators.
- `state/state.jsonl` + `state/audit.log` — runtime records, **gitignored**
  (contain tx hashes; no secrets). The committed transcripts in `evidence/`
  are the durable record.
