# T13 Evidence — real MCP results, Pharos mainnet (chain 1672)

v2 (2026-10-20): full rebuild on the real MCPs. v1 (Atlantic direct-RPC +
local corpus) is superseded — retained in git history only.

## Run manifest

- Chain MCP: `https://mcp.pharos.xyz/mcp` — tools `get_chain_info`, `get_block_number`, `get_code`, `eth_call`, `get_logs` (by name)
- Docs MCP: `https://docs.pharos.xyz/~gitbook/mcp` — tool `askQuestion` (by name)
- Pinned block: **20695304** · chain 1672 (asserted via `get_chain_info`)
- `rawRpcCalls: 0` · `localDocIndex: false`
- Machine-readable: `evidence/run-manifest.json`

## Round results

| Round | Docs MCP (askQuestion, sources) | Chain MCP (tool calls) | Result |
|---|---|---|---|
| totalSupply | "How do I read an ERC-20 token's total supply using eth_call?" — 15 cited sources, names selector `0x18160ddd` | `eth_call` totalSupply() on USDC @ block 20695304 | raw `43481279246573` → **43,481,279.246573 USDC** |
| decimals | "How do I read an ERC-20 token's decimals using eth_call?" — 15 cited sources | `eth_call` decimals() on USDC @ block 20695304 | **6** |
| balanceOf | "How do I read an ERC-20 token balance with balanceOf using eth_call?" — 10 cited sources, names calldata `0x70a08231…` | `get_logs` (recent USDC Transfers) → holder `0x936564245b69f5a293b42cbd752e0ee3bb68b470` → `eth_call` balanceOf(holder) @ block 20695304 | live balance read |
| price | "What is the live USD market price of USDC on Pharos mainnet?" — 10 cited sources; `askQuestion` → `getPage` on the Chainlink feeds page → USDC/USD row gives feed `0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d` | `get_code` (contract exists) → `eth_call` latestAnswer() @ block 20695304 | **$0.99987** (18 decimals) |

Per-round transcripts (verbatim docs answers + citations + chain calls + interpretations):
`evidence/transcripts/totalsupply.json`, `decimals.json`, `balanceof.json`, `price.json`.

## Spend log

Read-only task: `eth_call` / `get_logs` / `get_code` — **0 gas spent, 0 transactions broadcast.**

## Composition genuineness

Each round records `docs_names_function: true` — the Docs MCP answer literally
names the function the agent then calls (including the exact feed contract for
round 4, which was verified with `get_code` before calling). The docs drive the
chain queries; they are not two disconnected demos.
