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
`broadcast-unknown` and never auto-retried. `tide.py status` shows the full
history board plus the next scheduled payment; `pause` / `resume` / `cancel`
give the operator control. SkillEngine has no native cron, so ticks run on
the operator's system cron — the installer script provides the exact line
and docs but installs nothing and the build never claims the schedule is
running. Evidence: live installment tx
0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10
(block 31481497, 0.0005 PHRS), a re-run transcript proving the skip,
pause/resume/cancel transcripts, and 12/12 passing idempotency unit tests.

**Repo Link (commit-pinned):**
https://github.com/mohamedwael201193/lightkeeper/tree/e908ccad2ed744b3296f5853b6df181658704c87/tasks/t18-recurring-payment-agent

**Proof Link (live tx):**
https://atlantic.pharosscan.xyz/tx/0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10

**Video Link:** PENDING-VIDEO

**Reviewer Notes:** see REVIEWER_NOTES.md in the task dir — 60-second
verification path, requirement-coverage table, and the deliberate
non-claims (schedule not running; native PHRS only; self-payment dust;
reorg-depth posture).

**Spend:** 0.000521 PHRS total (0.0005 value + 0.000021 fee), 1 broadcast.

**Try it live (LIGHTKEEPER console, Tier C):** the console ships a schedule
designer (`apps/console/src/components/try/t18-recurring-payment-agent.tsx`,
auto-wired by TryPanel via the lamp slug) — recipient, amount,
weekly/monthly interval, run count, start time, and balance floor, all
validated live; a plain-language summary ("0.01 PHRS every 7 days, 4 times,
first run …") with the full installment-date table; and the exact
`tide.py`-shaped `schedule.json` plus the CLI + cron commands, copy-paste
ready. It states plainly that nothing runs until the operator installs the
cron line on their own machine — no signing, no broadcasting, no keys.
