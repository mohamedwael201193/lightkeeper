<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:12px;">

# <span style="color:#d9a821;font-family:Georgia,'Times New Roman',serif;letter-spacing:0.35em;">SAGA&nbsp;EXECUTOR</span>

<p style="color:#ffffff;font-family:Georgia,serif;font-style:italic;font-size:18px;">One arm fails — the keeper does not drop the lamp;<br/>it reaches back, and makes the sea whole again.</p>

<p style="color:#b9c2f5;font-size:13px;">LIGHTKEEPER · T06 · Hard · 200 pts · SkillEngine · Atlantic testnet</p>

</div>

---

## 1. What this is

A multi-step on-chain workflow — **approve → lock → execute → settle** — driven by
agent code over receipt checks (`scripts/saga.py`). SkillEngine ships no native
retry and no rollback, so both are implemented here as explicit, unit-tested policy.
Two fixture contracts on Atlantic testnet (`TestToken`, `TestFixture`) play the
workflow's counterparty. Nothing is simulated: every step is a mined transaction,
every state transition is appended to a JSONL state log, and the failure run
contains a **real mined `status: 0`** receipt followed by **confirmed compensation
transactions** (refund + allowance revoke).

## 2. Architecture

**Saga states:** `CREATED → RUNNING → SUCCEEDED | COMPENSATING → COMPENSATED | FAILED | COMPENSATION_FAILED`

**Step states:** `PENDING → PREPARED → BROADCAST → CONFIRMING → CONFIRMED | RETRYING → FAILED_PERMANENT`

- **Retry policy (agent code, not toolkit):** transient failures (dropped/missing
  receipt, RPC error) retry ≤3 times with 5/15/45s backoff and +20% gas bumps per
  attempt. A mined `0x0` is *permanent* — never retried, routed straight to
  compensation. Decision table unit-tested (`python3 scripts/saga.py --selftest`,
  25 cases).
- **Post-state gates:** a `0x1` receipt is not enough — each step also asserts
  on-chain state before the next starts (allowance ≥ amount, `locked` delta,
  `settled` flag, balance restoration). A gate failure escalates to compensation.
- **Failure-broadcast mode** (opt-in, code-restricted): the forced-failure step
  bypasses the precheck and is sent with an explicit `--gas-limit` so `cast`'s
  client-side `eth_estimateGas` — which refuses to broadcast any reverting call —
  cannot swallow the failure before it reaches the chain. This is the only way to
  mine a genuine `0x0` through this toolchain, and it is documented, not hidden.

## 3. Run A — full success (`SUCCEEDED`)

`runs/t06-run-a-20261016-040851/` · dust = 1000 wei LKTEST

