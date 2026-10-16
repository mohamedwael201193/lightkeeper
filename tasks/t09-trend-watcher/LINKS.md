# T09 Trend Watcher — Links (curl-verified 2026-10-16)

## Repo (commit-pinned)

- Task tree: `https://github.com/mohamedwael201193/lightkeeper/tree/<COMMIT>/tasks/t09-trend-watcher`
  (SHA filled at commit time; see SUBMISSION.md)

## Explorer — sampled block window (all HTTP 200, curl-verified)

| Block | Link | Status |
|---|---|---|
| 31481567 (run 1, window start) | https://atlantic.pharosscan.xyz/block/31481567 | 200 |
| 31481596 (run 1, window end) | https://atlantic.pharosscan.xyz/block/31481596 | 200 |
| 31481649 (run 2, window start) | https://atlantic.pharosscan.xyz/block/31481649 | 200 |
| 31481678 (run 2, window end) | https://atlantic.pharosscan.xyz/block/31481678 | 200 |

Each block page shows the real `baseFeePerGas` (1 gwei during the window) matching
the values recorded in `sample-output/observations-*-live.jsonl`.

## Reference

- SkillEngine skill reference (local): `~/workspace/custom-skills/pharos-skill-engine/`
- Networks: Atlantic `https://atlantic.dplabs-internal.com` · chainId 688689 · explorer `https://atlantic.pharosscan.xyz/`
