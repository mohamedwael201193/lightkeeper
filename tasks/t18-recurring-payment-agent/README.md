<div align="center" style="background:#1414c8; padding:48px 24px; border-radius:12px;">

<span style="color:#b9c2f5; letter-spacing:6px; font-size:12px;">LIGHTKEEPER · TASK 18 · ONE OF TWENTY-EIGHT LAMPS</span>

<h1 style="font-family:Georgia,'Times New Roman',serif; color:#d9a821; letter-spacing:10px; font-size:52px; margin:16px 0;">TIDE</h1>

<p style="color:#ffffff; font-style:italic; font-size:17px; max-width:560px; margin:0 auto;">The octopus keeps the rhythm — every due drop, paid exactly once, never twice.</p>

<span style="color:#e8c766; letter-spacing:4px; font-size:12px;">RECURRING PAYMENT AGENT · PHAROS ATLANTIC</span>

</div>

---

## 1. What this is

**TIDE** is a schedule-driven recurring payment agent for Pharos Atlantic testnet (chain 688689). You define a schedule — recipient, amount, token, weekly/monthly interval, max runs, stop conditions — and the agent's `tick` pays the single due installment as a **real on-chain native-PHRS transfer**, tracks it as paid/pending/failed, and shows history plus the next scheduled payment.

The hard guarantee: **an installment is never paid twice.** A local JSONL state key plus chain-receipt verification forms the idempotency firewall — re-running `tick` any number of times skips what is already paid. Insufficient balance or any failure marks the installment `failed` *without broadcasting anything*.

> Honest scope: SkillEngine has **no native cron/scheduling** (confirmed-absent primitive G1). Ticks are driven by the **operator's system cron** — see §5. This build provides the installer script and docs; it never installs cron jobs itself and never claims the schedule is running unless the operator installed it.

## 2. Official requirements

See [REQUIREMENTS.md](REQUIREMENTS.md) — the four official bullets quoted verbatim from the Arena master doc, plus the MEGA implementation sketch and the four documented deviations (native PHRS, own validation pipeline since T17 is unbuilt, receipt-based idempotency firewall, reorg posture).

## 3. Quickstart

Prerequisites: Python 3, Foundry `cast` on PATH, and the repo-root `.env` with `ATLANTIC_RPC_URL` and `DEPLOYER_PRIVATE_KEY` (mode 600, never committed).

```bash
cd tasks/t18-recurring-payment-agent

# 1. Copy the example schedule and edit it (recipient, amount, interval…)
cp config/schedule.example.json config/schedule.json
#    interval: "weekly" | "monthly" (30-day month, documented)

# 2. Inspect the board — history + next scheduled payment
python3 src/tide.py status

# 3. Run one tick: pays the single due installment, if any (idempotent)
set -a; source ../../.env; set +a
python3 src/tide.py tick

# 4. Unit tests (pure logic, no network)
python3 tests/test_idempotency.py
```

`tick` is **level-triggered**: safe to run every minute — it pays at most one due installment and otherwise exits 0 with `SKIP`.

## 4. Schedule file reference

`config/schedule.json`:

| Field | Meaning |
|---|---|
| `schedule_id` | unique id; the idempotency key is `schedule_id + installment #` |
| `recipient` | `0x`-address, validated before every tick |
| `amount_phrs` | decimal string (no float math; converted via `cast to-wei`) |
| `token` / `token_type` | `"PHRS"` / `"native"` (native-PHRS transfers only in this build) |
| `interval` | `"weekly"` (604800s) or `"monthly"` (2592000s = 30 days, documented) |
| `start_time` | ISO-8601 UTC; installment *n* is due at `start + n·interval` |
| `max_runs` | hard cap on installments |
| `stop_conditions.expires_at` | ISO-8601 UTC or `null` — past it, nothing is payable |
| `stop_conditions.min_balance_after_phrs` | balance floor; a tick that would breach it fails *without broadcasting* |
| `control.paused` / `control.cancelled` | operator flags (see §6) |

