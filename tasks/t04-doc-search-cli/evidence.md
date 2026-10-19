# T04 — Doc-Search CLI: Evidence

Every query below is a **real `tools/call` round-trip** against the Developer
Docs MCP (`https://docs.pharos.xyz/~gitbook/mcp`). Raw MCP responses are saved
verbatim under `evidence/raw/<id>.txt`; the machine-check test asserts every
citation excerpt is a verbatim substring of its raw log.

Generated: 2026-10-19T21:10:32.592988+00:00

## E1 — DOC-GROUNDED (exit 0)

Query (`search` via `searchDocumentation`):
> how do I deploy a contract on Pharos?

- **Piggy Bank Tutorial** — https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide
- **Rust** — https://docs.pharos.xyz/developer-guide/rust

## E2 — DOC-GROUNDED (exit 0)

Query (`search` via `searchDocumentation`):
> what is the Atlantic testnet chain id and RPC url

- **Pharos Skill Engine** — https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide
- **Atlantic Testnet** — https://docs.pharos.xyz/getting-started/network/atlantic-testnet

## E3 — DOC-GROUNDED (exit 0)

Query (`ask` via `askQuestion`):
> where do I get testnet tokens for gas on Pharos

Synthesized answer (first 350 chars):
> For **Pharos Atlantic Testnet**, get testnet `PHRS` from the **Pharos faucet** or directly from the Pharos team. The docs don’t specify a faucet URL. Add the testnet using chain ID `688689` and RPC `https://atlantic.dplabs-internal.com` ([Atlantic Testnet](/getting-started/network/atlantic-testnet)).  # Sources  - [Write Your First Token](https://d

## E7 — DOC-GROUNDED (exit 0)

Query (`ask` via `askQuestion`):
> what is the Atlantic testnet chain id

Synthesized answer (first 350 chars):
> The Atlantic testnet chain ID is **688689**. See [Atlantic Testnet](/getting-started/network/atlantic-testnet).  # Sources  - [Atlantic Testnet](https://docs.pharos.xyz/getting-started/network/atlantic-testnet) - [x402 Atlantic Testnet](https://docs.pharos.xyz/developer-guide/x402/x402-atlantic-testnet) - [Node Management](https://docs.pharos.xyz/n

## E8 — DOC-GROUNDED (exit 0)

Query (`page` via `getPage`):
> https://docs.pharos.xyz/getting-started/network/atlantic-testnet

None

## M1 — UNVERIFIED (exit 2)

Query (`search` via `searchDocumentation`):
> what is the birthday of the Pharos CEO

No good answer found. The Developer Docs MCP returned 10 result(s) but none covers this question above the relevance gate, so this tool will not improvise an answer.

## M2 — UNVERIFIED (exit 2)

Query (`search` via `searchDocumentation`):
> how do I run a Pharos node on a Raspberry Pi

No good answer found. The Developer Docs MCP returned 10 result(s) but none covers this question above the relevance gate, so this tool will not improvise an answer.

---
Replay: `python3 evidence/run_evidence.py` (real MCP calls).
