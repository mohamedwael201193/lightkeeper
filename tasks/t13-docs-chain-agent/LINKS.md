# T13 Links — all curl-verified (HTTP 200, 2026-10-16)

## On-chain evidence (Atlantic testnet explorer)

- Dust deposit tx (Q3 footprint):
  https://atlantic.pharosscan.xyz/tx/0x36564924532bfe15be4871f40bf533c0ceecbc045592dc348d60fad5faabf16b
- Dust transfer tx (Q3 Transfer log):
  https://atlantic.pharosscan.xyz/tx/0xf7f35529e142acf7dfe2a07225a68e7411182121445d51dc2b5395a56e2da0a7
- WPHRS token contract (address page):
  https://atlantic.pharosscan.xyz/address/0x838800b758277CC111B2d48Ab01e5E164f8E9471

## Docs cited (the agent's corpus — retrieval date 2026-10-16)

- https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md — `eth_call`, `eth_estimateGas`, `eth_getLogs` sections (verbatim excerpts in transcripts)
- https://docs.pharos.xyz/getting-started/gas-model.md — Estimation APIs + 20% buffer guidance
- https://docs.pharos.xyz/getting-started/token-registry.md — Atlantic WPHRS row (address, 18 decimals)
- https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md — RPC endpoint, chain ID 688689
- https://docs.pharos.xyz/developer-guide/foundry/write-your-first-token.md — `balanceOf` interaction pattern
- https://www.pharos.xyz/llms.txt — docs index

## Repo

- Task package (commit-pinned link goes here after commit):
  `https://github.com/mohamedwael201193/lightkeeper/tree/70f56a8/tasks/t13-docs-chain-agent`
