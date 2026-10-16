# REVIEWER NOTES — T23 Wallet Risk Checker

Paste-ready notes for the Arena submission form ("Notes for the Reviewer").

## What was built

A read-only wallet risk checker for Pharos Atlantic testnet (chain ID 688689).
For any address it runs **8 real on-chain checks** and prints a per-check
**PASS / FLAG / UNKNOWN / N/A** report with raw values + plain-language
explanations, plus a **disclosed-heuristic composite** (LOW/MED/HIGH) derived
by a formula printed in every report. No invented scores; every heuristic is
labeled HEURISTIC.

Checks: S1 account age (first-activity block via nonce binary search, EIP-161
aware) · S2 tx count / freshly-funded pattern · S3 native balance (context)
· S4 contract-vs-EOA + code-verification status · S5 recent activity window
· S6 interaction diversity from Transfer logs · S7 approval hygiene from
Approval logs · S8 flagged-address watchlist (N/A when unconfigured — never
a fake PASS).

## How to test (30-second test)

```bash
cd tasks/t23-wallet-risk-checker
export ATLANTIC_RPC_URL="https://atlantic.dplabs-internal.com"
node bin/run.mjs 0x2459eC8B2ca982a8c2C6188c098701177D63EC43
# expect: composite HIGH (heuristic) with S1/S2/S4/S6 flags+unknowns explained
node bin/run.mjs 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
# expect: composite MED (heuristic), established EOA with hygiene flags disclosed
node test/run-tests.mjs
# expect: ALL TESTS PASSED — every raw value cross-checked vs direct `cast` queries
```

No private key needed. The tool aborts unless the node reports chain ID 688689.

## What broke / honest notes

- The Atlantic RPC rejects `null` topic positions in `eth_getLogs`; the checker
  fetches topic0-only per 1,000-block chunk and filters client-side (documented
  in README §2).
- The explorer verification API is unreachable, so contract source verification
  reports UNKNOWN (never guessed) — this is why contracts floor at MED.
- There is no published flagged-address set for Atlantic testnet: S8 is N/A
  unless you configure `watchlist:` in `signals.yaml`.
- A first fixture deployment (0x131063513a0E60e87bF74521ae19A161cf296EFf) lacked
  `receive()` so funding reverted; it was superseded by
  0x2459eC8B2ca982a8c2C6188c098701177D63EC43 (both deployments logged in
  evidence.json — nothing hidden).
- "Risky" example = self-deployed, explicitly labeled TEST FIXTURE demonstrating
  flag mechanics on a known-benign contract. It is not an accusation against
  any third party.
- Total spend: ~0.0012654 PHRS (two deployments + 0.001 PHRS fixture funding),
  well under the 0.15 budget. The checker itself is read-only and spends nothing.
