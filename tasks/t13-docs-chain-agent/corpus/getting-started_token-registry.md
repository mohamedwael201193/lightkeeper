> For the complete documentation index, see [llms.txt](https://docs.pharos.xyz/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.pharos.xyz/getting-started/token-registry.md).

# Token Registry

## Atlantic Testnet Token Registry

<table><thead><tr><th width="119.734375">Symbol</th><th width="150.43359375">Name</th><th width="120.29296875">initsupply</th><th width="119.98828125">Decimals</th><th>Address</th></tr></thead><tbody><tr><td>USDC</td><td>USD Coin</td><td>0</td><td>6</td><td>0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B</td></tr><tr><td>USDT</td><td>Tether USD</td><td>0</td><td>6</td><td>0xE7E84B8B4f39C507499c40B4ac199B050e2882d5</td></tr><tr><td>WBTC</td><td>Wrapped BTC</td><td>0</td><td>18</td><td>0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4</td></tr><tr><td>WETH</td><td>Wrapped ETH</td><td>0</td><td>18</td><td>0x7d211F77525ea39A0592794f793cC1036eEaccD5</td></tr><tr><td>WPHRS</td><td>Wrapped PHRS</td><td>0</td><td>18</td><td>0x838800b758277CC111B2d48Ab01e5E164f8E9471</td></tr></tbody></table>

## Pacific Mainnet Token Registry

| Symbol                 | Name            | Pharos Address                             | Ethereum Address                           | Base Address                               |
| ---------------------- | --------------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| WPROS                  | Wrapped PROS    | 0x52c48d4213107b20bc583832b0d951fb9ca8f0b0 | 0xB197E02499e6502733C6bCE2eb39013C39A03147 | 0x8B7DdE054BE9D180c1Be7FaE0874697374A49832 |
| USDC (Circle Deployed) | USDC            | 0xc879c018db60520f4355c26ed1a6d572cdac1815 |                                            |                                            |
| LINK                   | Chainlink Token | 0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29 | 0x514910771AF9Ca656af840dff83E8264EcF986CA |                                            |
| WETH                   | Wrapped ETH     | 0x1f4b7011Ee3d53969bb67F59428a9ec0477856E9 |                                            |                                            |


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation by asking a question.

Perform an HTTP GET request on the following URL with the `ask` and `goal` query parameters:

```
GET https://docs.pharos.xyz/getting-started/token-registry.md?ask=<question>&goal=<user_goal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is what the user is ultimately trying to achieve, the reason they need the answer. Sharing it helps GitBook give you a better, more relevant answer. A goal is most helpful when it describes the outcome the user wants rather than restating the question. For example, with `ask=how do I create an API token`, a goal like `automate deployments from our CI pipeline` lets GitBook tailor the answer to that use case.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
