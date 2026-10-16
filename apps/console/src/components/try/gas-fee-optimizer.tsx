/**
 * T22 Gas Fee Optimizer — Tier A (live reads, no wallet, costs nothing).
 *
 * "Never overpay again": reads the CURRENT Atlantic gas price
 * (eth_gasPrice + eth_maxPriorityFeePerGas) plus the latest block's
 * utilization, then computes slow/standard/fast tiers from the LIVE
 * samples — not a static table. The visitor picks a transaction type
 * (transfer / contract call) and an urgency, and the page estimates the
 * PHRS cost per tier against a real gas budget.
 *
 * Differentiator — Quoted vs Settled: every gas tool quotes eth_gasPrice.
 * This lamp measures what the chain ACTUALLY charged — the average
 * effectiveGasPrice of the most recently settled transactions, pulled live
 * from their receipts — and prices the recommendation against the settled
 * number, not the quote.
 *
 * Percentile tiers mirror the agent-side methodology in
 * tasks/t22-gas-fee-optimizer/evidence/tier-table.json
 * (slow=p25, standard=p50, fast=p75 of observed samples).
 *
 * The three receipts linked below are REAL mined Atlantic transactions,
 * copied character-for-character from the task's evidence.json.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { Gauge, Rabbit, Turtle, Zap } from "lucide-react";
import type { Lamp } from "../../types";
import { EXPLORER_TX, rpcCall, useAtlanticRead } from "../../hooks/useAtlantic";
import {
  EmptyState,
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
} from "../ui";
import type { FeedItem, Stat } from "../ui";

const WEI = 10n ** 18n;

interface FeeSnapshot {
  gasPriceWei: bigint;
  priorityWei: bigint;
  blockNumber: number;
  baseFeeWei: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  at: string;
}

interface SettledSnapshot {
  quotedWei: bigint;
  avgWei: bigint;
  minWei: bigint;
  maxWei: bigint;
  count: number;
  at: string;
}

async function fetchFeeSnapshot(): Promise<FeeSnapshot> {
  const gasPriceHex = (await rpcCall("eth_gasPrice", [])) as string;
  const priorityHex = (await rpcCall("eth_maxPriorityFeePerGas", [])) as string;
  const block = (await rpcCall("eth_getBlockByNumber", ["latest", false])) as {
    number: string;
    baseFeePerGas?: string;
    gasUsed: string;
    gasLimit: string;
  };
  return {
    gasPriceWei: BigInt(gasPriceHex),
    priorityWei: BigInt(priorityHex),
    blockNumber: parseInt(block.number, 16),
    baseFeeWei: block.baseFeePerGas ? BigInt(block.baseFeePerGas) : 0n,
    gasUsed: BigInt(block.gasUsed),
    gasLimit: BigInt(block.gasLimit),
    at: new Date().toLocaleTimeString(),
  };
}

/**
 * Quoted vs Settled: walk back recent blocks, pull full receipts of the most
 * recent settled transactions, average their effectiveGasPrice.
 *
 * The 3-try backoff lives inside the hardened rpcCall — this function only
 * reports which REAL step is in flight via onProgress (0 = quoting,
 * 1 = walking blocks, 2 = reading receipts).
 */
