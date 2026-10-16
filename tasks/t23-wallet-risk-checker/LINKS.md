# LINKS — T23 Wallet Risk Checker

All links curl-verified (HTTP 200) on 2026-10-16. The commit-pinned repo link
resolves after the user pushes (commit is local-only until then).

| Link | Target | Status |
|---|---|---|
| https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 | Example A — established wallet (deployer) | 200 ✓ |
| https://atlantic.pharosscan.xyz/address/0x2459eC8B2ca982a8c2C6188c098701177D63EC43 | Example B — T23RiskFixture contract | 200 ✓ |
| https://atlantic.pharosscan.xyz/tx/0xe0e0323267bcf8ba922695802005ce4aa1656d5188c8ea9f724d455cebafd79f | Fixture deployment tx (block 31481833) | 200 ✓ |
| https://atlantic.pharosscan.xyz/tx/0x270a075a90f3bdb71f10d86cb0877205901cd085dfd526f47ebe6d0df8ef5c66 | Fixture funding tx, 0.001 PHRS (block 31481847) | 200 ✓ |
| https://github.com/mohamedwael201193/lightkeeper | Repo root | 200 ✓ |
| `https://github.com/mohamedwael201193/lightkeeper/tree/<commit>/tasks/t23-wallet-risk-checker` | Commit-pinned task folder (SUBMISSION.md) | pending push — commit hash filled at submission time |

Note: the Atlantic explorer is a client-rendered app; curl verifies the pages
exist (200). Address/tx data on them is verifiable independently via
`cast` against `https://atlantic.dplabs-internal.com` (chain ID 688689).
