# T13 — Arena Submission Pack (copy-paste ready)

## Title

Docs MCP + Chain MCP Agent — the agent that cites, then proves

## One-liner

Ask a Pharos dev question, get a Docs-MCP answer with cited sources, watch the agent call the SAME function on-chain via the Chain MCP and interpret the verified result.

## Description

T13 is the genuine Docs-MCP + Chain-MCP composition loop. For each question the agent (1) asks the real Developer Docs MCP (`askQuestion` at `docs.pharos.xyz/~gitbook/mcp`) and logs the answer verbatim with 10–15 cited doc sources; (2) calls the SAME function on-chain via the real Chain MCP (`eth_call` by name at `mcp.pharos.xyz/mcp`, Pharos mainnet 1672); (3) interprets the result in the context of the docs explanation. Four live rounds: `totalSupply()` → 43,481,279.246573 USDC; `decimals()` → 6; `balanceOf(holder)` → holder taken from REAL Transfer logs; `latestAnswer()` on the USDC/USD feed (address derived via Docs MCP `getPage` on the Chainlink feeds table) → $0.99987. Read-only: 0 gas, 0 broadcasts. `tests/test_agent.py` machine-checks every citation against the verbatim answers.

**Console try-it-live:** the T13 lamp page ships an interactive "Explain then prove" panel — docs-grounded explanation side by side with the LIVE on-chain execution of that exact function, decoded and interpreted. Free reads, no wallet; live reads route through the console's MCP proxy (browsers can't call the MCPs directly).

## Links

- Code (commit-pinned):
  https://github.com/mohamedwael201193/lightkeeper/tree/dc949c522fa32ccd7e66198e9e82fa8fb517c9e0/tasks/t13-docs-chain-agent
- USDC on Pharos mainnet: https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815
- USDC/USD feed (named by the Docs MCP): https://pharosscan.xyz/address/0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d
- Demo video: REPLACE_WITH_NEW_VIDEO_LINK

## Video

REPLACE_WITH_NEW_VIDEO_LINK
<!-- Suggested shots: question → Docs MCP answer with sources → same function
     called on-chain → interpreted result → second function/contract. -->

## Accuracy audit (added 2026-10-20)

Beyond the composition loop (docs name it, chain proves it), we independently
re-verified every cited docs claim with an original implementation — fresh MCP
round-trips, not the task's scripts or pinned figures:

- **B1** The Docs MCP really does name `0x18160ddd` as the `totalSupply()`
  selector (fresh `askQuestion`, verbatim answer assertion)
- **B2** Every docs-cited selector **recomputed with a real keccak** (`cast`):
  `totalSupply()`→`0x18160ddd`, `decimals()`→`0x313ce567`,
  `balanceOf(address)`→`0x70a08231`, `latestAnswer()`→`0x50d25bcd` — all match
  the docs-cited values, so a docs typo would fail here
- **B3** Fresh Chain MCP `eth_call decimals()` on the docs-cited USDC
  `0xc879c018db60520f4355c26ed1a6d572cdac1815` returns exactly **6**
- **B4** Fresh `eth_call totalSupply()` = **43,481,279.246573 USDC** — the
  pinned 2026-10-20 figure to the last base unit (no drift)
- **B5** The docs-named USDC/USD feed `0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d`
  exists on-chain (4,088 chars of deployed bytecode via `get_code`)
- **B6** Fresh `eth_call latestAnswer()` with the independently computed
  selector reads **$0.999852** (pinned 2026-10-20: $0.99987)

**Verdict: 6/6 PASS.** Report: `tasks/t13-docs-chain-agent/accuracy-audit/accuracy-audit.md`;
machine-readable: `accuracy-audit/audit.json`; machine-check:
`python3 -m unittest tests.test_accuracy_audit` (offline); re-run:
`python3 accuracy-audit/run_audit.py` (real network checks).
