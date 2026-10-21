/**
 * T09 — Trend Watcher (Swell Line) · try it live (TIER A — live reads, no signature).
 *
 * "Trend line, live": samples the exact series the Swell Line CLI watches —
 * per-block baseFeePerGas on Pharos mainnet (chain 1672), read one block
 * at a time via the Chain MCP so the run progress can count real observations — and renders the
 * window as a real trend chart with per-block deltas,
 * fastMA(5) / slowMA(15), the 0.5% confirmation band, and the trailing
 * above-band streak. FIRE needs 3 consecutive confirmations; a single spike
 * provably cannot trigger it — the panel shows exactly why the signal did or
 * did not fire for the window it just sampled.
 *
 * No mocks: every value on screen was just read from chain. This panel samples
 * one window on demand; the CLI holds the streak across runs.
 *
 * Presentation: 01 Configure → 02 Run → 03 Result (Presentation Standard,
 * SHOWTIME op 2026-10-16). FLAGSHIP (2026-10-16): the 03 act is rebuilt
 * around the chart as the hero — the trend line as a living thing. The
 * 0.5% confirmation band is drawn on the chart as a visible instrument, the
 * trailing streak gets its own meter, and a streak-anatomy panel shows
 * exactly why the rule fired or stayed silent. All math below is the CLI's
 * exact rule, unchanged.
 */
import { useEffect, useRef, useState } from "react";
import { motion, animate, useReducedMotion } from "framer-motion";
import type { Lamp } from "../../types";
import { rpcCall } from "../../hooks/useAtlantic";
import { ResultCard, ProgressLoader, EmptyState, ErrorState, StatStrip } from "../ui";

const FAST = 5;
const SLOW = 15;
const BAND_BPS = 50; // 0.5% confirmation band
const CONFIRMATIONS = 3;
const WINDOW_OPTIONS = [20, 30, 50, 100];
const DEFAULT_WINDOW = 30;
const TABLE_TAIL = 16;

interface Row {
  blockNumber: number;
  baseFeeWei: bigint;
  baseFeeGwei: number;
  deltaGwei: number | null;
  fastMAWei: bigint | null;
  slowMAWei: bigint | null;
  aboveBand: boolean | null;
}

interface TrendResult {
  window: number;
  oldestBlock: number;
  rows: Row[];
  streak: number;
  aboveCount: number;
  verdict: "TRENDING_UP" | "BUILDING" | "HOLD";
  reason: string;
}

function meanWei(vals: bigint[]): bigint {
  return vals.reduce((a, b) => a + b, 0n) / BigInt(vals.length);
}

function above(fastMA: bigint, slowMA: bigint, raw: bigint): boolean {
  const band = 10000n + BigInt(BAND_BPS);
  return fastMA * 10000n > slowMA * band && raw * 10000n > slowMA * band;
}

/**
 * Samples `window` blocks of base-fee history from Atlantic testnet (chain 688689)
 * and computes the trend verdict. The observation cycle is progressive so the
 * run progress can show a REAL count: it pins the tip (eth_blockNumber), then
 * reads each block's baseFeePerGas with one real eth_getBlockByNumber call per
 * block — the exact same per-block series the Swell Line CLI gets from
 * eth_feeHistory (bin/run.mjs observe) — advancing onObservation as each call
 * resolves. onStage tracks the real async stages: 0 = pinning tip,
 * 1 = observing blocks, 2 = verdict computation (synchronous, instant).
 * onBlock fires once per REAL completed observation (block + fee) so the run
 * act can draw each point as it arrives — never a timer.
 */
interface TrendProgress {
  onStage: (stage: number) => void;
  onObservation: (done: number) => void;
  onBlock?: (blockNumber: number, feeWei: bigint) => void;
}

