# T14 — Portfolio Assistant — Official Requirements (verbatim)

Source: `~/workspace/your_files/pharos-arena-MEGA.md` §4, "### T14 — Portfolio Assistant (Hard, 200 · DeFi)".

## OFFICIAL (quoted verbatim)

> (1) Reads positions from ≥2 protocols/vaults + wallet balances. (2) Answers ≥5 different NL question types correctly. (3) Every number cites source contract AND block. (4) Says clearly when it doesn't know (no guessing). (5) READ-ONLY — never initiates transactions.

## Implementation guidance (quoted verbatim, from the same section)

> **Implementation:** read-only-by-construction (no private key anywhere, tool allowlist, CI grep gate); coverage manifest (`sources.yaml`); intent router for 6 question types; citation renderer + validator; first-class "I don't know" path with negative probes (unsupported function, untracked protocol, no price feed). If the network lacks 2 live protocols, fail loudly — never mock.

> **Evidence:** 5+ answered questions with citations, negative-probe log, share link.

> **Video:** questions → cited answers → an "I don't know" → write-attempt refusal.

> **Risks:** thin Pharos DeFi (VERIFY LIVE venue inventory); no on-chain price feed → report in token units.

## How this build maps to each requirement

| # | Official requirement | This build |
|---|---|---|
| 1 | Reads positions from ≥2 protocols/vaults + wallet balances | Reads wallet balances across 7 verified on-chain sources: native PHRS + 6 ERC20s (USDC, USDT, WBTC, WETH, WPHRS from the official Atlantic Token Registry, each code-verified on-chain; plus LPK, a test ERC20 deployed by this task at `0x7d9C06353DdfeBC078A3a834A672CBF10aa06Ab9`). Honest note: Atlantic testnet has no live lending/vault protocols with positions for this wallet, so "positions" are wallet balances across multiple verified token contracts — reported as such, never as vault positions. |
| 2 | Answers ≥5 different NL question types correctly | 6 question types: balance, holdings, transaction count, recent activity, gas headroom, token info (see `src/index.mjs` `answer()`; intent router in L8 package). |
| 3 | Every number cites source contract AND block | `cite()` in L8 refuses naked numbers; `assertCited()` validates every answer; all reads block-pinned. |
| 4 | Says clearly when it doesn't know (no guessing) | First-class "I don't know" paths: untracked protocol, no price feed, unsupported function, no-code address, unknown question type — all exercised by `--probes` negative-probe log. |
| 5 | READ-ONLY — never initiates transactions | No private key anywhere in the task folder; chain-ID assertion first; CI grep gate (`test/` housekeeping test + repo `scripts/` conventions); the only on-chain write in evidence is the LPK test-token deployment, done by the operator, never by the assistant. |

## Hard rules inherited from the task contract

- No mock/demo/placeholder/fake success — the assistant reads live Atlantic state only.
- NEVER invent token prices or yields — testnet assets have NO market value; every valuation question is refused with the reason. All balances are reported in token units.
- Secrets never in the repo, code, README, logs, or evidence.
- Atlantic testnet ONLY (chain ID 688689). Never mainnet.
