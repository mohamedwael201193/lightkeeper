<div align="center" style="background:#1414c8;padding:56px 24px;border-radius:8px;">
  <p style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:52px;letter-spacing:0.35em;margin:0;">PORTFOLIO</p>
  <p style="font-family:Georgia,'Times New Roman',serif;color:#e8c766;font-size:20px;letter-spacing:0.5em;margin:12px 0 0;">T14 · THE KEEPER'S LEDGER</p>
  <p style="color:#ffffff;font-size:15px;font-style:italic;margin:24px 0 0;">One lighthouse. Thirty lamps. — <span style="color:#b9c2f5;">this lamp counts what the keeper holds, and never counts what it cannot see.</span></p>
</div>

# T14 — Portfolio Assistant

Read-only natural-language portfolio reports for a Pharos Atlantic testnet wallet.
Ask in plain words; get answers pinned to a block, every number citing its source
contract. It says "I don't know" instead of guessing, refuses USD valuations
(testnet assets have no market value), and cannot initiate transactions — there
is no key anywhere in this folder.

## 1. Verdict (the 30-second test)

```bash
cd tasks/t14-portfolio-assistant
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --question "What tokens do I hold?"
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --demo
node --test test/portfolio.test.mjs
```

- **Shipped:** 6 NL question types, block-pinned reads across 7 verified on-chain sources, citation validator, 4 negative probes, live test suite that asserts the assistant's numbers equal direct `cast` queries at the same pinned block.
- **Live evidence:** portfolio snapshot of the LIGHTKEEPER wallet at block **31483013** (chain 688689) — 5.865657109313757106 PHRS, 18.5 USDC, 0.0025 WPHRS, 1,000,000 LPK, 139 outgoing txs (see `evidence.json`).
- **Honest gaps:** no USD valuations (no price feed exists); activity scan covers the latest 10,000 blocks only; native PHRS transfers aren't visible in event logs — all stated, none papered over.

## 2. What it does

- Reads native PHRS balance, ERC20 balances across a verified registry (`sources.yaml`), outgoing transaction count, recent ERC20 Transfer activity, and gas headroom for any Atlantic address.
- Answers 6 question types in natural language: **balance, holdings, transaction count, recent activity, gas headroom, token info** — routed by a local intent router (no LLM, no guessing).
- Generates a natural-language portfolio summary from the snapshot (local template code, no LLM).
- Refuses what it cannot know: untracked protocols, USD valuations, unsupported contract functions, no-code addresses, unknown question types.

## 3. How it works

```
bin/run.mjs            # chain-ID assertion FIRST (refuses unless 688689), arg parsing
src/index.mjs          # registry parsing, block-pinned snapshot, NL answer(), negativeProbes()
src/lib/portfolio.mjs  # core reader library: PortfolioReader (reads only),
                       # cite()/assertCited(), intent router, NL summary generator
sources.yaml           # coverage manifest: 7 assets, each code-verified on-chain
```

All reads go through `eth_getBalance`, `eth_getTransactionCount`, `eth_call(balanceOf)`,
and `eth_getLogs` (Transfer events, paged in 1,000-block chunks — the node's hard
limit, discovered live). One `eth_blockNumber` pins the snapshot; reads are taken at
that block. `cite()` throws on any number missing a source or block, and
`assertCited()` validates every answer before it is returned.

Read-only by construction: no private key, no signer, no broadcast path exists in the
code. The only on-chain write in this task's history is the operator-deployed LPK
test token — the assistant itself never writes.

## 4. Quickstart

```bash
# full JSON snapshot
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --snapshot

# one question
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --question "How much gas can I afford?"

# all 6 question types + NL summary
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --demo

# negative probes (the "I don't know" paths)
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --probes

# tests (live tests compare the assistant against direct cast queries)
node --test test/portfolio.test.mjs
```

Zero dependencies — Node ≥ 18 only. The Atlantic RPC is public; no key needed.

## 5. The 6 question types

| # | Type | Example | Source cited |
|---|---|---|---|
| 1 | balance | "What is my LPK balance?" | `balanceOf` on the token contract |
| 2 | holdings | "What tokens do I hold?" | all registry contracts |
| 3 | transaction count | "How many transactions have I made?" | `eth_getTransactionCount` |
| 4 | recent activity | "What is my recent activity?" | `eth_getLogs` Transfer events |
| 5 | gas headroom | "How much gas can I afford?" | `eth_getBalance` + `eth_gasPrice` |
| 6 | token info | "What is USDC?" | registry entry + on-chain metadata |

Ask "what is my portfolio worth in USD?" and you get a refusal, not a price.

## 6. Evidence & citations

