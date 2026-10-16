# T18 — Recurring Payment Agent — OFFICIAL REQUIREMENTS

Quoted VERBATIM from `~/workspace/your_files/pharos-arena-MEGA.md` §"T18 — Recurring Payment Agent (Medium, 100 · Payments)" (2026-10-16):

> **OFFICIAL:** (1) Weekly/monthly schedule with amount/token/recipient. (2) Prepares each payment on time, tracks paid/pending/failed. (3) Handles insufficient balance/failure WITHOUT double-paying. (4) Shows payment history + next scheduled payment.

## MEGA implementation guidance (same section, quoted)

> **Implementation:** reuses T17's validate+prepare pipeline verbatim (one pipeline audited once). External scheduler (system cron/GitHub Actions — no official SkillEngine cron exists; say so) drives ticks; idempotency firewall: DB key + chain-level Transfer-log scan before each preparation; level-triggered ticks; state machine per payment (scheduled→prepared→observed-paid/failed). Moves to `paid` ONLY on observed on-chain Transfer. Kill-9 restart + 5×-tick double-pay tests.

> **Evidence:** schedule config, tick logs, idempotency proof (repeated ticks, single intent), history board, share link.

> **Video:** schedule → tick → prepared unsigned intent → history → next payment.

> **Risks:** missed ticks (external scheduler monitoring); reorgs (confirmation depth before marking paid).

## Verdict precision patches applied (LIGHTKEEPER-VERDICT.md)

- SkillEngine has **NO native cron/scheduling** (confirmed-absent primitive G1) → T18 is driven by an **external scheduler**; the cron installer script provides the line and docs but installs nothing and the build never claims the schedule is running.
- Network doctrine: Atlantic testnet = chain **688689**, native **PHRS**, RPC from repo `.env`; chain-ID guard aborts any broadcast on a non-Atlantic RPC (mainnet guard).
- Atlantic rate limits (500 req/5min) respected: a tick makes ~6 read calls and at most 1 broadcast.

## T18 deviations from the MEGA sketch (documented, not hidden)

1. **Native PHRS, not ERC-20:** the evidence schedule pays native PHRS dust. The official bullet says "amount/token/recipient"; the schedule file carries a `token` field (`"PHRS"`) and `token_type: "native"`. Native was chosen so the demo is fully verifiable with `cast` alone (no token-contract dependency) and the idempotency claim rests on one unambiguous primitive. ERC-20 support is a stated roadmap item, not a claim.
2. **No T17 reuse:** T17 is not built yet in this repo, so the "validate+prepare pipeline" is implemented here as `validate_payment()` (recipient format, chain-ID guard, balance ≥ amount+fee, balance floor) and audited once, in this task's code.
3. **Idempotency firewall:** local JSONL state key + chain receipt re-verification (`cast receipt`) instead of a Transfer-log scan — for native transfers the receipt status is the authoritative paid signal, and the crash-recovery path reconciles any dangling broadcast before deciding.
4. **Reorg posture:** `cast send` waits for receipt by default; the agent records `paid` only after explicitly re-reading the receipt (`status 0x1`). Deep-reorg confirmation depth is documented as an operator consideration in REVIEWER_NOTES.md.