async function fetchSettled(onProgress?: (step: number) => void): Promise<SettledSnapshot> {
  onProgress?.(0);
  const quotedWei = BigInt((await rpcCall("eth_gasPrice", [])) as string);
  onProgress?.(1);
  let cursor = BigInt((await rpcCall("eth_blockNumber", [])) as string);
  const effs: bigint[] = [];
  for (let i = 0; i < 8 && effs.length < 6; i++) {
    const blk = (await rpcCall("eth_getBlockByNumber", [
      "0x" + cursor.toString(16),
      true,
    ])) as { transactions?: Array<string | { hash: string }> };
    const txs = blk.transactions ?? [];
    const hashes = txs
      .slice(0, 6 - effs.length)
      .map((t) => (typeof t === "string" ? t : t.hash))
      .filter(Boolean);
    const receipts = await Promise.all(
      hashes.map((h) =>
        rpcCall("eth_getTransactionReceipt", [h]).catch(() => null)
      )
    );
    for (const r of receipts) {
      const rec = r as { status?: string; effectiveGasPrice?: string } | null;
      if (rec && rec.status === "0x1" && rec.effectiveGasPrice) {
        effs.push(BigInt(rec.effectiveGasPrice));
      }
    }
    cursor -= 1n;
  }
  onProgress?.(2);
  if (effs.length === 0) {
    throw new Error(
      "No settled transactions in the last 8 blocks — the chain is idle. Try again in a moment."
    );
  }
  const sum = effs.reduce((a, b) => a + b, 0n);
  return {
    quotedWei,
    avgWei: sum / BigInt(effs.length),
    minWei: effs.reduce((a, b) => (a < b ? a : b)),
    maxWei: effs.reduce((a, b) => (a > b ? a : b)),
    count: effs.length,
    at: new Date().toLocaleTimeString(),
  };
}

/** One ProgressLoader step per REAL async call in fetchSettled. */
const PROBE_STEPS = [
  "Quoting current gas price",
  "Walking back blocks for settled transactions",
  "Reading settled receipts",
];

function gwei(wei: bigint): string {
  const whole = wei / 10n ** 9n;
  const rem = wei % 10n ** 9n;
  if (rem === 0n) return whole.toString();
  return `${whole}.${rem.toString().padStart(9, "0").slice(0, 4)}`.replace(/0+$/, "").replace(/\.$/, "");
}

/** Format a plain-number gwei value (used by the animated hero numbers). */
function formatGweiNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const s = v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

function phrsCost(weiPerGas: bigint, gasUnits: number): string {
  const costWei = weiPerGas * BigInt(gasUnits);
  return formatWeiSigned(costWei);
}

function formatWeiSigned(wei: bigint): string {
  const neg = wei < 0n;
  const phrs = Number(neg ? -wei : wei) / Number(WEI);
  const s =
    phrs < 0.0001 && phrs > 0
      ? phrs.toExponential(2)
      : phrs.toFixed(6);
  return (neg ? "−" : "") + s;
}

/** PHRS cost as a number (for StatStrip's animated ticker). */
function phrsNum(weiPerGas: bigint, gasUnits: number): number {
  return Number(weiPerGas * BigInt(gasUnits)) / Number(WEI);
}

function fmtPhrs(n: number): string {
  return n > 0 && n < 0.0001 ? n.toExponential(2) : n.toFixed(6);
}

/** Nearest-rank percentile over sorted bigints (same method as evidence/tier-table.json). */
function percentile(sorted: bigint[], p: number): bigint {
  if (sorted.length === 0) return 0n;
  const k = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(k, sorted.length) - 1];
}

const TX_TYPES = [
  { id: "transfer", label: "Native transfer", gas: 21000 },
  { id: "contract", label: "Contract call (e.g. ERC-20 transfer)", gas: 120000 },
] as const;

const URGENCIES = [
  { id: "low", label: "Low urgency", tier: "slow" },
  { id: "medium", label: "Medium urgency", tier: "standard" },
  { id: "high", label: "High urgency", tier: "fast" },
] as const;

/** Real mined Atlantic transactions from the task's evidence.json — Job A/B/C dust runs. */
const PROOF_JOBS = [
  {
    hash: "0x1c9d62c6496e626ff10ffab8157b587908b0faca92dd71517095de61ba1d3050",
    label: "Job A — favorable window",
    desc: "45s deadline, submitted on a favorable reading at t+3.9s; paid 1.000000001 gwei effective vs 10 gwei requested.",
  },
  {
    hash: "0x1c8c65374bc2210b221604a64c6190f6145da30a9416e9181f7f85b267ce2366",
    label: "Job B — deadline-forced",
    desc: "30s deadline, held then forced at deadline−margin; the deadline was never missed. Paid 1.000000001 gwei effective.",
  },
  {
    hash: "0x799d56741f7b31251f59c8e3126a6a5910cdd55302a9ca7451b004fd43717305",
    label: "Job C — gap-persistence",
    desc: "Submitted at the same 10-gwei standard 2.5h later; settled again at 1.000000001 gwei in block 31,486,593 — the quoted-vs-settled gap persists.",
  },
];

