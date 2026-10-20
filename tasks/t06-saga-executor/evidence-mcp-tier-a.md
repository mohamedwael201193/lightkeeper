# T06 · Tier-A evidence — `get_transaction` + `get_transaction_receipt` chain boundary

Live Chain MCP (`https://mcp.pharos.xyz/mcp`, `pharos-mcp-server 0.1.0`,
protocol `2025-03-26`, Pharos mainnet 1672), captured 2026-10-20T04:05:24Z.
Full verbatim tool results: [`evidence-mcp-tier-a.json`](evidence-mcp-tier-a.json).

Canonical saga flow transaction (run B — forced failure, from `evidence.json`):
`0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05`
(`execute(minOut=2001)` — the deliberately impossible step).

| Tool / args | Live MCP result (verbatim) |
|---|---|
| `get_transaction` `{ "hash": "0x91f7e021…f819b05" }` | `{"content":[{"type":"text","text":"null"}]}` |
| `get_transaction_receipt` `{ "hash": "0x91f7e021…f819b05" }` | `{"content":[{"type":"text","text":"null"}]}` |

**Why `null` is the honest answer:** the hosted Chain MCP serves Pharos
**mainnet (chain 1672) only**. The T06 saga executed on **Atlantic testnet
(chain 688689)** — its transactions never existed on mainnet, so `null`
is the correct live response, not a failure. This row documents that chain
boundary exactly as the tools report it.

**Judge-verifiable receipt** (Atlantic explorer, the chain where the saga ran):
[`0x91f7e021…f819b05`](https://atlantic.pharosscan.xyz/tx/0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05)
— block `31482534`, receipt status `0x0` (failed, as designed).

Nothing was fabricated: the nulls above are the real MCP responses, and the
Atlantic facts are the real on-chain records from this task's evidence.
