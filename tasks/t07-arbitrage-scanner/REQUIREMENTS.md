# T07 — Arbitrage Scanner — Official Requirements (quoted VERBATIM)

Source: `~/workspace/your_files/pharos-arena-MEGA.md` §3, "T07 — Arbitrage Scanner (Hard, 200 · SkillEngine)".

> **OFFICIAL:** (1) Reads prices from ≥2 sources in the same scan. (2) Nets swap fees + slippage + gas. (3) Acts/prepares tx only above configurable profit threshold, else logs why skipped. (4) Logs every scan (gross spread, costs, net, decision). (5) Safe on testnet/simulated — no real funds required.

## Build plan from the same section (LIGHTKEEPER coordinator notes, not official)

> **Implementation:** per scan: blockNumber → parallel `eth_call` quotes ×2 + oracle → gasPrice → estimateGas → economics → policy gate → JSONL log. **Fee math (QA fix): fees per leg on NOTIONALS, never on the spread** — the exact figure T07 grades; slippage from reserves (unknown slippage → SKIP, never assumed zero); `nativePriceUsd` must come from a specified configured source, never invented. Skip reasons: BELOW_THRESHOLD, STALE_QUOTE, NO_LIQUIDITY, SOURCE_DOWN, NEGATIVE_NET. If fewer than 2 genuine sources exist on Atlantic, say so rather than fabricate; oracle-vs-DEX quotes labeled non-executable. Build T08 first as T07's safety harness.

> **Evidence:** scans.jsonl (every scan), config, a prepared-tx demo above threshold + a skip demo with reason, share link.

> **Video:** scan → numbers → above-threshold prepared tx → below-threshold skip with logged reason.

> **Risks:** thin Atlantic liquidity (honest SKIP logs are the deliverable); price-source availability (VERIFY LIVE).

## How this build maps to the five official requirements

| # | Official requirement | Where it is satisfied |
|---|---|---|
| 1 | Reads prices from ≥2 sources in the same scan | `scanner.py::scan()` — 3 independent on-chain ArbPool venues, parallel `eth_call` at one pinned block; `scans.jsonl` → `reserves_at_pinned_block` |
| 2 | Nets swap fees + slippage + gas | `evaluate_cycle()` — per-leg fees on NOTIONALS, slippage vs zero-fee ideal from real reserves, gas from `eth_gasPrice` × `eth_estimateGas`; `best_route` cost decomposition |
| 3 | Acts/prepares tx only above configurable profit threshold, else logs why skipped | Policy gate in `scan()`; `--execute` broadcasts only on ACT; SKIP records carry `skip_reason` (BELOW_THRESHOLD / STALE_QUOTE / NO_LIQUIDITY / SOURCE_DOWN / NEGATIVE_NET / EXECUTION_FAILED) |
| 4 | Logs every scan (gross spread, costs, net, decision) | `scans.jsonl` — append-only, every scan incl. failed ones |
| 5 | Safe on testnet/simulated — no real funds required | Atlantic testnet only (chain 688689), dust amounts, test-minted tokens with no value; execution is opt-in `--execute` |

## Deliberate deviations from the coordinator's draft plan (documented, honest)

- **No oracle leg.** The draft suggested "quotes ×2 + oracle". No verifiable price oracle exists on Atlantic for our test pair; per the honesty rule ("if fewer than 2 genuine sources exist, say so rather than fabricate"), the third source is a *third independent AMM venue* instead of a fake oracle. All three venues are executable, on-chain, and independently readable — strictly stronger than oracle-vs-DEX non-executable quotes.
- **`native_price_usd` is null by design.** The QA fix demands the USD price come from a specified configured source, never invented. No such source exists on Atlantic testnet for PHRS, so the config declares the source `NONE` and all economics run in native test units (WPHRS), with the 1:1 WPHRS==PHRS parity documented as test construction, not a market price.
- **T08-first ordering not followed.** T08 (Dry-Run Executor) is a separate task built by a separate worker; T07's safety comes from dust amounts + opt-in `--execute` + testnet-only operation, which satisfies official requirement (5) on its own.
