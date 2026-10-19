# SUBMISSION — T14 Portfolio Assistant (Arena pack, copy-paste ready)

## Title

T14 — Portfolio Assistant: read-only NL portfolio reports with block-pinned citations

## One-liner

Ask a Pharos Atlantic wallet anything about its portfolio in plain English — every
answer is a live on-chain read, every number cites its source contract and block,
and it says "I don't know" instead of guessing.

## Description

A read-only portfolio assistant for Pharos Atlantic testnet (chain 688689).
It answers 6 natural-language question types — balance, holdings, transaction
count, recent activity, gas headroom, token info — from a block-pinned snapshot
across 7 verified on-chain sources (native PHRS + USDC/USDT/WBTC/WETH/WPHRS from
the official Pharos Token Registry, each code-verified on-chain, plus a test ERC20
deployed by this task so the portfolio is non-trivial).

Every number carries a citation (source contract AND block), enforced in code —
the citation validator throws on naked numbers. First-class "I don't know" paths
are proven by negative probes: unsupported contract function, untracked protocol,
USD valuation (refused — testnet assets have no market value, no price feed is
queried, no price is ever invented), and no-code addresses (reported as unknown,
never zero).

READ-ONLY by construction: no private key anywhere, chain-ID assertion runs before
any read, and the test suite (15/15 green) asserts the assistant's balances and
tx count equal independent `cast` queries at the same pinned block.

Live evidence: real portfolio snapshot of the LIGHTKEEPER wallet at block 31483013
(5.865657109313757106 PHRS, 18.5 USDC, 0.0025 WPHRS, 1,000,000 LPK, 139 txs),
LPK deployment tx 0xbf309a965b0546c9464189a976d81fa77010cc59b02e54ba0578a310b555dc23
(block 31481364), 4 passing negative probes. Zero mock/demo/placeholder data.

## Repo link (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/REPLACE_WITH_COMMIT_SHA/tasks/t14-portfolio-assistant

## Share / demo links

- LPK deployment (Atlantic explorer): https://atlantic.pharosscan.xyz/tx/0xbf309a965b0546c9464189a976d81fa77010cc59b02e54ba0578a310b555dc23
- KeeperToken (LPK) contract: https://atlantic.pharosscan.xyz/address/0x7d9C06353DdfeBC078A3a834A672CBF10aa06Ab9
- Wallet under analysis: https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
- Reproduce: `cd tasks/t14-portfolio-assistant && node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --demo` (public RPC, no key needed)

## Video

PENDING-VIDEO (45–90s: questions → cited
answers → "I don't know" → write-attempt refusal → explorer proof). The console
"try it live" surface (below) adds a second filming angle: connect wallet → the
visitor's OWN live portfolio.

## Try it live (console surface, new)

`apps/console/src/components/try/t14-portfolio-assistant.tsx` — Tier A, pure
reads, no signature anywhere. If the visitor connects their wallet, the first
thing they see is THEIR OWN Atlantic portfolio, read live across three views:
**Balances** (native PHRS via `eth_getBalance` plus `eth_call balanceOf` across
the verified 7-source registry, block-pinned to one `eth_blockNumber`, with
`eth_getTransactionCount`), **Activity** (real ERC20 Transfer events scanned
from `eth_getLogs` over the last 5,000 blocks, 10 block-paged calls with the
window printed; native PHRS transfers emit no events, so it says so instead of
claiming to see them), and **Gas headroom** (`eth_gasPrice` × balance → rough
simple-transfer count, token units only — no USD anywhere). A chain-ID check
runs before any read; unreadable tokens report "unknown", never zero. No
wallet: a validated address input reads any portfolio. Below, the "keeper's
reference" shows the LIGHTKEEPER operator wallet's evidence snapshot
(block 31483013: 5.865657109313757106 PHRS, 18.5 USDC, 0.0025 WPHRS, 1,000,000
LPK, 139 txs) — clearly labeled historical, never confused with the live read.

## Reviewer notes

30-second test: run `node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --demo`
and check every number carries a `[source: …, block …]` citation. What to check:
the citations resolve on the Atlantic explorer at the pinned block. What we will
not claim: USD prices (no price feed — refused, never invented), or positions in
protocols with no verified contract for this wallet.
