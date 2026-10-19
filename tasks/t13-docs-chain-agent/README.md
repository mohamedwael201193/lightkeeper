# T13 — Docs MCP + Chain MCP Agent

**One agent, two real MCPs, one genuine loop:** a question goes to the
Developer Docs MCP (`askQuestion` with cited sources) → the agent calls the
SAME function on-chain via the Chain MCP (`eth_call` by name) → the result is
interpreted in the context of the docs explanation.

- Docs MCP: `https://docs.pharos.xyz/~gitbook/mcp` (public, no auth)
- Chain MCP: `https://mcp.pharos.xyz/mcp` (Pharos mainnet, chain 1672)
- Read-only. Zero raw `eth_*` against RPC URLs. Zero local doc indexes.

## Requirements → evidence

| # | Official requirement (T13, Medium) | How it is met | Evidence |
|---|---|---|---|
| 1 | Explanation comes from Docs MCP WITH sources referenced | Every round asks the Docs MCP `askQuestion`; answers logged verbatim with 10–15 markdown source links each, extracted as DOC-GROUNDED citations (doc URL + retrieval date) | `evidence/transcripts/*.json` → `docs.answer`, `citations[]`; machine-checked by `tests/test_agent.py` |
| 2 | Agent then calls the SAME function on-chain via Chain MCP | `totalSupply()` → `eth_call` data `0x18160ddd`; `decimals()` → `0x313ce567`; `balanceOf(address)` → `0x70a08231…`; `latestAnswer()` → `0x50d25bcd` — all via Chain MCP `tools/call` by name, on Pharos mainnet (chain 1672, asserted) | `src/doc_agent.py` `run_round()`; `evidence/run-manifest.json` (`rawRpcCalls: 0`) |
| 3 | Interprets result in context of explanation | Each round ends with an `[INFERENCE]` interpretation referencing the docs explanation (selector, decimals, feed contract) | `evidence/transcripts/*.json` → `interpretation` |
| 4 | Works for ≥2 different functions/contracts | 4 functions on 2 contracts: `totalSupply`/`decimals`/`balanceOf` on USDC `0xc879c018db60520f4355c26ed1a6d572cdac1815`, `latestAnswer` on the USDC/USD feed `0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d` (the feed contract was NAMED by the Docs MCP answer, then verified with `get_code` before calling) | `evidence/transcripts/` (4 rounds, 4/4 ok) |

## The four rounds (live, 2026-10-20, block 20695304)

1. **totalSupply** — Docs MCP explains `eth_call` with selector `0x18160ddd` (15 sources) → Chain MCP `eth_call` → raw `43481279246573` → 43,481,279.246573 USDC (6 decimals, live).
2. **decimals** — Docs MCP explains `decimals()` as a `uint8` eth_call (15 sources) → live: `6`.
3. **balanceOf** — Docs MCP explains ABI-encoded `balanceOf(address)` (10 sources) → holder `0x936564245b69f5a293b42cbd752e0ee3bb68b470` taken from a REAL recent Transfer log (via Chain MCP `get_logs`) → live balance read.
4. **price** — Docs MCP `askQuestion` points to the Chainlink feeds page; `getPage` on that page yields the USDC/USD row with the feed address (10 sources) → `get_code` confirms the contract exists → `latestAnswer()` live: `$0.99987`.

## Run it

```bash
cd tasks/t13-docs-chain-agent
python3 src/doc_agent.py        # 4 rounds, live against both MCPs (~2 min)
python3 tests/test_agent.py     # offline machine checks: citations, tools, honesty
```

Needs `pip install requests`. No API keys. No wallet. No broadcasts.

## Citation discipline

- **DOC-GROUNDED** — doc URL + retrieval date, extracted from the verbatim Docs MCP answer. Every technical claim carries these.
- **INFERENCE** — derived from grounded facts (on-chain values + docs text), labelled as such.
- **UNVERIFIED** — if the docs don't cover it, the agent says so and does not execute. (The `get_code` pre-check on the docs-named feed contract is the on-chain version of this: no code → no call.)

## Honest notes

- v1 of this task (2026-10-16) used a local docs corpus and direct Atlantic RPC (`cast`). Both were the exact pattern Arena reviewers rejected in T01–T04. v2 (2026-10-20) is a full rebuild on the real MCPs; the corpus is deleted and Atlantic is gone (Chain MCP serves mainnet 1672 only).
- Both MCP endpoints intermittently drop connections (~30–40%); the client retries with backoff (4 attempts). Drops are loud, never silent.
- The balanceOf holder is derived from live Transfer logs — a real address that held USDC at the pinned block, never invented.
