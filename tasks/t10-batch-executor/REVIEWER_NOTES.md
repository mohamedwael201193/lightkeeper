# REVIEWER NOTES — T10 "Flotilla" Batch Executor

Paste-ready notes for the Arena submission form (Notes field).

---

**What this is:** a batch executor implementing the SkillEngine reference's 3
official modes — simple (≤10, sequential), single-batch (11–200, one
Distributor contract call), multi-batch (>200, chunked calls) — with automatic
mode selection and a hardened distributor contract.

**Live on Atlantic testnet (chain 688689), 9 real transactions:**

- `BatchDistributor` (hardened): 0xec0aeCf6c778f44AEa12Ee17afB38f4E0af0a2a4
  — deploy: https://atlantic.pharosscan.xyz/tx/0xa12af6de7b4f7c9ca1b2ddf691d7f738c3cf02e301211a47aa02952f5c0bde30
- Partial-failure fixture `RevertingReceiver`: 0x49b26d4685262e7756cbE623f134cFa97d142B94
  — deploy: https://atlantic.pharosscan.xyz/tx/0x5809d308110ff5ec3e363e60ead5af626ecbd163479405b50ac6a0849e87ed7b

**The headline run — one batch tx, 12 actions, isolated failure:**
https://atlantic.pharosscan.xyz/tx/0x3daa4e7dd323e17a0d3e81758709d2497b0c6522ef6f6f9d0e1a95d2fa9a274b
Decoded receipt logs: 11× `Distributed(…, success=true)`, 1×
`Distributed(0x49b26d46…b94, success=false)` (the deliberately reverting
recipient), `BatchExecuted(total=12, succeeded=11, failed=1)`, tx status 0x1.
The failed action's funds were refunded inside the same tx — the other 11
recipients were paid. Partial failure is proven on-chain, not described.

**Gas saving (real receipts, not estimates-as-facts):** 12 individual sends =
252,000 gas (21,000 each, measured live); the single batch = 230,405 gas
(repeat run with all recipients existing) → saves 8.6% at n=12. Marginal
per-recipient cost ≈13.9k < 21k → breakeven at n≈11, exactly the SkillEngine
mode boundary; ≈32% projected saving at n=200. A first/second-run pair
(430,405 vs 230,405) isolates the one-time 200,000 new-account cost.

**Also live:** simple mode (3 sequential sends:
https://atlantic.pharosscan.xyz/tx/0xcff6be41a4eee20b094369d1791971b0e41671ed4f7c20be27bc0649193353ea
https://atlantic.pharosscan.xyz/tx/0x3648f97c71debc26716dae89ec1475ade18420e4de185704cbea907831306965
https://atlantic.pharosscan.xyz/tx/0x9c9eb17827067d6f23ed0525892cdc9982ae6b51ed11915943349a68c7e9edee)
and multi-batch chunking (2 chunks × 6:
https://atlantic.pharosscan.xyz/tx/0x2feffc088533f1a55e4e77048809dfb1fd7b6213dbc3d936dfdeebcb1b9a6913
https://atlantic.pharosscan.xyz/tx/0xce333bf2fd59a57b40ef2b3bde85131155522125858accd4219e74a81054d1c8).

**Hardening beyond the reference:** zero-address + duplicate rejection,
on-chain 200-recipient chunk cap, reentrancy guard, same-tx refunds (no
escrow), ERC20 path with per-recipient try/catch.

**Tests:** forge 12/12, node mode-selection 9/9. Total spend ≈0.032 PHRS.

**Honest limits:** single-batch demo at n=12 (band minimum); multi-batch demo
uses chunk size 6 (labeled); ERC20 path unit-tested but not executed live;
video pending.
