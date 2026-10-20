# SUBMISSION PACK — T18 Recurring Payment Agent (Arena copy-paste)

> Proof Link / Repo Link / Video Link / Reviewer Notes for the
> Pharos Season of AI Agent Arena per-task submission form.
> The repo link is commit-pinned. The video link is a placeholder
> until the operator records it (see VIDEO-GUIDE.md).

---

**Title:** TIDE — Recurring Payment Agent

**One-liner:** A schedule-driven agent that pays one due installment per tick as a real Atlantic PHRS transfer — and can never pay the same installment twice.

**Description:**

TIDE implements the T18 recurring-payment skill for Pharos Atlantic testnet.
A JSON schedule (recipient, amount, token, weekly/monthly interval, max runs,
stop conditions) drives `tide.py tick`: the single due installment is
validated (recipient format, chain-ID 688689 guard, balance ≥ amount+fee,
balance floor) and paid as a real on-chain native-PHRS transfer under the
shared nonce flock. An installment moves to `paid` ONLY after an observed
receipt with status 0x1. The idempotency firewall — local JSONL state key plus
chain-receipt re-verification — means any re-run skips already-paid
installments; insufficient balance or failure marks the installment `failed`
without broadcasting anything; an unreconcilable broadcast is parked as
`broadcast-unknown` and never auto-retried. RPC-stall hardening: a stalled
receipt lookup or broadcast raises a typed `TideTimeout` (never a traceback);
a stalled broadcast is parked `broadcast-unknown`, never `failed` — because
`failed` is retryable and retrying a landed-but-unconfirmed broadcast would
double-pay. `tide.py status` shows the full history board plus the next scheduled payment; `pause` / `resume` / `cancel`
give the operator control. SkillEngine has no native cron, so ticks run on
the operator's system cron — and on this deployment the operator installed the
real thing: a root crontab entry on this VM fires `tide.py tick` every 15
minutes (exact line in `evidence/09-cron-schedule.txt`), the `tide-demo-01`
schedule was resumed 2026-10-20, and the tick log ships as evidence that ticks
prepare on time — each tick validates and pays at most one due installment or
skips honestly. Evidence: live installment tx
0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10
(block 31481497, 0.0005 PHRS), a re-run transcript proving the skip,
pause/resume/cancel transcripts, a crash-recovery transcript (dangling
broadcasts reconciled against the real chain: the real tx recovered to `paid`,
a nonexistent hash cleanly parked `broadcast-unknown` after the RPC stalled —
zero broadcasts made by the test), and 15/15 passing unit tests.

**Repo Link (commit-pinned):**
https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t18-recurring-payment-agent

**Proof Link (live tx):**
https://atlantic.pharosscan.xyz/tx/0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10

**Video Link:** PENDING-VIDEO

**Reviewer Notes:** see "Reviewer notes" below — 60-second verification
path, requirement-coverage table, and the deliberate non-claims (live cron
schedule, exactly documented; native PHRS only; self-payment dust; reorg-depth
posture).

**Spend:** 0.000521 PHRS total (0.0005 value + 0.000021 fee), 1 broadcast.

