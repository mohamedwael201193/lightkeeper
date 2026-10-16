#!/usr/bin/env node
/**
 * t09-trend-watcher — CLI entry.
 *
 * CHAIN-ID ASSERTION FIRST: every command below aborts unless the RPC
 * reports chain 688689 (Atlantic testnet). Read-only: no keys, no signing,
 * no broadcasting — this tool spends 0 gas.
 *
 * Commands:
 *   observe         live cycle: feeHistory window + gas spot polls -> evaluate -> persist -> report
 *   report          summary of observations + why acted/not (official req 5)
 *   spike-demo      CONTROLLED SYNTHETIC single-spike series -> proves NO fire (official req 4)
 *   sustained-demo  CONTROLLED SYNTHETIC sustained rise -> proves confirmed FIRE
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const cfg = parseYaml(readFileSync(join(ROOT, "config.yaml"), "utf8"));

const { assertChainId, getFeeHistory, getGasPriceWei, getBlockNumber } = await import("../src/observe.mjs");
const { evaluateSeries } = await import("../src/trend.mjs");
const store = await import("../src/store.mjs");

const cmd = process.argv[2] || "help";

// --- chain-ID assertion: FIRST, before any command logic ---
let chainId;
try {
  chainId = assertChainId();
} catch (e) {
  console.error("FATAL:", e.message);
  process.exit(2);
}

const paths = store.statePaths(cfg);
store.ensureStateDir(paths);

if (cmd === "observe") await observe();
else if (cmd === "report") await report();
else if (cmd === "spike-demo") await demo("spike");
else if (cmd === "sustained-demo") await demo("sustained");
else {
  console.log("usage: node bin/run.mjs <observe|report|spike-demo|sustained-demo>");
  process.exit(1);
}

async function observe() {
  console.log(`t09-trend-watcher :: observe — chain ${chainId} (Atlantic), metric ${cfg.metric}`);
  const params = cfg.trend;
  const priors = store.loadPriors(paths);

  let samples;
  try {
    const { samples: feeSamples } = getFeeHistory(cfg.window.historyBlocks);
    samples = feeSamples.map((s) => ({ blockNumber: s.blockNumber, value: s.baseFeeWei, ts: s.ts, source: "eth_feeHistory/baseFeePerGas" }));
  } catch (e) {
    // fail-closed: record the observer error as an observation, HOLD, streak untouched
    const blk = safeBlockNumber();
    const row = { ts: now(), blockNumber: blk, metric: cfg.metric, chainId, mode: "LIVE", error: e.message, decision: "HOLD", reason: "OBSERVER_ERROR" };
    store.appendObservation(paths, row);
    store.appendAudit(paths, { ts: now(), blockNumber: blk, decision: "HOLD", reason: "OBSERVER_ERROR", detail: e.message });
    console.log("OBSERVER_ERROR — fail-closed HOLD. Streak preserved:", priors.streak);
    return;
  }

  // Live eth_gasPrice spot polls (context; NOT fed into the MA math — the MA series is baseFeePerGas)
  const spot = [];
  for (let i = 0; i < cfg.poll.liveSamples; i++) {
    try {
      spot.push({ block: getBlockNumber(), gasPriceWei: getGasPriceWei().toString() });
    } catch { spot.push({ block: null, gasPriceWei: null, error: "spot poll failed" }); }
    if (i < cfg.poll.liveSamples - 1) await sleep(cfg.poll.intervalSec * 1000);
  }

  const { rows, endPriors } = evaluateSeries(samples, params, priors);

  for (const r of rows) {
    store.appendObservation(paths, { ts: now(), metric: cfg.metric, chainId, mode: "LIVE", ...r });
  }
  const fired = rows.filter((r) => r.decision === "FIRE");
  for (const f of fired) {
    store.appendAudit(paths, { ts: now(), blockNumber: f.blockNumber, decision: "FIRE", reason: f.reason, streak: f.streak, fastMAWei: f.fastMAWei, slowMAWei: f.slowMAWei });
  }
  const last = rows[rows.length - 1];
  store.appendAudit(paths, { ts: now(), blockNumber: last.blockNumber, decision: last.decision, reason: last.reason, streak: last.streak, note: "cycle summary" });

  const runtime = {
    chainId, metric: cfg.metric, params,
    streak: endPriors.streak, lastFireBlock: endPriors.lastFireBlock,
    samplesTotal: (priors.samplesTotal ?? 0) + rows.length,
    firesTotal: (priors.firesTotal ?? 0) + fired.length,
    lastBlock: last.blockNumber, updatedAt: new Date().toISOString(),
  };
  store.saveRuntime(paths, runtime);

  printReport(rows, spot, fired, runtime);
  console.log(`\nPersisted ${rows.length} observations -> ${paths.observations} | priors -> ${paths.runtime}`);
}

async function report() {
  const priors = store.loadPriors(paths);
  const rows = store.readObservations(paths, 60);
  if (rows.length === 0) {
    console.log("No observations yet. Run: node bin/run.mjs observe");
    return;
  }
  const fires = rows.filter((r) => r.decision === "FIRE");
  const holds = rows.length - fires.length;
  const live = rows.filter((r) => r.mode === "LIVE");
  const synth = rows.filter((r) => r.mode !== "LIVE");
  console.log("t09-trend-watcher :: observation summary");
  console.log(`  observations: ${rows.length} (LIVE ${live.length}, synthetic ${synth.length})`);
  console.log(`  block range:  ${rows[0].blockNumber} .. ${rows[rows.length - 1].blockNumber}`);
  console.log(`  decisions:    FIRE x${fires.length} | HOLD x${holds}`);
  console.log(`  current streak: ${priors.streak} | lastFireBlock: ${priors.lastFireBlock ?? "none"} | firesTotal: ${priors.firesTotal ?? 0}`);
  console.log("");
  console.log("Why acted / why not (last 10 decisions):");
  for (const r of rows.slice(-10)) {
    const v = r.valueWei ? `${(BigInt(r.valueWei) / 1_000_000_000n)} gwei` : "n/a";
    console.log(`  block ${r.blockNumber} [${r.mode}] ${r.decision} — ${r.reason} (value ${v}, streak ${r.streak})`);
  }
  if (fires.length > 0) {
    console.log("\nFIRE events:");
    for (const f of fires) console.log(`  block ${f.blockNumber} — ${f.reason} (fastMA ${gwei(f.fastMAWei)} / slowMA ${gwei(f.slowMAWei)} gwei)`);
  } else {
    console.log("\nNo FIRE yet: the rule requires 3 CONSECUTIVE above-band samples; single spikes reset the streak (see spike-demo).");
  }
}

async function demo(kind) {
  // CONTROLLED SYNTHETIC harness — same math functions, labeled provenance.
  const G = 1_000_000_000n;
  const base = 10n * G;
  let series;
  if (kind === "spike") {
    // 14x flat, ONE spike 5x, then flat — streak must reset, never FIRE
    series = Array(14).fill(base).concat([50n * G]).concat(Array(6).fill(base));
  } else {
    // 14x flat then sustained 12% climb — must FIRE after 3 confirmations
    series = Array(14).fill(base);
    let v = base;
    for (let i = 0; i < 12; i++) { v = (v * 112n) / 100n; series.push(v); }
  }
  const startBlock = 99000000; // synthetic block space, clearly not real
  const samples = series.map((value, i) => ({ blockNumber: startBlock + i, value, ts: 0, source: "SYNTHETIC-CONTROLLED" }));
  const { rows, endPriors } = evaluateSeries(samples, cfg.trend, { streak: 0, lastFireBlock: null });

  console.log(`t09-trend-watcher :: ${kind}-demo — MODE=SYNTHETIC-CONTROLLED (math harness, NOT chain data)`);
  console.log("block      value    fastMA   slowMA   trend    streak decision reason");
  for (const r of rows.slice(-12)) {
    console.log(
      `${r.blockNumber}  ${pad(gwei(r.valueWei), 6)}  ${pad(gwei(r.fastMAWei), 6)}  ${pad(gwei(r.slowMAWei), 6)}  ${pad(r.trend, 8)} ${String(r.streak).padStart(6)} ${pad(r.decision, 8)} ${r.reason}`
    );
  }
  const fired = rows.filter((r) => r.decision === "FIRE");
  console.log(`\nResult: ${fired.length > 0 ? `FIRED at block(s) ${fired.map((f) => f.blockNumber).join(", ")}` : "NO FIRE — HOLD"} (end streak ${endPriors.streak})`);
  if (kind === "spike") console.log("Official req 4 demonstrated: a single spike does NOT trigger (streak reset on the dip).");
}

function printReport(rows, spot, fired, runtime) {
  const first = rows[0], last = rows[rows.length - 1];
  console.log("\n--- SIGNAL REPORT ---");
  console.log(`window:      blocks ${first.blockNumber}..${last.blockNumber} (${rows.length} real baseFeePerGas samples)`);
  console.log(`last sample: block ${last.blockNumber} value ${gwei(last.valueWei)} gwei`);
  console.log(`fastMA(5):   ${gwei(last.fastMAWei)} gwei | slowMA(15): ${gwei(last.slowMAWei)} gwei | trend ${last.trend}`);
  console.log(`streak:      ${last.streak}/${cfg.trend.confirmations} confirmations | decision ${last.decision} (${last.reason})`);
  console.log(`gas spot:    ${spot.map((s) => (s.gasPriceWei ? `${Number(BigInt(s.gasPriceWei)) / 1e9} gwei@${s.block}` : "err")).join(", ")} (context only)`);
  console.log(`signal:      ${fired.length > 0 ? `FIRE x${fired.length} at block(s) ${fired.map((f) => f.blockNumber).join(", ")}` : "NO SIGNAL — market flat inside the 0.5% band"}`);
}

function gwei(weiStr) {
  if (weiStr === null || weiStr === undefined) return "n/a";
  const w = BigInt(weiStr);
  const whole = w / 1_000_000_000n;
  const frac = (w % 1_000_000_000n).toString().padStart(9, "0").slice(0, 3);
  return `${whole}.${frac}`;
}
function pad(s, n) { return String(s).padStart(n); }
function now() { return Math.floor(Date.now() / 1000); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function safeBlockNumber() { try { return getBlockNumber(); } catch { return null; } }

/** Minimal YAML reader for our flat config (no dependency). */
function parseYaml(text) {
  const root = {};
  const stack = [{ obj: root, indent: -1 }];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.match(/^\s*/)[0].length;
    const m = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const key = m[1].trim();
    // strip inline comments ("# ...") — values in this config never contain '#'
    const val = m[2].replace(/\s+#.*$/, "").trim();
    const cur = stack[stack.length - 1].obj;
    if (val === "") {
      const child = {};
      cur[key] = child;
      stack.push({ obj: child, indent });
    } else {
      cur[key] = /^\d+$/.test(val) ? Number(val) : val;
    }
  }
  return root;
}
