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
- HARDEN op 2026-10-16 (read-only, zero broadcasts, appended to scans.jsonl as records 5–7):
  ACT `t07-1792133596` (pinned 31487071): poolC→poolB WPHRS-start, net +0.138051195909437998
  WPHRS > 0.05 threshold, 2 prepared calls logged, NOT broadcast (scan mode only);
  BELOW_THRESHOLD `t07-1792133650` (pinned 31487103): threshold raised to 0.5 WPHRS, same real
  spread nets 0.138 < 0.5 → no broadcast, reason logged; NEGATIVE_NET `t07-1792133667`
  (pinned 31487115): 0.001 WPHRS size, best route −0.001723761305911841 WPHRS → gas dominates,
  truthful skip. The CLI's twelve-cycle math was cross-verified against the panel's independent
  TypeScript port on live reserves (same winner poolC→poolB; net differs only by the panel's
  disclosed 0.5% slippage guard + live gas-price movement between runs).
- 10/10 tests pass, including a live cross-check that the Python quoter equals ArbPool.getAmountOut on-chain at a pinned block.

## Repo link (commit-pinned)
https://github.com/mohamedwael201193/lightkeeper/tree/bd2b759ee66c8240778d6a7052d914c99759ba6f/tasks/t07-arbitrage-scanner

## Proof link
https://github.com/mohamedwael201193/lightkeeper/tree/bd2b759ee66c8240778d6a7052d914c99759ba6f/tasks/t07-arbitrage-scanner/evidence.md
(Independently verifiable: `python3 scanner.py` re-runs the scan against the same on-chain venues.)

## Key tx hashes (Atlantic, chain 688689)
- Arb leg 1: 0x39fe2154abde86a58418d85667dbec826207b3733eeadb81a877c85e2185de30
- Arb leg 2: 0xdcd894bb8bd2f981f2af78425bb58623f26c724502212b24820f2fca380c58ad
- poolA deploy: 0x8280c398e7eeea1c5e1cac2530bd108f1376dee1cfc82d1527e594183cb81841
- poolB deploy: 0x0592a0075a8a48848c3b32240f4ee05bda954d0f5c59ef1407813859a7f695e0
- poolC deploy: 0x3a0bc2631f958f13a016f3608eb98157a9e9b50efab994a26efc87106041e1fc
- Venue contracts: poolA 0x8683C6D6EeAA57B03688f43Ad0cbCA0af26Cf464 · poolB 0x432BCd7bc6944Def44015bF00C82Eb50aA18A3F6 · poolC 0x3f0ae6f640f067B2532194a0ef2c869Aa49E587D

## Demo video
PENDING-VIDEO
(`apps/console/src/components/try/arbitrage-scanner.tsx`) runs the config→scan→verdict
rhythm in-browser against the same three venues — Tier A live reads, no signature.

## Try it live (LIGHTKEEPER console, Tier A)

New interactive surface: `apps/console/src/components/try/arbitrage-scanner.tsx`
(default-exports `TryArbitrageScanner`, lazy-loaded by `TryPanel` for lamp slug
`arbitrage-scanner` — no registry edits needed).

- Visitor sets **trade size**, **profit threshold**, **slippage guard %**, hits **Run scan**.
- The panel pins one Atlantic block, reads `getReserves()` on all three venues at that
  block via `eth_call`, prices **all twelve directed cycles** — six WPHRS-start, six
  TKB-start, the same set the CLI prices — with the contract-identical constant-product
  quote math (30 bps/leg on notionals), nets slippage
  + gas (2 legs × 68,744 gas — measured from the mined execution legs — × live
  `eth_gasPrice`) + the slippage guard, and shows a verdict chip:
  **◉ OPPORTUNITY** (net above threshold) or **○ SKIP — BELOW_THRESHOLD / NEGATIVE_NET /
  STALE_QUOTE / NO_LIQUIDITY / SOURCE_DOWN** with the numbers.
- The differentiator: **the whole market is shown, not just the winner.** All twelve cycles
  are ranked in two leaderboards (WPHRS-start and TKB-start, ranked separately — the two
  tokens are different units and are never mixed), with leg outputs, gross, fees and net on
  every row, losing routes included. Every scan is appended to a session evidence log
  (block, best cycle, net, verdict, skip reason) with a one-click JSONL export —
  the same append-only discipline as the CLI's scans.jsonl.
- The winning route's two legs are cross-checked through the contracts' own
  `getAmountOut` view via `eth_call` at the pinned block — the panel reports
  "contract quotes match the panel math exactly" (wei-identical) or flags the scan
  untrusted. Failed reads are errors, never zeros.
- Fully read-only: no wallet, no signature, no broadcast. Prior on-chain execution proof
  (arb legs `0x39fe2154…e2185de30`, `0xdcd894bb…ca380c58ad`) is linked in the panel footer.