| # | Step | Tx | Block | Status | Gas |
|---|---|---|---|---|---|
| 1 | approve(fixture, 1000) | [`0x30183882…1763a75`](https://atlantic.pharosscan.xyz/tx/0x30183882c8021b6daa017b03d5eecca595bf7faa2128e25eb59ad530e1763a75) | 31481355 | ✅ 0x1 | 46,663 |
| 2 | lock(1000) | [`0xe46a8c40…250256587`](https://atlantic.pharosscan.xyz/tx/0xe46a8c40db9656ecb37baf933f1d6044a0e13a03bfdf7e9e03b022d250256587) | 31481383 | ✅ 0x1 | 80,306 |
| 3 | execute(minOut=1000) | [`0x9c259838…100cd43`](https://atlantic.pharosscan.xyz/tx/0x9c2598384dfdbfd688bbd42e4006308decd455a1940bac95da6d2c529100cd43) | 31481413 | ✅ 0x1 | 25,688 |
| 4 | settle() | [`0xa13311d2…09ca5873`](https://atlantic.pharosscan.xyz/tx/0xa13311d24cd0aff5eb91c389f14b22e9be8f9cab7958583d00d7785b09ca5873) | 31481460 | ✅ 0x1 | 46,830 |

Gate trail: allowance 1000 → `locked` 0→1000 → execute returns 1000 → `settled=true`.
State log: `runs/t06-run-a-20261016-040851/state.log`.

## 4. Run B — forced failure → compensation (`COMPENSATED`)

`runs/t06-run-b-20261016-042903/` · dust = 2000 wei LKTEST · approve(4000) leaves a
real residual allowance so the revoke step is meaningful, not a no-op.

| # | Step | Tx | Block | Status | Gas |
|---|---|---|---|---|---|
| 1 | approve(fixture, 4000) | [`0x452acae1…a928ba7`](https://atlantic.pharosscan.xyz/tx/0x452acae1ec4335ecd0842672c97383b5671e1ad950150224f307dcd17a928ba7) | 31482444 | ✅ 0x1 | 46,663 |
| 2 | lock(2000) | [`0x0371814a…76f0eea`](https://atlantic.pharosscan.xyz/tx/0x0371814a1739f58698722db4915da1b718512c9bafcb347da3def4a6576f0eea) | 31482492 | ✅ 0x1 | 85,106 |
| 3 | execute(minOut=2001) — **impossible** | [`0x91f7e021…f819b05`](https://atlantic.pharosscan.xyz/tx/0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05) | 31482534 | ❌ **0x0** | 24,231 |
| C1 | compensate: refund() | [`0xe6cac311…fbb60ca`](https://atlantic.pharosscan.xyz/tx/0xe6cac3114397487f6d1b1efec721af968ee8868e196a9d5f6437d35b9fbb60ca) | 31482558 | ✅ 0x1 | 37,560 |
| C2 | compensate: revoke approve(0) | [`0x0e807191…34759b`](https://atlantic.pharosscan.xyz/tx/0x0e80719119b7fb8781020e5a7fa0fcec01eeec167caa7329ac6781f1cb34759b) | 31482599 | ✅ 0x1 | 24,739 |

The executor detected the `0x0` from the receipt, classified it permanent (no
retry — one and only one attempt), transitioned `RUNNING → COMPENSATING`, and ran
both compensations. Before/after token balance: **1,000,000 LKTEST → 1,000,000
LKTEST** — every wei of dust restored. Final chain state: `locked=0`,
`allowance=0`, `settled=false`.

## 5. Run C — mid-step crash → resume (`SUCCEEDED`, idempotency proof)

`runs/t06-run-c-20261016-063734/` · dust = 1000 wei LKTEST · `plan.json` records
the run's intent so a later process can rebuild it.

The executor was hard-killed with `os._exit(137)` — no cleanup, no persist,
SIGKILL-like — **between BROADCAST and CONFIRMING of the approve step**. A
second invocation (`python3 scripts/saga.py resume t06-run-c-20261016-063734`)
replayed the state log, found approve's in-flight tx, re-read its receipt from
the chain (0x1, block 31486478), and continued — never re-broadcasting it.

| # | Step | Tx | Block | Status | Note |
|---|---|---|---|---|---|
| 1 | approve(fixture, 1000) | [`0x96d304d5…16a14`](https://atlantic.pharosscan.xyz/tx/0x96d304d53c427e155d157a0234297f63b494c18f6317bf616a77bf9f88d16a14) | 31486478 | ✅ 0x1 | broadcast pre-crash; receipt re-read at resume |
| 2 | lock(1000) | [`0x609b2b06…8bf0b6`](https://atlantic.pharosscan.xyz/tx/0x609b2b06be22646c82d7b6bcacbac8170a38edbd0e9d53ff3675832e4c8bf0b6) | 31486635 | ✅ 0x1 | |
| 3 | execute(minOut=1000) | [`0xd9e4fb6d…4e5cc62`](https://atlantic.pharosscan.xyz/tx/0xd9e4fb6dc7c8d998ec0c532cb73211bd2ab927f04881f55ab0273db9c4e5cc62) | 31486759 | ✅ 0x1 | |
| 4 | settle() | [`0x9a93fe34…ea75`](https://atlantic.pharosscan.xyz/tx/0x9a93fe34fae224cf9ca3e229b3d90a52c94eeeb8379cc09c7f8cb2918f97ea75) | 31486778 | ✅ 0x1 | |

The idempotency claim is auditable in the log itself: exactly **one**
BROADCAST line carries approve's tx hash across both invocations; the resume
appends a `RESUMED` marker, not a second broadcast. If the in-flight tx had
never landed, the resume would have re-broadcast through the normal retry
policy — that branch is unit-tested and documented in the code, not faked.

## 6. Failure forensics (Run B — pure reads, zero new spend)

- **Revert reason:** `TestFixture: minOut exceeds locked balance`, confirmed
  by replaying `execute(2001)` from the deployer against block 31482533 —
  the exact pre-failure state.
- **Finality:** the 0x0 receipt (block 31482534) sits 3,730 blocks deep —
  no re-org can move it.
- **Compensation latency:** failure @31482534 → refund @31482558 (24 blocks)
  → revoke @31482599 (41 blocks).

## 7. Honest-rollback doctrine

Finalized transactions cannot be undone — there is no "rollback", only forward
compensating transactions. What compensation recovers here: the locked dust
(`refund()`) and the granted allowance (`approve(0)`). What it can never recover:
**gas** — the failed `execute` burned 24,231 gas and every compensation tx costs
gas too. The spend log in `evidence.json` accounts for every wei. If a
compensation tx itself failed, the saga would land in `COMPENSATION_FAILED` and
the manual runbook in `REVIEWER_NOTES.md` takes over.

## 8. Evidence — verify it yourself

- `cast receipt 0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05 --rpc-url https://atlantic.dplabs-internal.com` → `status 0 (failed)`
- Revert reason, replayed against the pre-failure state (pure read):
  `cast call 0x29bf11Cd948CE845687A21819b2844d5321432Cf "execute(uint256)" 2001 --from 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --block 31482533` → `execution reverted: TestFixture: minOut exceeds locked balance`
- State logs: `runs/t06-run-a-*/state.log`, `runs/t06-run-b-*/state.log`,
  `runs/t06-run-c-*/state.log` (every transition, tx hash, and gate decision,
  timestamped; the crash run ends its first invocation on a BROADCAST line)
- Machine-readable everything: `evidence.json` (all txs, blocks, gas, forensics, spend log)
- Contracts: [`TestToken`](https://atlantic.pharosscan.xyz/address/0x1F3fb438824140b7E1125502f80B686D95072939) ·
  [`TestFixture`](https://atlantic.pharosscan.xyz/address/0x29bf11Cd948CE845687A21819b2844d5321432Cf) —
  source in `src/`, deployed from this repo
- 26 tx links (13 canonical + 2 deploys + 2 aborted + 9 auditor re-verification)
  + 2 contract links, all curl-tested (HTTP 200, server-rendered HTML with the
  hash in-page) — see `LINKS.md`

## 9. Reproduce

```bash
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ~/workspace/lightkeeper/.env; set +a
cd ~/workspace/lightkeeper/tasks/t06-saga-executor

# unit tests: receipt classifier, retry table, state machine, gates, resume parser (no chain writes)
python3 scripts/saga.py --selftest

# full-success saga (dust wei)
python3 scripts/saga.py run-a 1000

# forced-failure saga -> compensation (dust wei)
python3 scripts/saga.py run-b 2000

# crash-recovery saga: hard-kills itself mid-step, then resume completes it
python3 scripts/saga.py run-c 1000 --kill-after approve   # exits 137: the crash is real
python3 scripts/saga.py resume t06-run-c-<run-id>          # -> SUCCEEDED, one broadcast/step
```

Every broadcast goes through `flock /tmp/lk-nonce.lock` (28 workers share one
key). Total T06 spend ≈ **0.00271 PHRS** (budget 0.15) — see `evidence.json`.

## 10. Files

| Path | What |
|---|---|
| `task.yaml` | task frontmatter |
| `REQUIREMENTS.md` | official T06 requirements, quoted verbatim |
| `src/TestToken.sol` / `src/TestFixture.sol` | fixture contracts (named Test*, never Mock*) |
| `scripts/saga.py` | the executor: state machine, retry policy, gates, compensations, crash/resume, selftests |
| `runs/<run-id>/{state.log,plan.json,run.json}` | per-run state log + resume plan + machine summary |
| `evidence.md` / `evidence.json` | human + machine evidence, real tx hashes, forensics, spend log |
| `REVIEWER_NOTES.md` | what to check, known limits, manual runbook |
| `LINKS.md` | every published link, curl-verified |
| `SUBMISSION.md` | copy-paste Arena submission pack |
| `VIDEO-GUIDE.md` | 45–120s filming guide (real terminal + real explorer) |
