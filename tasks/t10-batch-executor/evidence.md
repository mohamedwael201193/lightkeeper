# Evidence — T10 Batch Executor ("Flotilla")

*Atlantic testnet, chain ID 688689. Every transaction below was broadcast from
`0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` under the shared nonce lock
(`flock /tmp/lk-nonce.lock`). All 9 tx links + 2 contract links curl-verified
(HTTP 200) on 2026-10-16.*

## What was built

A hardened `BatchDistributor` contract implementing the 3 official batch modes
(simple ≤10 / single-batch 11–200 / multi-batch >200) with automatic mode
selection (`bin/mode.mjs`). Hardening beyond the SkillEngine reference:
zero-address + duplicate-recipient rejection, on-chain chunk cap of 200,
reentrancy guard, per-recipient `Distributed(recipient, amount, success)`
events so partial failure never reverts the batch, and same-tx refund of
leftovers (no escrow).

## The live runs

**Deploys (2 txs).**
`BatchDistributor` → `0xec0aeCf6c778f44AEa12Ee17afB38f4E0af0a2a4`
([tx](https://atlantic.pharosscan.xyz/tx/0xa12af6de7b4f7c9ca1b2ddf691d7f738c3cf02e301211a47aa02952f5c0bde30),
608,947 gas).
`RevertingReceiver` — the honest partial-failure fixture, a contract whose
`receive()` reverts — → `0x49b26d4685262e7756cbE623f134cFa97d142B94`
([tx](https://atlantic.pharosscan.xyz/tx/0x5809d308110ff5ec3e363e60ead5af626ecbd163479405b50ac6a0849e87ed7b),
99,083 gas).

**Simple mode (3 txs, ≤10 recipients → sequential sends).** 0.001 PHRS each to
self, `0x174C…48cA`, `0x107D…24BE`:
[0xcff6be…](https://atlantic.pharosscan.xyz/tx/0xcff6be41a4eee20b094369d1791971b0e41671ed4f7c20be27bc0649193353ea),
[0x3648f9…](https://atlantic.pharosscan.xyz/tx/0x3648f97c71debc26716dae89ec1475ade18420e4de185704cbea907831306965),
[0x9c9eb1…](https://atlantic.pharosscan.xyz/tx/0x9c9eb17827067d6f23ed0525892cdc9982ae6b51ed11915943349a68c7e9edee) —
21,000 gas each, measured live (this becomes the individual baseline).

**Single-batch mode (11–200 → one contract call, 12 recipients).**
[0x3daa4e…](https://atlantic.pharosscan.xyz/tx/0x3daa4e7dd323e17a0d3e81758709d2497b0c6522ef6f6f9d0e1a95d2fa9a274b),
block 31481710, status `0x1`, 430,405 gas. Receipt logs decoded:
eleven `Distributed(recipient, 0.001 PHRS, success=true)` events, one
`Distributed(0x49b26d46…b94, 0.001 PHRS, success=false)` — the refuser —
and `BatchExecuted(total=12, succeeded=11, failed=1)`. The refuser's 0.001
PHRS was refunded to the caller inside the same transaction. **This is the
isolated partial failure: which failed, and what happened to the rest.**

**Single-batch repeat.** The identical 12-recipient call re-broadcast after
all recipients existed:
[0x06482f…](https://atlantic.pharosscan.xyz/tx/0x06482f20df77f1ef438ff4cba4c57635ba4502e041c0a3de8fb5f8113832bb94),
230,405 gas. The 430,405 − 230,405 = **200,000** delta is exactly 8 × 25,000
(`G_newaccount` for the 8 brand-new recipient addresses in run one) — the
first-touch cost, proven by the repeat rather than asserted.

**Multi-batch mode (>200 → chunked calls; demo chunk size 6, honestly
labeled).** 12 recipients in 2 chunks of 6:
chunk 1/2 [0x2feffc…](https://atlantic.pharosscan.xyz/tx/0x2feffc088533f1a55e4e77048809dfb1fd7b6213dbc3d936dfdeebcb1b9a6913)
(115,163 gas), chunk 2/2
[0xce333b…](https://atlantic.pharosscan.xyz/tx/0xce333bf2fd59a57b40ef2b3bde85131155522125858accd4219e74a81054d1c8)
(121,208 gas; chunk 2/2 also carries the refuser: 5 succeeded, 1 isolated
failure). The 200+ path with full chunk size is exercised in unit tests.

## Gas-saving report (official req #3)

| Measurement | Gas | Source |
|---|---|---|
| 1 individual send | 21,000 | 3 live receipts + `cast estimate` |
| 12 individual sends (baseline) | 252,000 | 12 × 21,000 |
| Single batch, recipients existing | **230,405** | live receipt |
| **Saving at n=12** | **21,595 (8.6%)** | measured |
| Marginal per-recipient in batch | ≈13,866 | live estimates n=1/2/3 |
| Breakeven recipients | ≈11 | 73,616 ÷ (21,000 − 13,866) |
| Projected saving at n=200 | ≈32% | 2.83M vs 4.2M |

The breakeven (≈11) is exactly the SkillEngine reference's single-batch
threshold — the mode boundary is economically grounded on Atlantic, not
arbitrary.

## Per-recipient final balances (wei, queried live post-run)

- `0x174C…48cA`, `0x107D…24BE`: 3,500,000,000,000,000 (0.0035 PHRS —
  simple 0.001 + batch 0.001 ×2 + chunk 0.0005)
- `0x8735…c155`, `0x25b3…55b`, `0x74B8…6b8a`, `0x857E…48dA`, `0xd5c0…12A`,
  `0xb106…bb5A`, `0xe053…83a7`, `0x5dc7…5981`: 2,500,000,000,000,000 (0.0025)
- Deployer `0xf76e…71a3`: 5,919,898,423,316,398,420

## Spend log

Receipt-accounted (gasUsed × effectiveGasPrice per tx + net dust):
gas **0.001668 PHRS**, dust **0.0305 PHRS** net,
**grand total ≈ 0.0322 PHRS — within the 0.15 budget.**
Per-tx breakdown in `evidence.json`.

## Tests

- `forge test`: **12/12 pass** (happy paths, partial-failure isolation native
  + ERC20, all 6 validation reverts, refund correctness, no escrow left).
- `node --test test/mode.test.mjs`: **9/9 pass** (mode boundaries 10/11 and
  200/201, chunking 450→200/200/50, demo chunk sizes, invalid inputs).

## Honest limits

- Single-batch demo ran at **n=12** (bottom of the 11–200 band); multi-batch
  demo at **n=12 with chunk size 6** (labeled in evidence and README).
- ERC20 path is implemented + unit-tested but not executed live.
- Portal share link and video slot are pending user-side actions.
