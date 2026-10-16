# SUBMISSION PACK — T10 "Flotilla" Batch Executor (copy-paste ready)

## Title

Flotilla — Batch Executor (T10)

## One-liner

One signature, twelve dust transfers, one isolated failure: a hardened
Distributor executes 3 official batch modes on Atlantic, with per-action
success events and a measured 8.6% gas saving at n=12 (breakeven n≈11).

## Description

Flotilla implements the SkillEngine airdrop reference's 3 official batch modes
with automatic selection: simple (≤10 recipients, sequential sends),
single-batch (11–200, one hardened Distributor contract call), multi-batch
(>200, chunked calls, ≤200 enforced on-chain).

**Live on Atlantic testnet (chain 688689) — 9 real transactions, ≈0.032 PHRS
total spend:**

- `BatchDistributor` deployed: `0xec0aeCf6c778f44AEa12Ee17afB38f4E0af0a2a4`
  (https://atlantic.pharosscan.xyz/tx/0xa12af6de7b4f7c9ca1b2ddf691d7f738c3cf02e301211a47aa02952f5c0bde30)
- Headline run — 12 independent actions in ONE tx:
  https://atlantic.pharosscan.xyz/tx/0x3daa4e7dd323e17a0d3e81758709d2497b0c6522ef6f6f9d0e1a95d2fa9a274b
  Decoded logs: 11× `Distributed(…, success=true)` + 1×
  `Distributed(0x49b26d46…b94, success=false)` (deliberately reverting
  fixture) + `BatchExecuted(12, 11, 1)`; tx status 0x1; the failed action's
  funds refunded in the same tx. Partial failure isolated on-chain.
- Gas saving from real receipts: 12 individual sends = 252,000 gas (21,000
  each, measured); single batch = 230,405 gas → saves 8.6%. Marginal analysis
  (live estimates) puts breakeven at n≈11 — the SkillEngine boundary.
- Simple mode (3 sends) + multi-batch chunking (2×6) also executed live; see
  evidence.md for all 9 tx hashes.

Hardening beyond the reference: zero-address/duplicate rejection, reentrancy
guard, same-tx refunds (no escrow), ERC20 path with per-recipient try/catch
(unit-tested). Tests: forge 12/12, mode-selection 9/9.

Honest limits: single-batch demo at n=12; multi-batch demo chunk size 6
(labeled); ERC20 path not executed live; all recipients are wallets controlled
by this build (dust only).

## Repo link (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/57fa81d9d11e30a6d3e590a198cce218c2176ca2/tasks/t10-batch-executor

## Share / demo links

- Explorer batch tx: https://atlantic.pharosscan.xyz/tx/0x3daa4e7dd323e17a0d3e81758709d2497b0c6522ef6f6f9d0e1a95d2fa9a274b
- Portal share link: PENDING-PORTAL

## Transaction hashes

- 0xa12af6de7b4f7c9ca1b2ddf691d7f738c3cf02e301211a47aa02952f5c0bde30 (deploy distributor)
- 0x5809d308110ff5ec3e363e60ead5af626ecbd163479405b50ac6a0849e87ed7b (deploy refuser)
- 0xcff6be41a4eee20b094369d1791971b0e41671ed4f7c20be27bc0649193353ea
- 0x3648f97c71debc26716dae89ec1475ade18420e4de185704cbea907831306965
- 0x9c9eb17827067d6f23ed0525892cdc9982ae6b51ed11915943349a68c7e9edee
- 0x3daa4e7dd323e17a0d3e81758709d2497b0c6522ef6f6f9d0e1a95d2fa9a274b (headline batch)
- 0x06482f20df77f1ef438ff4cba4c57635ba4502e041c0a3de8fb5f8113832bb94
- 0x2feffc088533f1a55e4e77048809dfb1fd7b6213dbc3d936dfdeebcb1b9a6913
- 0xce333bf2fd59a57b40ef2b3bde85131155522125858accd4219e74a81054d1c8

## Video

PENDING-VIDEO