**Try it live (LIGHTKEEPER console, Tier C):** the console ships a schedule
designer (`apps/console/src/components/try/t18-recurring-payment-agent.tsx`,
auto-wired by TryPanel via the lamp slug) — recipient, amount,
weekly/monthly interval, run count, start time, and balance floor, all
validated live (amount must parse AND be above zero, mirroring the
executor's own validation); a plain-language summary ("0.01 PHRS every 7
days, 4 times, first run …") with the full installment-date table now
carrying the exact per-installment idempotency key (`schedule_id · #n`)
and a "never twice / never broke / never stranded" guarantees strip; and the exact
`tide.py`-shaped `schedule.json` plus the CLI + cron commands, copy-paste
ready. It states plainly that nothing runs until the operator installs the
cron line on their own machine — no signing, no broadcasting, no keys.

## Reviewer notes

For the Arena reviewer: what to check, in order, and what we deliberately
did NOT claim.

### 60-second verification

1. **Schedule config:** `config/schedule.json` — weekly, 0.0005 PHRS, recipient, max_runs 4, stop conditions. The template is `config/schedule.example.json`.
2. **One real tx:** https://atlantic.pharosscan.xyz/tx/0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10 — block 31481497, status 0x1, value exactly 0.0005 PHRS, chain 688689.
3. **Idempotency:** `evidence/03-tick-skip-rerun.txt` — the immediate re-run printed `SKIP: no installment due` and broadcast nothing.
4. **History + next payment:** `evidence/01-status-before.txt` (before) and `evidence/07-status-final.txt` (after) — paid/pending/cancelled board with next-payment line.
5. **Controls:** `evidence/04-pause.txt`, `05-resume.txt`, `06-cancel.txt`.
6. **Tests:** `python3 tests/test_idempotency.py` → 15/15 pass (pure logic; chain stubs labeled in the file header).
7. **Crash recovery:** `evidence/08-crash-recovery.txt` — dangling `broadcast` records reconciled against the real chain: the real tx `0xeec25b…` recovered to `paid`; a nonexistent hash stalled the receipt RPC and was parked `broadcast-unknown` with no traceback, no retry, zero broadcasts.

### Requirement coverage (official bullets)

| # | Bullet | Where |
|---|---|---|
| 1 | Weekly/monthly schedule with amount/token/recipient | `config/schedule.json` (`interval: weekly`; `monthly` supported, 30-day month documented); `token: PHRS` |
| 2 | Prepares each payment on time, tracks paid/pending/failed | `src/tide.py` `cmd_tick` + `cmd_status`; state machine in `state/state.jsonl`, transcripts in `evidence/` |
| 3 | Insufficient balance/failure WITHOUT double-paying | `validate_payment()` fails the installment *before* any broadcast; unit test `test_failed_installment_never_broadcasts`; `broadcast-unknown` blocks auto-retry |
| 4 | Payment history + next scheduled payment | `tide.py status` board (see transcripts 01/07) |

### Deliberate non-claims (read before judging)

- **The schedule IS running on this deployment — stated exactly, not implied.**
  SkillEngine has no native cron; the external cron is the operator's.
  `scripts/install-cron.sh` prints the line and *refuses* `--install`. On
  2026-10-20 the operator (not the build) installed the crontab entry —
  `tide.py tick` every 15 min (exact line in `evidence/09-cron-schedule.txt`)
  — and resumed `tide-demo-01`, so ticks prepare on time for real; the tick
  log is shipped as evidence. The cancel transcripts are historical (the
  cancel was real then; the resume is real now; both are in
  `state/state.jsonl`). Durability caveat, observed: `/var/spool` crontabs do
  not survive VM replacements (a reboot at 2026-10-20T00:12Z wiped the
  installed entry; reinstalled 2026-10-20T00:16Z). The canonical line is
  stored in the task dir for reinstall.
- **Native PHRS only.** ERC-20 is a roadmap item, not a supported path. The `token` field says `"PHRS"` so the limit is visible in the config itself.
- **Self-payment dust.** The demo pays the operator's own wallet — a real on-chain transfer (nonce, gas, receipt) that keeps the shared test wallet funded. Labeled as such in the schedule label, evidence, and README.
- **Reorg depth.** `paid` is recorded only after an explicitly re-read receipt (`status 0x1`); we do not implement multi-block confirmation depth. For weekly dust on a testnet this is proportionate; a production deployment should add it.
- **RPC stalls.** A stalled `cast receipt` lookup (observed on the Atlantic RPC for a nonexistent hash: it hangs past the 120s deadline) is typed as `TideTimeout` and treated as *unknown*, never as a crash; a stalled broadcast is parked `broadcast-unknown`, never `failed` — because `failed` is retryable and a retry after a landed-but-unconfirmed broadcast would double-pay.
- **Nonce safety.** Every broadcast is wrapped: `flock /tmp/lk-nonce.lock cast send …` per the shared-key nonce protocol.

### How to re-run the demo yourself

```bash
cd tasks/t18-recurring-payment-agent
set -a; source ../../.env; set +a
python3 src/tide.py status   # board
python3 src/tide.py tick     # pays only if an installment is due
```

To see a live payment: set `start_time` in `config/schedule.json` to a few
minutes in the past, ensure the schedule is not cancelled, run `tick` —
one real dust tx — then run `tick` again to watch it skip.
