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

One broadcast total. The schedule was cancelled after evidence capture, then
**resumed by the operator on 2026-10-20** to run under the live 15-minute cron:
installment 1 (due 2026-10-23T00:00:00Z) will pay 0.0005 PHRS dust automatically
unless paused/cancelled; `max_runs: 4` caps the schedule at 4 installments total
(≈0.0021 PHRS worst case, inside the 0.15 budget).

## Schedule config + state

- `config/schedule.json` — the exact schedule used (committed).
- `config/schedule.example.json` — blank template for operators.
- `state/state.jsonl` + `state/audit.log` — runtime records, **gitignored**
  (contain tx hashes; no secrets). The committed transcripts in `evidence/`
  are the durable record.

## Live cron schedule (2026-10-20) — the tick engine really ticks

The "on time" gap is closed: a real crontab entry on this VM fires
`tide.py tick` every 15 minutes, and the `tide-demo-01` schedule was resumed
(operator action, 2026-10-20T23:56Z) so ticks prepare on time. The full
record — installed cron line, `crontab -l` output, `state/cron.log`
(cron-fired stdout), and the matching `state/audit.log` tick entries — is
shipped as `evidence/09-cron-schedule.txt`.

Honest incident log: the first version of the installed line used `source`
to load the `.env`; cron runs lines under `/bin/sh`, where `source` does not
exist, so the 00:00Z tick fired but failed with an honest
`env var ATLANTIC_RPC_URL is not set` error (visible in both logs). Fixed by
using POSIX `.` (the installer script's printed line was fixed the same way).
A VM reboot at 2026-10-20T00:12Z then wiped `/var/spool` (ephemeral across VM
replacements) — crontab entry and the manually-started cron daemon both gone.
The entry was reinstalled at 2026-10-20T00:16Z and the daemon started via
`systemctl start cron` (enabled, so it starts on boot). The ≥2 clean tick
entries in `evidence/09-cron-schedule.txt` are all post-reinstall, cron-fired,
each printing `SKIP: no installment due — next payment: installment 1 at
2026-10-23T00:00:00+00:00` (level-triggered design working: nothing is due
until Oct 23, so nothing broadcasts).
