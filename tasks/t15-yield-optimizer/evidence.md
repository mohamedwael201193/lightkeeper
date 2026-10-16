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

## Live stake → claim → withdraw run

**Status: PENDING — see blocker note below.** Planned and queued:

1. Stake 0.02 PHRS Kelp (optimizer recommendation) + 0.01 PHRS Kraken (rate verification)
2. Wait ~120 blocks, read `pendingReward` views
3. Claim both; verify `balance_delta == (claimBlock − stakeBlock) × rewardPerBlock` to the wei
4. Withdraw both (Kelp fee-free after 100-block hold; Kraken pays the 1% early-exit fee —
   the fee mechanics demonstrated live)

**Blocker (flagged to coordinator):** the shared nonce lock `/tmp/lk-nonce.lock` is held
by the T24 worker, whose `wait-receipt.mjs` has been stuck 3+ hours on tx
`0xef21ab8087c6983a2e5c320937f71373451fc8703c0e31ceb0dd0c80034a91e6` — which returns
"tx not found" on-chain (dropped/never broadcast). T15's stake worker is queued on the
lock and proceeds automatically the moment it frees. All non-broadcast deliverables are
complete; the claim-math proof will be appended here when the run executes.

## Spend log

| Item | PHRS |
|---|---|
| Deploy Kelp (fee) | 0.000992755 |
| Deploy Kraken (fee) | 0.000992803 |
| Vault funding (2 × 0.01) | 0.020000000 |
| **Total so far** | **0.021985558** |
| Budget | 0.150000000 |
| Remaining | 0.128014442 |

Machine-readable: `evidence.json`.
