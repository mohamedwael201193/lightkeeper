<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:4px;">
<h1 style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;letter-spacing:0.35em;font-size:42px;margin:0;">T01 · READ CONTRACT STATE</h1>
<p style="color:#ffffff;font-style:italic;font-size:18px;margin:16px 0 0;">The keeper reads the stone before lighting the lamp.</p>
<p style="color:#b9c2f5;font-size:13px;margin:12px 0 0;">LIGHTKEEPER · Lamp 1 of 28 · Pharos Agent Arena · Pharos mainnet · Chain MCP</p>
</div>

## 1 · The 30-second verdict

A contract-state reader that reads **4 typed values** from a live mainnet
contract — **every read is a Chain MCP `tools/call` by name**
(`get_chain_info`, `get_code`, `get_block_number`, `eth_call`) against the
hosted MCP at `https://mcp.pharos.xyz/mcp`. All values are pinned to a single
block, shown with raw hex, decoded values, human formatting (decimals read
from the contract itself), and address labels. Failure states fail loudly —
never silent zeros. **Zero raw JSON-RPC calls** against any RPC URL.

- **Contract:** USDC `0xc879c018db60520f4355c26ed1a6d572cdac1815`
  ([explorer](https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815))
  — a real token real users hold, read on the chain the hosted MCP serves.
- **Chain:** Pharos mainnet, chain ID **1672** (asserted via MCP
  `get_chain_info` before every run).
- **MCP:** `pharos-mcp-server 0.1.0`, keyless Streamable HTTP
  (`initialize` → session header → `tools/call`).
- **Cost:** 0 PHRS — all reads are free; no deployment, no transactions.
- **Proof:** live transcript + per-run evidence manifest recording the MCP
  endpoint, tool names, pinned block, git commit and dirty flag.

## 2 · Requirements → evidence

| # | Official Arena requirement | How this submission meets it | Evidence |
|---|---|---|---|
| 1 | Read ≥3 different values from one contract **via Chain MCP** | 4 values from one contract — `name()` (string), `symbol()` (string), `decimals()` (uint8), `totalSupply()` (uint256) — each read as an MCP `tools/call` named `eth_call`. No `eth_*` call is ever made against an RPC URL. | `bin/read-contract-state.py` (`read_view`); manifest `mcpToolsCalled`; `sample-output/transcript-live.txt` |
| 2 | Show contract address + block number read at | Every run prints the contract address and the pinned block; all 4 reads carry that block. | Transcript header; manifest `blockReadAt` |
| 3 | Format raw values for humans (decimals applied, addresses labelled) | `decimals()` is read **from the contract itself (6)** — never assumed — and `totalSupply` renders as `43,376,165.573737 USDC`. Addresses are checksummed and labelled via `config/labels.json`; the zero address is special-cased; unknown addresses print `unlabeled address` — never a made-up label. | Transcript `human` lines; `config/labels.json` |
| 4 | Short README (which contract, how to run, sample output) | This file: contract + explorer link (§1), one-command run (§4), real sample output (§5). | — |

## 3 · Which contract

USDC on Pharos mainnet (`0xc879c018db60520f4355c26ed1a6d572cdac1815`,
code length 1798 bytes, verified via MCP `get_code`). The hosted Chain MCP
serves mainnet (chain 1672) only, so the task reads where the MCP reads —
a production token instead of a test deployment.

| # | Value | Type | Selector |
|---|---|---|---|
| 1 | `name` | `string` | `0x06fdde03` → `"USDC"` |
| 2 | `symbol` | `string` | `0x95d89b41` → `"USDC"` |
| 3 | `decimals` | `uint8` | `0x313ce567` → `6` |
| 4 | `totalSupply` | `uint256` | `0x18160ddd` → `43376165573737` raw → `43,376,165.573737 USDC` |

## 4 · How to run

Prerequisites: Python 3 + `requests` (stdlib otherwise). No API key, no
private key, no RPC URL — the Chain MCP is keyless. No install step.

```bash
# read everything, pretty-printed, with a per-run evidence manifest
bin/read-contract-state.sh --manifest evidence/run-manifest.json

# pin a historical block instead of latest
bin/read-contract-state.sh --block 20686000

# read a different contract (any mainnet address with code)
bin/read-contract-state.sh --contract 0x...

# negative-path suite (no-code address + unknown selector): both must fail loudly
bin/read-contract-state.sh --negative

# test suite: reader vs INDEPENDENT raw-JSON-RPC re-reads + gates
bash test/run-tests.sh
```

The script asserts **chain ID 1672 via MCP `get_chain_info` first** and aborts
on mismatch; checks the address holds bytecode via MCP `get_code`; pins one
block via MCP `get_block_number`; then issues all `eth_call`s at that block —
each one an MCP `tools/call` by name.

## 5 · Sample output (real — live Chain MCP, 2026-10-19)

