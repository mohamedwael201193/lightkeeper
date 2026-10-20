# @lightkeeper/portfolio (L8)

Read-only on-chain portfolio reader for Pharos Atlantic testnet (chain
688689). Hard rules, enforced in code: no private keys, no signers, no
broadcasts — reads only; never invents prices or yields (testnet assets
have no market value; "I don't know" is an explicit answer); every numeric
fact carries a citation `{value, source, block}` and `assertCited` throws
on naked numbers. All reads are block-pinned for internal consistency.

Promoted verbatim from the task-local copy (plus protocol position views)
— this package is now the canonical home; T14 imports it.

## API (`src/portfolio.mjs`)

- `PortfolioReader` — `snapshot(address)`, `tokenBalance`, `viewCall`, …
- `routeIntent`, `extractTokenMention`, `extractProtocolMention`
- `formatUnits`, `cite`, `assertCited`, `summarizeSnapshot`, `decodeWords`
- `DONT_KNOW`, `NO_MARKET_VALUE`, `ATLANTIC_CHAIN_ID`, `ATLANTIC_RPC_URL`, `PROTOCOL_VIEWS`

## Consumers (real imports)

- `tasks/t14-portfolio-assistant/src/index.mjs`
- `tasks/t14-portfolio-assistant/bin/run.mjs`
- `tasks/t14-portfolio-assistant/test/portfolio.test.mjs`

## Test

`cd tasks/t14-portfolio-assistant && node --test test/portfolio.test.mjs`
(unit describes offline; live describes read Atlantic testnet).
