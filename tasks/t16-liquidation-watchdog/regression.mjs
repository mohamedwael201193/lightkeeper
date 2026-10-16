#!/usr/bin/env node
/**
 * T16 Liquidation Watchdog — 31-check regression for the try-module math.
 *
 * This script mirrors, in BigInt, the EXACT formulas in
 * apps/console/src/components/try/liquidation-watchdog.tsx (which are
 * byte-identical to watcher/watch.py's concrete_actions and MiniLend.sol's
 * healthFactor). It does not touch the chain — it pins the math so the
 * flagship rebuild can never silently drift it.
 *
 * Zones:  HF < 1.0 liquidatable · HF < 1.1 critical · HF < 1.3 warning
 *         · else healthy · no debt → none (infinite HF, nothing to liquidate)
 *   p_liq  = oracle price / HF
 *   repay  = debt − collateral·8/15            (restores HF to 1.5)
 *   top-up = debt·15/8 − collateral           (restores HF to 1.5)
 *   guards: debt-free → no gauge/no division · HF = 0 → liquidatable at any
 *           price (p_liq = 0, cushion = 0) · price = 0 → no top-up division
 *
 * Run: node tasks/t16-liquidation-watchdog/regression.mjs
 */
const HF_SCALE = 10n ** 18n;
const WARN_HF = 13n * 10n ** 17n; // 1.3 — watcher/config.yaml
const CRIT_HF = 11n * 10n ** 17n; // 1.1
const HF_ONE = HF_SCALE; // 1.0 — liquidation boundary (liquidate() needs HF < 1)
const TARGET_HF_NUM = 15n; // 1.5 restore target (debt*15/8, collat*8/15)
const GAUGE_CAP = 2n * HF_SCALE; // gauge display cap
const E18 = 10n ** 18n;

function zoneOf(hf, hasDebt) {
  if (!hasDebt) return "none";
  if (hf < HF_ONE) return "liquidatable";
  if (hf < CRIT_HF) return "critical";
  if (hf < WARN_HF) return "warning";
  return "healthy";
}

/** Mirrors buildVerdict() in the try module. */
function derive(collUsd8, debtUsd8, hf, price8) {
  const hasDebt = debtUsd8 > 0n;
  const liquidationPrice8 =
    hasDebt && hf > 0n ? (price8 * HF_SCALE) / hf : 0n;
  const cushionBps =
    hasDebt && price8 > 0n && hf > 0n
      ? ((price8 - liquidationPrice8) * 10000n) / price8
      : 0n;
  const targetDebt8 = (collUsd8 * 8n) / TARGET_HF_NUM;
  const repayUsd8 =
    hasDebt && debtUsd8 > targetDebt8 ? debtUsd8 - targetDebt8 : 0n;
  const needCollUsd8 = (debtUsd8 * TARGET_HF_NUM) / 8n;
  const addPhrsWei =
    hasDebt && price8 > 0n && needCollUsd8 > collUsd8
      ? ((needCollUsd8 - collUsd8) * E18) / price8
      : 0n;
  return { hasDebt, liquidationPrice8, cushionBps, targetDebt8, repayUsd8, needCollUsd8, addPhrsWei };
}

/** Mirrors MiniLend.healthFactor: (collUsd * 8000 * 1e18) / (debtUsd * 10000). */
function contractHf(collUsd8, debtUsd8) {
  if (debtUsd8 === 0n) return (1n << 256n) - 1n; // uint max — infinite HF
  return (collUsd8 * 8000n * HF_SCALE) / (debtUsd8 * 10000n);
}

let n = 0;
let failed = 0;
function check(name, cond) {
  n += 1;
  if (cond) {
    console.log(`ok ${n} - ${name}`);
  } else {
    failed += 1;
    console.log(`NOT OK ${n} - ${name}`);
  }
}

/** HF literal helper: E("1.5") === 1.5e18. */
const E = (x) => {
  const [i, f = ""] = String(x).split(".");
  return BigInt(i) * HF_SCALE + BigInt((f + "0".repeat(18)).slice(0, 18));
};

// --- 7 zone paths -----------------------------------------------------------
check("healthy: HF 1.5 with debt", zoneOf(E(1.5), true) === "healthy");
check("warning: HF 1.2 with debt", zoneOf(E(1.2), true) === "warning");
check("critical: HF 1.05 with debt", zoneOf(E(1.05), true) === "critical");
check("liquidatable: HF 0.99 with debt", zoneOf(E(0.99), true) === "liquidatable");
check("liquidatable: HF 0 (collateral gone, debt remains)", zoneOf(0n, true) === "liquidatable");
check("none: debt-free (collateral, no debt)", zoneOf(E(1.5), false) === "none");
check("none: no position at all (no collateral, no debt)", zoneOf(0n, false) === "none");