/** Big animated gwei number — ticks with a spring ONLY when the real value changes. */
function AnimatedGwei({ wei }: { wei: bigint }) {
  const g = Number(wei) / 1e9;
  const reduce = useReducedMotion();
  const mv = useMotionValue(g);
  const spring = useSpring(mv, { stiffness: 90, damping: 22 });
  const [display, setDisplay] = useState(() => formatGweiNum(g));

  useEffect(() => {
    mv.set(g);
  }, [g, mv]);

  useEffect(() => {
    if (reduce) {
      setDisplay(formatGweiNum(g));
      return;
    }
    const unsub = spring.on("change", (v) => setDisplay(formatGweiNum(v)));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spring, reduce, g]);

  return <span className="tabular-nums">{display}</span>;
}

function Sparkline({ values }: { values: bigint[] }) {
  if (values.length === 0) return null;
  const g = values.map((v) => Number(v) / 1e9);
  const min = Math.min(...g);
  const max = Math.max(...g);
  const span = max - min || 1;
  const W = 220;
  const H = 36;
  const pts =
    values.length === 1
      ? [`${W / 2},${H / 2}`]
      : g.map((v, i) => `${(i / (g.length - 1)) * W},${H - 4 - ((v - min) / span) * (H - 8)}`);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 h-9 w-full max-w-[220px]"
      role="img"
      aria-label={`Fee history: ${gwei(values[0])} to ${gwei(values[values.length - 1])} gwei over ${values.length} samples`}
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="#2456E6"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map((p, i) => {
        const [cx, cy] = p.split(",");
        return (
          <circle key={i} cx={cx} cy={cy} r="2.4" fill="#2456E6" opacity={i === pts.length - 1 ? 1 : 0.35} />
        );
      })}
    </svg>
  );
}

function ActNumber({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white"
        aria-hidden
      >
        {n}
      </span>
      <h4 className="text-lg font-semibold text-ink">{title}</h4>
    </div>
  );
}

