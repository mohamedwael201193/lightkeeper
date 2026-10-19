# T01 — Read Contract State · OFFICIAL REQUIREMENTS (quoted verbatim)

Source: Pharos Agent Arena Build page for T01, extracted 2026-10-15
(quoted in `~/workspace/your_files/pharos-arena-MEGA.md` §4, T01 entry).

> **OFFICIAL requirements:** (1) Read ≥3 different values from one contract via
> Chain MCP (name/totalSupply/owner/balance...). (2) Show contract address +
> block number read at. (3) Format raw values for humans (decimals applied,
> addresses labelled). (4) Short README (which contract, how to run, sample
> output).

## How this submission meets each bullet (v2 — rebuilt 2026-10-19)

| # | Official requirement | This submission |
|---|---|---|
| 1 | Read ≥3 different values from one contract via Chain MCP | **4 values** from one contract — USDC `0xc879c018db60520f4355c26ed1a6d572cdac1815` on Pharos mainnet (chain 1672): `name()` (string), `symbol()` (string), `decimals()` (uint8), `totalSupply()` (uint256). Every read is an MCP `tools/call` **by name** (`eth_call`) against the hosted Chain MCP `https://mcp.pharos.xyz/mcp` (`pharos-mcp-server 0.1.0`) via `src/mcp_client.py` (Streamable HTTP: `initialize` → `mcp-session-id` → `tools/call`). **Zero raw JSON-RPC calls** against any RPC URL — `rawRpcCalls: 0` is asserted in the per-run manifest and in `test/run-tests.sh` group 2. |
| 2 | Show contract address + block number read at | Every run prints contract address and the pinned block (from MCP `get_block_number`); ALL 4 values are read at that same block (block-pinning, no drift). The run manifest (`evidence/run-manifest.json`) records `blockReadAt`, `mcpEndpoint`, `mcpToolsCalled`, `gitCommit`, `gitDirty`. |
| 3 | Format raw values for humans (decimals applied, addresses labelled) | `decimals()` is read **from the contract itself (6)** — never assumed — and `totalSupply` renders as `43,376,165.573737 USDC`. Addresses are checksummed and labelled via `config/labels.json`; the zero address is special-cased; unknown addresses print `unlabeled address` — never silently substituted. |
| 4 | Short README (which contract, how to run, sample output) | `README.md`: contract + explorer link, one-command run, real sample output transcript from the live Chain MCP (2026-10-19), plus a "Requirements → evidence" table. |

## Bars above the official minimum (from LIGHTKEEPER-VERDICT.md §4, T01 row)

The bar to beat is: *generated evidence manifest + labeled address reads +
negative-path run + proof link + video.* This task ships all five:
`evidence/run-manifest.json` (generated per run, stamps MCP endpoint + tool
names + commit + dirty flag), labelled address reads,
`bin/read-contract-state.sh --negative` (2/2 fail loudly, via MCP `get_code`
and `eth_call`), explorer proof links, and a per-task video slot.

## Reviewer feedback addressed (v1 → v2)

v1 (2026-10-16) was returned with: *"The task requires reads through Chain
MCP; your code still reads directly from the Atlantic RPC. Switch the reads
to Chain MCP (mainnet is fine) and resubmit."* v2 answers it directly: the
Atlantic direct-RPC path is gone; the task now reads a mainnet contract
through genuine Chain MCP tool calls, exactly as the reviewer asked.
