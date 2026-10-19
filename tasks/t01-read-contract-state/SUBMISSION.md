# T01 — SUBMISSION PACK (copy-paste into the Arena form — do NOT submit on my behalf)

## Title
T01 · Read Contract State — USDC live reader via Chain MCP (Pharos mainnet)

## One-liner
Reads 4 typed state values from live USDC on Pharos mainnet — every read a
genuine Chain MCP `tools/call` by name — all pinned to one block, with human
formatting, address labels, and a stamped per-run manifest. Failures fail
loudly, never silently.

## Full description
A contract-state reader built directly on the Chain MCP
(`https://mcp.pharos.xyz/mcp`, `pharos-mcp-server 0.1.0`, keyless Streamable
HTTP). `src/mcp_client.py` speaks the real MCP protocol — `initialize`
(protocol 2025-03-26) → `mcp-session-id` header → `tools/call` — and the
reader (`bin/read-contract-state.py`) issues every read as an MCP tool call
by name: `get_chain_info` (chain-id gate: asserts 1672 before anything else),
`get_code` (bytecode check: aborts loudly on no-code addresses),
`get_block_number` (block pinning), then `eth_call` per value at the pinned
block. Target: USDC `0xc879c018db60520f4355c26ed1a6d572cdac1815` — a real
token real users hold — reading `name()` (string → "USDC"), `symbol()`
(string → "USDC"), `decimals()` (uint8 → 6), `totalSupply()` (uint256 →
43,376,165.573737 USDC). Decimals are read from the contract itself, never
assumed; addresses are checksummed and labelled; unknown selectors revert
on-chain and the revert surfaces as a loud `ERROR` (the MCP returns
`{"error": {"message": "execution reverted: "}}` inside the tool result —
never a fabricated value). No raw JSON-RPC call is made against any RPC URL
anywhere in this task (`rawRpcCalls: 0`, asserted by the test suite).
Failure states are first-class: wrong chain-id, no-code address, unknown
selector, and empty returns all abort loudly — demonstrated by
`bin/read-contract-state.sh --negative` (2/2 fail loudly). Evidence: per-run
manifest stamping the MCP endpoint, tool names, pinned block, git commit and
dirty flag; real terminal transcripts; a live test suite (reader vs
INDEPENDENT raw-JSON-RPC re-reads at the pinned block — 7/7 groups pass).
Total spend: 0 PHRS (all reads free; no deployment, no transactions). No
mocks, no fixtures, no placeholders.

**Console try-it-live:** the T01 lamp page on the LIGHTKEEPER console ships an
interactive "Ask any contract anything" panel
(`apps/console/src/components/try/read-contract-state.tsx`): any visitor
pastes an ERC-20 contract address and gets live name()/symbol()/decimals()/
totalSupply() (+ optional balanceOf) reads, all pinned to one block,
human-formatted with decimals from the contract itself — free reads, no
wallet, no signature. (Note: browsers cannot call the hosted MCP endpoint
directly — it sends no CORS headers, verified by probe — so the panel routes
through the console's same-origin proxy (`apps/console/api/mcp.ts`), which
issues genuine MCP `tools/call` requests server-side. The submitted task code
calls the MCP directly. Same chain, same values, no fabricated data.)

## Repo link (commit-pinned subfolder)
https://github.com/mohamedwael201193/lightkeeper/tree/REPLACE_WITH_COMMIT_SHA/tasks/t01-read-contract-state

## Proof links
- Contract (Pharos mainnet): https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815
- Per-run manifest: `evidence/run-manifest.json` in the repo subfolder (stamps MCP endpoint, tool names, pinned block, commit, dirty flag)
- Live transcript: `sample-output/transcript-live.txt` in the repo subfolder

## Transactions
None — this task performs zero transactions (read-only; all reads free).

## Video
REPLACE_WITH_NEW_VIDEO_LINK — re-recorded 2026-10-19+: the full reader run
against the live Chain MCP (4 values via eth_call, pinned block, manifest),
plus the --negative suite failing loudly. The v1 video (Atlantic direct-RPC)
is superseded.

## Reviewer notes

- Resubmission after "Changes requested": every read is now a Chain MCP
  `tools/call` by name (`get_chain_info`, `get_code`, `get_block_number`,
  `eth_call`) against `https://mcp.pharos.xyz/mcp` on Pharos mainnet (1672) —
  zero direct-RPC calls in the task code (`rawRpcCalls: 0` in the manifest).
- The reviewer's "(mainnet is fine)" is honored: reads target USDC
  `0xc879c018db60520f4355c26ed1a6d572cdac1815` (name/symbol/decimals/
  totalSupply), all pinned to one block, human-formatted from the contract's
  own decimals.
- New video (below) records the v2 code running live, including the
  `--negative` suite.
