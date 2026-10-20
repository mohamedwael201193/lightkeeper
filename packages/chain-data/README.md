# @lightkeeper/chain-data (L1)

The only package that touches RPC/Chain MCP: the canonical Streamable-HTTP
Chain MCP client (`ChainMCP`), the Atlantic/Pharos network-identity table,
fail-on-mismatch chain assertions, and the ≤1,000-block log-chunking helper.

Consolidates the previously duplicated per-task `mcp_client.py` copies
(T01, T12) — tasks import this instead of vendoring their own client.

## API (`lightkeeper_chain_data`)

- `ChainMCP(url, timeout, client_name, client_version)` — `.connect()`, `.call(tool, args)`, `.get_chain_info()`, `.get_block_number()`, `.close()`; raises `MCPError`
- `NETWORKS` — `{"pharos-mainnet": {chain_id: 1672, ...}, "atlantic-testnet": {chain_id: 688689, ...}}`
- `assert_chain_id(reported, expected, *, what)` — fail-on-mismatch, raises `MCPError`
- `chunk_ranges(start, end, max_size=1000)` — inclusive `(from, to)` ranges
- `parse_block(v)`, `parse_sse(text, status)`, `network_for_chain_id(id)`

## Consumers (real runtime imports)

- `tasks/t01-read-contract-state/bin/read-contract-state.py` — client + `assert_chain_id` gate
- `tasks/t12-skill-chain-flow/flow.py` — client (`client_name="lightkeeper-t12"`)
- `tasks/t02-event-log-monitor/monitor.py` — `chunk_ranges` in `scan_range`

## Test

`python3 tests/test_chain_data.py` — 23 tests, offline (live MCP smoke test
behind `LK_LIVE_TESTS=1`).
