# T13 Evidence — real on-chain results, Pharos Atlantic testnet (chain ID 688689)

Wallet: `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`
Token under test: **WPHRS** (Wrapped Pharos) `0x838800b758277CC111B2d48Ab01e5E164f8E9471`, 18 decimals —
from the official Token Registry page (retrieved 2026-10-16).

## Real transactions (2, dust amounts)

| Purpose | Hash | Block | Status | Gas used | Explorer |
|---|---|---|---|---|---|
| Dust deposit 0.0005 PHRS → WPHRS (create the event-log footprint Q3 queries) | `0x36564924532bfe15be4871f40bf533c0ceecbc045592dc348d60fad5faabf16b` | 31482314 | 0x1 | 28,138 | https://atlantic.pharosscan.xyz/tx/0x36564924532bfe15be4871f40bf533c0ceecbc045592dc348d60fad5faabf16b |
| Dust transfer 0.0001 WPHRS self→self (produce a real Transfer log) | `0xf7f35529e142acf7dfe2a07225a68e7411182121445d51dc2b5395a56e2da0a7` | 31482328 | 0x1 | 27,776 | https://atlantic.pharosscan.xyz/tx/0xf7f35529e142acf7dfe2a07225a68e7411182121445d51dc2b5395a56e2da0a7 |

Both broadcasts were wrapped in `flock /tmp/lk-nonce.lock` (shared-key nonce safety)
and `cast` waited for each receipt before continuing.

## Spend log

- Deposit tx: 28,138 gas × 1,000,000,001 wei = 0.000028138 PHRS
- Transfer tx: 27,776 gas × 1,000,000,001 wei = 0.000027776 PHRS
- **Total: 0.000055914 PHRS** — of the 0.15 PHRS T13 budget (0.037% used)
- Q1 (balance), Q2 (estimate), Q4 (fail-closed probe) are read-only:
  `eth_call` / `eth_estimateGas` — zero gas spent.

Machine-readable: `evidence/evidence.json`.

## Transcript summaries

### Q1 — "How do I read an ERC-20 balance (balanceOf) on Pharos Atlantic?"

- Citations: [DOC-GROUNDED] `eth_call` section of the JSON-RPC reference ("Executes a message call without creating a transaction. Useful for reading contract state."); [DOC-GROUNDED] Token Registry Atlantic table (WPHRS row).
- Execution: `cast call 0x8388…89471 "balanceOf(address)(uint256)" <wallet>` → `2500000000000000 [2.5e15]`; `decimals()` → `18`.
- Interpretation: [INFERENCE] 2.5e15 wei at 18 decimals = **0.0025 WPHRS** at block 31482405. Read-only, no gas.
- Full: `evidence/transcripts/balance.json`.

### Q2 — "How do I estimate gas for an ERC-20 transfer on Pharos Atlantic?"

- Citations: [DOC-GROUNDED] `eth_estimateGas` section ("Estimates the gas needed to execute a transaction."); [DOC-GROUNDED] Gas Model "Best Practices for Developers" (use Estimation APIs; add ~20% buffer).
- Execution: `cast estimate --from <wallet> 0x8388…89471 "transfer(address,uint256)" <wallet> 100000000000000` → **40,067 gas**.
- Interpretation: [INFERENCE] per the docs' 20% buffer guidance, recommended limit **48,080**; at the live gas price (10,000,000,000 wei) the execution would cost ~0.00040067 PHRS. Estimation only — no transaction sent.
- Full: `evidence/transcripts/estimate.json`.

### Q3 — "How do I get event logs (Transfer events) on Pharos Atlantic?"

- Citations: [DOC-GROUNDED] `eth_getLogs` section (filter params fromBlock/toBlock/address/topics; "Block range is limited to 100 blocks when rate limiting is enabled").
- Execution: the two dust txs above, then `cast logs --json --from-block 31482326 --to-block 31482330 --address 0x8388…89471 <Transfer topic>`.
- Result: **1 log returned, 1/1 matched** the transfer's tx hash (`0xf7f35529…2da0a7`), topics `[Transfer, wallet, wallet]`, data `0.0001 WPHRS`. The on-chain footprint exactly matches the query output.
- Honesty note: WPHRS's `deposit()` emits a `Deposit` event only — no `Transfer` — which is why the transcript broadcasts a real dust transfer before querying. `balanceOf` after: 2.5e15 wei.
- Full: `evidence/transcripts/logs.json`.

### Q4 (fail-closed probe) — "What is the live USD price of WPHRS on Atlantic?"

- The corpus covers JSON-RPC methods, the gas model, network parameters, and a token registry — but no price feed or market-data API.
- Agent response: `[UNVERIFIED] The docs do not say.` Nothing executed. This is the T27-style coverage gate working as designed.
- Full: `evidence/transcripts/failclosed.json`.

## Tests

`tests/test_transcripts.py` — **10/10 pass** (2026-10-16):
citation quality (URL + retrieval date + excerpt present on all 3 main modes),
fail-closed gate (UNVERIFIED label, no invented values), and LIVE read-only
re-verification of all three procedures (`balanceOf`/`decimals`,
`eth_estimateGas > 0`, and a fresh `eth_getLogs` re-query that finds the saved
transfer tx hash again).
