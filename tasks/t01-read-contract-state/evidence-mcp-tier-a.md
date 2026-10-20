# T01 · Tier-A evidence — `get_storage_at`: state the client doesn't decode

Live Chain MCP (`https://mcp.pharos.xyz/mcp`, `pharos-mcp-server 0.1.0`,
protocol `2025-03-26`, Pharos mainnet 1672), captured 2026-10-20T04:05:15Z.
Full verbatim tool results: [`evidence-mcp-tier-a.json`](evidence-mcp-tier-a.json).

The task's typed client decodes contract *values* (`name()`, `symbol()`,
`decimals()`, `totalSupply()` via `eth_call`). This row exercises the live
MCP tool the client never used before — **`get_storage_at`** — and presents
the result exactly as it arrives: raw 32-byte storage, **not decoded**.

| Step | Value |
|---|---|
| Block (pinned via live `get_block_number`) | `20715977` (`0x13c19c9`) |
| Contract | USDC `0xc879c018db60520f4355c26ed1a6d572cdac1815` ([explorer](https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815)) |
| Tool / args | `get_storage_at` `{ "address": "0xc879…1815", "position": "0x0" }` |
| Raw result | `0x0000000000000000000000009f8ea09770dc38fc61f5a62031b3be0526d54d92` |

No claim is made about which storage variable this is — the point is the
honest primitive: the MCP returns the raw slot and the client does not
invent a decoding. Zero raw JSON-RPC in this task (`rawRpcCalls: 0`):
the call above went through `initialize → mcp-session-id → tools/call`.

Reproduce (any MCP client): initialize at `https://mcp.pharos.xyz/mcp`
(protocol `2025-03-26`), then `tools/call get_storage_at`
`{"address":"0xc879c018db60520f4355c26ed1a6d572cdac1815","position":"0x0"}`.
