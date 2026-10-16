# T14 — Reviewer Notes (paste-ready)

## What this is

A read-only portfolio assistant for Pharos Atlantic testnet. Point it at a wallet, ask in natural language, and it answers from live on-chain reads — every number cites its source contract and block.

## The 30-second test

```bash
cd tasks/t14-portfolio-assistant
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --question "What tokens do I hold?"
node bin/run.mjs --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --demo
node --test test/portfolio.test.mjs   # live tests: assistant vs direct cast queries
```

## What to check

1. **Citations** — every number in every answer carries `[source: <contract or method>, block <n>]`. The citation validator (`assertCited`) throws on naked numbers; try removing a citation and watch the test fail.
2. **"I don't know"** — run `--probes`: unsupported function call on a real token, untracked protocol question, USD-valuation question, no-code address. All four must refuse honestly. Ask `what is my portfolio worth in USD?` — the only acceptable answer is a refusal, and that is what you get.
3. **Read-only** — grep the folder for key material; there is none. The chain-ID assertion (`eth_chainId` first, refuse unless 688689) runs before any read.
4. **Live vs invented** — `sources.yaml` lists the coverage manifest; the 5 registry tokens come from the official Pharos Token Registry doc and were each verified code-present on-chain. The LPK token is really deployed (see the explorer tx link in LINKS.md). Testnet assets are labeled "testnet — no market value" everywhere — no USD price exists or is shown.
5. **Honest limits** — the activity scan covers the most recent 10,000 blocks (the node caps `eth_getLogs` at 1,000 blocks/call; this is paged and stated). Native PHRS transfers are not visible in event logs and the assistant says so instead of claiming to see them. The 18.5 USDC predates the scan window — the assistant reports the window it covered rather than inventing history.

## What we will NOT claim

- No USD valuations, no APY/yield figures (testnet assets have no market value).
- No "positions in protocols/vaults": Atlantic testnet has no live lending/vault positions for this wallet, so we report wallet balances across 7 verified sources and label them exactly that.
- No fabricated activity: the window scanned is printed in every activity answer.
