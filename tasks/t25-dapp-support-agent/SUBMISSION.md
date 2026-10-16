# T25 — Arena Submission Pack (copy-paste ready)

## Title

`dApp Support Agent — plain-language failure diagnosis for Pharos Atlantic`

## One-liner

`Paste a tx hash, get the failure cause in plain English with a fix — plus doc-grounded Pharos Q&A that cites its sources or says "I don't know".`

## Description

A support agent for the Pharos Atlantic testnet (chain id 688689) with two real capabilities.

**1. Live diagnostics.** `diagnose <txhash>` fetches the transaction + receipt and walks a cause tree: out-of-gas (`gasUsed == gasLimit`), revert-with-reason (`eth_call` replay at block−1, `Error(string)` decoded), Solidity panics (`Panic(uint256)` with code meanings), silent reverts, unknown custom errors (selector reported honestly), insufficient native balance and insufficient allowance (pre-condition reads at block−1), plus honest pending/not-found paths — the pending-vs-dropped unknown is stated, not guessed. Every verdict ships a plain-language explanation, a suggested fix, a DOC-GROUNDED/INFERENCE label, and the explorer link. `account <address>` reports balance, tx count, EOA/contract, and recent ERC-20 activity with an honest coverage note.

**2. Doc-grounded Q&A.** Answers Pharos questions from a local KB built from real doc-page fetches (2026-10-16: `llms.txt`, Atlantic Testnet page, FAQs, SkillEngine `networks.json`). Every answer carries DOC-GROUNDED (URL + fetch date + excerpt) / INFERENCE / UNVERIFIED labels. When the docs don't cover a question, the agent says so instead of improvising (demonstrated live).

**Evidence — 3 distinct real failure types, all mined on Atlantic (self-generated dust txs, labeled):**
- Revert with reason: https://atlantic.pharosscan.xyz/tx/0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23 (block 31482154)
- Out of gas (gasUsed == gasLimit == 120000): https://atlantic.pharosscan.xyz/tx/0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf (block 31482265)
- Solidity Panic(0x11) overflow: https://atlantic.pharosscan.xyz/tx/0x2c78309c41ce0bd53f611ac5a1ad5e2bfa0e29b7f5e3514b9f0a429c2dcab048 (block 31482171)

Fixture contract: https://atlantic.pharosscan.xyz/address/0xC987a20fEEDc38772cE0786c3233148586a67e53 (`src/TestReverter.sol`).
Tests: `python3 tests/test_agent.py` → 8/8 PASS, every diagnostic value asserted against live chain queries. Stdlib only, read-only (never broadcasts). Spend ≈ 0.0011 PHRS.

**Interactive console panel (Tier A, no wallet):** `apps/console/src/components/try/t25-dapp-support-agent.tsx` — "Every failed tx, explained." Paste ANY Atlantic tx hash (a preset or the visitor's own failed tx) and get the live diagnosis in the browser: tx hash → receipt → cause → plain-language explanation → fix. The panel deepens the CLI engine with new signatures: intrinsic-gas shortfall (<21,000), no-code-at-destination, early/late silent-revert heuristic from the gas-burn share, constructor-revert detection, and a live `eth_estimateGas` retry suggestion for out-of-gas cases. Revert replay preserves the RPC error `data` field (the shared `rpcCall` drops it). Unknown cases report "unknown" with the raw receipt — nothing invented.

## Links

- Repo (commit-pinned): https://github.com/mohamedwael201193/lightkeeper/tree/ae37f9a/tasks/t25-dapp-support-agent
- Share/demo link: PENDING (portal share-link mechanics unverified — fallback: explorer tx links above, all curl-verified HTTP 200)
- Video: PENDING-VIDEO (guide: VIDEO-GUIDE.md)

## Reviewer notes (summary)

Run `python3 src/support_agent.py diagnose 0x31993dc8…` and compare with the explorer link — same receipt, same numbers. Try the say-so path: `ask "How do I run a confidential transaction on Pharos?"`. Full notes: REVIEWER_NOTES.md. Honest gaps: no organic third-party failure in-window (400 blocks scanned); account activity is ERC-20 Transfers only (disclosed); panic-code meanings labeled INFERENCE.
