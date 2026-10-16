# T15 — SUBMISSION PACK (copy-paste ready for the Pharos Agent Arena)

> Paste the sections below into the per-task submission form. The repo link is
> commit-pinned — fill `ec2a9b4d1bd18e7d2dbcb20f3e8197767e760e89` after the T15 commit lands.

---

## Title

T15 · Yield Optimizer — the honest one (LIGHTKEEPER)

## One-liner

A yield optimizer that first proves the venue set is empty, then beats APY theater
with net math: live on-chain rate cards, gas + fee + holding-period accounting, and a
"stay put" answer when everything nets negative. Testnet mechanics demonstration.

## Description

**What it does.** T15 compares ≥3 yield sources on live Atlantic-testnet data and
outputs a recommendation with expected net gain — or "stay put" with a reason:

1. **Discovery first.** `optimizer/discover.py` enumerates real yield venues on
   Atlantic via `eth_getCode` probes (positive controls included) + a 30-block
   activity scan. Finding: **zero third-party venues exist** — documented as the
   result, not hidden.
2. **Real on-chain rate cards.** Two builder-deployed, fully-disclosed staking vaults
   (`src/OctopusVault.sol`) with immutable schedules — Kelp: 1e13 wei/block, 0 bps
   entry, 50 bps early exit, 100-block hold; Kraken: 2.5e13 wei/block, 100 bps entry,
   100 bps early exit, 400-block hold — both funded with 0.01 PHRS. All math on-chain,
   rewards capped by the funded pool (`runwayBlocks()` is a view).
3. **Net math, not APY ranking.** `net(H) = gross − entryFee − exitFee(H) − gas`
   with live gas price, estimated gas, and measured block time. Gross is
   **runway-capped**: Kraken's 2.5× rate only funds 400 blocks, so Kelp wins the
   1,000-block comparison on net (+0.006924 vs +0.006690 PHRS). At 50 blocks every
   venue nets negative → honestly **STAY PUT**.
4. **User-signature-only execution.** `optimizer/prepare.py` emits an unsigned
   deposit tx (`signed: false`, no v/r/s); a CI grep gate proves the module holds
   no keys and cannot sign.

**Evidence.** Vault deploys, live scan at pinned block 31482643, recommendation with
full net-gain math, stake → claim → withdraw run with balance deltas equal to
`(claimBlock − stakeBlock) × rewardPerBlock` to the wei. 8 forge + 12 Python tests.

**Honesty label.** Testnet mechanics demonstration — rewards are valueless testnet
PHRS, never real yield. APY figures are illustrative at dust scale; decisions are
made on net.

## Repo link (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/ec2a9b4d1bd18e7d2dbcb20f3e8197767e760e89/tasks/t15-yield-optimizer

## Proof links

- Deploy Kelp: https://atlantic.pharosscan.xyz/tx/0x91c13f9cb3e4df65c7d7b23218bb04241ee0cc66a8b0180a16db617b1240feb9
- Deploy Kraken: https://atlantic.pharosscan.xyz/tx/0x1d01194b335186295860624f6f94f6d6af19c856a9ffcd29d009deaa2601edbd
- Kelp contract: https://atlantic.pharosscan.xyz/address/0xe3212234B17A90cCBC36b0B44845394b62838b08
- Kraken contract: https://atlantic.pharosscan.xyz/address/0xDC3D4a3f47BB479692239ECC362a16CE3485B283
- Stake / claim / withdraw txs: appended to evidence.md when the queued run executes
  (nonce-lock contention with T24 noted honestly in REVIEWER_NOTES.md)

## Video

PENDING-VIDEO — filming guide: VIDEO-GUIDE.md (45–90s, real terminal + real explorer,
no staged fakes)
