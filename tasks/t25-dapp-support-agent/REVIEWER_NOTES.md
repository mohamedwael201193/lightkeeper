# T25 — Reviewer Notes

**Task:** dApp Support Agent (Easy, 50 · Support / Reporting) · **Chain:** Pharos Atlantic testnet (688689)

## What to check (fastest path)

1. **Run one diagnosis** (needs only `ATLANTIC_RPC_URL` in env — read-only, zero spend):
   `python3 src/support_agent.py diagnose 0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf`
   Expect `verdict: out_of_gas`, gas_used == gas_limit == 120000, block 31482265 — then compare with the explorer link in LINKS.md. They match because both read the same receipt.
2. **Run the say-so test:** `python3 src/support_agent.py ask "How do I run a confidential transaction on Pharos?"` → `not_covered` + "I won't improvise."
3. **Run the suite:** `python3 tests/test_agent.py` → 8/8 PASS (each diagnostic asserted against live `cast` queries).

## Design decisions worth knowing

- **No Chain-MCP dependency at runtime.** The official spec says "fetches tx+receipt via Chain MCP"; this build talks to the Atlantic JSON-RPC directly (the same underlying reads: `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_call`, `eth_getLogs`). Fewer moving parts, same evidence. The verdict's Chain-MCP reference (§2) confirms these map 1:1 to MCP tools (`get_transaction_by_hash`, `get_transaction_receipt`, `eth_call`).
- **Revert decoding is local, via replay at block−1.** The receipt alone doesn't carry revert data; the agent replays the exact calldata with `eth_call` at the pre-tx block and decodes `Error(string)` / `Panic(uint256)` / unknown selectors (reported honestly).
- **Docs-MCP `?ask=` is not used** — it 403s plain GETs (verdict, first-hand). The KB (`src/kb.json`) is 4 hand-built entries from real page fetches on 2026-10-16, each with URL + fetch date + excerpt. Small on purpose: a wrong confident answer is worse than "not covered".
- **Two early txs hit the wrong contract** (0x7536e4a4… and 0xb91c2673…): the deployer wallet is shared by all 28 builders and the first contract address I used belonged to another builder's deploy (identified by bytecode-marker scan). Both calls were re-run against the correct fixture; only the correct runs are evidence. Disclosed here so the extra nonces don't look unexplained.

## Honest gaps

- No organic third-party failure demonstrated (400-block scan found none in-window; re-scanned 250 blocks 2026-10-16, still none); covered by 6 distinct self-generated types, which the spec allows.
- `account` activity covers ERC-20 Transfers only (plain PHRS transfers emit no logs) — disclosed in every report.
- Pending-vs-dropped is unknowable from public RPC — the agent says so.
- Panic-code meanings labeled INFERENCE (standard EVM semantics, no Pharos doc page covers them).

## Spend

≈ 0.0020 PHRS total (4 fixture deploys + 7 diagnostic txs + 2 mis-targeted calls), budget was 0.15. Itemized per-tx in `evidence.json`.
