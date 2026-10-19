# T01 · LINKS (every link curl-verified HTTP 200 on 2026-10-19)

| # | Link | What | HTTP |
|---|---|---|---|
| 1 | https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815 | USDC contract (Pharos mainnet) | 200 ✓ |
| 2 | https://mcp.pharos.xyz/health | Chain MCP health (`{"status":"ok","chainId":1672}`) | 200 ✓ |
| 3 | `https://github.com/mohamedwael201193/lightkeeper/tree/REPLACE_WITH_COMMIT_SHA/tasks/t01-read-contract-state` | Repo subfolder (commit-pinned after commit) | — |
| 4 | REPLACE_WITH_NEW_VIDEO_LINK | Re-recorded demo video (live Chain MCP run + negative suite) | — |

Verification method: `curl -s -o /dev/null -w "%{http_code}" -L --max-time 30 <url>`
for links 1–2 on 2026-10-19 (both returned 200). Link 3 is filled with the real
commit SHA after `git commit`; link 4 is recorded by the user at submission time.