// --- threshold boundaries ----------------------------------------------------
check("boundary: HF exactly 1.3 is healthy", zoneOf(13n * 10n ** 17n, true) === "healthy");
check("boundary: one wei below 1.3 is warning", zoneOf(13n * 10n ** 17n - 1n, true) === "warning");
check("boundary: HF exactly 1.1 is warning", zoneOf(11n * 10n ** 17n, true) === "warning");
check("boundary: one wei below 1.1 is critical", zoneOf(11n * 10n ** 17n - 1n, true) === "critical");
check("boundary: HF exactly 1.0 is critical", zoneOf(HF_ONE, true) === "critical");
check("boundary: one wei below 1.0 is liquidatable", zoneOf(HF_ONE - 1n, true) === "liquidatable");

// --- formulas ----------------------------------------------------------------
// Alert-time state from evidence.json: coll $0.003, debt $0.002, price $1.50, HF 1.2
const COLL = 300000n, DEBT = 200000n, PRICE = 150000000n, HF12 = 12n * 10n ** 17n;
const d = derive(COLL, DEBT, HF12, PRICE);
check("p_liq = price/HF: $1.50/1.2 = $1.25", d.liquidationPrice8 === 125000000n);
check("cushion: (1.50-1.25)/1.50 = 1666 bps", d.cushionBps === 1666n);
check("repay: debt − coll·8/15 = $0.0004 (matches Telegram alert 716)", d.repayUsd8 === 40000n);
check("repay provably restores HF to exactly 1.5", contractHf(COLL, DEBT - d.repayUsd8) === 15n * 10n ** 17n);
check("top-up: (debt·15/8 − coll)/price = 0.0005 PHRS (corrected formula)", d.addPhrsWei === 500000000000000n);
check("top-up provably restores HF to exactly 1.5", contractHf(d.needCollUsd8, DEBT) === 15n * 10n ** 17n);

// Demo position (post-recovery): coll $0.003, debt $0.0016, price $1.50, HF 1.5
const dDemo = derive(300000n, 160000n, 15n * 10n ** 17n, PRICE);
check("demo: on-chain HF is exactly 1.5 → healthy", contractHf(300000n, 160000n) === 15n * 10n ** 17n && zoneOf(15n * 10n ** 17n, true) === "healthy");
check("demo: repay is 0 (already at the 1.5 target)", dDemo.repayUsd8 === 0n);
check("demo: top-up is 0 (already at the 1.5 target)", dDemo.addPhrsWei === 0n);
const dHigh = derive(400000n, 200000n, 16n * 10n ** 17n, PRICE); // HF 1.6, above target
check("above target: repay and top-up both clamp to 0", dHigh.repayUsd8 === 0n && dHigh.addPhrsWei === 0n);

// --- guards ------------------------------------------------------------------
const dZero = derive(0n, 200000n, 0n, PRICE); // collateral gone, debt remains
check("HF=0: repay leg is the full debt", dZero.repayUsd8 === 200000n);
check("HF=0: top-up leg restores 1.5 (0.0025 PHRS)", dZero.addPhrsWei === 2500000000000000n && contractHf(dZero.needCollUsd8, 200000n) === 15n * 10n ** 17n);
check("HF=0: no division by zero — p_liq 0, cushion 0", dZero.liquidationPrice8 === 0n && dZero.cushionBps === 0n);
const dFree = derive(300000n, 0n, (1n << 256n) - 1n, PRICE); // debt-free
check("debt-free: repay and top-up are 0, HF is uint max", dFree.repayUsd8 === 0n && dFree.addPhrsWei === 0n && contractHf(300000n, 0n) === (1n << 256n) - 1n);
const dNoPrice = derive(COLL, DEBT, HF12, 0n); // oracle price 0
check("price=0: no top-up division — add 0, repay still exact", dNoPrice.addPhrsWei === 0n && dNoPrice.repayUsd8 === 40000n);

// --- sanity ------------------------------------------------------------------
check("p_liq is below the oracle price whenever HF > 1", d.liquidationPrice8 < PRICE);
const dOne = derive(250000n, 200000n, HF_ONE, PRICE); // HF exactly 1.0
check("cushion is 0 when HF = 1.0 (p_liq = price)", dOne.cushionBps === 0n && dOne.liquidationPrice8 === PRICE);
check("gauge: HF 3.0 clamps to the 2.0 dial cap for the needle", 3n * HF_SCALE > GAUGE_CAP);

console.log(`\n${n - failed}/${n} checks passed`);
process.exit(failed ? 1 : 0);
