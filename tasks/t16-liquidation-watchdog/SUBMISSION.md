# SUBMISSION PACK — T16 Liquidation Watchdog (copy-paste ready)

> Fill `aec2b4f6504bb511425b667c575105e220a3a3bf` with the real commit hash after committing (see LINKS.md).
> Video slot is PENDING-VIDEO until the demo is filmed.

---

**Title:** Liquidation Watchdog — real on-chain health-factor alerts on Pharos Atlantic

**One-liner:** A watchdog that reads a lending position's health factor live from
chain and fires a single Telegram alert with a concrete repay-or-top-up action
the moment it crosses into the danger zone — proven with a real price-drop on
Atlantic testnet.

**Description:**

T16 Liquidation Watchdog watches a lending position the way it should be
watched: the health factor is computed ON-CHAIN, and the watcher only reads.

I deployed MiniLend, a minimal lending pool on Pharos Atlantic
(`0x108989a165a446e1d89CEe3C9936344ea7ADbf4a`), with a real Aave-style health
factor: HF = (collateralUSD × 80% liquidation threshold) / debtUSD, 1e18 = 1.0.
Debt is USD-denominated so the oracle price genuinely moves the health factor,
and every price update is an auditable on-chain event.

The watcher (`watcher/watch.py`) reads `getUserAccountData` live via `cast`,
evaluates it against configurable thresholds (warn 1.3 / critical 1.1 in
`watcher/config.yaml`), and on entry into a danger zone sends ONE Telegram
alert carrying a concrete action — both the exact dollar amount to repay and
the exact PHRS to add as collateral to restore HF ≥ 1.5. It is transition-only
(`watcher/state.json`): re-runs in the same zone never re-alert, and recovery
is logged silently.

Proven end-to-end on Atlantic, all real transactions:

1. Deployed MiniLend (oracle $2.00) —
   https://atlantic.pharosscan.xyz/tx/0xc4da78490b2b0b2b501b5d0eb944878ed1d9f5cf47d5a3813e2d46a263a2c0de
2. Opened a dust position: 0.002 PHRS collateral, $0.002 debt (HF 1.6, healthy) —
   https://atlantic.pharosscan.xyz/tx/0x3798b3e3604a9c358fe6e8b8d271f2663b2814b4ab81c53c26a542df614288d7
   / https://atlantic.pharosscan.xyz/tx/0xfa4674f23632226406fc24f264be85d10c14eb5d59494595c8965e8e24116c0d
3. Drove it into the warning zone with a REAL on-chain price update
   (`setPrice` $2.00 → $1.50, HF 1.6 → 1.2) —
   https://atlantic.pharosscan.xyz/tx/0x6a9a22d43b00eab59a6e26f007bce35249f7796a9688f716d47c49984d084861
4. The watcher detected the crossing and delivered the Telegram alert
   (message_id 716): "Health factor: 1.2000 … Concrete action: repay $0.000400
   of debt OR add 0.000267 PHRS collateral to restore HF ≥ 1.5" (block 31481762).
5. Repaid $0.0004 on-chain (HF 1.2 → 1.5) —
   https://atlantic.pharosscan.xyz/tx/0x434f9b5a75c7a6ff7ce83533d848748bdada393023c0b7ee1d72c20a2bb6bea4 —
   the watcher logged RECOVERED with no alert.

Unit tests: `forge test` 9/9 pass (HF math for healthy/warning/critical zones,
borrow guard, oracle access control, repay restore).

Total gas: 0.00164 PHRS (budget 0.15). No mocks, no simulated prices, no
placeholder alerts — every number in the alert came from a real `eth_call`.

**Repo (commit-pinned):**
https://github.com/mohamedwael201193/lightkeeper/tree/d9ef4d7f02542483734fef43cb58b20c6fcc6cbc/tasks/t16-liquidation-watchdog

**Share/demo links:** PENDING-VIDEO

**Transaction hashes:**
- 0xc4da78490b2b0b2b501b5d0eb944878ed1d9f5cf47d5a3813e2d46a263a2c0de (deploy)
- 0x3798b3e3604a9c358fe6e8b8d271f2663b2814b4ab81c53c26a542df614288d7 (deposit)
- 0xfa4674f23632226406fc24f264be85d10c14eb5d59494595c8965e8e24116c0d (borrow)
- 0x6a9a22d43b00eab59a6e26f007bce35249f7796a9688f716d47c49984d084861 (price drop → alert)
- 0x434f9b5a75c7a6ff7ce83533d848748bdada393023c0b7ee1d72c20a2bb6bea4 (repay → recovered)

**Video:** PENDING-VIDEO

## Console interactive surface (added 2026-10-16)

- Module: `apps/console/src/components/try/liquidation-watchdog.tsx` — Tier A, live reads
  only (no wallet, no signature, costs nothing).
- **"Your position, live risk":** paste any address → the module calls
  `getUserAccountData()` on MiniLend via `eth_call` and shows collateral, debt, oracle
  price and the on-chain health factor with a PASS / AT RISK / LIQUIDATABLE chip, the
  exact oracle price that would trigger liquidation, and the concrete repay-X or
  add-Y-PHRS amounts that restore HF ≥ 1.5 — the same math the Telegram watcher fires.
- Differentiator: real risk math on any address you paste — not a canned demo of one
  position. The console video shot is shot 7 in VIDEO-GUIDE.md.
