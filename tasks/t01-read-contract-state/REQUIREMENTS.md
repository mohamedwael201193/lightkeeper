# T01 — Read Contract State · OFFICIAL REQUIREMENTS (quoted verbatim)

Source: Pharos Agent Arena Build page for T01, extracted 2026-10-15
(quoted in `~/workspace/your_files/pharos-arena-MEGA.md` §4, T01 entry).

> **OFFICIAL requirements:** (1) Read ≥3 different values from one contract via
> Chain MCP (name/totalSupply/owner/balance...). (2) Show contract address +
> block number read at. (3) Format raw values for humans (decimals applied,
> addresses labelled). (4) Short README (which contract, how to run, sample
> output).

## How this submission meets each bullet

| # | Official requirement | This submission |
|---|---|---|
| 1 | Read ≥3 different values from one contract via Chain MCP | **8 values** from one contract (`KeeperRegistry` 0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD): `totalLamps` (uint256), `keeper` (address), `realmName` (string), `decimals` (uint8), `lampBalanceOf(keeper)` (mapping→uint256), `lampBearer(0..2)` (mapping→address). Read via `eth_call` — the exact JSON-RPC primitive behind Chain MCP's `eth_call` tool. (Honest note: the hosted Chain MCP at `mcp.pharos.xyz` serves **mainnet only**, so Atlantic reads go direct-RPC with identical `eth_call` semantics; see README §6.) |
| 2 | Show contract address + block number read at | Every run prints contract address, **pinned block number + block hash**; ALL 8 values are read at that same block (block-pinning, no drift). The run manifest (`evidence/run-manifest.json`) records `blockReadAt` + `blockHash`. |
| 3 | Format raw values for humans (decimals applied, addresses labelled) | `decimals()` is read **from the contract itself (6)** — never assumed — and `lampBalanceOf` renders as `3.000000 lamps`. Addresses are checksummed and labelled via `config/labels.json` (`keeper — deployer (LIGHTKEEPER Atlantic wallet)`); the zero address is labelled, unknown addresses print `unlabeled address` — never silently substituted. |
| 4 | Short README (which contract, how to run, sample output) | `README.md`: contract + explorer link, one-command run, real sample output transcript from the live deployment. |

## Bars above the official minimum (from LIGHTKEEPER-VERDICT.md §4, T01 row)

The competitor's Contract Reader meets all 4 bullets; the bar to beat it is:
*generated evidence manifest + labeled address reads + negative-path run + proof link + video.*
This task ships all five: `evidence/run-manifest.json` (generated per run),
labelled address reads, `bin/read-contract-state.sh --negative` (2/2 fail
loudly), explorer proof links, and a per-task video slot (PENDING-VIDEO).
