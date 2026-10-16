# T13 — Arena Submission Pack (copy-paste ready)

## Title

Docs MCP + Chain MCP Agent — the agent that cites, then proves

## One-liner

Ask a Pharos dev question, get a docs-cited answer (DOC-GROUNDED / INFERENCE / UNVERIFIED), watch the agent execute the same procedure live on Atlantic and interpret the verified result.

## Description

T13 is the Docs-MCP + Chain-MCP composition loop. For each developer question
the agent (1) answers from the REAL Pharos docs with labeled citations — every
DOC-GROUNDED claim carries the doc URL, retrieval date, and verbatim excerpt;
(2) executes the answered procedure live on Pharos Atlantic testnet
(`eth_call`, `eth_estimateGas`, `eth_getLogs` via cast — never a mock);
(3) interprets the on-chain result in the context of the explanation; and
(4) says `[UNVERIFIED]` and executes NOTHING when the docs don't cover the
question. Three full Q&A→execution transcripts on the canonical WPHRS token
(balanceOf/decimals → 0.0025 WPHRS; transfer gas estimate 40,067 → buffered
limit 48,080; real dust deposit + transfer → eth_getLogs matched 1/1 to the
tx hash), plus a fail-closed probe. 10/10 tests pass, including live read-only
re-verification of every procedure. Total spend: 0.0000559 PHRS.

**Console try-it-live (2026-10-16, v2):** the T13 lamp page on the LIGHTKEEPER
console ships an interactive "Explain then prove" panel
(`apps/console/src/components/try/t13-docs-chain-agent.tsx`) — the
differentiator: docs-grounded explanation (DOC-GROUNDED / INFERENCE citations
with doc URLs, retrieval dates, verbatim excerpts) and the LIVE on-chain
execution of that exact function, decoded and interpreted, side by side —
closed by a **docs-vs-chain VERDICT**: the panel compares the decoded chain
value against the exact claim the docs corpus makes and renders DOCS ≡ CHAIN,
DOCS ≠ CHAIN, or "no doc claim to check". The verdict is real, not theater:
it surfaced a genuine mismatch on camera-reproducible grounds — the token
registry doc says the token's name is "Wrapped PHRS", but the contract's
`name()` returns "Wrapped Pharos" on-chain (curl-verified 2026-10-16); the
panel flags it with the contract as live truth. Covers totalSupply(),
decimals(), name(), symbol(), balanceOf(address) — and fails closed with
[UNVERIFIED] (executing nothing) for anything the docs don't cover, with a
bytecode check that rejects wallet addresses. Numbered 01 Ask → 02 Explain →
03 Prove → 04 Verdict flow, raw-RPC-request transparency, one-click edge demos
(made-up function → fail-closed; wallet address → bytecode check). Free reads,
no wallet. Fixed 2026-10-16: this RPC rejects `eth_getBlockNumber` (HTTP 400,
"invalid method") — the panel uses `eth_blockNumber`.

## Links

- Code (commit-pinned):
  https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t13-docs-chain-agent
- Deposit tx (Q3 footprint): https://atlantic.pharosscan.xyz/tx/0x36564924532bfe15be4871f40bf533c0ceecbc045592dc348d60fad5faabf16b
- Transfer tx (Q3 Transfer log): https://atlantic.pharosscan.xyz/tx/0xf7f35529e142acf7dfe2a07225a68e7411182121445d51dc2b5395a56e2da0a7
- Demo video: PENDING-VIDEO

## Transaction hashes

- `0x36564924532bfe15be4871f40bf533c0ceecbc045592dc348d60fad5faabf16b` (deposit 0.0005 PHRS → WPHRS, block 31482314, status 0x1)
- `0xf7f35529e142acf7dfe2a07225a68e7411182121445d51dc2b5395a56e2da0a7` (transfer 0.0001 WPHRS, block 31482328, status 0x1)

## Video

PENDING-VIDEO — filming guide: `VIDEO-GUIDE.md` (45–90s, real terminal + real explorer, no staged fakes).
