# Reviewer notes — T06 Saga Executor

## What to check (fastest path)

1. **The 0x0 is real.** `cast receipt 0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05 --rpc-url https://atlantic.dplabs-internal.com`
   → `status 0 (failed)`, block 31482534. Or open the
   [explorer page](https://atlantic.pharosscan.xyz/tx/0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05)
   — server-rendered, status visible in HTML.
2. **Compensation is confirmed, not claimed.** Refund
   [`0xe6cac311…`](https://atlantic.pharosscan.xyz/tx/0xe6cac3114397487f6d1b1efec721af968ee8868e196a9d5f6437d35b9fbb60ca)
   and revoke
   [`0x0e807191…`](https://atlantic.pharosscan.xyz/tx/0x0e80719119b7fb8781020e5a7fa0fcec01eeec167caa7329ac6781f1cb34759b)
   are both `0x1`. Then read the chain:
   `locked(address)` → 0, `allowance` → 0, `balanceOf` → back to exactly
   1,000,000 LKTEST.
3. **The state machine actually ran.** `runs/t06-run-b-20261016-042903/state.log`
   shows `RUNNING → (execute) FAILED_PERMANENT → COMPENSATING → COMPENSATED`
   with a tx hash on every transition. The executor classified the `0x0` as
   permanent and did **not** retry it (one attempt, then compensation).
4. **Retry policy is defined + unit-tested**, not just documented:
   `python3 scripts/saga.py --selftest` (21 cases). No transient failure
   occurred organically during the runs, so per the build doctrine this is
   reported as "defined + unit-tested" — not faked.

## Design decisions worth knowing

- **Why an explicit `--gas-limit` on the forced step:** `cast send` runs
  client-side `eth_estimateGas` first and *refuses to broadcast* a call it
  knows will revert. Without the bypass, the deliberately-reverting tx can
  never reach the chain (proven the hard way — see the aborted attempt in
  `evidence.md`). The bypass is restricted to `force_fail` steps only.
- **Why approve(2×dust) in Run B:** so the revoke compensation is a real
  state change (2000 → 0), not a theatrical no-op.
- **Why token balance is the compensation metric, not native balance:**
  27 workers share the deployer key, so the wallet's PHRS delta mixes
  everyone's gas. The LKTEST balance is touched only by this saga —
  1,000,000 → 1,000,000 is airtight. Gas accounting is receipt-based
  (`evidence.json` → `spend_log`).

## Known limits (honest)

- Gas is unrecoverable: the forced `0x0` cost 24,231 gas; compensations cost
  gas too. Nothing here pretends otherwise.
- The retry path (dropped receipt / RPC error) is unit-tested but was not
  exercised organically on-chain; the code path is identical to the one that
  handled the aborted attempt's broadcast failures.
- `COMPENSATION_FAILED` has a defined state and persists evidence, but
  recovery from it is manual — runbook below.
- Testnet only. The doctrine (compensate forward, never "undo") is
  chain-agnostic.

## Manual runbook (if a compensation tx fails → COMPENSATION_FAILED)

1. Read `runs/<run-id>/state.log` — the last `CONFIRMING` line names the
   stuck step and its tx hash.
2. `cast receipt <hash>`: if it landed `0x1`, re-run the step's postcheck
   manually (`cast call … locked(address)` / `allowance(…)`); if green,
   the saga is recoverable by re-running with the same dust.
3. If the refund tx itself reverted: funds are still in `TestFixture.locked`;
   call `refund()` directly via `flock /tmp/lk-nonce.lock cast send
   0x29bf11Cd948CE845687A21819b2844d5321432Cf "refund()" …` then
   `approve(0)` on the token. Both are permissionless for the locker.
4. Record the manual txs in `evidence.md` — never silently.
