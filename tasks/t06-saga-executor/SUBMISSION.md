# SUBMISSION PACK — T06 Saga Executor (copy-paste ready)

> Fill `278ee1c2895bf25971444b78a4e57e18dd376d56` after the module commit lands (see coordinator), then paste.

## Title

`Saga Executor — multi-step on-chain workflows with honest compensation (T06)`

## One-liner

`Approve → lock → execute → settle` on Atlantic with receipt-checked steps,
agent-code retry policy, a REAL mined 0x0 forced failure, and confirmed
refund + allowance-revoke compensation — finalized txs can't be undone, only
compensated.

## Description (paste into the Arena form)

T06 Saga Executor (Hard, 200 pts, SkillEngine) — LIGHTKEEPER module.

What it does: a saga state machine (CREATED→RUNNING→SUCCEEDED |
COMPENSATING→COMPENSATED | FAILED | COMPENSATION_FAILED) drives a 4-step
on-chain workflow against two purpose-built, source-verified fixture contracts
on Atlantic testnet (TestToken 0x1F3fb438824140b7E1125502f80B686D95072939,
TestFixture 0x29bf11Cd948CE845687A21819b2844d5321432Cf). Every step is
receipt-verified with post-state gates before the next starts. Retry policy is
agent code over receipt checks (SkillEngine has no native retry): transient
failures retry ≤3 with 5/15/45s backoff and +20% gas bumps; a mined 0x0 is
permanent — never retried, routed to compensation.

Proof it works:
- Run A (SUCCEEDED): approve → lock → execute → settle, all four receipts 0x1
  (blocks 31481355/31481383/31481413/31481460).
- Run B (COMPENSATED): forced execute() with an impossible minOut mined a REAL
  status-0x0 receipt (block 31482534,
  0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05) — the
  executor detected it, skipped retry, and ran two confirmed compensations:
  refund() (0xe6cac3114397487f6d1b1efec721af968ee8868e196a9d5f6437d35b9fbb60ca)
  and allowance revoke (0x0e80719119b7fb8781020e5a7fa0fcec01eeec167caa7329ac6781f1cb34759b).
  LKTEST balance before/after: 1,000,000 → 1,000,000. Final state: locked=0,
  allowance=0. Revert reason forensically confirmed: "TestFixture: minOut
  exceeds locked balance" (replayed against block 31482533).
- Run C (SUCCEEDED after a REAL crash): the executor hard-killed itself
  (exit 137) between approve's BROADCAST and CONFIRMING, then `resume`
  replayed the state log, re-read the in-flight receipt (0x96d304d53c427e155d157a0234297f63b494c18f6317bf616a77bf9f88d16a14,
  block 31486478), and completed approve → lock → execute → settle with
  exactly one broadcast tx per step — no duplicate sends after death.
- Honest limits: gas is unrecoverable (the 0x0 burned 24,231 gas); total T06
  spend 0.00238 PHRS of a 0.15 budget, receipt-accounted in evidence.json.
  25 unit tests pass (receipt classifier, retry table, state machine,
  resume-point parser).

Code: https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t06-saga-executor
Evidence: evidence.md + evidence.json in the same dir (13 txs, all explorer
links curl-verified server-rendered).

## Links

- Code (commit-pinned): `https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t06-saga-executor`
- Interactive demo (console "Try it live"): `https://lightkeeper-console.vercel.app` — open the
  **T06 Saga Executor** lamp and scroll to the live surface: an interactive timeline of the
  forced-failure run (click each step: tx, receipt, executor decision), a crash-recovery
  timeline (Run C: killed mid-step at exit 137, resumed to SUCCEEDED, one broadcast per step),
  a failure-forensics panel (revert reason, finality depth, compensation latency), a "Verify receipts live"
  button that re-reads every receipt status from Atlantic RPC, and a copy-paste reproduce panel.
  Module: `apps/console/src/components/try/saga-executor.tsx`.
- The 0x0 receipt: https://atlantic.pharosscan.xyz/tx/0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05
- Refund compensation: https://atlantic.pharosscan.xyz/tx/0xe6cac3114397487f6d1b1efec721af968ee8868e196a9d5f6437d35b9fbb60ca
- Revoke compensation: https://atlantic.pharosscan.xyz/tx/0x0e80719119b7fb8781020e5a7fa0fcec01eeec167caa7329ac6781f1cb34759b

## Video

https://orchid-cliff-9sjs.here.now/T06-saga-executor.mp4
real explorer pages, spoken script included).