State lives in `state/state.jsonl` (JSONL, **gitignored**) — each line is one record: `paid` (only after an observed `status 0x1` receipt), `failed`, `skipped`, or `broadcast`/`broadcast-unknown` (crash-recovery path). Human-readable decisions go to `state/audit.log` (also gitignored).

## 5. Cron setup (external scheduler)

Run the installer script — it prints the exact cron line for your machine and the verify steps. **It installs nothing** (`--install` is refused by design):

```bash
./scripts/install-cron.sh
# then: crontab -e   (paste the printed line)
# verify: crontab -l | grep tide.py
# watch:  tail -f state/cron.log
```

The suggested cadence is every 5 minutes. Missed-tick risk (MEGA §risks) is inherent to any external scheduler and is the operator's to monitor — `state/audit.log` timestamps every tick decision, and `status` always shows the next payment, so a gap is visible.

## 6. Commands

```
python3 src/tide.py tick      # pay the one due installment (idempotent)
python3 src/tide.py status    # history board: paid/pending/failed + next payment
python3 src/tide.py history   # alias of status
python3 src/tide.py pause     # pause: ticks print SKIP until resumed
python3 src/tide.py resume    # resume a paused schedule
python3 src/tide.py cancel    # cancel permanently (unpaid installments stop)
```

Every broadcast goes through the shared nonce lock: `flock /tmp/lk-nonce.lock cast send …` (28 workers share one key; `cast` waits for receipt by default).

## 7. Evidence

- **Live installment:** 0.0005 PHRS paid on Atlantic — [`0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10`](https://atlantic.pharosscan.xyz/tx/0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10) (block 31481497, status 0x1, value verified 500000000000000 wei, chainId 688689).
- **Idempotency proof:** immediate re-run printed `SKIP: no installment due` and broadcast nothing (transcript: `evidence/03-tick-skip-rerun.txt`).
- **Control proof:** pause → tick SKIP → resume → cancel, all recorded (transcripts `evidence/04–06`).
- **Unit tests:** 15/15 pass (`tests/test_idempotency.py`) — double-tick pays exactly once, sequential installments each paid once, failed installments never broadcast, `broadcast-unknown` blocks auto-retry, RPC-stall recovery (stalled receipt → unknown, never a crash; stalled broadcast → `broadcast-unknown`, never `failed`), expiry/pause/cancel semantics.
- **Crash-recovery proof (2026-10-16):** a sandbox run with two dangling `broadcast` records against the real chain — the real tx `0xeec25b…` reconciled to `paid`, a nonexistent hash stalled the RPC for 120s and was cleanly parked `broadcast-unknown` with no traceback and no retry (transcript: `evidence/08-crash-recovery.txt`). Zero broadcasts were made by the test.
- **Spend:** 0.000521 PHRS total (0.0005 value + 0.000021 fee) of the 0.15 PHRS budget.
- Full packet: [evidence.md](evidence.md) · [evidence.json](evidence.json) · [LINKS.md](LINKS.md) (curl-verified).

## 8. Honesty appendix

- The demo schedule pays **to the operator's own wallet** (self-payment dust). It is a real on-chain transfer (nonce 55, gas paid) that keeps funds inside the shared test wallet. Stated plainly wherever the tx is cited.
- **The schedule is NOT running anywhere.** The evidence schedule `tide-demo-01` was **cancelled** after the demo (`evidence/06-cancel.txt`) precisely so no future cron install can pay from it. A running schedule exists only if the operator installs the cron line from §5.
- ERC-20 tokens are **not** supported in this build (native PHRS only) — a stated roadmap item, not a claim.
- Deep-reorg confirmation depth beyond receipt observation is an operator consideration; see [REVIEWER_NOTES.md](REVIEWER_NOTES.md).
- No mocks, no staged successes, no secrets in the repo. Every tx hash links to the real Atlantic explorer.
