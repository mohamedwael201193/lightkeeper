# SUBMISSION PACK — T10 "Flotilla" Batch Executor (copy-paste ready)

## Title

Flotilla — Batch Executor (T10)

## One-liner

One signature, eleven dust transfers, one isolated failure: a hardened
Distributor executes 3 official batch modes on Atlantic, with per-action
success events and a measured 12.5% gas saving at n=11 (breakeven ≈ n=3).

## Description

Flotilla implements the SkillEngine airdrop reference's 3 official batch modes
with automatic selection: simple (≤10 recipients, sequential sends),
single-batch (11–200, one hardened Distributor contract call), multi-batch
(>200, chunked calls, ≤200 enforced on-chain).

**Live on Atlantic testnet (chain 688689) — 12 real transactions, ≈0.062 PHRS
total spend:**

- `BatchDistributor` deployed: `0xec0aeCf6c778f44AEa12Ee17afB38f4E0af0a2a4`
  (https://atlantic.pharosscan.xyz/tx/0xa12af6de7b4f7c9ca1b2ddf691d7f738c3cf02e301211a47aa02952f5c0bde30)
- Headline run — 12 independent actions in ONE tx:
  https://atlantic.pharosscan.xyz/tx/0x3daa4e7dd323e17a0d3e81758709d2497b0c6522ef6f6f9d0e1a95d2fa9a274b
  Decoded logs: 11× `Distributed(…, success=true)` + 1×
  `Distributed(0x49b26d46…b94, success=false)` (deliberately reverting
  fixture) + `BatchExecuted(12, 11, 1)`; tx status 0x1; the failed action's
  funds refunded in the same tx. Partial failure isolated on-chain.
- Gas saving from real receipts: 11 individual sends = 231,000 gas (21,000
  each, measured); single batch = 202,173 gas → saves 12.5%. A 3-point receipt
  curve (n=8/10/11: 149,170/185,573/202,173) puts the marginal per-recipient
  cost at ≈17.7k gas → measured breakeven ≈ n=3 for pre-existing EOA
  recipients — the batch wins well before the SkillEngine 11 boundary.
- Simple mode (3 sends) + multi-batch chunking (2×6) also executed live, plus
  3 builder round-trip runs at n=8/10/11 proving the exact commands the
  console generates; see evidence.md for all 12 tx hashes.

Hardening beyond the reference: zero-address/duplicate rejection, reentrancy
guard, same-tx refunds (no escrow), ERC20 path with per-recipient try/catch
(unit-tested). Tests: forge 12/12, mode-selection 9/9.

Honest limits: single-batch demo at n=12; multi-batch demo chunk size 6
(labeled); ERC20 path not executed live; all recipients are wallets controlled
by this build (dust only).

## Repo link (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/dc949c522fa32ccd7e66198e9e82fa8fb517c9e0/tasks/t10-batch-executor

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
- 0xbfd1d120d7c8552b5076c3a9574eb717e6acd56a09a3411455085e4eeec3cee5 (builder round-trip n=8)
- 0x067109a9609ad0ea7cfb3e865da30929ef7c5decb96f050e16e01d669df0ae0c (builder round-trip n=10)
- 0x0d5a9c779fa35812cf8335888500e7c9cc9ede815a4af3e21541b5e24780ef35 (builder round-trip n=11)

## Video

PENDING-VIDEO

## Try it live (LIGHTKEEPER console, Tier C)

The console ships a copy-paste-safe batch builder
(`apps/console/src/components/try/t10-batch-executor.tsx`, auto-wired by
TryPanel via the lamp slug — no registry edits):

- recipient rows with live 0x-address validation + amount parsing + **duplicate
  detection** (the Distributor reverts on duplicates — flagged before gas is spent)
- running total, automatic mode selection (≤10 simple · 11–200 single-batch ·
  >200 multi-batch), and gas estimated from the live receipts in this pack —
  with an individual-sends-vs-batch comparison shown live
- one-click "Add the refuser fixture" row: drops the live RevertingReceiver
  into the batch so visitors can prove partial-failure isolation themselves
- safety checklist chips: address validity, duplicates, dust limit, dry-run-first
- generates the exact `cast` preflight + `flock`-guarded broadcast commands
  (comma-separated arrays, as cast requires — fixed after a real failed parse),
  with the Atlantic RPC, chain 688689, and the live Distributor address filled;
  the exact generated format was round-trip tested on-chain (3 live batches)

The builder refuses to generate a command while any row is invalid — the
mistakes (bad address, bad amount, bad total) are prevented in the browser.
Tier C, honestly: it never signs or broadcasts anything; the visitor runs the
commands in their own terminal with their own keys.