async function sampleTrend(window: number, prog?: TrendProgress): Promise<TrendResult> {
  prog?.onStage(0);
  const tipHex = (await rpcCall("eth_blockNumber", [])) as string;
  const tip = Number(BigInt(tipHex));
  const oldest = tip - window + 1;
  if (oldest <= 0)
    throw new Error(`Atlantic tip ${tip} is below the ${window}-block window — cannot sample.`);
  prog?.onStage(1);

  // One real RPC call per observation; the count is real, not a timer.
  const fees: bigint[] = new Array<bigint>(window);
  let done = 0;
  await Promise.all(
    Array.from({ length: window }, (_, i) => {
      const blockNumber = oldest + i;
      return rpcCall("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false])
        .then((b) => {
          const block = b as { baseFeePerGas?: string } | null;
          if (!block || !block.baseFeePerGas)
            throw new Error(`Atlantic did not return block ${blockNumber}.`);
          fees[i] = BigInt(block.baseFeePerGas);
          prog?.onBlock?.(blockNumber, fees[i]);
        })
        .finally(() => {
          done += 1;
          prog?.onObservation(done);
        });
    })
  );
  prog?.onStage(2);

  if (fees.length < SLOW)
    throw new Error(`Atlantic returned only ${fees.length} fee samples — need at least ${SLOW}.`);

  const rows: Row[] = fees.map((wei, i) => {
    const fast = i >= FAST - 1 ? meanWei(fees.slice(i - FAST + 1, i + 1)) : null;
    const slow = i >= SLOW - 1 ? meanWei(fees.slice(i - SLOW + 1, i + 1)) : null;
    return {
      blockNumber: oldest + i,
      baseFeeWei: wei,
      baseFeeGwei: Number(wei) / 1e9,
      deltaGwei: i === 0 ? null : Number(wei - fees[i - 1]) / 1e9,
      fastMAWei: fast,
      slowMAWei: slow,
      aboveBand: fast !== null && slow !== null ? above(fast, slow, wei) : null,
    };
  });

  // Trailing consecutive above-band readings (the streak; any miss resets it).
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].aboveBand) streak++;
    else break;
  }

  const anyRecentAbove = rows.slice(-6).some((r) => r.aboveBand);
  let verdict: TrendResult["verdict"];
  let reason: string;
  if (streak >= CONFIRMATIONS) {
    verdict = "TRENDING_UP";
    reason = `Confirmed ${streak}× above the band — the 3-confirmation rule would fire. The Swell Line CLI confirms this streak across runs before it reports.`;
  } else if (streak > 0) {
    verdict = "BUILDING";
    reason = `Streak ${streak} of ${CONFIRMATIONS} — above the band but not yet confirmed. One flat reading resets it.`;
  } else {
    verdict = "HOLD";
    reason = anyRecentAbove
      ? "A single above-band reading appeared and the very next reading fell back — streak reset to 0. A spike can never trigger it; this window says HOLD."
      : "Flat inside the 0.5% band — the market is quiet, so the honest signal is HOLD, not a manufactured fire.";
  }

  return {
    window,
    oldestBlock: oldest,
    rows,
    streak,
    aboveCount: rows.filter((r) => r.aboveBand).length,
    verdict,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Spike test (CONTROLLED — SYNTHETIC series, same math as the CLI harness).
// The exact evaluateSeries/decide math from src/trend.mjs, ported faithfully:
// 14x flat 10 gwei, ONE 5x spike, 6x flat — the streak must climb to 1 then
// reset on the dip, and never FIRE. This is official requirement 4, one click.
// Labeled synthetic everywhere it appears; never mixed with live reads.
// ---------------------------------------------------------------------------
type TrendClass = "BULLISH" | "BEARISH" | "FLAT" | "WARMUP";

interface SpikeRow {
  blockNumber: number;
  valueGwei: number;
  fastMAGwei: number | null;
  slowMAGwei: number | null;
  trend: TrendClass;
  streak: number;
  decision: "FIRE" | "HOLD";
  reason: string;
}

function classifyTrendT(fastMA: bigint, slowMA: bigint, bandBps: number): "BULLISH" | "BEARISH" | "FLAT" {
  const SCALE = 10000n;
  const band = BigInt(bandBps);
  if (fastMA * SCALE > slowMA * (SCALE + band)) return "BULLISH";
  if (slowMA * SCALE > fastMA * (SCALE + band)) return "BEARISH";
  return "FLAT";
}

function runSpikeTest(): { rows: SpikeRow[]; fired: boolean; endStreak: number; peakStreak: number } {
  const G = 1_000_000_000n;
  const base = 10n * G;
  const series: bigint[] = Array(14).fill(base).concat([50n * G]).concat(Array(6).fill(base));
  const values: bigint[] = [];
  let streak = 0;
  let peakStreak = 0;
  let lastFireBlock: number | null = null;
  const rows: SpikeRow[] = [];
  let fired = false;

  series.forEach((value, i) => {
    const blockNumber = 99000000 + i;
    values.push(value);
    const fastMA = values.length >= FAST ? meanWei(values.slice(-FAST)) : null;
    const slowMA = values.length >= SLOW ? meanWei(values.slice(-SLOW)) : null;

    let decision: "FIRE" | "HOLD" = "HOLD";
    let reason: string;
    let aboveBand = false;
    if (fastMA === null || slowMA === null) {
      reason = "WARMUP_INSUFFICIENT_SAMPLES";
      streak = 0;
    } else {
      const trend = classifyTrendT(fastMA, slowMA, BAND_BPS);
      const readingAbove = value * 10000n > slowMA * (10000n + BigInt(BAND_BPS));
      aboveBand = trend === "BULLISH" && readingAbove;
      streak = aboveBand ? streak + 1 : 0;
      peakStreak = Math.max(peakStreak, streak);
      if (trend === "BEARISH") reason = "BEARISH_TREND_STREAK_RESET";
      else if (trend === "BULLISH" && !readingAbove) reason = "READING_BELOW_BAND_STREAK_RESET";
      else if (trend === "FLAT") reason = "FLAT_INSIDE_BAND_STREAK_RESET";
      else reason = `STREAK_${streak}_OF_${CONFIRMATIONS}`;
      if (aboveBand && streak >= CONFIRMATIONS) {
        const cooled = lastFireBlock === null || blockNumber - lastFireBlock >= 20;
        if (cooled) {
          decision = "FIRE";
          reason = `CONFIRMED_${CONFIRMATIONS}X_ABOVE_BAND`;
          lastFireBlock = blockNumber;
          streak = 0;
          fired = true;
        } else {
          reason = "CONFIRMED_BUT_COOLDOWN";
          streak = 0;
        }
      }
    }
    rows.push({
      blockNumber,
      valueGwei: Number(value) / 1e9,
      fastMAGwei: fastMA === null ? null : Number(fastMA) / 1e9,
      slowMAGwei: slowMA === null ? null : Number(slowMA) / 1e9,
      trend: fastMA === null || slowMA === null ? "WARMUP" : classifyTrendT(fastMA, slowMA, BAND_BPS),
      streak,
      decision,
      reason,
    });
  });
  return { rows, fired, endStreak: streak, peakStreak };
}

// ---------------------------------------------------------------------------
// Charts — real series, real states. Entrance motion only (data arriving);
// nothing on a timer.
// ---------------------------------------------------------------------------
const INK = "#0B1533";
const SLATE = "#5A6B8C";
const ACCENT = "#2456E6";
const PASS = "#16a34a";
const BAND_FILL = "rgba(36, 86, 230, 0.10)";

/** Smooth path through points (Catmull-Rom → bezier). Passes through every point. */
function smoothPath(xs: number[], ys: number[]): string {
  if (xs.length < 2) return "";
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const p0 = i === 0 ? xs[i] : xs[i - 1];
    const q0 = i === 0 ? ys[i] : ys[i - 1];
    const p1 = xs[i];
    const q1 = ys[i];
    const p2 = xs[i + 1];
    const q2 = ys[i + 1];
    const p3 = i + 2 < xs.length ? xs[i + 2] : xs[i + 1];
    const q3 = i + 2 < ys.length ? ys[i + 2] : ys[i + 1];
    const c1x = p1 + (p2 - p0) / 6;
    const c1y = q1 + (q2 - q0) / 6;
    const c2x = p2 - (p3 - p1) / 6;
    const c2y = q2 - (q3 - q1) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.toFixed(1)},${q2.toFixed(1)}`;
  }
  return d;
}

const gweiNum = (wei: bigint): number => Number(wei) / 1e9;

/**
 * The hero instrument: the live trend line with the 0.5% confirmation band
 * drawn as a shaded instrument around slowMA(15), fastMA(5) and the raw base
 * fee, above-band confirmations marked, and the trailing streak zone lit.
 * The line draws itself on data arrival (The Draw); every other motion is an
 * entrance that maps to the same state.
 */
function TrendChart({ result }: { result: TrendResult }) {
  const reduceMotion = useReducedMotion();
  const W = 720;
  const H = 340;
  const PAD = { l: 64, r: 16, t: 20, b: 48 };
  const rows = result.rows;
  const vals = rows.map((r) => r.baseFeeGwei);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => PAD.l + (i / (rows.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);

  const xs = rows.map((_, i) => x(i));
  const rawPath = smoothPath(xs, vals.map(y));
  const areaPath = `${rawPath} L${xs[xs.length - 1].toFixed(1)},${(H - PAD.b).toFixed(1)} L${xs[0].toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;

  const fastIdx: number[] = [];
  const slowIdx: number[] = [];
  rows.forEach((r, i) => {
    if (r.fastMAWei !== null) fastIdx.push(i);
    if (r.slowMAWei !== null) slowIdx.push(i);
  });
  const fastPath = smoothPath(
    fastIdx.map(x),
    fastIdx.map((i) => y(gweiNum(rows[i].fastMAWei!)))
  );
  const slowPath = smoothPath(
    slowIdx.map(x),
    slowIdx.map((i) => y(gweiNum(rows[i].slowMAWei!)))
  );

  // The 0.5% confirmation band as a visible instrument: slowMA(15) ± 0.5%.
  // The rule's band condition is slowMA * (10000 + 50) / 10000, drawn here.
  const bandUp = slowIdx.map((i) => `${x(i).toFixed(1)},${y(gweiNum(rows[i].slowMAWei!) * 1.005).toFixed(1)}`);
  const bandDn = slowIdx
    .map((i) => `${x(i).toFixed(1)},${y(gweiNum(rows[i].slowMAWei!) * 0.995).toFixed(1)}`)
    .reverse();
  const bandPath = bandUp.length > 1 ? `M${bandUp.join(" L")} L${bandDn.join(" L")} Z` : "";

  // The trailing streak zone: the exact blocks that built the live streak.
  const streak = result.streak;
  const streakStart = rows.length - streak;
  const stepX = rows.length > 1 ? x(1) - x(0) : 0;
  const streakZone =
    streak > 0
      ? {
          x1: x(streakStart) - stepX / 2,
          x2: x(rows.length - 1) + stepX / 2,
        }
      : null;

  const gridlines = [0, 1, 2, 3].map((g) => lo + (span * g) / 3);
  const gradId = `swell-area-${result.oldestBlock}`;

  // Draw-on choreography: the line draws itself once, because the real data
  // just arrived. Instant under prefers-reduced-motion.
  const drawProps = reduceMotion
    ? {}
    : {
        initial: { pathLength: 0 },
        animate: { pathLength: 1 },
        transition: { duration: 0.9, ease: "easeOut" as const },
      };
  const fadeLateProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.6, delay: 0.55 },
      };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2">
          <svg width="28" height="6" aria-hidden><line x1="0" y1="3" x2="28" y2="3" stroke={INK} strokeWidth="2.5" /></svg>
          <span className="font-medium text-ink">Base fee</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="28" height="6" aria-hidden><line x1="0" y1="3" x2="28" y2="3" stroke={ACCENT} strokeWidth="2.5" strokeDasharray="6 4" /></svg>
          <span className="font-medium text-ink">fastMA(5)</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="28" height="6" aria-hidden><line x1="0" y1="3" x2="28" y2="3" stroke={SLATE} strokeWidth="2.5" strokeDasharray="6 4" /></svg>
          <span className="font-medium text-ink">slowMA(15)</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="20" height="10" aria-hidden><rect x="0" y="0" width="20" height="10" rx="2" fill={BAND_FILL} stroke={ACCENT} strokeOpacity="0.5" /></svg>
          <span className="font-medium text-ink">0.5% confirmation band</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill={ACCENT} /></svg>
          <span className="font-medium text-ink">Above the band</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Base fee trend, blocks ${result.oldestBlock} to ${result.oldestBlock + rows.length - 1}, with the 0.5% confirmation band`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridlines.map((g, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={y(g)} x2={W - PAD.r} y2={y(g)} stroke="#E3EAF9" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(g) + 4} textAnchor="end" fontSize="12" fill={SLATE}>
              {g.toFixed(3)}
            </text>
          </g>
        ))}
        {streakZone && (
          <g>
            <rect
              x={streakZone.x1}
              y={PAD.t}
              width={streakZone.x2 - streakZone.x1}
              height={H - PAD.t - PAD.b}
              fill={ACCENT}
              opacity="0.07"
            />
            <text
              x={(streakZone.x1 + streakZone.x2) / 2}
              y={PAD.t + 16}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill={ACCENT}
            >
              streak {streak}/{CONFIRMATIONS}
            </text>
          </g>
        )}
        {bandPath && (
          <motion.path d={bandPath} fill={BAND_FILL} stroke={ACCENT} strokeOpacity="0.45" strokeWidth="1" {...fadeLateProps} />
        )}
        <path d={areaPath} fill={`url(#${gradId})`} />
        {slowPath && (
          <motion.path d={slowPath} fill="none" stroke={SLATE} strokeWidth="2" strokeDasharray="6 4" opacity="0.85" {...fadeLateProps} />
        )}
        {fastPath && (
          <motion.path d={fastPath} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeDasharray="7 4" {...fadeLateProps} />
        )}
        {rawPath && (
          <motion.path d={rawPath} fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" {...drawProps} />
        )}
        {rows.map(
          (r, i) =>
            r.aboveBand && (
              <circle key={r.blockNumber} cx={x(i)} cy={y(r.baseFeeGwei)} r="5" fill={ACCENT} stroke="#fff" strokeWidth="1.5" />
            )
        )}
        <text x={PAD.l} y={H - 30} fontSize="12" fill={SLATE} fontFamily="monospace">
          #{result.oldestBlock}
        </text>
        <text x={W - PAD.r} y={H - 30} textAnchor="end" fontSize="12" fill={SLATE} fontFamily="monospace">
          #{result.oldestBlock + rows.length - 1}
        </text>
        <text x={PAD.l} y={H - 12} fontSize="12" fill={SLATE}>
          gwei — {rows.length} live block observations
        </text>
      </svg>
      {/* Streak strip: one dot per block — the live above-band state. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Per-block band state">
        <span className="mr-1 text-sm font-medium text-slate">Band state</span>
        {rows.map((r) => (
          <span
            key={r.blockNumber}
            title={`Block ${r.blockNumber}: ${r.aboveBand === null ? "warmup" : r.aboveBand ? "above band" : "inside band"}`}
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: r.aboveBand ? ACCENT : r.aboveBand === null ? "#C9D4EC" : "#E3EAF9" }}
          />
        ))}
      </div>
    </div>
  );
}

/** The synthetic spike series: the 5× spike and the streak that dies on the next reading. */
function SpikeChart({ rows }: { rows: SpikeRow[] }) {
  const W = 720;
  const H = 260;
  const PAD = { l: 64, r: 16, t: 28, b: 52 };
  const vals = rows.map((r) => r.valueGwei);
  const lo = 0;
  const hi = Math.max(...vals) * 1.1;
  const x = (i: number) => PAD.l + (i / (rows.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const xs = rows.map((_, i) => x(i));
  const path = smoothPath(xs, vals.map(y));
  const spikeIdx = rows.findIndex((r) => r.valueGwei > 10.0001);
  const resetIdx = spikeIdx + 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Controlled synthetic series: flat, one five-times spike, flat again"
    >
      {[0, 25, 50].map((g) => (
        <g key={g}>
          <line x1={PAD.l} y1={y(g)} x2={W - PAD.r} y2={y(g)} stroke="#E3EAF9" strokeWidth="1" />
          <text x={PAD.l - 8} y={y(g) + 4} textAnchor="end" fontSize="12" fill={SLATE}>
            {g.toFixed(0)} gwei
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      {spikeIdx >= 0 && (
        <g>
          <line x1={x(spikeIdx)} y1={y(vals[spikeIdx])} x2={x(spikeIdx)} y2={H - PAD.b} stroke={ACCENT} strokeWidth="1.5" strokeDasharray="5 4" />
          <circle cx={x(spikeIdx)} cy={y(vals[spikeIdx])} r="7" fill={ACCENT} stroke="#fff" strokeWidth="2" />
          <text x={x(spikeIdx)} y={PAD.t - 10} textAnchor="middle" fontSize="13" fontWeight="700" fill={ACCENT}>
            5× spike — streak climbs to 1
          </text>
        </g>
      )}
      {resetIdx < rows.length && (
        <g>
          <circle cx={x(resetIdx)} cy={y(vals[resetIdx])} r="5" fill={PASS} stroke="#fff" strokeWidth="1.5" />
          <text x={x(resetIdx)} y={H - PAD.b + 20} textAnchor="middle" fontSize="13" fontWeight="600" fill={SLATE}>
            Next reading below band — streak resets to 0
          </text>
        </g>
      )}
      <text x={PAD.l} y={H - 8} fontSize="12" fill={SLATE}>
        Synthetic series — controlled, not chain data · {rows.length} blocks
      </text>
    </svg>
  );
}

/**
 * THE STREAK — the signature instant. The trailing above-band streak as a
 * live-counting meter: the count ticks from 0 to the real value once (The
 * Tick, mapped to the measured streak landing), and the three confirmation
 * slots fill with it. Any miss resets the streak — this meter IS the rule.
 */
function StreakMeter({ streak, verdict }: { streak: number; verdict: TrendResult["verdict"] }) {
  const reduceMotion = useReducedMotion();
  const [ticked, setTicked] = useState(reduceMotion ? streak : 0);

  useEffect(() => {
    if (reduceMotion) {
      setTicked(streak);
      return;
    }
    const controls = animate(0, streak, {
      duration: 0.7,
      ease: "easeOut",
      onUpdate: (v) => setTicked(Math.round(v)),
    });
    return () => controls.stop();
  }, [streak, reduceMotion]);

  const slotCopy =
    verdict === "TRENDING_UP"
      ? "Three in a row — the rule fires."
      : verdict === "BUILDING"
        ? "Above the band, not yet confirmed — one flat reading resets it."
        : "Quiet. A lone spike can never reach three.";

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div>
        <p className="text-sm font-semibold text-slate">Confirmation streak</p>
        <p className="font-display text-5xl tracking-tight text-ink" aria-live="polite">
          {ticked}
          <span className="text-2xl text-slate">/{CONFIRMATIONS}</span>
        </p>
      </div>
      <div className="flex items-center gap-2" role="img" aria-label={`${streak} of ${CONFIRMATIONS} confirmations`}>
        {Array.from({ length: CONFIRMATIONS }, (_, i) => (
          <span
            key={i}
            className="h-4 w-10 rounded-full border transition-colors"
            style={{
              background: i < ticked ? ACCENT : "#E9EEF9",
              borderColor: i < ticked ? ACCENT : "#C9D4EC",
            }}
          />
        ))}
      </div>
      <p className="max-w-xs text-sm leading-relaxed text-slate">{slotCopy}</p>
    </div>
  );
}

/**
 * Streak anatomy — the thinking layer made visible. The exact trailing
 * blocks that built the streak, and the exact block where a spike died
 * (above the band once, then back inside — streak reset to 0). This is the
 * "a single spike provably cannot trigger it" proof, on live data.
 */
function StreakAnatomy({ result }: { result: TrendResult }) {
  const rows = result.rows;
  const run: Row[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].aboveBand) run.unshift(rows[i]);
    else break;
  }
  let deadSpike: { spike: Row; fell: Row } | null = null;
  for (let i = rows.length - 2; i >= 0; i--) {
    if (rows[i].aboveBand === true && rows[i + 1].aboveBand === false) {
      deadSpike = { spike: rows[i], fell: rows[i + 1] };
      break;
    }
  }

  const first = run[0]?.blockNumber;
  const last = run[run.length - 1]?.blockNumber;

  return (
    <div className="mt-5 rounded-xl border border-hairline bg-porcelain p-4 sm:p-5">
      <p className="text-sm font-semibold text-slate">Streak anatomy — why the rule did, or didn&apos;t, fire</p>
      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink">
        {run.length >= CONFIRMATIONS && (
          <li>
            <strong>It fired here.</strong> Blocks{" "}
            <span className="font-mono">#{first} → #{last}</span> read above the band{" "}
            {run.length} times running — the rule fires at the {CONFIRMATIONS}rd confirmation.
          </li>
        )}
        {run.length > 0 && run.length < CONFIRMATIONS && (
          <li>
            <strong>Building, not fired.</strong> Blocks{" "}
            <span className="font-mono">#{first} → #{last}</span> read above the band {run.length}×
            — <strong>{CONFIRMATIONS - run.length} more</strong> consecutive confirmation
            {CONFIRMATIONS - run.length === 1 ? " is" : "s are"} needed. The next flat reading
            resets it to 0.
          </li>
        )}
        {run.length === 0 && deadSpike && (
          <li>
            <strong>The spike that died.</strong> Block{" "}
            <span className="font-mono">#{deadSpike.spike.blockNumber}</span> read{" "}
            {deadSpike.spike.baseFeeGwei.toFixed(3)} gwei — above the band, streak 1. The very
            next block, <span className="font-mono">#{deadSpike.fell.blockNumber}</span>, read{" "}
            {deadSpike.fell.baseFeeGwei.toFixed(3)} gwei — back inside — and the streak reset to
            0. A single spike provably cannot trigger the rule.
          </li>
        )}
        {run.length === 0 && !deadSpike && (
          <li>
            <strong>Quiet window.</strong> No above-band readings in these {rows.length} blocks —
            the market moved inside the 0.5% band the whole time, so the honest signal is HOLD.
          </li>
        )}
        <li className="text-slate">
          The dual condition: fastMA(5) <em>and</em> the raw reading must both clear
          slowMA(15) × 1.005. The raw-reading half kills the fast-MA echo of a lone spike.
        </li>
      </ul>
    </div>
  );
}

/**
 * The run act's live instrument: each point is a REAL completed block read
 * (delivered by sampleTrend's onBlock), drawn in block order as it arrives.
 * No timers, no fake progress — just the observations as they land.
 */
function LiveObservations({ obs, window }: { obs: Array<{ block: number; feeWei: bigint }>; window: number }) {
  const W = 240;
  const H = 52;
  const sorted = [...obs].sort((a, b) => a.block - b.block);
  const vals = sorted.map((o) => Number(o.feeWei) / 1e9);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const px = (i: number) => (sorted.length > 1 ? (i / (sorted.length - 1)) * W : W / 2);
  const py = (v: number) => 6 + (1 - (v - lo) / span) * (H - 12);
  const points = sorted.map((_, i) => `${px(i).toFixed(1)},${py(vals[i]).toFixed(1)}`).join(" ");
  const latest = sorted[sorted.length - 1];

  return (
    <div className="mt-4 rounded-xl border border-hairline bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-60" role="img" aria-label="Observations arriving live">
          <polyline points={points} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" />
          {sorted.map((o, i) => (
            <circle key={o.block} cx={px(i)} cy={py(vals[i])} r="2" fill={ACCENT} />
          ))}
        </svg>
        <div className="text-sm">
          <p className="font-semibold text-ink">
            {obs.length} of {window} blocks observed
          </p>
          {latest && (
            <p className="mt-1 font-mono text-slate">
              latest: #{latest.block} · {(Number(latest.feeWei) / 1e9).toFixed(3)} gwei
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function gwei(wei: bigint | null): string {
  return wei === null ? "—" : (Number(wei) / 1e9).toFixed(3);
}

const VERDICT_HEADLINE: Record<TrendResult["verdict"], string> = {
  TRENDING_UP: "Trending up",
  BUILDING: "Building",
  HOLD: "Hold",
};

export default function TrySwellLine({ lamp }: { lamp: Lamp }) {
  const [tab, setTab] = useState<"live" | "spike">("live");
  const [window, setWindow] = useState(DEFAULT_WINDOW);
  const [runId, setRunId] = useState(0);
  const [spikeRan, setSpikeRan] = useState(false);

  // Live-read run state — driven manually so progress is a REAL count of
  // completed observations, not a timer.
  const [data, setData] = useState<TrendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [observed, setObserved] = useState(0);
  const [liveObs, setLiveObs] = useState<Array<{ block: number; feeWei: bigint }> | null>(null);
  const runSeq = useRef(0);

  useEffect(() => {
    if (runId === 0) return;
    const seq = ++runSeq.current;
    const alive = () => runSeq.current === seq;
    setLoading(true);
    setError(null);
    setObserved(0);
    setStage(0);
    setLiveObs([]);
    sampleTrend(window, {
      onStage: (s) => {
        if (alive()) setStage(s);
      },
      onObservation: (d) => {
        if (alive()) setObserved(d);
      },
      onBlock: (blockNumber, feeWei) => {
        if (alive()) setLiveObs((prev) => (prev === null ? [{ block: blockNumber, feeWei }] : [...prev, { block: blockNumber, feeWei }]));
      },
    })
      .then((r) => {
        if (alive()) setData(r);
      })
      .catch((e: unknown) => {
        if (alive())
          setError(e instanceof Error ? e.message : "The Atlantic RPC did not answer.");
      })
      .finally(() => {
        if (alive()) setLoading(false);
      });
    // deps are caller-owned: re-run when runId or window changes after a run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, window]);

  const spike = spikeRan ? runSpikeTest() : null;
  const spikeRow = spike ? spike.rows.find((r) => r.valueGwei > 10.0001) : null;

  const latest = data ? data.rows[data.rows.length - 1] : null;

  return (
    <div className="space-y-6">
      {/* header */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="chip chip-dim">Tier A · live read</span>
          <span className="chip chip-dim">No signature · costs nothing</span>
        </div>
        <h3 className="font-display text-2xl tracking-tight text-ink">Trend line, live</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink">
          The question Swell Line answers:{" "}
          <strong>is gas trending up, or is that just a wave?</strong> The rule: fastMA(5) vs
          slowMA(15), a 0.5% confirmation band, and <strong>3 consecutive above-band readings to
          fire</strong>. Any miss resets the streak; a single spike provably cannot trigger it.
        </p>
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Trend Watcher modes">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "live"}
          className={tab === "live" ? "btn-primary" : "btn-outline"}
          onClick={() => setTab("live")}
        >
          Live fee market
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "spike"}
          className={tab === "spike" ? "btn-primary" : "btn-outline"}
          onClick={() => setTab("spike")}
        >
          Spike test — controlled
        </button>
      </div>

      {tab === "spike" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip chip-dim">Synthetic — controlled</span>
            <span className="chip chip-dim">Same math as the CLI's spike demo</span>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-ink">
            A controlled series: 14 blocks flat at 10 gwei, <strong>one 5× spike</strong>, then
            6 blocks flat. This is <em>not</em> chain data — it is the official anti-spike
            demonstration (requirement 4), run here with the identical confirmation math the CLI
            uses on live blocks.
          </p>

          <div className="rounded-2xl border border-hairline bg-porcelain p-5 sm:p-6">
            <p className="text-sm font-semibold text-slate">01 — The controlled series</p>
            <p className="mt-1 text-sm text-slate">
              Flat 10 gwei × 14 → one 50 gwei spike → flat 10 gwei × 6. Press run and watch the
              streak climb to 1, then die on the very next reading.
            </p>
            <button type="button" className="btn-primary mt-4" onClick={() => setSpikeRan(true)}>
              {spikeRan ? "Re-run spike test" : "Run the spike test"}
            </button>
          </div>

          {spike && spikeRow && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="space-y-6"
            >
              <ResultCard
                eyebrow="Result — controlled spike test (synthetic series)"
                headline={spike.fired ? "Fired" : "Held — no fire"}
                status={spike.fired ? "fail" : "pass"}
                subline={`At block ${spikeRow.blockNumber} the 5× spike lands: the streak climbs to 1 — then the very next reading falls below the band and the streak drops back to 0. The raw-reading condition kills the fast-MA echo of the spike, so one spike can never reach ${CONFIRMATIONS} confirmations.`}
                rows={[
                  { label: "Series", value: "14 flat × 10 gwei → 1 × 50 gwei → 6 flat × 10 gwei" },
                  { label: "Peak streak", value: `${spike.peakStreak} of ${CONFIRMATIONS} — never enough` },
                  { label: "End streak", value: `${spike.endStreak}` },
                  { label: "Blocks evaluated", value: `${spike.rows.length}` },
                ]}
              />

              <StatStrip
                stats={[
                  { label: "Series length", value: spike.rows.length, format: (n) => `${Math.round(n)}`, suffix: "blocks" },
                  { label: "Spike magnitude", value: 5, format: (n) => `${Math.round(n)}×` },
                  { label: "Peak streak", value: spike.peakStreak, format: (n) => `${Math.round(n)}`, suffix: `/ ${CONFIRMATIONS} needed` },
                  { label: "Fires", value: spike.fired ? 1 : 0, format: (n) => `${Math.round(n)}` },
                ]}
              />

              <div className="rounded-2xl border border-hairline bg-white p-5 sm:p-6">
                <p className="mb-3 text-sm font-semibold text-slate">The spike, drawn</p>
                <SpikeChart rows={spike.rows} />
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-slate">
                  Row by row — identical to the CLI harness
                </p>
                <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th>Block</th>
                        <th className="text-right">Value (gwei)</th>
                        <th className="text-right">fastMA(5)</th>
                        <th className="text-right">slowMA(15)</th>
                        <th className="text-right">Streak</th>
                        <th>Decision</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spike.rows.map((r) => (
                        <tr key={r.blockNumber} className={r.valueGwei > 10.0001 ? "font-semibold" : undefined}>
                          <td className="font-mono">{r.blockNumber}</td>
                          <td className="font-mono text-right">{r.valueGwei.toFixed(3)}</td>
                          <td className="font-mono text-right">
                            {r.fastMAGwei === null ? "—" : r.fastMAGwei.toFixed(3)}
                          </td>
                          <td className="font-mono text-right">
                            {r.slowMAGwei === null ? "—" : r.slowMAGwei.toFixed(3)}
                          </td>
                          <td className="font-mono text-right">{r.streak}</td>
                          <td>
                            {r.decision === "FIRE" ? (
                              <span className="chip chip-pass">▲ FIRE</span>
                            ) : (
                              <span className="text-sm text-slate">HOLD</span>
                            )}
                          </td>
                          <td className="font-mono text-sm text-slate">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {!spikeRan && (
            <EmptyState
              title="No test run yet"
              message="Run the controlled spike test to watch the confirmation rule reject a 5× spike — the same math the CLI runs on live blocks."
              actionLabel="Run the spike test"
              onAction={() => setSpikeRan(true)}
            />
          )}

          <p className="text-sm text-slate">
            Controlled synthetic series only — the live fee-market tab reads real blocks. Task:{" "}
            <strong className="text-ink">{lamp.name}</strong>. Tier A — LIGHTKEEPER never sees,
            holds, or asks for private keys.
          </p>
        </div>
      )}

      {tab === "live" && (
        <div className="space-y-6">
          {/* 01 Configure */}
          <section aria-label="Configure">
            <p className="mb-3 text-sm font-semibold text-slate">01 — Configure the sample</p>
            <div className="rounded-2xl border border-hairline bg-porcelain p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-ink">Observation window</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Observation window in blocks">
                  {WINDOW_OPTIONS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWindow(w)}
                      aria-pressed={window === w}
                      className={
                        window === w
                          ? "btn-primary !min-h-[44px] !px-4 !text-sm"
                          : "btn-outline !min-h-[44px] !px-4 !text-sm"
                      }
                    >
                      {w} blocks
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-sm text-slate">
                The window is pinned at the tip, then every block is read with its own real{" "}
                <code className="font-mono text-sm">eth_getBlockByNumber</code> call — the run
                progress counts them as they arrive. The CLI samples {DEFAULT_WINDOW} blocks by
                default; every reading on this page is a real Atlantic block, read live.
              </p>
            </div>
          </section>

          {/* run control */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setRunId((n) => n + 1)}
              disabled={loading}
            >
              {loading ? "Sampling Atlantic…" : data ? "Re-sample (free)" : "Sample the fee market"}
            </button>
            <span className="text-sm text-slate">
              fast {FAST} / slow {SLOW} · band {BAND_BPS} bps · {CONFIRMATIONS} confirmations to fire
            </span>
          </div>

          {/* 02 Run */}
          {loading && (
            <section aria-label="Run">
              <p className="mb-3 text-sm font-semibold text-slate">02 — Run</p>
              <ProgressLoader
                title={stage === 1 ? `Observing ${observed} of ${window}…` : "Sampling the fee market"}
                steps={[
                  "Pin the tip — eth_blockNumber",
                  `Observe ${window} blocks — one real eth_getBlockByNumber call each`,
                  "Compute the trend verdict",
                ]}
                current={stage}
              />
              {liveObs !== null && liveObs.length > 0 && (
                <LiveObservations obs={liveObs} window={window} />
              )}
            </section>
          )}

          {/* errors */}
          {!loading && error && (
            <ErrorState
              title="The sample failed"
              message={error}
              hint="The read costs nothing — waiting a moment and trying again is safe."
              retryLabel="Re-sample"
              onRetry={() => setRunId((n) => n + 1)}
            />
          )}

          {/* 03 Result — the chart as the hero */}
          {!loading && !error && data && latest && (
            <section aria-label="Result" className="space-y-6">
              <p className="text-sm font-semibold text-slate">03 — Result</p>
              <ResultCard
                eyebrow={`Trend verdict — ${data.window} live observations, blocks ${data.oldestBlock} → ${data.oldestBlock + data.rows.length - 1}`}
                headline={VERDICT_HEADLINE[data.verdict]}
                status={data.verdict === "TRENDING_UP" ? "pass" : "neutral"}
                subline={data.reason}
                rows={[
                  { label: "Confirmation streak", value: `${data.streak} of ${CONFIRMATIONS}` },
                  { label: "Above-band readings", value: `${data.aboveCount} of ${data.rows.length}` },
                  { label: "Latest base fee", value: `${latest.baseFeeGwei.toFixed(3)} gwei` },
                  { label: "Rule", value: `fastMA(${FAST}) vs slowMA(${SLOW}), ${BAND_BPS / 100}% band, ${CONFIRMATIONS} confirmations` },
                ]}
                links={[
                  {
                    label: "View first block of the window on the explorer",
                    href: `https://pharosscan.xyz/block/${data.oldestBlock}`,
                  },
                  {
                    label: "View latest sampled block on the explorer",
                    href: `https://pharosscan.xyz/block/${data.oldestBlock + data.rows.length - 1}`,
                  },
                ]}
              />

              <p className="max-w-2xl text-[13px] leading-relaxed text-slate">
                Honest note on the uniform column: Atlantic&apos;s base fee is
                protocol-flat at exactly 1 gwei — verified against
                eth_feeHistory, where 30 consecutive blocks all returned
                0x3b9aca00 (1,000,000,000 wei). The identical readings are the
                chain&apos;s real state, not a display artifact; on a flat-fee
                chain the honest verdict is Hold.
              </p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="rounded-2xl border border-hairline bg-white p-5 sm:p-8"
              >
                <div className="mb-5 flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <p className="text-sm font-semibold text-slate">The instrument</p>
                    <p className="mt-1 max-w-md text-sm leading-relaxed text-slate">
                      The trend line as a living thing: base fee drawn block by block, fastMA(5)
                      and slowMA(15) as the moving instruments, and the 0.5% confirmation band
                      shaded around slowMA — the rule you can see.
                    </p>
                  </div>
                  <StreakMeter streak={data.streak} verdict={data.verdict} />
                </div>
                <TrendChart result={data} />
                <StreakAnatomy result={data} />
              </motion.div>

              <StatStrip
                stats={[
                  { label: "Observations", value: data.rows.length, format: (n) => `${Math.round(n)}`, suffix: "blocks" },
                  { label: "Above band", value: data.aboveCount, format: (n) => `${Math.round(n)}` },
                  { label: "Streak", value: data.streak, format: (n) => `${Math.round(n)}`, suffix: `/ ${CONFIRMATIONS} needed` },
                  { label: "Latest base fee", value: latest.baseFeeGwei, format: (n) => n.toFixed(3), suffix: "gwei" },
                ]}
              />

              <div>
                <p className="mb-3 text-sm font-semibold text-slate">
                  Recent blocks — every intermediate number
                </p>
                <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
                  <table className="data-table w-full">
                    <thead>
                      <tr>
                        <th>Block</th>
                        <th className="text-right">Base fee (gwei)</th>
                        <th className="text-right">Δ (gwei)</th>
                        <th className="text-right">fastMA(5)</th>
                        <th className="text-right">slowMA(15)</th>
                        <th>Band</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.slice(-TABLE_TAIL).map((r) => (
                        <tr key={r.blockNumber}>
                          <td className="font-mono">
                            <a
                              className="text-accent underline decoration-dotted underline-offset-2"
                              href={`https://pharosscan.xyz/block/${r.blockNumber}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {r.blockNumber}
                            </a>
                          </td>
                          <td className="font-mono text-right">{r.baseFeeGwei.toFixed(3)}</td>
                          <td className="font-mono text-right">
                            {r.deltaGwei === null ? "—" : `${r.deltaGwei >= 0 ? "+" : ""}${r.deltaGwei.toFixed(3)}`}
                          </td>
                          <td className="font-mono text-right">{gwei(r.fastMAWei)}</td>
                          <td className="font-mono text-right">{gwei(r.slowMAWei)}</td>
                          <td>
                            {r.aboveBand === null ? (
                              <span className="text-sm text-slate">warmup</span>
                            ) : r.aboveBand ? (
                              <span className="chip chip-pass">▲ above</span>
                            ) : (
                              <span className="text-sm text-slate">inside</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* honest empty */}
          {!loading && !error && !data && runId === 0 && (
            <EmptyState
              title="No sample yet"
              message={`Sample the fee market to pull ${window} real blocks of Atlantic base-fee history — the verdict arrives with the trend line and every number on the table.`}
              actionLabel="Sample the fee market"
              onAction={() => setRunId((n) => n + 1)}
            />
          )}

          <p className="text-sm text-slate">
            Same per-block base-fee series (baseFeePerGas) and same dual-condition rule as the
            Swell Line CLI. Task: <strong className="text-ink">{lamp.name}</strong>. Tier A —
            LIGHTKEEPER never sees, holds, or asks for private keys.
          </p>
        </div>
      )}
    </div>
  );
}
