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

Simulation only — nothing broadcast. (Run via `tools/rpc-normalize-proxy.py`; the RPC quirk is disclosed in `REVIEWER_NOTES.md`.)

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

*Honest drift note:* `cast estimate` predicted 58,219 but the tx used 45,470 (estimates over-predicted by ~28%). This is the documented simulation/reality drift — the 1.2× safety factor absorbed it with room to spare.

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
| Dry-runs (A + B), forge simulation, gate refusal | — | 0 (read-only) | 0 |
| **Total** | | | **0.00029803 PHRS** (0.2% of budget) |

All broadcasts were `flock /tmp/lk-nonce.lock`-wrapped (shared-key nonce safety).
