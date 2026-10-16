# T04 — Doc-Search CLI: Links

Every URL below was curl-verified on **2026-10-16** (HTTP 200; `-L` followed the one redirect).
Citation URLs appear verbatim in `evidence/evidence.json` and the answer cards.

## Corpus sources (fetched live into `corpus/`)

| URL | Status | Bytes | Used as |
|---|---|---|---|
| https://www.pharos.xyz/llms.txt | 200 | 16,089 | docs navigation index; indexed as "Pharos Documentation Index" (carries the authoritative Defaults block) |
| https://docs.pharos.xyz/llms-full.txt | 200 | 403,670 | full GitBook corpus → 73 pages → 438 passages |
| https://docs.pharos.xyz/sitemap.md | 200 | — | page-URL enumeration + positional attribution order |

## Citation URLs (appear in evidence answer cards)

| URL | Status | Cited by |
|---|---|---|
| https://docs.pharos.xyz/developer-guide/foundry/write-your-first-uniswap-contract | 200 | E1 |
| https://docs.pharos.xyz/developer-guide/hardhat/write-your-first-uniswap-contract | 200 | E1 |
| https://docs.pharos.xyz/developer-guide/x402 | 200 | E5 |
| https://docs.pharos.xyz/getting-started/network/atlantic-testnet | 200 | E2 |
| https://docs.pharos.xyz/getting-started/token-registry | 200 | E5 |
| https://docs.pharos.xyz/introduction/readme.md | 200 | E6 (extensionless form 307-redirects to docs home, so the stable `.md` form is cited — see REVIEWER_NOTES.md §2) |
| https://docs.pharos.xyz/tooling-and-infrastructure/cross-chain/circle-cctp | 200 | E5 |
| https://docs.pharos.xyz/tooling-and-infrastructure/mcp | 200 | E3, E7 |
| https://docs.pharos.xyz/tooling-and-infrastructure/oracles/supra | 200 | E4 |
| https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide | 200 | E2 (transient 000 on first pass; 200 on retry with `-L`) |
| https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide | 200 | E3 (transient 000 on first pass; 200 on retry with `-L`) |
| https://docs.pharos.xyz/tooling-and-infrastructure/rpc/zan | 200 | E2 |

## Reference (miss-path suggestion)

| URL | Status | Used in |
|---|---|---|
| https://docs.pharos.xyz/sitemap.md | 200 | UNVERIFIED answer card ("browse the full doc index") |

Re-verify any time: the citation URLs are listed in `evidence/evidence.json` under each query's `citations`.
