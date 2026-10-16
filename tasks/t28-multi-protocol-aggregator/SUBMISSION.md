# SUBMISSION.md — T28 Multi-Protocol Aggregator (Arena copy-paste pack)

> Paste each section into the matching Arena submission field.
> Video link: PENDING-VIDEO (film per VIDEO-GUIDE.md, then paste).

## Title

T28 — Multi-Protocol Aggregator (LIGHTKEEPER)

## One-liner

One interface over three live Atlantic venues — two vaults and a lending
pool — with explained routing, unsigned action preparation, and degraded-mode
proof.

## Description

A multi-protocol aggregator on Pharos Atlantic testnet (chain 688689).
`aggregate.py` is a single facade over N fault-isolated venue adapters bound
by a local `registry.json` to real, bytecode-verified contracts (verified by
a discovery run, never hard-coded).

- **Integrates 3 venues / 2 protocol types behind one interface:**
  MeridianVault (2.5% target APY) `0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9`,
  HalcyonVault (5.2% target APY) `0x6F34a6f94f529Bf10313bA77cc34314389Dd204E`,
  TidepoolLending (utilization-rate curve) `0x95a16e1898B09CcE5e03765Baa55C8C112cb80C2`.
  Sibling LIGHTKEEPER tasks had deployed nothing on-chain at build time, so
  they are recorded as PENDING in the registry — coverage is honest, not invented.
- **Queries + actions:** one run pins a block and reads all venues (TVL, APYs,
  share price, utilization) into a normalized report with a capital-efficiency
  / risk comparison view. Actions are **prepared for signature only**:
  unsigned tx JSON + gas estimate + eth_call dry-run revert gate — the tool
  cannot broadcast.
- **Explained routing:** `route --intent deposit` → HalcyonVault (5.20% >
  2.50% > 0.74%, block 31482335), every venue's verdict traced to a live
  quote row; `route --intent borrow` → TidepoolLending (vaults rejected with
  reason).
- **One protocol down:** labeled chaos run forces a venue to a dead address →
  marked UNREACHABLE with reason, never zero-filled; the other two aggregate
  and re-rank in the same run.
- **Architecture write-up:** `ARCHITECTURE.md` (failure-modes table included).

## Repo link (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/2972d1c/tasks/t28-multi-protocol-aggregator

## Proof link (tx hashes)

Deploys:
- https://atlantic.pharosscan.xyz/tx/0x3aca9fd713c1e6ed6115a59d6c29fb2b5db5730a23314b26c8bf371e8db2068c (MeridianVault)
- https://atlantic.pharosscan.xyz/tx/0xf8dc82032cfeb28e8ba2eccba750ef87f16e579984898e6cd5c67da8024ec204 (HalcyonVault)
- https://atlantic.pharosscan.xyz/tx/0xd655bfbb05911975959765a6f0524c21d5aea7f1c1267050af9e19170cc82c08 (TidepoolLending)

Seeds:
- https://atlantic.pharosscan.xyz/tx/0x9c2deda596d4540fcd6d9d3bb252f607b381ec8b254426864b450bda80229ea3 (deposit 0.002 → VaultA)
- https://atlantic.pharosscan.xyz/tx/0x6110d2b6647c66f8f4d09ba0718487d1619ea1c2287b0736f23bc91336e85f8e (deposit 0.001 → VaultB)
- https://atlantic.pharosscan.xyz/tx/0xb659cc39c0eed3073ec60355c0209d0b2b9b69f1fec10cec825c6c5a37abaf78 (supply 0.003 → Lending)
- https://atlantic.pharosscan.xyz/tx/0x4be7a81774e69accbe81cc609b539117853cb168dbf1e6de0603cfa08d93d3e6 (borrow 0.0005 ← Lending)

Aggregation run: block https://atlantic.pharosscan.xyz/block/31482191
(full report: `runs/aggregation-report-block-31482191.json` in repo)

## Video link

PENDING-VIDEO

## Console — try it live (Tier A)

Deployed on the LIGHTKEEPER console: `apps/console/src/components/try/multi-protocol-aggregator.tsx`.
One view over every venue — reads all three live venue contracts on Atlantic
via `eth_call` pinned to one block (TVL, APYs, share price, utilization,
liquidity depth), normalizes into one table, ranks the venues for a deposit or
borrow intent the visitor configures, and shows the explained router verdicts
(per-venue SELECTED / passed-over lines with the numbers, including the
percentage-point gap behind the winner).
A venue whose read fails — or whose address holds no bytecode (checked with
`eth_getCode` before every read) — is marked UNREACHABLE, never zero-filled.
The board also carries the capital-efficiency column and the risk flags from
the same live reads (ELEVATED / THIN / small-vault notes, same thresholds as
`aggregate.py risk_flags()`). Every error is a plain-language message with a
retry; no dead ends.
Quotes only: no wallet, no signature, no execution in the browser; the run
command stays CLI.

## Reviewer notes (paste)

All 7 transactions are real Atlantic testnet writes (dust scale, 0.00212 PHRS
gas total, under the 0.15 budget). The aggregator itself never signs or
broadcasts. Unit tests: 10/10 (`python3 -m pytest tests/ -q`, no network).
Honest gaps: venues are minimal purpose-built contracts at dust scale;
sibling tasks are PENDING in the registry (nothing faked); video slot pending.
Full reviewer brief: REVIEWER_NOTES.md in repo.
