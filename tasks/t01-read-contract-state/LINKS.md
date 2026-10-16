# T01 · LINKS (every link curl-verified HTTP 200 on 2026-10-16)

| # | Link | What | HTTP |
|---|---|---|---|
| 1 | https://atlantic.pharosscan.xyz/tx/0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b | Deploy tx (block 31481260, status 1) | 200 ✓ |
| 2 | https://atlantic.pharosscan.xyz/address/0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD | KeeperRegistry contract | 200 ✓ |
| 3 | `https://github.com/mohamedwael201193/lightkeeper/tree/b4a53c58fcb92f3d41ed56ed880596ed8c7d6075/tasks/t01-read-contract-state` | Repo subfolder (commit-pinned; b4a53c58fcb92f3d41ed56ed880596ed8c7d6075) | — |
| 4 | PENDING-VIDEO | 45–90s demo video slot | — |

Verification method: `curl -s -o /dev/null -w "%{http_code}" -L --max-time 30 <url>`
for links 1–2 on 2026-10-16 (both returned 200). Link 3 is filled with the real
commit SHA after `git commit`; link 4 is recorded by the user at submission time
per VIDEO-GUIDE.md.
