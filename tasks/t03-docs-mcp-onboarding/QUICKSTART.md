# First 5 Queries — a Docs-MCP-derived onboarding quickstart

**What this is:** the smallest useful onboarding artifact for a new Pharos builder — five questions,
five answers. **Every answer below is a real Developer Docs MCP answer** captured 2026-10-19 via
the `askQuestion` tool at `https://docs.pharos.xyz/~gitbook/mcp` (public GitBook MCP, no auth),
verbatim excerpts with source links. Where the docs could not answer, the quickstart says so
instead of inventing. Full verbatim log: `evidence/transcripts/transcript-20261019T200816Z.md`.

---

## 1. What chain am I building on?

**Ask:** *"What is the Atlantic testnet chain ID, RPC URL and native currency?"*

> Atlantic Testnet: Chain ID **688689** · RPC `https://atlantic.dplabs-internal.com` · native currency **PHRS** (18 decimals).

Sources: [Atlantic Testnet](https://docs.pharos.xyz/getting-started/network/atlantic-testnet) ·
[Token Registry](https://docs.pharos.xyz/getting-started/token-registry) (via Docs-MCP answer, 2026-10-19)

**Chain-identity note (`evidence.md` G5):** the hosted Chain MCP at `https://mcp.pharos.xyz/mcp`
targets chain ID **1672** — and only a separate query reveals 1672 = **Pacific Mainnet** (`PROS`).
If your agent reads chain state on Atlantic (688689/PHRS), check which chain your tooling points at.

## 2. How do I read chain data as an agent?

**Ask:** *"What is the Pharos Chain MCP and which read tools does it expose for an AI agent?"*

> The **Pharos Chain MCP** connects MCP-compatible AI clients to Pharos chain data and operations
> through natural-language requests. Its hosted endpoint is `https://mcp.pharos.xyz/mcp` using
> Streamable HTTP; it requires no API key and targets chain ID `1672` (`0x688`).
> Read tools: `get_chain_info`, `get_block_number`, `get_block`, `get_gas_price`, `get_balance`
> (native PROS), `get_transaction_count`, `get_transaction`, `get_transaction_receipt`,
> `eth_call`, `estimate_gas`, `get_code`, `get_storage_at`, `get_logs` (event logs; maximum
> 1,000 blocks per call) — plus `send_raw_transaction` (broadcasts an already-signed tx).

Sources: [Pharos MCP](https://docs.pharos.xyz/tooling-and-infrastructure/mcp) (via Docs-MCP answer, 2026-10-19)

## 3. How do I page event logs?

**Ask:** *"What are the block range limits for eth_getLogs queries on Pharos?"*

> For direct Pharos JSON-RPC `eth_getLogs`, the range limit is **100 blocks when rate limiting is
> enabled**, or **10,000 blocks as a fallback cap**. If you're using the Pharos MCP server's
> `get_logs` tool instead, its limit is **1,000 blocks per call**.

Source: [JSON-RPC API Methods](https://docs.pharos.xyz/api-and-sdk/json-rpc-methods) (via Docs-MCP answer, 2026-10-19)

**⚠️ Doc-vs-reality discrepancy (`evidence.md` G3):** live Atlantic `eth_getLogs` enforces a
**1,000-block** cap, which matches neither documented regime. Size your chunks from observed
behavior (1,000), not from the docs text alone.

## 4. Where is the faucet?

**Ask:** *"Where can I get Atlantic testnet PHRS from the official faucet?"*

> **The docs do not publish an official faucet URL.** The setup guide says to get testnet PHRS
> "from the **Pharos faucet** or directly from the team, but it doesn't provide the faucet's URL."

Sources: [Pharos Skill Engine](https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide) ·
[Piggy Bank Tutorial](https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide) (via Docs-MCP answer, 2026-10-19)

This is a documented docs gap (`evidence.md` G2) — do not trust a faucet URL from anywhere but an
official Pharos channel.

## 5. How do I sign in / submit to the Agent Arena?

**Ask:** *"How do I sign in to the Pharos AI Agent Arena portal at ai.pharos.xyz to submit a task?"*

> **The developer docs do not cover the Agent Arena at all** — no sign-in flow, no submission
> instructions, no share-link mechanics (three separate Docs-MCP queries all returned "cannot find").
> The closest documented flow is
> [Publish Service Agent](https://docs.pharos.xyz/tooling-and-infrastructure/overview/publish-skill-af)
> (Anvita Flow publishing — **not** Arena submission; do not conflate them).

This is a documented docs gap (`evidence.md` G1).

---

## Ask it yourself

The Developer Docs MCP is a public MCP endpoint (MCP Streamable HTTP, no auth). This task's
runner calls its `askQuestion` tool with retry-with-backoff (the endpoint drops ~30–40% of
connections; it is stateless, so retry is safe):

```bash
python3 scripts/query_log.py run   # replays all 9 onboarding queries via the Docs MCP → evidence/runs/<ts>.json + transcript + proof
python3 scripts/quote_check.py     # verifies every evidence.md quote against the verbatim transcript
```

Ask one specific, self-contained question per query. When the docs don't cover it, the MCP
says so honestly — treat that "cannot find" as data, not as an invitation to guess.
