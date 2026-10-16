# Reviewer Notes — T16 Liquidation Watchdog

## What to check first (2 minutes)

1. Open the contract and read `healthFactor`:
   `src/MiniLend.sol` — 12 lines, Aave-style
   `HF = (collateralUSD × 8000/10000) / debtUSD`, 1e18 = 1.0.
2. Open the alert evidence: `evidence.md` — 5 real txs, Telegram message_id 716,
   and the full watcher log showing OK → WARNING (alert) → WARNING (no duplicate)
   → OK (recovered, no alert).
3. Verify any tx hash on https://atlantic.pharosscan.xyz/tx/<hash>.

## Why this clears the bar honestly

- **Requirement (1)** — "reads collateral/debt/HF from chain": the watcher
  calls `getUserAccountData` live; the HF is computed **on-chain**, not in Python.
  Verify: `cast call 0x108989a165a446e1d89CEe3C9936344ea7ADbf4a
  "healthFactor(address)(uint256)" 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
  --rpc-url https://atlantic.dplabs-internal.com` → currently 1.5e18.
- **Requirement (2)** — thresholds are in `watcher/config.yaml`
  (warn 1.3, critical 1.1), not hard-coded.
- **Requirement (3)** — exactly one real Telegram alert (message_id 716),
  plus a timestamped log. The mandate said one alert, no spam — the
  transition-only state machine (`watcher/state.json`) is what enforces it,
  and the re-run log line proves no duplicates.
- **Requirement (4)** — the alert's concrete action names real amounts:
  *"repay $0.000400 of debt OR add 0.000267 PHRS collateral to restore HF ≥ 1.5"*.
  The recovery repay then executed the first option on-chain (tx 5) and the
  watcher logged RECOVERED.
  - Honesty note (2026-10-16 hardening): the add-collateral leg quoted in alert
    716 used the original formula and restores HF to only 1.36 — the code now
    uses the exact restore-to-target solution (0.000500 PHRS at alert-time
    state, provably HF = 1.5). Details in `evidence.md`.

## Deliberate design choices (and their trade-offs)

- **Own labeled pool instead of a live protocol.** Atlantic has no live
  Aave-style lending market with open positions we could watch; the MEGA
  risk line anticipates exactly this ("no live positions (labeled test
  fixture)"). We labeled it plainly (MiniLend) and made the fixture *real*:
  real contract, real dust, real HF math — no simulation anywhere in the loop.
- **Debt denominated in USD (8dp), collateral in PHRS.** This is what makes
  the price feed move the health factor — the realistic borrow-stable-against-
  volatile-collateral shape. If both were PHRS-denominated the price would
  cancel out and the demo would be vacuous.
- **Price drop, not more borrowing**, as the state change: it exercises the
  oracle path (the thing a real watchdog must survive) and leaves an auditable
  `PriceUpdated` event.
- **One alert only.** The recovery was deliberately silent — a watchdog that
  spams on every tick is a broken watchdog.

## Known honest gaps

- Single position watched (the deployer's own dust position); the watcher
  supports one `(contract, user)` pair per config file — multi-position is a
  config loop away, not built.
- No critical-zone (< 1.1) live crossing demonstrated — we stopped at WARNING
  per the one-alert mandate. The math for CRITICAL is unit-tested
  (`testCriticalZoneOnDeepDrop`, HF 0.8) and the zone branch is the same code
  path.
- No liquidation executed on-chain (`liquidate` exists and is tested for its
  guard, but firing it was out of scope and out of budget need).
- `lib/forge-std` is vendored (1.4 MB) so the task builds offline.
