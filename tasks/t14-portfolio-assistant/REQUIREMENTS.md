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
| 1 | Reads positions from ≥2 protocols/vaults + wallet balances | Reads positions from **3 verified protocol/vault contracts** + wallet balances across 7 verified token sources (native PHRS + USDC/USDT/WBTC/WETH/WPHRS from the official Atlantic Token Registry, each code-verified on-chain; plus LPK, a test ERC20 deployed by this task at `0x7d9C06353DdfeBC078A3a834A672CBF10aa06Ab9`). Protocol reads (2026-10-20, all code-verified on-chain, all LIGHTKEEPER builder-deployed test contracts and disclosed as such): **MiniLend** lending pool `0x108989a165a446e1d89CEe3C9936344ea7ADbf4a` — LIVE operator position at block 31638738 (collateral 0.002 PHRS, debt 0.0016 USD contract-denominated 8dp, health factor 1.5, oracle 1.5 USD/PHRS 8dp, threshold 8000 bps); **Kelp** `0xe3212234B17A90cCBC36b0B44845394b62838b08` and **Kraken** `0xDC3D4a3f47BB479692239ECC362a16CE3485B283` staking vaults — read live, operator stakes fully claimed, reported as zero. Every protocol number cites source contract AND block through the same `cite()`/`assertCited()` path as balances. |
| 2 | Answers ≥5 different NL question types correctly | 6 question types: balance, holdings, transaction count, recent activity, gas headroom, token info (see `src/index.mjs` `answer()`; intent router in L8 package). |
| 3 | Every number cites source contract AND block | `cite()` in L8 refuses naked numbers; `assertCited()` validates every answer; all reads block-pinned. |
| 4 | Says clearly when it doesn't know (no guessing) | First-class "I don't know" paths: untracked protocol, no price feed, unsupported function, no-code address, unknown question type — all exercised by `--probes` negative-probe log. |
| 5 | READ-ONLY — never initiates transactions | No private key anywhere in the task folder; chain-ID assertion first; CI grep gate (`test/` housekeeping test + repo `scripts/` conventions); the only on-chain write in evidence is the LPK test-token deployment, done by the operator, never by the assistant. |

On the MEGA "fail loudly if the network lacks 2 live protocols" guidance: the
2026-10-20 venue inventory found 3 live builder-deployed protocol contracts
(MiniLend lending pool, Kelp + Kraken staking vaults); 1 carries a live operator
position and all 3 are read live and cited with contract AND block. Nothing was
mocked — the zero-stake vaults are reported as zero, and untracked protocols
still get an explicit "I don't know".

## Hard rules inherited from the task contract

- No mock/demo/placeholder/fake success — the assistant reads live Atlantic state only.
- NEVER invent token prices or yields — testnet assets have NO market value; every valuation question is refused with the reason. All balances are reported in token units.
- Secrets never in the repo, code, README, logs, or evidence.
- Atlantic testnet ONLY (chain ID 688689). Never mainnet.
