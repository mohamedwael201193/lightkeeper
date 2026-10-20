# T14 · Tier-A evidence — `get_transaction_count` fresh-vs-veteran check

Live Chain MCP (`https://mcp.pharos.xyz/mcp`, `pharos-mcp-server 0.1.0`,
protocol `2025-03-26`, Pharos mainnet 1672), captured 2026-10-20T04:05:33Z.
Full verbatim tool results: [`evidence-mcp-tier-a.json`](evidence-mcp-tier-a.json).

The portfolio wallet `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` (the task's
Atlantic wallet) is classified on **mainnet** by live nonce, calibrated
against a veteran anchor derived live from the latest mainnet block
(`get_block` → first tx → `get_transaction` → sender → `get_transaction_count`).

| Check | Tool / args | Live result |
|---|---|---|
| Portfolio wallet nonce | `get_transaction_count` `{ "address": "0xf76e…C71a3" }` | nonce `36` (`0x24`) — small mainnet history, not a fresh-zero wallet |
| Latest block | `get_block_number` | `20715999` (`0x13c19df`) |
| Anchor block | `get_block` `{ "block": "latest", "includeTransactions": true }` | `0x13c19e1` (20716001), 1 tx |
| Anchor tx | `get_transaction` `{ "hash": "0xa65474ff6bcc75d7bb9e456f774f18e7d33e2dcf454691e8b1ecebff05c9cade" }` | from `0xc5f6fe56976e0a55aed6c0e08951a8a2f8980f45` |
| **Veteran anchor nonce** | `get_transaction_count` `{ "address": "0xc5f6…80f45" }` | nonce **`205739`** (`0x323ab`) |
| Anchor receipt (judge-verifiable) | `get_transaction_receipt` `{ "hash": "0xa65474ff…9cade" }` | status `0x1`, block `0x13c19e1`, gasUsed `0x23bca`, to `0x936564245b69f5a293b42cbd752e0ee3bb68b470` ([explorer](https://pharosscan.xyz/tx/0xa65474ff6bcc75d7bb9e456f774f18e7d33e2dcf454691e8b1ecebff05c9cade)) |

Reading the check: the portfolio wallet (36 mainnet txs) is **not** a
brand-new wallet — a portfolio assistant would treat it as "light history"
rather than "fresh". The veteran anchor (205,739 txs, a live mainnet sender
at capture time, **not** the portfolio wallet) gives the calibration point.

Reproduce: initialize at `https://mcp.pharos.xyz/mcp` (protocol
`2025-03-26`), then `tools/call get_transaction_count`
`{"address":"0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"}`.
