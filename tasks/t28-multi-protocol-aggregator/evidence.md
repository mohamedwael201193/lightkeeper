# T28 — Evidence

All figures below are real: 7 confirmed transactions on Pharos Atlantic
testnet (chain 688689), one full live aggregation run at a pinned block, and
a labeled chaos run. Machine-readable: `evidence.json`.

## Transactions (7 real, all confirmed)

| # | Kind | Tx hash | Explorer |
|---|---|---|---|
| 1 | Deploy `SimpleVault("MeridianVault", 250)` → `0x5543fb53…7f0D3d9` | `0x3aca9fd713c1e6ed6115a59d6c29fb2b5db5730a23314b26c8bf371e8db2068c` | [tx](https://atlantic.pharosscan.xyz/tx/0x3aca9fd713c1e6ed6115a59d6c29fb2b5db5730a23314b26c8bf371e8db2068c) |
| 2 | Deploy `SimpleVault("HalcyonVault", 520)` → `0x6F34a6f9…89Dd204E` | `0xf8dc82032cfeb28e8ba2eccba750ef87f16e579984898e6cd5c67da8024ec204` | [tx](https://atlantic.pharosscan.xyz/tx/0xf8dc82032cfeb28e8ba2eccba750ef87f16e579984898e6cd5c67da8024ec204) |
| 3 | Deploy `SimpleLending("TidepoolLending")` → `0x95a16e18…112cb80C2` | `0xd655bfbb05911975959765a6f0524c21d5aea7f1c1267050af9e19170cc82c08` | [tx](https://atlantic.pharosscan.xyz/tx/0xd655bfbb05911975959765a6f0524c21d5aea7f1c1267050af9e19170cc82c08) |
| 4 | Deposit 0.002 PHRS → T28-VAULT-A | `0x9c2deda596d4540fcd6d9d3bb252f607b381ec8b254426864b450bda80229ea3` | [tx](https://atlantic.pharosscan.xyz/tx/0x9c2deda596d4540fcd6d9d3bb252f607b381ec8b254426864b450bda80229ea3) |
| 5 | Deposit 0.001 PHRS → T28-VAULT-B | `0x6110d2b6647c66f8f4d09ba0718487d1619ea1c2287b0736f23bc91336e85f8e` | [tx](https://atlantic.pharosscan.xyz/tx/0x6110d2b6647c66f8f4d09ba0718487d1619ea1c2287b0736f23bc91336e85f8e) |
| 6 | Supply 0.003 PHRS → T28-LEND | `0xb659cc39c0eed3073ec60355c0209d0b2b9b69f1fec10cec825c6c5a37abaf78` | [tx](https://atlantic.pharosscan.xyz/tx/0xb659cc39c0eed3073ec60355c0209d0b2b9b69f1fec10cec825c6c5a37abaf78) |
| 7 | Borrow 0.0005 PHRS ← T28-LEND | `0x4be7a81774e69accbe81cc609b539117853cb168dbf1e6de0603cfa08d93d3e6` | [tx](https://atlantic.pharosscan.xyz/tx/0x4be7a81774e69accbe81cc609b539117853cb168dbf1e6de0603cfa08d93d3e6) |

## Spend log

2,123,366 gas × ~1 gwei ≈ **0.002123368 PHRS** gas total — 1.4% of the
0.15 PHRS task budget. Per-tx gasUsed/effectiveGasPrice in `evidence.json`
(`spend_log`). Principal: 0.006 PHRS deposited/supplied, 0.0005 PHRS borrowed
back → **0.0055 PHRS sits in the venue contracts, recoverable via
withdraw** — it is not spent.

## Live aggregation run (block 31482191)

`runs/aggregation-report-block-31482191.json` — all three venues read at one
pinned block:

- T28-VAULT-A: TVL 0.002000001 PHRS · supply APY 2.50% · share price 1.000000
- T28-VAULT-B: TVL 0.001000001 PHRS · supply APY 5.20% · share price 1.000001
- T28-LEND: TVL 0.002500000 PHRS · supply APY 0.74% · borrow APY 4.99% ·
  utilization 16.66%

Comparison ranking: VAULT-B > VAULT-A > LEND by live supply APY.
[Block on explorer](https://atlantic.pharosscan.xyz/block/31482191).

## Routing (explained, traced to quote rows)

- `runs/route-deposit.txt` — deposit 0.001 PHRS → winner **T28-VAULT-B**
  (5.20% > 2.50% > 0.74%, block 31482335), each venue's verdict explained.
- `runs/route-borrow.txt` — borrow 0.0001 PHRS → winner **T28-LEND** (only
  lending venue; both vaults REJECTED with reason).

## Actions prepared, never broadcast

- `runs/prepare-supply.txt` — unsigned `supply()` tx for T28-LEND with gas
  estimate and eth_call dry-run **passed**. No broadcast code path exists in
  `aggregate.py`.

## Degraded mode (labeled chaos test)

`runs/chaos-demo.txt` — T28-VAULT-B forced to a dead address at block
31482519: marked **UNREACHABLE** with reason; the other two venues aggregated
normally and the comparison re-ranked (VAULT-A > LEND). Nothing zero-filled.

## Unit tests

`python3 -m pytest tests/ -q` → **10/10 passed** (normalization units, risk
flags, comparison ranking, UNREACHABLE-never-zero-filled, unknown-type
rejection). No network, no keys.

## Registry honesty note

Sibling tasks T02/T07/T10/T15/T16 had deployed nothing on-chain when the
registry was built (sweep of their `evidence.json`/`src`/`broadcast` dirs
found zero deployment addresses). They are recorded as `PENDING` in
`registry.json` — coverage is honest, not invented.
