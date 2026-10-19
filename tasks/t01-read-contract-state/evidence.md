# T01 · Evidence — Read Contract State via Chain MCP (≥300 words)

## What was built (v2, 2026-10-19)

A contract-state reader in `tasks/t01-read-contract-state/` built directly on
the **Chain MCP** (`https://mcp.pharos.xyz/mcp`, `pharos-mcp-server 0.1.0`,
keyless Streamable HTTP). `src/mcp_client.py` speaks the real MCP protocol —
`initialize` (protocol `2025-03-26`) → `mcp-session-id` header →
`tools/call` — and `bin/read-contract-state.py` issues **every** read as an
MCP tool call by name: `get_chain_info` (chain-id gate), `get_code`
(bytecode check), `get_block_number` (block pinning), `eth_call` per value at
the pinned block. Target: **USDC on Pharos mainnet** (chain 1672)
`0xc879c018db60520f4355c26ed1a6d572cdac1815` — a real token real users hold —
reading `name()`, `symbol()`, `decimals()`, `totalSupply()`. No deployment, no
transactions, no raw JSON-RPC calls anywhere in the task (`rawRpcCalls: 0`).

## Real on-chain facts (live Chain MCP, 2026-10-19)

- **MCP endpoint:** `https://mcp.pharos.xyz/mcp` — server `pharos-mcp-server
  0.1.0`; `get_chain_info` reports chain 1672, native symbol PROS.
- **Contract:** USDC `0xc879c018db60520f4355c26ed1a6d572cdac1815`
  Explorer: https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815
- **Live read (pinned block 20686894):** name="USDC", symbol="USDC",
  decimals=6, totalSupply=43376165573737 (43,376,165.573737 USDC).
- **Negative paths:** `get_code` on the burn address returns empty `0x` →
  loud abort; `eth_call` with selector `0xdeadbeef` returns on-chain
  `execution reverted` inside the tool result → loud `ERROR`, never a value.

## Honesty notes

1. v1 of this task (2026-10-16) read a purpose-deployed `KeeperRegistry` on
   Pharos Atlantic via direct RPC. Reviewers returned it: *"Switch the reads
   to Chain MCP (mainnet is fine)"*. v2 is a full rebuild on the real Chain
   MCP, on the chain the hosted MCP serves. The v1 deployment
   (`0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD`, deploy tx
   `0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b`)
   remains on-chain and untouched; its records (`deployment.json`,
   `evidence.json` v1 fields) are kept as history, not claimed as current.
2. The console try-it-live panel cannot call the hosted MCP endpoint directly
   (no CORS headers — verified by probe), so it routes through the console's
   same-origin proxy (`apps/console/api/mcp.ts`), which issues genuine MCP
   `tools/call` requests server-side. The submitted task code calls the MCP
   directly. Same chain, same values; documented in SUBMISSION.md, not hidden.

## Spend log (≤ 0.15 PHRS budget)

| Action | Tx hash | Cost (PHRS) |
|---|---|---|
| Reads (`eth_call` via Chain MCP) | — (no tx) | 0 |
| **Total** | | **0** |

## Test run

`test/run-tests.sh` — 5 groups, all live: (1) reader runs clean + manifest
emitted; (2) manifest proves MCP routing (`mcpToolsCalled` ⊇ the 4 tools,
`rawRpcCalls == 0`); (3) all 4 values re-read via **independent raw JSON-RPC**
against the public mainnet RPC (no MCP, no shared code path) at the pinned
block and byte-compared; manifest decoded values asserted equal;
(4) negative path 2/2 fail loudly + no-code-address read aborts;
(5) chain-id gate aborts on mismatch. Result: **7/7 groups PASS, 0 failed**
(15 individual checks).

## Artifacts

- `sample-output/transcript-live.txt` — real terminal transcript (live MCP)
- `sample-output/transcript-negative.txt` — negative-path transcript
- `evidence/run-manifest.json` — per-run manifest (MCP endpoint, tool names,
  pinned block, git commit, dirty flag)
- `deployment.json` — v1 Atlantic deployment record (history only)
- Every link in `LINKS.md` was curl-verified HTTP 200.
