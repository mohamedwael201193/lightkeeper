# T06 — Saga Executor: Official Requirements

Source: `~/workspace/your_files/pharos-arena-MEGA.md`, section
"### T06 — Saga Executor (Hard, 200 · SkillEngine)". Quoted VERBATIM:

> **OFFICIAL:** (1) ≥3 DEPENDENT steps, each verified (receipt checked)
> before next starts. (2) Defined retry policy for transient failures
> (gas spike/dropped tx). (3) Defined COMPENSATION/ROLLBACK path for
> permanent failure + demo of it. (4) State log showing current step at
> any time. (5) One fully successful run AND one forced-failure run
> with recovery.

LIGHTKEEPER build-matrix guidance for T06 (from the same section —
plan, not official requirements):

> **Implementation:** saga state machine
> (CREATED→RUNNING→SUCCEEDED | COMPENSATING→COMPENSATED | FAILED |
> COMPENSATION_FAILED) + step states
> (PENDING→PREPARED→BROADCAST→CONFIRMING→CONFIRMED |
> RETRYING→FAILED_PERMANENT); idempotency keys; crash recovery. Retry:
> ≤3, backoff 5/15/45s, +20% gas bumps for transient; permanent
> (revert/insufficient) → no retry → compensation. **Honest-rollback
> doctrine:** finalized txs can't be undone — "rollback" = compensating
> forward txs (revoke approval, swap-back, withdraw); gas never
> recoverable; lossy compensations reported with actual balances.
> Forced-failure run: impossible minOut at step 2 → COMPENSATED.
> Fixture contracts named TestFixture/TestSwap — never "Mock*". If no
> transient failure occurs organically, document "defined + unit-tested"
> rather than faking one.
>
> **Evidence:** state log, Run A (success) receipts, Run B (forced
> failure → compensation) receipts, retry/compensation policy doc,
> share link.
>
> **Video:** Run A → forced-failure Run B → compensation txs → on-screen
> caption "finalized txs can't be undone — compensation only".
>
> **Risks:** COMPENSATION_FAILED path needs a manual runbook;
> kill-mid-CONFIRMING restart test.

How this build maps to the official bullets:

| Official bullet | Where it is proven |
|---|---|
| (1) ≥3 dependent steps, receipt-verified | Run A: approve → lock → execute → settle, each step waits for its receipt + post-state gate before the next starts (`scripts/saga.py`) |
| (2) Retry policy for transient failures | `retry_decision()` in `scripts/saga.py`: ≤3 retries, 5/15/45s backoff, +20% gas bumps; unit-tested (`--selftest`, 21 cases) |
| (3) Compensation/rollback path + demo | Run B: mined 0x0 → `COMPENSATING` → `refund()` + `approve(0)` revoke, each mined and linked; honest-rollback doctrine in README §5 |
| (4) State log showing current step | `runs/<run-id>/state.log` — JSONL, one line per transition, written before/after every broadcast |
| (5) One success run + one forced-failure run with recovery | Run A `SUCCEEDED` (4× 0x1); Run B `COMPENSATED` (1× real 0x0 + 2 compensation txs) — see `evidence.json` |
