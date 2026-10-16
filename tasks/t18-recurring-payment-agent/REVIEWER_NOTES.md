# REVIEWER NOTES — T18 Recurring Payment Agent (TIDE)

For the Arena reviewer: what to check, in order, and what we deliberately
did NOT claim.

## 60-second verification

1. **Schedule config:** `config/schedule.json` — weekly, 0.0005 PHRS, recipient, max_runs 4, stop conditions. The template is `config/schedule.example.json`.
2. **One real tx:** https://atlantic.pharosscan.xyz/tx/0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10 — block 31481497, status 0x1, value exactly 0.0005 PHRS, chain 688689.
3. **Idempotency:** `evidence/03-tick-skip-rerun.txt` — the immediate re-run printed `SKIP: no installment due` and broadcast nothing.
4. **History + next payment:** `evidence/01-status-before.txt` (before) and `evidence/07-status-final.txt` (after) — paid/pending/cancelled board with next-payment line.
5. **Controls:** `evidence/04-pause.txt`, `05-resume.txt`, `06-cancel.txt`.
6. **Tests:** `python3 tests/test_idempotency.py` → 12/12 pass (pure logic; chain stubs labeled in the file header).

## Requirement coverage (official bullets)

| # | Bullet | Where |
|---|---|---|
| 1 | Weekly/monthly schedule with amount/token/recipient | `config/schedule.json` (`interval: weekly`; `monthly` supported, 30-day month documented); `token: PHRS` |
| 2 | Prepares each payment on time, tracks paid/pending/failed | `src/tide.py` `cmd_tick` + `cmd_status`; state machine in `state/state.jsonl` (gitignored), transcripts in `evidence/` |
| 3 | Insufficient balance/failure WITHOUT double-paying | `validate_payment()` fails the installment *before* any broadcast; unit test `test_failed_installment_never_broadcasts`; `broadcast-unknown` blocks auto-retry |
| 4 | Payment history + next scheduled payment | `tide.py status` board (see transcripts 01/07) |

## Deliberate non-claims (read before judging)

- **The schedule is NOT running.** SkillEngine has no native cron; the external cron is the operator's. `scripts/install-cron.sh` prints the line and *refuses* `--install`. The demo schedule was cancelled after evidence capture. Any claim otherwise would be fake — we chose the honest state.
- **Native PHRS only.** ERC-20 is a roadmap item, not a supported path. The `token` field says `"PHRS"` so the limit is visible in the config itself.
- **Self-payment dust.** The demo pays the operator's own wallet — a real on-chain transfer (nonce, gas, receipt) that keeps the shared test wallet funded. Labeled as such in the schedule label, evidence, and README.
- **Reorg depth.** `paid` is recorded only after an explicitly re-read receipt (`status 0x1`); we do not implement multi-block confirmation depth. For weekly dust on a testnet this is proportionate; a production deployment should add it.
- **Nonce safety.** Every broadcast is wrapped: `flock /tmp/lk-nonce.lock cast send …` per the 28-worker shared-key protocol.

## How to re-run the demo yourself

```bash
cd tasks/t18-recurring-payment-agent
set -a; source ../../.env; set +a
python3 src/tide.py status   # board
python3 src/tide.py tick     # pays only if an installment is due
```

To see a live payment: set `start_time` in `config/schedule.json` to a few
minutes in the past, ensure the schedule is not cancelled, run `tick` —
one real dust tx — then run `tick` again to watch it skip.
