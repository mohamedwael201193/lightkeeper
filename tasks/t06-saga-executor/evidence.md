# T06 Saga Executor — Evidence

All transactions on **Atlantic testnet (chain 688689)**. Explorer:
`https://atlantic.pharosscan.xyz`. Every link below was curl-tested
(HTTP 200, server-rendered HTML containing the hash) — see `LINKS.md`.
Machine-readable version: `evidence.json`.

## Contracts (both source-verified on the explorer)

| Contract | Address | Deploy tx | Verify GUID |
|---|---|---|---|
| TestToken (LKTEST, 18dp, 1M supply) | [`0x1F3fb438824140b7E1125502f80B686D95072939`](https://atlantic.pharosscan.xyz/address/0x1F3fb438824140b7E1125502f80B686D95072939) | [`0x980d7216…aca78`](https://atlantic.pharosscan.xyz/tx/0x980d72167fea7733d6da0f372718ac578f2cdd1c92cea951ee82510ab8daca78) (block 31481184) | `61c70c9272a26451f89e03aa0fd625849727446c3b9b5095c1851d6b2fb88912` |
| TestFixture | [`0x29bf11Cd948CE845687A21819b2844d5321432Cf`](https://atlantic.pharosscan.xyz/address/0x29bf11Cd948CE845687A21819b2844d5321432Cf) | [`0x63e814e8…89c3`](https://atlantic.pharosscan.xyz/tx/0x63e814e827e57b23bc0f4e6951d7b60188256f585db807aee0d463300c0f89c3) (block 31481203) | `616f0aacadc197b452853f69360e27cd07cb6cfb3ebb204200a7a32680790e60` |

## Run A — full success → `SUCCEEDED`

`runs/t06-run-a-20261016-040851/` · dust 1000 wei

| Step | Tx | Block | Receipt |
|---|---|---|---|
| approve(fixture, 1000) | [`0x30183882…1763a75`](https://atlantic.pharosscan.xyz/tx/0x30183882c8021b6daa017b03d5eecca595bf7faa2128e25eb59ad530e1763a75) | 31481355 | ✅ 0x1 |
| lock(1000) | [`0xe46a8c40…250256587`](https://atlantic.pharosscan.xyz/tx/0xe46a8c40db9656ecb37baf933f1d6044a0e13a03bfdf7e9e03b022d250256587) | 31481383 | ✅ 0x1 |
| execute(minOut=1000) | [`0x9c259838…100cd43`](https://atlantic.pharosscan.xyz/tx/0x9c2598384dfdbfd688bbd42e4006308decd455a1940bac95da6d2c529100cd43) | 31481413 | ✅ 0x1 |
| settle() | [`0xa13311d2…09ca5873`](https://atlantic.pharosscan.xyz/tx/0xa13311d24cd0aff5eb91c389f14b22e9be8f9cab7958583d00d7785b09ca5873) | 31481460 | ✅ 0x1 |

## Run B — forced failure → `COMPENSATED` (canonical)

`runs/t06-run-b-20261016-042903/` · dust 2000 wei

| Step | Tx | Block | Receipt |
|---|---|---|---|
| approve(fixture, 4000) | [`0x452acae1…a928ba7`](https://atlantic.pharosscan.xyz/tx/0x452acae1ec4335ecd0842672c97383b5671e1ad950150224f307dcd17a928ba7) | 31482444 | ✅ 0x1 |
| lock(2000) | [`0x0371814a…76f0eea`](https://atlantic.pharosscan.xyz/tx/0x0371814a1739f58698722db4915da1b718512c9bafcb347da3def4a6576f0eea) | 31482492 | ✅ 0x1 |
| **execute(minOut=2001) — impossible** | [`0x91f7e021…f819b05`](https://atlantic.pharosscan.xyz/tx/0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05) | 31482534 | ❌ **0x0 (failed)** |
| compensate: refund() | [`0xe6cac311…fbb60ca`](https://atlantic.pharosscan.xyz/tx/0xe6cac3114397487f6d1b1efec721af968ee8868e196a9d5f6437d35b9fbb60ca) | 31482558 | ✅ 0x1 |
| compensate: revoke approve(0) | [`0x0e807191…34759b`](https://atlantic.pharosscan.xyz/tx/0x0e80719119b7fb8781020e5a7fa0fcec01eeec167caa7329ac6781f1cb34759b) | 31482599 | ✅ 0x1 |

Verify the failure yourself:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cast receipt 0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05 \
  --rpc-url https://atlantic.dplabs-internal.com | grep -E '^(status|blockNumber)'
# status  0 (failed)
# blockNumber  31482534
```

**Before/after balances (compensation proof):**
LKTEST balance 1,000,000 → 1,000,000 (every wei restored).
Final chain state: `locked=0`, `allowance=0`, `settled=false`.

## Run C — mid-step crash → resume → `SUCCEEDED` (idempotency proof)

`runs/t06-run-c-20261016-063734/` · dust 1000 wei · plan in `plan.json`

The risk flagged in REVIEWER_NOTES ("kill-mid-CONFIRMING restart test") is now
a real run, not a plan: the executor was hard-killed with `os._exit(137)`
(no cleanup, no persist — SIGKILL-like) **between BROADCAST and CONFIRMING of
the approve step**. A second invocation (`python3 scripts/saga.py resume
t06-run-c-20261016-063734`) replayed the state log: it found approve's
in-flight tx, re-read its receipt from the chain (0x1, block 31486478), and
continued the saga — **never re-broadcasting it**.

| Step | Tx | Block | Receipt | Note |
|---|---|---|---|---|
| approve(fixture, 1000) | [`0x96d304d5…16a14`](https://atlantic.pharosscan.xyz/tx/0x96d304d53c427e155d157a0234297f63b494c18f6317bf616a77bf9f88d16a14) | 31486478 | ✅ 0x1 | broadcast pre-crash; receipt re-read at resume |
| lock(1000) | [`0x609b2b06…8bf0b6`](https://atlantic.pharosscan.xyz/tx/0x609b2b06be22646c82d7b6bcacbac8170a38edbd0e9d53ff3675832e4c8bf0b6) | 31486635 | ✅ 0x1 | |
| execute(minOut=1000) | [`0xd9e4fb6d…4e5cc62`](https://atlantic.pharosscan.xyz/tx/0xd9e4fb6dc7c8d998ec0c532cb73211bd2ab927f04881f55ab0273db9c4e5cc62) | 31486759 | ✅ 0x1 | |
| settle() | [`0x9a93fe34…ea75`](https://atlantic.pharosscan.xyz/tx/0x9a93fe34fae224cf9ca3e229b3d90a52c94eeeb8379cc09c7f8cb2918f97ea75) | 31486778 | ✅ 0x1 | |

**Idempotency evidence:** the state log contains exactly **one** BROADCAST
line carrying a tx hash for approve, across both invocations (the resume
appends a RESUMED marker, not a second broadcast). Saga state: `SUCCEEDED`.
Run spend: 0.0001995 PHRS.

## Failure forensics (Run B, zero new spend — pure reads)

- **Revert reason:** `TestFixture: minOut exceeds locked balance` — confirmed
  by replaying `execute(2001)` from the deployer against block 31482533
  (the pre-failure state); on-chain `Error(string)` payload
  `0x08c379a0…`.
- **Finality depth:** the 0x0 receipt (block 31482534) is 3,730 blocks deep
  (measured at block 31486264) — no re-org can move it.
- **Compensation latency:** failure mined @31482534 → refund @31482558 (24
  blocks) → revoke @31482599 (41 blocks). The executor detected the 0x0,
  classified it permanent, and finished both compensations within 41 blocks.
- Machine-readable: `evidence.json` → `forensics`.

## Aborted first attempt (honest record)

`t06-run-b-20261016-041144`: the forced `execute()` could not be broadcast —
`cast`'s client-side `eth_estimateGas` reverts on a deliberately-reverting call
and aborts before any tx reaches the chain (4 attempts, 0 txs mined). Its
approve/lock are real:
[`0xf0cd0b23…be35a7`](https://atlantic.pharosscan.xyz/tx/0xf0cd0b23720490f95e870e5b43799c748f47a33883e1e7b5e5ef23a820be35a7)
(block 31481551),
[`0xcba5e834…b1dbbb`](https://atlantic.pharosscan.xyz/tx/0xcba5e834fb142d4151fb59b80baeb0d7e83d18e9f68c222f7a89116c90b1dbbb)
(block 31481613).
Fix: explicit `--gas-limit` on failure-broadcast steps (see README §2); re-ran
as the canonical Run B above.

## Spend log

Receipt-based accounting (Σ gasUsed × effectiveGasPrice over T06's own 13 txs;
wallet deltas are not used — 27 other workers share the key):

| Bucket | PHRS |
|---|---|
| 2 contract deployments | 0.001666238001666238 |
| Run A (4 txs) | 0.000199487000199487 |
| Aborted Run B attempt (2 txs) | 0.000092769000092769 |
| Canonical Run B (5 txs) | 0.000218299000218299 |
| Run C (4 txs, crash → resume) | 0.000199487000199487 |
| **Total** | **0.00237628000237628** (budget 0.15) |

Gas is unrecoverable by design: the forced `0x0` burned 24,231 gas; both
compensation txs cost gas. Reported, not hidden.

## Unit tests

`python3 scripts/saga.py --selftest` — 25 cases, ALL PASSED:
receipt-status classifier (0x1/0x0/int forms + fixture receipts), retry decision
table (permanent→compensate; transient→retry 5/15/45s ×1.20/×1.44/×1.728 then
give_up), state-machine states, gate helper, forced-failure arithmetic,
gas-limit bypass flag on failure-broadcast steps, **resume-point log parser**
(crashed-step detection, terminal-log refusal, FAILED_PERMANENT refusal).
