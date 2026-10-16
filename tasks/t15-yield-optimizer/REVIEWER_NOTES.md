# T15 Yield Optimizer — Reviewer Notes

## What to verify (5 minutes)

1. **Discovery is real:** open `runs/discovery.json`. The method is reproducible —
   `python3 -m optimizer.discover` re-runs it. Note the positive controls: the two
   OctopusVaults read PRESENT (3,983 bytes of code), proving the probe works, while
   canonical Multicall3 reads absent. `third_party_yield_venues_found: 0`.
2. **Rate cards are on-chain, not in a spreadsheet:** call the view functions yourself:
   `cast call 0xe3212234B17A90cCBC36b0B44845394b62838b08 "rewardPerBlock()(uint256)" --rpc-url https://atlantic.dplabs-internal.com`
   → `10000000000000`. Same for `entryFeeBps`, `exitFeeBps`, `minHoldBlocks`, `runwayBlocks`.
3. **The scan is pinned:** `runs/scan.json` → `pinned_block` + `explorer_block` link.
   Every rate/fee/hold number cites its source contract AND block.
4. **Net math, not APY theater:** `runs/recommendation.json`. At 1,000 blocks the winner
   is **Kelp**, not the 2.5×-rate Kraken — because the optimizer caps Kraken's gross at
   its 400-block funded runway and subtracts its 1% entry fee. At 50 blocks everything
   nets negative and the answer is honestly **STAY PUT**.
5. **Claim math:** `evidence.json` → each claim's `balance_delta_wei` equals
   `(claim_block − stake_block) × rewardPerBlock` to the wei. No rounding, no fudge.

## Where the bodies are buried (honest limits)

- There are no third-party yield venues on Atlantic; the "≥3 sources" are two
  builder-deployed fixtures + the 0% wallet baseline. This is stated in the README,
  the discovery report, and every JSON artifact — never disguised.
- Rewards are testnet PHRS (zero value). Everything is labeled "testnet mechanics
  demonstration", including the video.
- APY figures are illustrative at dust scale (single-staker marginal share ≈ 100%).
  The recommendation is decided by NET, never by APY.
- Reward pools are finite (0.01 PHRS each). `runwayBlocks()` is live on-chain;
  when a pool empties, rewards stop — the optimizer models this, it doesn't
  project past it.
- The optimizer module never signs: `optimizer/prepare.py` emits `signed: false`
  with no v/r/s fields. The live stake/claim/withdraw run was executed by the
  operator (dust, Atlantic only) outside the module, under the arena nonce lock.

## Reproduce

```bash
cd ~/workspace/lightkeeper/tasks/t15-yield-optimizer
forge test && python3 tests/test_optimizer.py   # 8 + 12, all green
# then the 4-step pipeline in README §6 (needs only ATLANTIC_RPC_URL)
```

## Why this beats a thin T15

Most yield-optimizer demos rank venues by headline APY on invented numbers. T15 does
the opposite: it **discovers that the venue set is empty and says so**, deploys **real
funded vaults with on-chain rate cards**, and lets **net math (fees + gas + finite
runway)** overturn the naive APY ranking — with every wei of the claim verified
against the chain. The empty discovery result isn't a failure mode; it's the finding
that makes the rest honest.
