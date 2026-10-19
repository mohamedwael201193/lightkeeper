# T13 Links — verified 2026-10-20

## MCP endpoints (live)

- Chain MCP: https://mcp.pharos.xyz/mcp (Streamable HTTP, mainnet 1672)
- Chain MCP health: https://mcp.pharos.xyz/health
- Docs MCP: https://docs.pharos.xyz/~gitbook/mcp (Streamable HTTP, public)

## On-chain evidence (Pharos mainnet explorer)

- USDC token contract: https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815
- USDC/USD feed contract (named by the Docs MCP): https://pharosscan.xyz/address/0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d

## Docs cited (via Docs MCP askQuestion, 2026-10-20)

Top sources across the four rounds (full per-round lists in `evidence/transcripts/*.json` → `citations[]`):

- https://docs.pharos.xyz/api-and-sdk/json-rpc-methods — `eth_call` reference
- https://docs.pharos.xyz/developer-guide/rust
- https://docs.pharos.xyz/api-and-sdk/eth-getproof

## Repo

- Code + evidence: `tasks/t13-docs-chain-agent/` (`src/doc_agent.py`, `src/mcp.py`, `tests/test_agent.py`)
