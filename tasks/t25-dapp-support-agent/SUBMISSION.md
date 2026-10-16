# T25 — Arena Submission Pack (copy-paste ready)

## Title

`dApp Support Agent — plain-language failure diagnosis for Pharos Atlantic`

## One-liner

`Paste a tx hash, get the failure cause in plain English with a fix — plus doc-grounded Pharos Q&A that cites its sources or says "I don't know".`

## Description

A support agent for the Pharos Atlantic testnet (chain id 688689) with two real capabilities.

**1. Live diagnostics.** `diagnose <txhash>` fetches the transaction + receipt and walks a cause tree: out-of-gas (`gasUsed == gasLimit`), revert-with-reason (`eth_call` replay at block−1, `Error(string)` decoded), Solidity panics (`Panic(uint256)` with code meanings), silent reverts, unknown custom errors (selector reported honestly), insufficient native balance, ERC-20 `transferFrom` allowance and owner token-balance shortfalls (pre-condition reads at block−1), and constructor reverts (init code replayed at block−1, decoded like a call revert), plus honest pending/not-found paths — the pending-vs-dropped unknown is stated, not guessed. Every verdict ships a plain-language explanation, a suggested fix, a DOC-GROUNDED/INFERENCE label, and the explorer link. `account <address>` reports balance, tx count, EOA/contract, and recent ERC-20 activity with an honest coverage note.

**2. Doc-grounded Q&A.** Answers Pharos questions from a local KB built from real doc-page fetches (2026-10-16: `llms.txt`, Atlantic Testnet page, FAQs, SkillEngine `networks.json`). Every answer carries DOC-GROUNDED (URL + fetch date + excerpt) / INFERENCE / UNVERIFIED labels. When the docs don't cover a question, the agent says so instead of improvising (demonstrated live).

**Evidence — 6 distinct real failure types, all mined on Atlantic (self-generated dust txs, labeled):**
- Revert with reason: https://atlantic.pharosscan.xyz/tx/0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23 (block 31482154)
- Out of gas (gasUsed == gasLimit == 120000): https://atlantic.pharosscan.xyz/tx/0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf (block 31482265)
- Solidity Panic(0x11) overflow: https://atlantic.pharosscan.xyz/tx/0x2c78309c41ce0bd53f611ac5a1ad5e2bfa0e29b7f5e3514b9f0a429c2dcab048 (block 31482171)
- Insufficient allowance (transferFrom, 0 approved vs 1 SDT): https://atlantic.pharosscan.xyz/tx/0x8e655c344f8d30ca23d8369eb2c6594d86acf3b07616ff7cfbe0cb6f51dadd01 (block 31486989)
- Insufficient token balance (transferFrom, 10000 approved, 1000 held vs 2000): https://atlantic.pharosscan.xyz/tx/0x9e1561f8ba0e8d3482707bd336a8d1d96f62a19a0cd08e7645b89f25ce9e0613 (block 31487003)
- Constructor revert decoded (init-code replay): https://atlantic.pharosscan.xyz/tx/0x1e70dc673ec96753bf6c45962186a4586db0b663c0ff81912707d53958f4e167 (block 31487042)

Fixture contract: https://atlantic.pharosscan.xyz/address/0xC987a20fEEDc38772cE0786c3233148586a67e53 (`src/TestReverter.sol`).
Tests: `python3 tests/test_agent.py` → 8/8 PASS, every diagnostic value asserted against live chain queries. Stdlib only, read-only (never broadcasts). Spend ≈ 0.0020 PHRS.

**Interactive console panel (Tier A, no wallet):** `apps/console/src/components/try/t25-dapp-support-agent.tsx` — "Every failed tx, explained." Paste ANY Atlantic tx hash (a preset or the visitor's own failed tx) and get the live diagnosis in the browser: tx hash → receipt → cause → plain-language explanation → fix. The panel deepens the CLI engine with new signatures: intrinsic-gas shortfall (<21,000), no-code-at-destination, transferFrom allowance / token-balance pre-condition reads, constructor-revert decoding via init-code replay (reason/panic/custom, never a generic silent verdict), early/late silent-revert heuristic from the gas-burn share, a live `eth_estimateGas` retry suggestion for out-of-gas cases, and a one-click plain-language summary. Two real panel bugs were found and fixed during hardening: a calldata word-offset error in the transferFrom amount decode (it read the spender word) and a no-code misdiagnosis of failed deployments (both proven by the new dust txs above). Revert replay preserves the RPC error `data` field (the shared `rpcCall` drops it). Unknown cases report "unknown" with the raw receipt — nothing invented.

## Links

- Repo (commit-pinned): https://github.com/mohamedwael201193/lightkeeper/tree/ae37f9a/tasks/t25-dapp-support-agent
- Share/demo link: PENDING (portal share-link mechanics unverified — fallback: explorer tx links above, all curl-verified HTTP 200)
- Video: PENDING-VIDEO (guide: VIDEO-GUIDE.md)

## Reviewer notes (summary)

Run `python3 src/support_agent.py diagnose 0x31993dc8…` and compare with the explorer link — same receipt, same numbers. Try the say-so path: `ask "How do I run a confidential transaction on Pharos?"`. Full notes: REVIEWER_NOTES.md. Honest gaps: no organic third-party failure in-window (400 blocks scanned); account activity is ERC-20 Transfers only (disclosed); panic-code meanings labeled INFERENCE.
