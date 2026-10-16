/**
 * T09 — Trend Watcher (Swell Line) · try it live (TIER A — live reads, no signature).
 *
 * "Trend line, live": samples the exact series the Swell Line CLI watches —
 * per-block baseFeePerGas via eth_feeHistory on Atlantic testnet (chain 688689) —
 * and renders the recent window as a table + sparkline with per-block deltas,
 * fastMA(5) / slowMA(15), the 0.5% confirmation band, and the trailing
 * above-band streak. FIRE needs 3 consecutive confirmations; a single spike
 * provably cannot trigger it — the panel shows exactly why the signal did or
 * did not fire for the window it just sampled.
 *
 * No mocks: every value on screen was just read from chain. This panel samples
 * one window on demand; the CLI holds the streak across runs in state/runtime.json.
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import { rpcCall, useAtlanticRead } from "../../hooks/useAtlantic";

const WINDOW = 30; // blocks sampled per refresh — the CLI pulls a 30-block window too
const FAST = 5;
const SLOW = 15;
const BAND_BPS = 50; // 0.5% confirmation band
const CONFIRMATIONS = 3;

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
  oldestBlock: number;
  rows: Row[];
  streak: number;
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

async function sampleTrend(): Promise<TrendResult> {
  const raw = (await rpcCall("eth_feeHistory", [WINDOW, "latest", []])) as {
    oldestBlock: string;
    baseFeePerGas: string[];
  };
  const oldest = Number(BigInt(raw.oldestBlock));
  // baseFeePerGas has WINDOW+1 entries (includes the pending block) — drop the last,
  // exactly like the Swell Line CLI (bin/run.mjs observe).
  const fees = raw.baseFeePerGas.slice(0, WINDOW).map((h) => BigInt(h));
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
    reason = `CONFIRMED ${streak}× ABOVE BAND — the 3-confirmation rule would FIRE. The Swell Line CLI confirms this streak across runs before it reports.`;
  } else if (streak > 0) {
    verdict = "BUILDING";
    reason = `Streak ${streak} of ${CONFIRMATIONS} — above the band but not yet confirmed. One flat reading resets it.`;
  } else {
    verdict = "HOLD";
    reason = anyRecentAbove
      ? "A single above-band reading appeared and the very next reading fell back — streak reset to 0. A spike can never trigger it; this window says HOLD."
      : "FLAT INSIDE THE 0.5% BAND — the market is quiet, so the honest signal is HOLD, not a manufactured fire.";
  }

  return { oldestBlock: oldest, rows, streak, verdict, reason };
}

function gwei(wei: bigint | null): string {
  return wei === null ? "—" : (Number(wei) / 1e9).toFixed(3);
}

function Sparkline({ rows }: { rows: Row[] }) {
  const W = 560;
  const H = 96;
  const vals = rows.map((r) => r.baseFeeGwei);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = vals
    .map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 6 - ((v - lo) / span) * (H - 14)).toFixed(1)}`)
    .join(" ");
  const lastAbove = rows[rows.length - 1]?.aboveBand === true;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="base fee sparkline">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={lastAbove ? "text-accent" : "text-slate"}
      />
      {rows.map((r, i) =>
        r.aboveBand ? (
          <circle
            key={r.blockNumber}
            cx={(i / (rows.length - 1)) * W}
            cy={H - 6 - ((r.baseFeeGwei - lo) / span) * (H - 14)}
            r="3.5"
            className="fill-accent"
          />
        ) : null
      )}
      <text x="4" y="12" className="fill-slate" fontSize="10">
        {hi.toFixed(3)} gwei
      </text>
      <text x="4" y={H - 4} className="fill-slate" fontSize="10">
        {lo.toFixed(3)} gwei
      </text>
    </svg>
  );
}

export default function TrySwellLine({ lamp }: { lamp: Lamp }) {
  const [runId, setRunId] = useState(0);
  const { data, loading, error, refetch } = useAtlanticRead<TrendResult>(
    sampleTrend,
    [runId],
    { auto: runId > 0 }
  );

  const tail = data ? data.rows.slice(-16) : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="chip">TIER A · LIVE READ</span>
        <span className="chip">NO SIGNATURE · COSTS NOTHING</span>
      </div>

      <h3 className="smallcaps !text-ink mb-2">Trend line, live</h3>
      <p className="mb-5 max-w-3xl text-sm leading-relaxed text-slate">
        The question Swell Line answers: <strong className="text-ink">is gas trending up, or is
        that just a wave?</strong> This panel samples the same live series the CLI watches —
        per-block <code className="font-mono text-xs">baseFeePerGas</code> via{" "}
        <code className="font-mono text-xs">eth_feeHistory</code> — and applies the same rule:
        fastMA(5) vs slowMA(15), a 0.5% confirmation band, and <strong className="text-ink">3
        consecutive above-band readings to FIRE</strong>. Any miss resets the streak; a single
        spike provably cannot trigger it. Every row below was just read from chain — flat markets
        stay silent here.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={() => setRunId((n) => n + 1)} disabled={loading}>
          {loading ? "Sampling Atlantic…" : data ? "Refresh sample" : "Sample the fee market"}
        </button>
        {data && !loading && (
          <button className="btn-outline" onClick={refetch} disabled={loading}>
            Re-sample (free)
          </button>
        )}
        <span className="text-xs text-slate">
          window: {WINDOW} blocks · fast {FAST} / slow {SLOW} · band {BAND_BPS} bps · confirmations {CONFIRMATIONS}
        </span>
      </div>

      {error && <p className="mb-4 text-sm text-fail">{error}</p>}
      {loading && <p className="mb-4 text-sm text-slate">Reading {WINDOW} blocks of fee history…</p>}

      {data && !loading && (
        <div className="space-y-5">
          {/* verdict */}
          <div className="rounded-xl border border-hairline bg-porcelain p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={data.verdict === "TRENDING_UP" ? "chip-pass" : "chip"}>
                {data.verdict === "TRENDING_UP"
                  ? `▲ TRENDING UP ×${data.streak}`
                  : data.verdict === "BUILDING"
                    ? `◌ BUILDING — streak ${data.streak}/${CONFIRMATIONS}`
                    : "○ HOLD"}
              </span>
              <span className="font-mono text-xs text-slate">
                blocks {data.oldestBlock} → {data.oldestBlock + data.rows.length - 1}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate">{data.reason}</p>
          </div>

          {/* sparkline */}
          <div>
            <h4 className="smallcaps !text-ink mb-2">Base fee, last {WINDOW} blocks</h4>
            <div className="rounded-xl border border-hairline bg-porcelain p-4">
              <Sparkline rows={data.rows} />
              <p className="mt-1 text-xs text-slate">
                Dots mark above-band readings (fastMA and raw above slowMA × 1.005).
              </p>
            </div>
          </div>

          {/* table */}
          <div>
            <h4 className="smallcaps !text-ink mb-2">Recent blocks</h4>
            <div className="overflow-x-auto">
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
                  {tail.map((r) => (
                    <tr key={r.blockNumber}>
                      <td className="font-mono">{r.blockNumber}</td>
                      <td className="font-mono text-right">{r.baseFeeGwei.toFixed(3)}</td>
                      <td className="font-mono text-right">
                        {r.deltaGwei === null ? "—" : `${r.deltaGwei >= 0 ? "+" : ""}${r.deltaGwei.toFixed(3)}`}
                      </td>
                      <td className="font-mono text-right">{gwei(r.fastMAWei)}</td>
                      <td className="font-mono text-right">{gwei(r.slowMAWei)}</td>
                      <td>
                        {r.aboveBand === null ? (
                          <span className="text-xs text-slate">warmup</span>
                        ) : r.aboveBand ? (
                          <span className="chip-pass">▲ above</span>
                        ) : (
                          <span className="text-xs text-slate">inside</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-slate">
            Same source (<code className="font-mono text-xs">eth_feeHistory</code>) and same dual-condition
            rule as the Swell Line CLI — this panel samples one window on demand, the CLI holds the
            streak across runs in <code className="font-mono text-xs">state/runtime.json</code>. Task:{" "}
            <strong className="text-ink">{lamp.name}</strong>. Tier A — LIGHTKEEPER never sees, holds,
            or asks for private keys.
          </p>
        </div>
      )}

      {!data && !loading && runId === 0 && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          Sample the fee market to pull {WINDOW} real blocks of Atlantic base-fee history and see
          Swell Line's verdict — with every intermediate number on the table.
        </div>
      )}
    </div>
  );
}
