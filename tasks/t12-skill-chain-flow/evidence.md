# T12 — Skill + Chain MCP Flow · Evidence (v2)

Pharos mainnet (chain 1672) via the real Chain MCP (`https://mcp.pharos.xyz/mcp`).
Every chain read below is an MCP `tools/call` by name. Zero broadcasts by design
(mainnet = real funds; `policy.yaml` `behavior.no_broadcast: true`).

## v2 contrast runs (2026-10-20, live)

**allow-1** (`--amount-usdc 100`), run `allow-1-1792448486`:
- READ @ block 20695075: chainId 1672, USDC balance **16,712.740923**
  (16,712,740,923 base units, decimals 6 read live), PROS 0, gas **10 gwei**
- SKILL: RULE-NETWORK PASS, RULE-BALANCE PASS, RULE-GAS PASS, RULE-FRESHNESS PASS
  → **ALLOW**
- EXECUTE: `estimate_gas` via Chain MCP → **52,679 gas** (simulation only —
  no signature, no broadcast)
- VERIFY @ block 20695077: balance unchanged, verdict STABLE → OK

**block-1** (`--amount-usdc 1000000`), run `block-1-1792448505`:
- READ @ block 20695080: chainId 1672, USDC balance **16,712.740923**,
  gas 10 gwei
- SKILL: RULE-BALANCE **FAIL** — "live USDC balance=16712740923 base units
  (16712.740923 USDC) vs proposed 1000000000000 (1000000 USDC)" → **BLOCK**
- EXECUTE: skipped loudly — nothing simulated, nothing signed
- VERIFY @ block 20695083: verdict STABLE → OK

Full transcripts: `run-logs/flow-transcript.jsonl` (v2 entries;
v1 Atlantic lines retained above as labeled history).
Run manifest: `evidence/run-manifest.json`
(`mcp_tools_called`: get_chain_info, get_block_number, get_balance, eth_call,
get_gas_price, estimate_gas; `raw_rpc_calls: 0`).

## MCP endpoint & tools (stamped)

- Endpoint: `https://mcp.pharos.xyz/mcp` (Streamable HTTP, keyless)
- Server: `pharos-mcp-server` (verified via live `tools/list`, 14 tools)
- Health: `https://mcp.pharos.xyz/health` → `{"status":"ok","chainId":1672}`

## v1 history (superseded 2026-10-20, retained)

v1 read Atlantic testnet (chain 688689) via `cast`. Broadcasts below are real
but belong to the superseded design — not claimed as current.

| # | Run | Tx hash | Block | Status |
|---|---|---------|-------|--------|
| 1 | deploy KeeperPing | [`0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3`](https://atlantic.pharosscan.xyz/tx/0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3) | 31481433 | success |
| 2 | allow-3 `ping()` dust | [`0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349`](https://atlantic.pharosscan.xyz/tx/0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349) | 31482141 | success |
| 3 | allow-4 `ping()` dust (post-harden) | [`0x022bc47b3f1932f531791f7b6fc9ed30da719bf9535394c30e4bbcbc11fd7128`](https://atlantic.pharosscan.xyz/tx/0x022bc47b3f1932f531791f7b6fc9ed30da719bf9535394c30e4bbcbc11fd7128) | 31486412 | success |

## Honesty notes

1. v1's "Chain MCP-equivalent queries" rationalization is withdrawn (see
   REQUIREMENTS.md). v2 calls the real Chain MCP tools by name.
2. The watched holder (`0x936564245b69f5a293b42cbd752e0ee3bb68b470`) was found
   via live `get_logs` (USDC Transfers); the skill reads its public balance
   only — never transacts with it.
3. `get_gas_price` returns `{"gasPriceWei": "<decimal>", ...}` and
   `get_balance` returns `{"balanceWei": "<decimal>", ...}` — parsed as
   decimals (an early v2 build mis-parsed these as hex and was fixed before
   the evidence runs; the fix is in the committed code).
4. No-broadcast is deliberate and documented, not a gap: proving the
   *decision* depends on MCP data is what the composition requirement tests.
