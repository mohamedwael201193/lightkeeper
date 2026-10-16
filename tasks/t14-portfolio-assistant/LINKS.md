# T14 — Links (all curl-verified 2026-10-16, HTTP 200)

| # | Link | What it is |
|---|---|---|
| 1 | https://atlantic.pharosscan.xyz/tx/0xbf309a965b0546c9464189a976d81fa77010cc59b02e54ba0578a310b555dc23 | LPK test-token deployment transaction (block 31481364) |
| 2 | https://atlantic.pharosscan.xyz/address/0x7d9C06353DdfeBC078A3a834A672CBF10aa06Ab9 | KeeperToken (LPK) contract page — token registry entry deployed by this task |
| 3 | https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 | LIGHTKEEPER wallet page (the portfolio under analysis) |
| 4 | https://docs.pharos.xyz/getting-started/token-registry.md | Official Pharos Atlantic Token Registry (source of the 5 verified token addresses in `sources.yaml`) |
| 5 | https://github.com/mohamedwael201193/lightkeeper | LIGHTKEEPER monorepo (task folder pinned at submission commit — see SUBMISSION.md) |

Verification method: `curl -s -o /dev/null -w "%{http_code}"` per URL; all returned `200` on 2026-10-16. No link is assumed from memory — each was fetched.