- `evidence.json` — full portfolio snapshot at block 31483013: balances with raw values, sources, blocks; tx count; 2 Transfer events in blocks 31473013–31483013 (LPK mint + WPHRS self-transfer); gas headroom; spend log.
- `evidence.md` — the narrative: what was built, what the chain said, what was refused.
- Every number in every answer cites source contract AND block, enforced by code
  (`assertCited`), not by convention.
- The live test suite asserts the assistant's balances and tx count equal independent
  `cast` queries at the same pinned block.

## 7. Honest limits

- **No USD valuations, ever.** Atlantic testnet assets have no market value; no price feed is queried. Token units only.
- **"Positions" = wallet balances.** Atlantic testnet has no live lending/vault protocols holding positions for this wallet — the assistant reports wallet balances across 7 verified sources and labels them exactly that, never as vault positions.
- **Activity window is bounded.** `eth_getLogs` is capped at 1,000 blocks/call on this node; the assistant pages the latest 10,000 blocks and prints the window it scanned. The 18.5 USDC predates the window — reported as out-of-scope, not invented.
- **Native transfers are invisible to it.** PHRS transfers emit no events; the assistant says so rather than claiming to see them.
- **Shared wallet.** The LIGHTKEEPER deployer wallet is used by the whole build operation; its PHRS balance moves as sibling tasks spend gas. Snapshots are pinned to a block so each report is internally consistent.
- **RPC flakiness.** The Atlantic endpoint occasionally times out; reads retry with backoff and the tool reports failure rather than partial data.

## 7b. Requirements → evidence

| # | Official requirement (verbatim) | How it is met | Evidence |
|---|---|---|---|
| 1 | Reads positions from ≥2 protocols/vaults + wallet balances | Reads wallet balances across 7 verified on-chain sources: native PHRS (`eth_getBalance`) + 6 ERC20s (`balanceOf` per contract) — USDC, USDT, WBTC, WETH, WPHRS from the official Atlantic Token Registry (each code-verified on-chain), plus LPK deployed by this task. Honest scope note: Atlantic has no live lending/vault protocols holding positions for this wallet, so "positions" are reported as wallet balances across verified contracts — never as vault positions. | `sources.yaml`; `evidence.json` (balances with raw values, sources, pinned block); `src/index.mjs` `snapshot()` |
| 2 | Answers ≥5 different NL question types correctly | 6 question types via local intent router (no LLM): balance, holdings, transaction count, recent activity, gas headroom, token info. Live test asserts routing for all 6 + valuation-refusal + unknown. | `bin/run.mjs --demo` output; `sample-output/demo-output.txt`; `test/portfolio.test.mjs` "routeIntent covers the 6 question types" |
| 3 | Every number cites source contract AND block | `cite()` in `src/lib/portfolio.mjs` throws on any number missing source or block; `assertCited()` validates every answer before return; all reads pinned to one `eth_blockNumber`. Live test asserts snapshot balances equal independent `cast` queries at the same pinned block. | `evidence.json` (every balance: value, raw, source, block); `test/portfolio.test.mjs` "assistant native + ERC20 balances equal cast at the same pinned block" |
| 4 | Says clearly when it doesn't know (no guessing) | First-class "I don't know" paths: untracked protocol, no price feed (USD valuation refused), unsupported contract function, no-code address, unknown question type. All 4 exercised by `--probes`. | `bin/run.mjs --probes` output; `sample-output/negative-probes.json`; `test/portfolio.test.mjs` "live: honest I-don't-know paths" (3 tests) |
| 5 | READ-ONLY — never initiates transactions | No private key, signer, or broadcast path anywhere in the task folder; chain-ID assertion (`assertAtlantic`) runs before any read and refuses non-688689; CI grep gate fails on key material or mock language. The only on-chain write in evidence is the operator-deployed LPK token — never by the assistant. | `test/portfolio.test.mjs` "no secrets or mock language in the task folder"; `src/lib/portfolio.mjs` header hard rules; `bin/run.mjs` chain-ID gate |

## 8. Submission checklist

- [x] Official requirements quoted verbatim (`REQUIREMENTS.md`)
- [x] 7 verified on-chain sources in `sources.yaml` (5 from the official Pharos Token Registry doc, code-verified; LPK deployed by this task, tx `0xbf309a96…10cc59b02e54ba0578a310b555dc23`)
- [x] 6 NL question types + NL summary generator
- [x] Every number cites source contract AND block (code-enforced)
- [x] 4 negative probes passing (`--probes`)
- [x] Read-only: no key, chain-ID assertion first, grep gate in tests
- [x] Live tests green: assistant == direct `cast` at the pinned block
- [x] No mock/demo/placeholder/fake data; no invented prices; no secrets in repo
- [x] `SUBMISSION.md` (Arena pack; video slot: PENDING-VIDEO)
- [x] Curl-verified links (`LINKS.md`)
