# T15 — SUBMISSION PACK (copy-paste ready for the Pharos Agent Arena)

---

## Title

T15 · Yield Optimizer — the honest one (LIGHTKEEPER)

## One-liner

A yield optimizer that first proves the venue set is empty, then beats APY theater
with net math: live on-chain rate cards, gas + fee + holding-period accounting, and a
"stay put" answer when everything nets negative. Testnet mechanics demonstration.

## Description

**What it does.** T15 compares 2 live yield venues plus an honest 0% stay-put baseline on live Atlantic-testnet data and
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

https://github.com/mohamedwael201193/lightkeeper/tree/dc949c522fa32ccd7e66198e9e82fa8fb517c9e0/tasks/t15-yield-optimizer

## Proof links

- Deploy Kelp: https://atlantic.pharosscan.xyz/tx/0x91c13f9cb3e4df65c7d7b23218bb04241ee0cc66a8b0180a16db617b1240feb9
- Deploy Kraken: https://atlantic.pharosscan.xyz/tx/0x1d01194b335186295860624f6f94f6d6af19c856a9ffcd29d009deaa2601edbd
- Kelp contract: https://atlantic.pharosscan.xyz/address/0xe3212234B17A90cCBC36b0B44845394b62838b08
- Kraken contract: https://atlantic.pharosscan.xyz/address/0xDC3D4a3f47BB479692239ECC362a16CE3485B283
- Stake Kelp (0.02 PHRS): https://atlantic.pharosscan.xyz/tx/0x67784abb03a93435cb9d818c390ee6542454050d506e921e01aa086dfdd8d0c5
- Stake Kraken (0.01 PHRS): https://atlantic.pharosscan.xyz/tx/0x01e6ce14c573c0f5493f222e05c13cb69f8aae478b12b9462be988a28cf6c766
- Claim Kelp (1,410,000,000,000,000 wei = 141 blocks × 1e13, exact): https://atlantic.pharosscan.xyz/tx/0x6452e916d88b5eb7ace2513f0cc49d61df927bfb342344e22f8565f198ea44e2
- Claim Kraken (3,524,999,999,999,999 wei, exact vs on-chain formula): https://atlantic.pharosscan.xyz/tx/0x6decfa5ca770bd7cab1ae08425a6f726032b794f4beeaa70ef01e18d9b73da09
- Withdraw Kelp (fee-free after hold): https://atlantic.pharosscan.xyz/tx/0x11714e6f6b1cbe8686b6a5ee2d6830a55873b5c660b03b0abb5e5c57af87d9d2
- Withdraw Kraken (1% early-exit fee, event-verified): https://atlantic.pharosscan.xyz/tx/0x3dc2ac6890497f640ac6aecda7be65d1f8c6b343fbfd7d084770d244eeec6e32

## Video

PENDING-VIDEO (45–90s, real terminal + real explorer,
no staged fakes)

## Console interactive surface (deepened 2026-10-16)

- Module: `apps/console/src/components/try/yield-optimizer.tsx` — Tier A, live reads
  only (no wallet, no signature, costs nothing).
- **"Vaults, live — net math, not APY theater":** reads both OctopusVault rate cards
  off Atlantic via `eth_call` (rewardPerBlock, entry/exit fees, min hold, totalStaked,
  rewardPool, runwayBlocks) **plus live `eth_gasPrice`**, shows the cards side by side,
  and re-runs the optimizer's ACTUAL decision rule live —
  `net(H) = runway-capped gross − entryFee − exitFee(H) − gas` — against a stay-put
  (0%) baseline. Gas per venue = measured live-run tx gas × live gas price; marginal
  pro-rata share computed in integer wei like the contract.
- **Stake-size (0.01/0.02/0.05 PHRS) × holding-period (100/400/1000 blocks) selectors.**
  Live on today's gas price the three horizons give three different honest answers:
  100 blocks → STAY PUT (friction eats everything), 400 → Kraken (rate wins),
  1000 → Kelp (runway cap flips the 2.5× APY ranking). The verdict narrative is
  computed from live chain state — it says "stay put" when everything nets negative
  and explains the flip only when the cap actually flips the ranking.
- **On-chain proof strip:** deploy txs + the exact-wei claim tx as explorer links.
- Differentiator: the winner chip is computed from live chain state at page-load time —
  not a screenshot of a past run.
