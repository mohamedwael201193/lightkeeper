# T15 Yield Optimizer — Links (all curl-verified, HTTP 200)

## Transactions (Atlantic explorer)

- Deploy OctopusVault-Kelp: https://atlantic.pharosscan.xyz/tx/0x91c13f9cb3e4df65c7d7b23218bb04241ee0cc66a8b0180a16db617b1240feb9
- Deploy OctopusVault-Kraken: https://atlantic.pharosscan.xyz/tx/0x1d01194b335186295860624f6f94f6d6af19c856a9ffcd29d009deaa2601edbd
- Stake / claim / withdraw txs: PENDING (queued on nonce lock — see evidence.md)

## Contracts

- OctopusVault-Kelp `0xe3212234B17A90cCBC36b0B44845394b62838b08`: https://atlantic.pharosscan.xyz/address/0xe3212234B17A90cCBC36b0B44845394b62838b08
- OctopusVault-Kraken `0xDC3D4a3f47BB479692239ECC362a16CE3485B283`: https://atlantic.pharosscan.xyz/address/0xDC3D4a3f47BB479692239ECC362a16CE3485B283
- Scan pinned block 31482643: https://atlantic.pharosscan.xyz/block/31482643

## Repo (commit-pinned after commit)

- `https://github.com/mohamedwael201193/lightkeeper/tree/<commit>/tasks/t15-yield-optimizer`
  (commit hash filled in SUBMISSION.md post-commit)

## Verification commands (anyone can re-run)

```bash
# rate card, live from chain — no trust needed
for fn in "rewardPerBlock()(uint256)" "entryFeeBps()(uint256)" "exitFeeBps()(uint256)" "minHoldBlocks()(uint256)" "runwayBlocks()(uint256)"; do
  cast call 0xe3212234B17A90cCBC36b0B44845394b62838b08 "$fn" --rpc-url https://atlantic.dplabs-internal.com
done
```
