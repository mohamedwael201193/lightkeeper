# T08 — Evidence (all real, Atlantic testnet chain 688689)

Wallet: `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` · Probe: `0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f`
Machine-readable companion: `evidence.json`. Every explorer link below returned **HTTP 200** on 2026-10-16 (see `LINKS.md`).

## Setup — probe deployment (1 real tx)

| Item | Value |
|---|---|
| Contract | `DryRunProbe` (`contracts/DryRunProbe.sol`) — `boom()` always reverts, `ping()` increments `count` + emits `Pinged` |
| Deploy tx | [`0xbb5facf81cd46d97cdb706ef2ecf6ecda70cd7cb32133b2ba5ed1a08b4748e44`](https://atlantic.pharosscan.xyz/tx/0xbb5facf81cd46d97cdb706ef2ecf6ecda70cd7cb32133b2ba5ed1a08b4748e44) |
| Block | 31481306 · gas used 252,561 · status success |
| Log | `runs/deploy.log` |

## Scenario A — dry-run PREDICTS A REVERT, gate blocks execution

**Dry-run** (`runs/dryrun-A.log`, receipt `runs/receipt-A.json`, block 31481344):

```
[dry-run] FAIL  revert reason: DryRunProbe: forced boom, data: "0x08c379a0..."
[dry-run] GATE: execution BLOCKED — no broadcast will be attempted.
```

- `cast estimate` on `boom()` failed; the exact revert reason **`DryRunProbe: forced boom`** was extracted from the `Error(string)` payload (`0x08c379a0…`) — decoded, never invented.
- Receipt status `FAIL`; no gas estimate issued; projected after-state = unchanged.

**Gate proof** — the FAIL ticket was deliberately fed to the broadcaster:

```
$ python3 src/broadcast.py --receipt runs/receipt-A.json ...
[2026-10-16T04:09:42Z] EXECUTION REFUSED receipt=runs/receipt-A.json
  reason=ticket status is 'FAIL' (need PASS); revertReason=DryRunProbe: forced boom, ...
exit code: 2
```

Logged in `runs/blocked-execution.log`. **No transaction was broadcast for `boom()`** — there is nothing on the explorer to link, which is itself the evidence the gate fired.

## Scenario B — dry-run PREDICTS SUCCESS, real broadcast matches

**Dry-run** (`runs/dryrun-B.log`, receipt `runs/receipt-B.json`, block 31481413):

```
[dry-run] PASS  gas=58219 limit(1.2x)=69863 predictedCost=0.00069863 PHRS
```

- `cast call` succeeded; `cast estimate` → 58,219 gas; 1.2× safety limit → 69,863; gas price 10 gwei → predicted cost 0.00069863 PHRS.
- Before-state snapshot: `count = 0`; projected after: `count = 1`, "chain unmodified".

**Forge-script contract flow, no broadcast** (`runs/forge-dryrun.log`):

```
Script ran successfully.
...
Estimated total gas used for script: 62804
SIMULATION COMPLETE. To broadcast these transactions, add --broadcast ...
```

Simulation only — nothing broadcast. (Run via `tools/rpc-normalize-proxy.py`; the RPC quirk root-cause is in README §6.)

**Real broadcast** through the gate (`runs/broadcast-B.log`):

| Item | Value |
|---|---|
| Tx | [`0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee`](https://atlantic.pharosscan.xyz/tx/0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee) |
| Status | 1 (success) — matches predicted PASS |
| Block | 31481387 |
| Gas used | **45,470** — within the predicted 1.2× limit of 69,863 ✓ |
| Gas limit sent | 69,863 (exactly the receipt's 1.2× value, replayed by the gate) |
| Event | `Pinged(0xf76e…71a3, 1)` |
| State | probe `count`: **0 → 1**, exactly as projected |

**Prediction vs reality:** status PASS→success ✓ · gas 45,470 ≤ 69,863 limit ✓ · state 0→1 ✓.

## Scenario C — repeatability: the prediction holds a SECOND time

**Dry-run** (`runs/receipt-C.json`, block 31486270) — the same `ping()` call, fresh chain state:

```
[dry-run] PASS  gas=37379 limit(1.2x)=44855 predictedCost=0.00044855 PHRS
```

Before-state snapshot: `count = 1` (left there by Scenario B); projected after: `count = 2`.

**Gate re-test:** `broadcast.py` pointed at the fresh FAIL receipt (`runs/receipt-A-rerun.json`) → **EXECUTION REFUSED** (exit 2), appended to `runs/blocked-execution.log`.

**Real broadcast** through the gate (`runs/broadcast-C.log`):

| Item | Value |
|---|---|
| Tx | [`0xd294bb5c03c55d7ffdd750b0a20384aa393e490da11fe3d7f67845d34d34fb03`](https://atlantic.pharosscan.xyz/tx/0xd294bb5c03c55d7ffdd750b0a20384aa393e490da11fe3d7f67845d34d34fb03) |
| Status | 1 (success) — matches predicted PASS |
| Block | 31486429 |
| Gas used | **28,370** — within the predicted 1.2× limit of 44,855 ✓ |
| Gas limit sent | 44,855 (exactly the receipt's 1.2× value, replayed by the gate) |
| Event | `Pinged(0xf76e…71a3, 2)` |
| State | probe `count`: **1 → 2**, exactly as projected |

**Prediction vs reality:** status PASS→success ✓ · gas 28,370 ≤ 44,855 limit ✓ · state 1→2 ✓.

## The prediction ledger

One-shot proof is easy to cherry-pick, so the executor keeps score: every gated
broadcast appends a prediction-vs-reality row to
[`runs/prediction-ledger.jsonl`](runs/prediction-ledger.jsonl) — automatically
via `tools/ledger.py`, invoked by `src/broadcast.py` after each success.

| Tx | Est | Used | Drift | Limit | Status |
|---|---|---|---|---|---|
| `0x639f87…012ee` | 58,219 | 45,470 | +28.0% | 69,863 ✓ | success |
| `0xd294bb…4fb03` | 37,379 | 28,370 | +31.8% | 44,855 ✓ | success |

*Honest drift note, now measured across two broadcasts:* `cast estimate` over-predicts by ~30% on Atlantic. The 1.2× safety factor exists precisely for this drift — both txs fit inside their limits with margin. Estimates are predictions; now with public drift data.

## Unit tests

`tests/test_estimation_parsing.py` — **17/17 pass**, no network, no key:
cast-output parsing (success integer, revert-reason extraction, hex-payload decoding),
`Error(string)` / `Panic(0x11)` / custom-error decoding, 1.2× gas math + cost math,
gate rules (PASS allowed; FAIL/ERROR/missing blocked), and the no-signer-in-dryrun structural check.

## Spend log (budget 0.15 PHRS)

| What | Tx | Gas | Cost (PHRS) |
|---|---|---|---|
| Deploy DryRunProbe | `0xbb5fac…4748e44` | 252,561 @ 1.000000001 gwei | 0.0002525610 |
| Scenario B broadcast (`ping`) | `0x639f87…012ee` | 45,470 @ 1.000000001 gwei | 0.0000454700 |
| Scenario C broadcast (`ping`, second PASS ticket) | `0xd294bb…4fb03` | 28,370 @ 1.000000001 gwei | 0.0000283700 |
| Dry-runs (A + B + C), forge simulation, gate refusals | — | 0 (read-only) | 0 |
| **Total** | | | **0.00032640 PHRS** (0.2% of budget) |

All broadcasts were `flock /tmp/lk-nonce.lock`-wrapped (shared-key nonce safety).