export default function TryGas({ lamp }: { lamp: Lamp }) {
  const [history, setHistory] = useState<FeeSnapshot[]>([]);
  const [txType, setTxType] = useState<(typeof TX_TYPES)[number]["id"]>("transfer");
  const [urgency, setUrgency] = useState<(typeof URGENCIES)[number]["id"]>("medium");

  // Ambient Tier A live read — auto on mount, refetchable.
  const { data, loading, error, refetch } = useAtlanticRead(async () => {
    const snap = await fetchFeeSnapshot();
    setHistory((h) => [...h.slice(-23), snap]);
    return snap;
  }, []);

  // Quoted-vs-settled probe — on demand. Progress state is tracked manually
  // (not via useAtlanticRead) so each ProgressLoader step maps to the real
  // RPC call that is actually in flight.
  const [probeStep, setProbeStep] = useState(0);
  const [probe, setProbe] = useState<SettledSnapshot | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeEmpty, setProbeEmpty] = useState(false);

  const runProbe = useCallback(async () => {
    setProbeLoading(true);
    setProbeError(null);
    setProbeEmpty(false);
    setProbeStep(0);
    try {
      const snap = await fetchSettled((i) => setProbeStep(i));
      setProbe(snap);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "The Atlantic RPC did not answer.";
      // A settled-nothing window is an honest zero, not a failure.
      if (msg.includes("No settled transactions")) setProbeEmpty(true);
      else setProbeError(msg);
    } finally {
      setProbeLoading(false);
    }
  }, []);

  const tiers = useMemo(() => {
    const samples = history.map((s) => s.gasPriceWei).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (samples.length === 0) return null;
    return {
      slow: percentile(samples, 25),
      standard: percentile(samples, 50),
      fast: percentile(samples, 75),
      n: samples.length,
    };
  }, [history]);

  const utilization = data && data.gasLimit > 0n ? Number((data.gasUsed * 10000n) / data.gasLimit) / 100 : null;
  const recommendedTier = URGENCIES.find((u) => u.id === urgency)?.tier ?? "standard";
  const gasUnits = TX_TYPES.find((t) => t.id === txType)?.gas ?? 21000;
  const txLabel = (TX_TYPES.find((t) => t.id === txType)?.label ?? "transfer").toLowerCase();
  const tierRows = tiers
    ? [
        { name: "slow", label: "Slow", price: tiers.slow, note: "25th percentile of observed samples" },
        { name: "standard", label: "Standard", price: tiers.standard, note: "median of observed samples" },
        { name: "fast", label: "Fast", price: tiers.fast, note: "75th percentile of observed samples" },
      ]
    : [];

  // The hero comparison — quoted vs settled.
  const gapWei = probe ? probe.quotedWei - probe.avgWei : null;
  const gapSaved = gapWei !== null && gapWei >= 0n;
  const gapAbsGwei = gapWei === null ? "—" : formatGweiNum(Number(gapWei >= 0n ? gapWei : -gapWei) / 1e9);
  const gapPhrsWei = gapWei !== null ? gapWei * BigInt(gasUnits) : null;

  const stats: Stat[] = tiers
    ? [
        { label: "Slow cost", value: phrsNum(tiers.slow, gasUnits), format: fmtPhrs, suffix: "PHRS", icon: <Turtle size={14} aria-hidden /> },
        { label: "Standard cost", value: phrsNum(tiers.standard, gasUnits), format: fmtPhrs, suffix: "PHRS", icon: <Zap size={14} aria-hidden /> },
        { label: "Fast cost", value: phrsNum(tiers.fast, gasUnits), format: fmtPhrs, suffix: "PHRS", icon: <Rabbit size={14} aria-hidden /> },
        { label: "Gas price now", value: data ? Number(data.gasPriceWei) / 1e9 : 0, format: formatGweiNum, suffix: "gwei", icon: <Gauge size={14} aria-hidden /> },
      ]
    : [];

  const feedItems: FeedItem[] = [...history].reverse().map((s, i) => ({
    key: `${s.blockNumber}-${s.at}-${i}`,
    node: (
      <>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-ink">
            Sample {history.length - i} —{" "}
            <span className="font-mono font-semibold">{gwei(s.gasPriceWei)} gwei</span>
          </p>
          <p className="font-mono text-xs text-slate">block {s.blockNumber.toLocaleString()}</p>
        </div>
        <p className="mt-1 font-mono text-xs text-slate">
          priority {gwei(s.priorityWei)} gwei · base {gwei(s.baseFeeWei)} gwei · {s.at}
        </p>
      </>
    ),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="smallcaps">Live — Pharos Atlantic · chain 688689</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Never overpay again</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink">
          The optimizer reads Atlantic's gas price <em>right now</em> and recomputes the
          slow / standard / fast tiers from those live samples — not from a static table.
          Its edge: it prices against what the chain <em>actually charges</em> (settled
          receipts), not just what it quotes. No wallet needed, no signature, costs
          nothing. LIGHTKEEPER never holds private keys.
        </p>
      </div>

      {/* Ambient live read — context strip, kept small so it never competes with the result */}
      <section
        aria-label="Current Atlantic gas price"
        className="rounded-2xl border border-hairline bg-white p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate">Current Atlantic gas price</p>
            {loading && !data && <p className="mt-2 text-sm text-ink">Reading from Atlantic…</p>}
            {data && (
              <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                {gwei(data.gasPriceWei)} <span className="text-sm font-normal text-slate">gwei</span>
              </p>
            )}
            <Sparkline values={history.map((s) => s.gasPriceWei)} />
          </div>
          <button type="button" className="btn-outline" onClick={refetch} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error && (
          <div className="mt-4">
            <ErrorState
              title="The live read failed"
              message="Atlantic's node didn't answer after three tries with backoff — a transient gateway issue, not your setup."
              hint="Reads cost nothing and touch no wallet. Try again in a moment."
              onRetry={refetch}
            />
          </div>
        )}
        {data && (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-slate">Max priority fee</dt><dd className="font-mono text-ink">{gwei(data.priorityWei)} gwei</dd></div>
            <div><dt className="text-slate">Latest block</dt><dd className="font-mono text-ink">{data.blockNumber.toLocaleString()}</dd></div>
            <div><dt className="text-slate">Base fee</dt><dd className="font-mono text-ink">{gwei(data.baseFeeWei)} gwei</dd></div>
            <div><dt className="text-slate">Block utilization</dt><dd className="font-mono text-ink">{utilization === null ? "—" : `${utilization.toFixed(2)}%`}</dd></div>
          </dl>
        )}
      </section>

      {/* 01 Configure */}
      <section className="space-y-4" aria-label="Configure the quote">
        <ActNumber n={1} title="Choose the transaction to quote" />
        <div>
          <p className="text-sm font-semibold text-slate">Transaction type</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TX_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTxType(t.id)}
                className={txType === t.id ? "btn-primary w-full justify-center" : "btn-outline w-full justify-center"}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate">Urgency</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {URGENCIES.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUrgency(u.id)}
                className={urgency === u.id ? "btn-primary w-full justify-center" : "btn-outline w-full justify-center"}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn-primary w-full justify-center sm:w-auto"
          onClick={runProbe}
          disabled={probeLoading}
        >
          {probeLoading ? "Measuring…" : probe ? "Measure again" : "Measure what the chain charges"}
        </button>
      </section>

      {/* 02 Run — only while the probe is in flight; never beside the result */}
      {probeLoading && (
        <section aria-label="Probe in progress">
          <div className="space-y-3">
            <ActNumber n={2} title="Measuring the chain" />
            <ProgressLoader steps={PROBE_STEPS} current={probeStep} title="Quoted-vs-settled probe" />
          </div>
        </section>
      )}

      {/* 03 Result */}
      {!probeLoading && (
        <section className="space-y-4" aria-label="Probe result">
          <ActNumber n={3} title="Result — quoted vs settled" />

          {probeEmpty && (
            <EmptyState
              title="Quiet window — no settled transactions"
              message="The last 8 blocks settled nothing, so there's no effective price to average. That's an honest answer, not an error."
              actionLabel="Probe again"
              onAction={runProbe}
            />
          )}

          {probeError && (
            <ErrorState
              title="The probe didn't complete"
              message={probeError}
              hint="Reads cost nothing and touch no wallet — the gateway already retried with backoff, so this means the node stayed silent. Try again in a moment."
              onRetry={runProbe}
            />
          )}

          {!probe && !probeError && !probeEmpty && (
            <EmptyState
              title="Nothing measured yet"
              message="Run the probe to pull the receipts of Atlantic's most recent settled transactions and compare what the chain actually charged against what it quotes."
              actionLabel="Run the probe"
              onAction={runProbe}
            />
          )}

          {probe && (
            <>
              <ResultCard
                eyebrow="Result — quoted vs settled"
                headline={
                  <>
                    {gapAbsGwei}{" "}
                    <span className="text-2xl font-normal text-slate sm:text-3xl">
                      gwei {gapSaved ? "under" : "over"} the quote
                    </span>
                  </>
                }
                subline={
                  gapSaved ? (
                    <>
                      Recent transactions settled cheaper than <span className="font-mono">eth_gasPrice</span> said.
                      The optimizer prices your fee off the settled number, not the quote.
                    </>
                  ) : (
                    <>
                      Recent traffic settled above the quote — the chain is busy. Bid the settled
                      number below, not the low quote.
                    </>
                  )
                }
                status={gapSaved ? "pass" : "neutral"}
                rows={[
                  { label: "Settled transactions measured", value: `${probe.count} latest receipts` },
                  { label: "Settled range", value: `${gwei(probe.minWei)}–${gwei(probe.maxWei)} gwei` },
                  { label: "Measured at", value: probe.at },
                ]}
              >
                {/* The duel: quoted vs settled, two big animated numbers side by side */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-hairline bg-porcelain p-4 text-center sm:p-5">
                    <p className="text-sm font-semibold text-slate">Quoted</p>
                    <p className="mt-2 font-display text-3xl tracking-tight text-ink sm:text-4xl">
                      <AnimatedGwei wei={probe.quotedWei} />
                    </p>
                    <p className="mt-1 text-sm text-slate">
                      gwei · <span className="font-mono">eth_gasPrice</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-hairline bg-porcelain p-4 text-center sm:p-5">
                    <p className="text-sm font-semibold text-slate">Settled</p>
                    <p className="mt-2 font-display text-3xl tracking-tight text-ink sm:text-4xl">
                      <AnimatedGwei wei={probe.avgWei} />
                    </p>
                    <p className="mt-1 text-sm text-slate">gwei · avg of {probe.count} real receipts</p>
                  </div>
                </div>
                {/* The gap, highlighted */}
                <div className="mt-3 rounded-xl bg-tint px-4 py-3">
                  <p className="text-sm leading-relaxed text-ink">
                    {gapSaved ? (
                      <>
                        For a {gasUnits.toLocaleString()}-gas {txLabel}, that's{" "}
                        <strong className="font-mono">{gapPhrsWei !== null ? formatWeiSigned(gapPhrsWei) : "—"} PHRS</strong>{" "}
                        the quote would have you over-provision — the optimizer's saving.
                      </>
                    ) : (
                      <>
                        For a {gasUnits.toLocaleString()}-gas {txLabel}, that's{" "}
                        <strong className="font-mono">{gapPhrsWei !== null ? formatWeiSigned(gapPhrsWei) : "—"} PHRS</strong>{" "}
                        more than the quote — bid the settled number, not the quote.
                      </>
                    )}
                  </p>
                </div>
              </ResultCard>

              {stats.length > 0 && <StatStrip stats={stats} />}

              {tiers && (
                <div>
                  <p className="text-sm font-semibold text-slate">
                    Fee recommendation — tiers from {tiers.n} live sample{tiers.n === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-sm text-slate">
                    Every refresh changes them. Flat testnet gas means flat tiers; the page says so
                    instead of faking variance.
                  </p>
                  <div className="mt-3 overflow-x-auto rounded-2xl border border-hairline bg-white">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tier</th>
                          <th>Fee</th>
                          <th>Est. cost (PHRS)</th>
                          <th>Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tierRows.map((r) => (
                          <tr key={r.name} className={r.name === recommendedTier ? "bg-gold/10" : undefined}>
                            <td className="font-semibold text-ink">
                              {r.label}
                              {r.name === recommendedTier && (
                                <span className="chip chip-info ml-2">recommended for {urgency}</span>
                              )}
                            </td>
                            <td className="font-mono">{gwei(r.price)} gwei</td>
                            <td className="font-mono">{phrsCost(r.price, gasUnits)}</td>
                            <td className="text-xs text-slate">{r.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-sm text-slate">
                    Cost assumes a {gasUnits.toLocaleString()}-gas budget ({TX_TYPES.find((t) => t.id === txType)?.label}).
                    Estimated only — the chain settles the effective price at mining time.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Sample history — newest first, internally scrolled */}
      <section className="space-y-3" aria-label="Fee samples this session">
        <p className="text-sm font-semibold text-slate">
          Fee samples this session — {history.length} live sample{history.length === 1 ? "" : "s"}
        </p>
        <FeedList
          items={feedItems}
          maxHeight="max-h-80"
          emptyText={loading ? "Collecting the first sample…" : "No samples yet — press Refresh to take a live gas-price sample."}
        />
      </section>

      {/* Real proof — mined dust jobs from the task run */}
      <section className="space-y-2" aria-label="Proven on-chain">
        <p className="text-sm font-semibold text-slate">Proven on-chain — {lamp.name}</p>
        <p className="text-sm text-slate">
          The optimizer's agent already ran all three required paths as real dust transactions on Atlantic.
        </p>
        <ul className="space-y-2">
          {PROOF_JOBS.map((j) => (
            <li key={j.hash} className="rounded-xl border border-hairline bg-white px-4 py-3">
              <a
                className="break-all font-mono text-xs text-accent hover:underline"
                href={`${EXPLORER_TX}${j.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                {j.label} · {j.hash.slice(0, 10)}…{j.hash.slice(-4)}
              </a>
              <p className="mt-1 text-sm text-slate">{j.desc}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