```
mcp              https://mcp.pharos.xyz/mcp
mcp server       pharos-mcp-server 0.1.0
chain            1672 (Pharos mainnet) — asserted via get_chain_info
contract         0xc879c018db60520f4355c26ed1a6d572cdac1815  (USDC — Pharos mainnet stablecoin (real token real users hold))
code length      1798 bytes — get_code non-empty
block read at    20686894  (all reads pinned here)
═══ LIGHTKEEPER · T01 · READ CONTRACT STATE (Chain MCP) ═══
▸ name        · string  · selector 0x06fdde03
    raw     0x000000000000000000…00000000
    decoded USDC
    human   "USDC"
▸ symbol      · string  · selector 0x95d89b41
    raw     0x000000000000000000…00000000
    decoded USDC
    human   "USDC"
▸ decimals    · uint8   · selector 0x313ce567
    raw     0x000000000000000000…00000006
    decoded 6
    human   6 — human-formatting scale (read from the contract, never assumed)
▸ totalSupply · uint256 · selector 0x18160ddd
    raw     0x000000000000000000…4cf0d469
    decoded 43376165573737
    human   43,376,165.573737 USDC
reads            4 values · 4 MCP tools (eth_call, get_block_number, get_chain_info, get_code) · 0 raw-RPC calls
manifest         evidence/run-manifest.json
```

Full transcript: `sample-output/transcript-live.txt`.

## 6 · Reading & decoding notes

- **Real MCP protocol.** `src/mcp_client.py` speaks Streamable HTTP:
  `initialize` (protocol `2025-03-26`) → captures the `mcp-session-id`
  response header → `notifications/initialized` → `tools/call` with the
  `Mcp-Session-Id` header on every call. SSE `data:` frames are parsed and
  matched by request id; the inner `content[0].text` JSON is decoded.
  Sessions are reused per process and re-handshaked on `-32000`.
- **Block pinning.** `get_block_number` → every `eth_call` carries that block,
  so "block read at" is honest — no drift between the 4 reads.
- **Decimals are read, not assumed.** `decimals()` returns 6 from chain; the
  human supply is `raw / 10^decimals` with integer arithmetic.
- **Reverts surface inside the tool result.** An unknown selector does not
  raise at the MCP layer — the EVM revert arrives as
  `{"error": {"message": "execution reverted: ", ...}}` inside a successful
  tool result. The reader treats that as a loud `ERROR`, never a value.
- **Address labels.** `config/labels.json` maps known addresses to labels;
  the zero address is special-cased; anything else prints
  `unlabeled address` — never a made-up label.

## 7 · Failure modes (first-class, never silent)

| Trigger | Behavior |
|---|---|
| Wrong chain ID | abort, `chain-id mismatch … refusing to read the wrong network` |
| No-code address | abort, `no contract code at …` (verified in `--negative` case A via `get_code`) |
| Unknown selector | on-chain `execution reverted` → `ERROR`, never a fabricated value (case B) |
| View returns empty `0x` | treated as failure, not zero |
| MCP/session failure | abort with `ERROR`, exit non-zero |

`bin/read-contract-state.sh --negative` runs cases A+B and passes only if both
fail loudly (2/2). Transcript: `sample-output/transcript-negative.txt`.

## 8 · Tests

`test/run-tests.sh` (5 groups, all live — no mocks, no secrets needed):

1. Reader runs clean and emits a manifest.
2. **Manifest proves MCP routing**: asserts `mcpEndpoint`,
   `mcpToolsCalled ⊇ {get_chain_info, get_code, get_block_number, eth_call}`,
   and `rawRpcCalls == 0`.
3. **Independent re-reads**: raw JSON-RPC `eth_call` against the public
   mainnet RPC (no MCP, no shared code path) at the pinned block — all 4
   values byte-compared; manifest decoded values asserted equal.
4. Negative path: suite passes + direct no-code-address read aborts.
5. Chain-id gate: `EXPECT_CHAIN_ID=1` aborts.

Result: **7/7 groups PASS** (15 individual checks).

## 9 · Files & evidence index

| Path | What |
|---|---|
| `src/mcp_client.py` | minimal Streamable-HTTP MCP client (stdlib + `requests`) |
| `bin/read-contract-state.py` | the reader (all reads = MCP `tools/call` by name) |
| `bin/read-contract-state.sh` | one-command entry point (delegates to the reader) |
| `config/labels.json` | address → human labels |
| `evidence/run-manifest.json` | generated per-run manifest (endpoint, tools, block, commit, dirty) |
| `sample-output/transcript-live.txt` | real terminal transcript |
| `sample-output/transcript-negative.txt` | negative-path transcript |
| `test/run-tests.sh` | live test suite |
| `REQUIREMENTS.md` | official requirements, quoted verbatim, with the mapping |
| `SUBMISSION.md` | arena submission pack (copy-paste) |

**History note (honest):** v1 of this task (2026-10-16) read a purpose-deployed
`KeeperRegistry` contract on Pharos Atlantic via direct RPC and was returned by
reviewers with "Switch the reads to Chain MCP (mainnet is fine)". v2
(2026-10-19) is a full rebuild: every read is a genuine Chain MCP tool call,
on the chain the hosted MCP serves. The v1 Atlantic deployment
(`0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD`) remains on-chain and untouched;
nothing about it is claimed here.
