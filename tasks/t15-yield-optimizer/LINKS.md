# T15 Yield Optimizer — Links (all curl-verified, HTTP 200)

## Transactions (Atlantic explorer)

- Deploy OctopusVault-Kelp: https://atlantic.pharosscan.xyz/tx/0x91c13f9cb3e4df65c7d7b23218bb04241ee0cc66a8b0180a16db617b1240feb9
- Deploy OctopusVault-Kraken: https://atlantic.pharosscan.xyz/tx/0x1d01194b335186295860624f6f94f6d6af19c856a9ffcd29d009deaa2601edbd
- Stake Kelp: https://atlantic.pharosscan.xyz/tx/0x67784abb03a93435cb9d818c390ee6542454050d506e921e01aa086dfdd8d0c5
- Stake Kraken: https://atlantic.pharosscan.xyz/tx/0x01e6ce14c573c0f5493f222e05c13cb69f8aae478b12b9462be988a28cf6c766
- Claim Kelp: https://atlantic.pharosscan.xyz/tx/0x6452e916d88b5eb7ace2513f0cc49d61df927bfb342344e22f8565f198ea44e2
- Claim Kraken: https://atlantic.pharosscan.xyz/tx/0x6decfa5ca770bd7cab1ae08425a6f726032b794f4beeaa70ef01e18d9b73da09
- Withdraw Kelp: https://atlantic.pharosscan.xyz/tx/0x11714e6f6b1cbe8686b6a5ee2d6830a55873b5c660b03b0abb5e5c57af87d9d2
- Withdraw Kraken: https://atlantic.pharosscan.xyz/tx/0x3dc2ac6890497f640ac6aecda7be65d1f8c6b343fbfd7d084770d244eeec6e32

## Contracts

- OctopusVault-Kelp `0xe3212234B17A90cCBC36b0B44845394b62838b08`: https://atlantic.pharosscan.xyz/address/0xe3212234B17A90cCBC36b0B44845394b62838b08
- OctopusVault-Kraken `0xDC3D4a3f47BB479692239ECC362a16CE3485B283`: https://atlantic.pharosscan.xyz/address/0xDC3D4a3f47BB479692239ECC362a16CE3485B283
- Scan pinned block 31482643: https://atlantic.pharosscan.xyz/block/31482643

## Repo (commit-pinned after commit)

- `https://github.com/mohamedwael201193/lightkeeper/tree/ec2a9b4d1bd18e7d2dbcb20f3e8197767e760e89/tasks/t15-yield-optimizer`
  (commit hash filled in SUBMISSION.md post-commit)

## Verification commands (anyone can re-run)

```bash
# rate card, live from chain — no trust needed
for fn in "rewardPerBlock()(uint256)" "entryFeeBps()(uint256)" "exitFeeBps()(uint256)" "minHoldBlocks()(uint256)" "runwayBlocks()(uint256)"; do
  cast call 0xe3212234B17A90cCBC36b0B44845394b62838b08 "$fn" --rpc-url https://atlantic.dplabs-internal.com
done
```
