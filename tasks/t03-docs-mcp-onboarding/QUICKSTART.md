# First 5 Queries — a Docs-MCP-derived onboarding quickstart

**What this is:** the smallest useful onboarding artifact for a new Pharos builder — five questions,
five answers. **Every answer below is a real Docs-MCP answer** captured 2026-10-16 from the documented
ask endpoint (`GET https://docs.pharos.xyz/<page>.md?ask=<q>&goal=<g>`), verbatim excerpts with source
links. Where the docs could not answer, the quickstart says so instead of inventing. Full verbatim
log: `evidence.json`.

---

## 1. What chain am I building on?

**Ask:** *"What is the Atlantic testnet chain ID, RPC URL and native currency?"*

> Atlantic Testnet: Chain ID **688689** · RPC `https://atlantic.dplabs-internal.com` · native currency **PHRS**.
> Rate limit: 500 requests / 5 min · max 64 pending txs per address · explorer `https://atlantic.pharosscan.xyz/`.

Sources: [Atlantic Testnet](https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md) ·
[`llms.txt`](https://docs.pharos.xyz/llms.txt) ("Do not rely on memorized network parameters… Confirm against the Live Data section.")

**⚠️ Chain-identity trap (confirmed, see `evidence.md` G2):** the hosted Chain MCP at
`https://mcp.pharos.xyz/mcp` serves chain **1672 / PROS** — Pacific mainnet — not Atlantic.
If your agent reads chain state, check which chain your tooling points at.

## 2. How do I read chain data as an agent?

**Ask:** *"What is the Pharos Chain MCP and which read tools does it expose for an AI agent?"*

> The Pharos Chain MCP is a public MCP server (`https://mcp.pharos.xyz/mcp`, Streamable HTTP, **no API key**)
> that lets MCP-compatible clients (Claude Desktop, Cursor, Windsurf, Codex…) query chain data in plain
> language. Read tools: `get_chain_info`, `get_block_number`, `get_block`, `get_gas_price`,
> `get_balance`, `get_transaction_count`, `get_transaction`, `get_transaction_receipt`, `eth_call`,
> `get_code`, `get_storage_at`, `get_logs`, `estimate_gas` — plus `send_raw_transaction` for writes.
> Hosted quota: 120 requests/minute/IP.

Source: [Pharos MCP](https://docs.pharos.xyz/tooling-and-infrastructure/mcp.md)

## 3. How do I page event logs?

**Ask:** *"What are the block range limits for eth_getLogs queries on Pharos?"*

> Block-range limit: **100 blocks when rate limiting is enabled**, **10,000-block fallback cap**.
> For a monitor, use batches of ≤100 blocks.

Source: [JSON-RPC API Methods](https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md) (via Docs-MCP answer)

## 4. Where is the faucet?

**Ask:** *"Where can I get Atlantic testnet PHRS from the official faucet?"*

> **The docs do not publish an official faucet URL.** They say to get testnet PHRS "from the Pharos
> faucet or directly from the team" (see the [Piggy Bank Tutorial](https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide.md)).
> This is a documented docs gap (`evidence.md` G3) — do not trust a faucet URL from anywhere but an
> official Pharos channel.

## 5. How do I sign in / submit to the Agent Arena?

**Ask:** *"How do I sign in to the Pharos AI Agent Arena portal at ai.pharos.xyz to submit a task?"*

> **The developer docs do not cover the Agent Arena at all** — no sign-in flow, no submission
> instructions, no share-link mechanics (three separate Docs-MCP queries all returned "cannot find").
> This is a documented docs gap (`evidence.md` G4). The closest documented flow is
> [Publish Service Agent](https://docs.pharos.xyz/tooling-and-infrastructure/overview/publish-skill-af.md)
> (Anvita Flow publishing — **not** Arena submission; do not conflate them).

---

## Ask it yourself

The Docs-MCP ask endpoint is scriptable from plain HTTP (with rate-limit caveats — see `evidence.md` G1):

```bash
python3 scripts/query_log.py run   # replays all 9 onboarding queries, stores verbatim Q/A in evidence.json
```

Ask one specific, self-contained question per query. When the docs don't cover it, the endpoint
says so honestly — treat that "cannot find" as data, not as an invitation to guess.
