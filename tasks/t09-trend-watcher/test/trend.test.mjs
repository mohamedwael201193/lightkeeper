/**
 * t09-trend-watcher unit tests — SYNTHETIC series only.
 * These tests exercise the trend MATH (src/trend.mjs), never the chain.
 * Live evidence comes from `node bin/run.mjs observe` (real blocks).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { movingAverage, classifyTrend, decide, evaluateSeries } from "../src/trend.mjs";

const G = 1_000_000_000n;
const P = { fastWindow: 5, slowWindow: 15, bandBps: 50, confirmations: 3, cooldownBlocks: 20 };
const samp = (values, start = 1000) => values.map((v, i) => ({ blockNumber: start + i, value: v }));

test("movingAverage: exact integer mean of last window", () => {
  assert.equal(movingAverage([1n, 2n, 3n, 4n, 5n], 5), 3n);
  assert.equal(movingAverage([10n * G, 10n * G, 20n * G], 3), (40n * G) / 3n);
});

test("movingAverage: null on insufficient samples (warmup)", () => {
  assert.equal(movingAverage([1n, 2n], 5), null);
  assert.equal(movingAverage([], 5), null);
});

test("classifyTrend: band boundary is exact (BigInt, no floats)", () => {
  const slow = 10_000n * G;
  // exactly at the band edge: fast = slow*(1+band) -> NOT above (strict >)
  const edge = (slow * 10050n) / 10000n;
  assert.equal(classifyTrend(edge, slow, 50), "FLAT");
  assert.equal(classifyTrend(edge + 1n, slow, 50), "BULLISH");
  assert.equal(classifyTrend(slow - slow / 100n, slow, 50), "BEARISH");
});

test("evaluateSeries: flat series never fires", () => {
  const { rows, endPriors } = evaluateSeries(samp(Array(30).fill(10n * G)), P, { streak: 0, lastFireBlock: null });
  assert.ok(rows.every((r) => r.decision === "HOLD"));
  assert.equal(endPriors.streak, 0);
});

test("evaluateSeries: single spike does NOT trigger (official req 4)", () => {
  const flat = Array(14).fill(10n * G);
  const series = flat.concat([50n * G]).concat(Array(10).fill(10n * G));
  const { rows, endPriors } = evaluateSeries(samp(series), P, { streak: 0, lastFireBlock: null });
  assert.ok(rows.every((r) => r.decision === "HOLD"), "single spike must never FIRE");
  // streak resets after the dip
  const lastRows = rows.slice(-5);
  assert.ok(lastRows.every((r) => r.streak === 0), `streak must reset, got ${lastRows.map((r) => r.streak)}`);
  assert.equal(endPriors.streak, 0);
});

test("evaluateSeries: sustained exceedance FIRES at exactly the Nth confirmation (official req 3)", () => {
  const series = Array(14).fill(10n * G);
  let v = 10n * G;
  for (let i = 0; i < 12; i++) { v = (v * 112n) / 100n; series.push(v); } // +12%/sample climb
  const { rows } = evaluateSeries(samp(series), P, { streak: 0, lastFireBlock: null });
  const fires = rows.filter((r) => r.decision === "FIRE");
  assert.equal(fires.length, 1, "exactly one FIRE expected");
  const idx = rows.indexOf(fires[0]);
  // the firing sample is the 3rd consecutive confirmation: streak 1,2 before it
  assert.ok(rows[idx - 1].above && rows[idx - 1].streak === 2, "2nd confirmation must precede FIRE");
  assert.ok(rows[idx - 2].above && rows[idx - 2].streak === 1, "1st confirmation must precede FIRE");
  assert.ok(!rows[idx - 3].above, "confirmations must be consecutive (3rd-back sample not above)");
  assert.equal(fires[0].reason, "CONFIRMED_3X_ABOVE_BAND");
  assert.equal(fires[0].streak, 0, "streak resets after FIRE");
});

test("evaluateSeries: dip after 2 confirmations resets streak (anti-spike)", () => {
  const series = Array(14).fill(10n * G);
  let v = 10n * G;
  for (let i = 0; i < 2; i++) { v = (v * 130n) / 100n; series.push(v); } // exactly 2 confirmations...
  series.push(10n * G); // ...then a dip back to baseline
  for (let i = 0; i < 8; i++) series.push(10n * G);
  const { rows } = evaluateSeries(samp(series), P, { streak: 0, lastFireBlock: null });
  assert.ok(rows.every((r) => r.decision === "HOLD"), "dip must prevent FIRE");
  assert.ok(rows.some((r) => r.streak === 2), "setup: 2 confirmations must actually build");
  assert.ok(rows.slice(-5).every((r) => r.streak === 0), "streak must reset after the dip");
});

test("evaluateSeries: cooldown blocks a second FIRE", () => {
  const series = Array(14).fill(10n * G);
  let v = 10n * G;
  for (let i = 0; i < 16; i++) { v = (v * 112n) / 100n; series.push(v); } // climb ends inside the cooldown
  const { rows } = evaluateSeries(samp(series, 5000), P, { streak: 0, lastFireBlock: null });
  const fires = rows.filter((r) => r.decision === "FIRE");
  assert.equal(fires.length, 1, "cooldown must suppress the second FIRE inside 20 blocks");
  const cool = rows.find((r) => r.reason.startsWith("CONFIRMED_BUT_COOLDOWN"));
  assert.ok(cool, "expected a CONFIRMED_BUT_COOLDOWN hold reason");
});

test("evaluateSeries: warmup rows HOLD with WARMUP_INSUFFICIENT_SAMPLES", () => {
  const { rows } = evaluateSeries(samp(Array(10).fill(10n * G)), P, { streak: 0, lastFireBlock: null });
  assert.ok(rows.every((r) => r.decision === "HOLD" && r.reason === "WARMUP_INSUFFICIENT_SAMPLES"));
});

test("evaluateSeries: observer error is fail-closed (HOLD, streak preserved)", () => {
  // rising series so the streak is genuinely > 0 when the error hits
  const series = Array(14).fill(10n * G);
  let v = 10n * G;
  for (let i = 0; i < 6; i++) { v = (v * 130n) / 100n; series.push(v); }
  const good = samp(series, 1000);
  // measure the streak at the end of the clean prefix, then inject the error
  const prefixStreak = evaluateSeries(good, P, { streak: 0, lastFireBlock: null }).endPriors.streak;
  good.push({ blockNumber: 1000 + series.length, error: "RPC_TIMEOUT" });
  good.push(...samp(Array(5).fill(10n * G), 1000 + series.length + 1));
  const { rows } = evaluateSeries(good, P, { streak: 0, lastFireBlock: null });
  const errRow = rows.find((r) => r.trend === "ERROR");
  assert.ok(errRow, "error row must be recorded");
  assert.equal(errRow.decision, "HOLD");
  assert.equal(errRow.streak, prefixStreak, "streak must be preserved across observer errors");
  assert.ok(errRow.reason.startsWith("OBSERVER_ERROR_"));
});

test("decide: BEARISH resets streak", () => {
  const d = decide({ streak: 2, lastFireBlock: null }, 9n * G, 10n * G, 9n * G, 2000, 3, 50, 20);
  assert.equal(d.streak, 0);
  assert.equal(d.decision, "HOLD");
  assert.equal(d.reason, "BEARISH_TREND_STREAK_RESET");
});

test("decide: BULLISH crossover with echo-contaminated MA but cold reading does NOT confirm", () => {
  // the spike has left the fast MA, but the current reading is back at baseline:
  // no confirmation, streak resets (this is what kills single-spike false fires)
  const d = decide({ streak: 1, lastFireBlock: null }, 18n * G, 12666n * G / 1000n, 10n * G, 2001, 3, 50, 20);
  assert.equal(d.above, false);
  assert.equal(d.streak, 0);
  assert.equal(d.reason, "READING_BELOW_BAND_STREAK_RESET");
});
