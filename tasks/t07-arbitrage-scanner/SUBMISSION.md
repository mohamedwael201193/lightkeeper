# T07 — Arbitrage Scanner — Arena Submission Pack (copy-paste ready)

## Title
LIGHTKEEPER T07 — Arbitrage Scanner (Atlantic testnet, real execution leg)

## One-liner
A SkillEngine arbitrage scanner over three independent on-chain AMM venues: block-pinned reads, fee-on-notional + slippage + gas math, threshold-gated ACT/SKIP with logged reasons — including a real mined two-leg arbitrage and honest "no opportunity" scans.

## Description
T07 scans three independently-deployed constant-product venues (ArbPool contracts, 0.30%/leg fee) on Pharos Atlantic testnet. Each scan pins one block, reads all venues in parallel via eth_call, evaluates all 12 directed cycles, and nets per-leg fees (charged on notionals, never on the spread) + slippage (vs the zero-fee ideal from real reserves) + gas (eth_estimateGas × live gas price). Above the configurable profit threshold it prepares — and with --execute, broadcasts — the two-leg arbitrage; below it, it logs SKIP with a machine-readable reason (BELOW_THRESHOLD / STALE_QUOTE / NO_LIQUIDITY / SOURCE_DOWN / NEGATIVE_NET). No USD price is invented: native_price_usd is null by design and all economics run in native test units.

Proven on-chain (chain 688689):
- ACT scan (pinned block 31482138): net +0.138051195909437998 WPHRS > 0.05 threshold → executed leg1 0x39fe2154abde86a58418d85667dbec826207b3733eeadb81a877c85e2185de30 + leg2 0xdcd894bb8bd2f981f2af78425bb58623f26c724502212b24820f2fca380c58ad (both status 1); wallet WPHRS 7000 → 7000.139809535909437998, matching the predicted gross to the wei.
- SKIP / BELOW_THRESHOLD (pinned 31482387, threshold 0.5 WPHRS): real spread nets 0.138 < 0.5 → no broadcast, reason logged.
- SKIP / NEGATIVE_NET (pinned 31482299): run after our own arb consumed the spread — best route −0.253 WPHRS, reported truthfully.
- 10/10 tests pass, including a live cross-check that the Python quoter equals ArbPool.getAmountOut on-chain at a pinned block.

## Repo link (commit-pinned)
https://github.com/mohamedwael201193/lightkeeper/tree/fe1f384688064a935c32e994172a7c94a9223799/tasks/t07-arbitrage-scanner

## Proof link
https://github.com/mohamedwael201193/lightkeeper/tree/fe1f384688064a935c32e994172a7c94a9223799/tasks/t07-arbitrage-scanner/evidence.md
(Independently verifiable: `python3 scanner.py` re-runs the scan against the same on-chain venues.)

## Reviewer notes
https://github.com/mohamedwael201193/lightkeeper/tree/fe1f384688064a935c32e994172a7c94a9223799/tasks/t07-arbitrage-scanner/REVIEWER_NOTES.md

## Key tx hashes (Atlantic, chain 688689)
- Arb leg 1: 0x39fe2154abde86a58418d85667dbec826207b3733eeadb81a877c85e2185de30
- Arb leg 2: 0xdcd894bb8bd2f981f2af78425bb58623f26c724502212b24820f2fca380c58ad
- poolA deploy: 0x8280c398e7eeea1c5e1cac2530bd108f1376dee1cfc82d1527e594183cb81841
- poolB deploy: 0x0592a0075a8a48848c3b32240f4ee05bda954d0f5c59ef1407813859a7f695e0
- poolC deploy: 0x3a0bc2631f958f13a016f3608eb98157a9e9b50efab994a26efc87106041e1fc
- Venue contracts: poolA 0x8683C6D6EeAA57B03688f43Ad0cbCA0af26Cf464 · poolB 0x432BCd7bc6944Def44015bF00C82Eb50aA18A3F6 · poolC 0x3f0ae6f640f067B2532194a0ef2c869Aa49E587D

## Demo video
PENDING-VIDEO
