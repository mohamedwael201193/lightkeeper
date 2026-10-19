# T15 Yield Optimizer — Evidence

> **TESTNET MECHANICS DEMONSTRATION.** Pharos Atlantic testnet (chain 688689) only.
> Rewards are valueless testnet PHRS — never real yield. Dust amounts throughout.
> Budget ≤ 0.15 PHRS. Every link below was curl-tested (HTTP 200).

## Deploys (confirmed)

| | OctopusVault-Kelp | OctopusVault-Kraken |
|---|---|---|
| Address | `0xe3212234B17A90cCBC36b0B44845394b62838b08` | `0xDC3D4a3f47BB479692239ECC362a16CE3485B283` |
| Deploy tx | [0x91c13f9c…feb9](https://atlantic.pharosscan.xyz/tx/0x91c13f9cb3e4df65c7d7b23218bb04241ee0cc66a8b0180a16db617b1240feb9) | [0x1d01194b…edbd](https://atlantic.pharosscan.xyz/tx/0x1d01194b335186295860624f6f94f6d6af19c856a9ffcd29d009deaa2601edbd) |
| Rate card | 1e13 wei/block · 0 bps entry · 50 bps early-exit · 100-block hold | 2.5e13 wei/block · 100 bps entry · 100 bps early-exit · 400-block hold |
| Funding | 0.01 PHRS (constructor) | 0.01 PHRS (constructor) |
| Gas | 992,754 @ 1 gwei = 0.000992755 PHRS | 992,802 @ 1 gwei = 0.000992803 PHRS |

Rate cards verified by direct `eth_call` post-deploy (name/rate/fees/hold/pool all match).
Address pages: [Kelp](https://atlantic.pharosscan.xyz/address/0xe3212234B17A90cCBC36b0B44845394b62838b08) ·
[Kraken](https://atlantic.pharosscan.xyz/address/0xDC3D4a3f47BB479692239ECC362a16CE3485B283)

## Discovery (the empty result IS the finding)

`runs/discovery.json` — method: `eth_getCode` probes (canonical Multicall3: **absent**;
both OctopusVaults as positive controls: **present**, 3,983 bytes) + 30-block activity
scan (5 txs — chain near-idle). Result: `third_party_yield_venues_found: 0`.

## Live scan + recommendation

- `runs/scan.json` — 3 sources at pinned block **31482643**
  ([explorer](https://atlantic.pharosscan.xyz/block/31482643)): live rates, fees,
  holding periods, reward-pool runways, `eth_estimateGas` figures, measured block time.
- `runs/recommendation.json` — **1,000-block horizon: ALLOCATE Kelp** (net +0.006924 PHRS;
  Kraken's 2.5× rate is runway-capped at 400 blocks → net +0.006690). **50-block horizon:
  STAY PUT** (all nets negative — the fee-sensitivity flip, demonstrated not asserted).
- `runs/unsigned_deposit.json` — unsigned Kelp deposit tx (`signed: false`, no v/r/s)
  for user signature.

## Live stake → claim → withdraw run — COMPLETE

Full lifecycle proven on both vaults. Every amount below is event-verified from
receipt logs.

**Stakes** (both status 1):

| | Kelp stake | Kraken stake |
|---|---|---|
| Tx | [0x67784abb…8d0c5](https://atlantic.pharosscan.xyz/tx/0x67784abb03a93435cb9d818c390ee6542454050d506e921e01aa086dfdd8d0c5) | [0x01e6ce14…c766](https://atlantic.pharosscan.xyz/tx/0x01e6ce14c573c0f5493f222e05c13cb69f8aae478b12b9462be988a28cf6c766) |
| Block | 31483596 | 31483602 |
| Principal | 0.02 PHRS | 0.01 PHRS |
| Entry fee (on-chain) | 0 (0 bps) | 0.0001 PHRS (100 bps → reward pool) |
| Net staked | 0.02 PHRS | 0.0099 PHRS |

**Claims** (both status 1) — the yield-math proof:

| | Kelp claim | Kraken claim |
|---|---|---|
| Tx | [0x6452e916…ea44e2](https://atlantic.pharosscan.xyz/tx/0x6452e916d88b5eb7ace2513f0cc49d61df927bfb342344e22f8565f198ea44e2) | [0x6decfa5c…73da09](https://atlantic.pharosscan.xyz/tx/0x6decfa5ca770bd7cab1ae08425a6f726032b794f4beeaa70ef01e18d9b73da09) |
| Block | 31483737 | 31483743 |
| `Claimed` event | 1,410,000,000,000,000 wei | 3,524,999,999,999,999 wei |
| Proof | (31483737−31483596) × 1e13 = **exact to the wei** | 141 blocks × 2.5e13 pro-rata = **exact to the wei** vs the on-chain integer-division formula (1 wei truncation vs naive — documented, not hidden) |

**Withdrawals** (both status 1) — the fee mechanics, live:

| | Kelp withdraw | Kraken withdraw |
|---|---|---|
| Tx | [0x11714e6f…af87d9d2](https://atlantic.pharosscan.xyz/tx/0x11714e6f6b1cbe8686b6a5ee2d6830a55873b5c660b03b0abb5e5c57af87d9d2) | [0x3dc2ac68…eec6e32](https://atlantic.pharosscan.xyz/tx/0x3dc2ac6890497f640ac6aecda7be65d1f8c6b343fbfd7d084770d244eeec6e32) |
| Block | 31483757 | 31483766 |
| Harvest on exit | 200,000,000,000,000 (= 20 × 1e13, exact) | 575,000,000,000,000 (= 23 × 2.5e13, exact) |
| Principal out | 0.02 (full) | 0.009801 |
| Exit fee | **0** — withdrawn after the 100-block hold | **0.000099** — exactly 100 bps of 0.0099 (early exit, before 400-block hold; fee → reward pool) |

Total testnet rewards harvested: 5,709,999,999,999,999 wei (≈0.00571 PHRS, zero
monetary value). Operator principal fully returned.

**Earlier blocker (RESOLVED):** the shared nonce lock had been held 8+ hours by a
stuck T24 worker; it freed and the whole run executed first-try thereafter.

## Spend log

| Item | PHRS |
|---|---|
| Deploy Kelp (fee) | 0.000992755 |
| Deploy Kraken (fee) | 0.000992803 |
| Vault funding (2 × 0.01) | 0.020000000 |
| Stake Kelp (fee) | 0.000102375 |
| Stake Kraken (fee) | 0.000105175 |
| Claim Kelp (fee) | 0.000089777 |
| Claim Kraken (fee) | 0.000089777 |
| Withdraw Kelp (fee) | 0.000053605 |
| Withdraw Kraken (fee) | 0.000053980 |
| **Total** | **0.022480247** |
| Budget | 0.150000000 |
| Remaining | 0.127519753 |
| Rewards harvested (testnet, zero value) | 0.005710000 PHRS |

Machine-readable: `evidence.json`.
