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
import { useMemo, useState } from "react";
import type { Lamp } from "../../types";
import { EXPLORER_TX, rpcCall, useAtlanticRead } from "../../hooks/useAtlantic";

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
 */
async function fetchSettled(): Promise<SettledSnapshot> {
  const quotedWei = BigInt((await rpcCall("eth_gasPrice", [])) as string);
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

function gwei(wei: bigint): string {
  const whole = wei / 10n ** 9n;
  const rem = wei % 10n ** 9n;
  if (rem === 0n) return whole.toString();
  return `${whole}.${rem.toString().padStart(9, "0").slice(0, 4)}`.replace(/0+$/, "").replace(/\.$/, "");
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

export default function TryGas({ lamp }: { lamp: Lamp }) {
  const [history, setHistory] = useState<FeeSnapshot[]>([]);
  const [txType, setTxType] = useState<(typeof TX_TYPES)[number]["id"]>("transfer");
  const [urgency, setUrgency] = useState<(typeof URGENCIES)[number]["id"]>("medium");

  const { data, loading, error, refetch } = useAtlanticRead(async () => {
    const snap = await fetchFeeSnapshot();
    setHistory((h) => [...h.slice(-23), snap]);
    return snap;
  }, []);

  // Quoted vs Settled: on-demand live read (auto=false) — each click re-measures
  // what the chain actually charged on the most recent settled transactions.
  const settled = useAtlanticRead(fetchSettled, [], { auto: false });

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
  const tierRows = tiers
    ? [
        { name: "slow", label: "Slow", price: tiers.slow, note: "25th percentile of observed samples" },
        { name: "standard", label: "Standard", price: tiers.standard, note: "median of observed samples" },
        { name: "fast", label: "Fast", price: tiers.fast, note: "75th percentile of observed samples" },
      ]
    : [];
  const settleGapWei = settled.data ? settled.data.quotedWei - settled.data.avgWei : null;
  const settleGapPhrs = settleGapWei !== null ? settleGapWei * BigInt(gasUnits) : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="smallcaps">Live — Pharos Atlantic testnet</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Never overpay again</h3>
        <p className="mt-1 max-w-2xl text-sm text-slate">
          The optimizer reads Atlantic's gas price <em>right now</em> and recomputes the
          slow / standard / fast tiers from those live samples — not from a static table.
          Its edge: it prices against what the chain <em>actually charges</em> (settled
          receipts), not just what it quotes. No wallet needed, no signature, costs
          nothing. LIGHTKEEPER never holds private keys.
        </p>
      </div>

      {/* Live gas read */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="smallcaps">Current Atlantic gas price</p>
            {loading && !data && <p className="mt-2 text-sm text-slate">Reading from Atlantic…</p>}
            {error && <p className="mt-2 text-sm text-fail">{error}</p>}
            {data && (
              <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                {gwei(data.gasPriceWei)} <span className="text-sm font-normal text-slate">gwei</span>
              </p>
            )}
            <Sparkline values={history.map((s) => s.gasPriceWei)} />
          </div>
          <button className="btn-outline" onClick={refetch} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {data && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div><dt className="text-slate">Max priority fee</dt><dd className="font-mono text-ink">{gwei(data.priorityWei)} gwei</dd></div>
            <div><dt className="text-slate">Latest block</dt><dd className="font-mono text-ink">{data.blockNumber.toLocaleString()}</dd></div>
            <div><dt className="text-slate">Base fee</dt><dd className="font-mono text-ink">{gwei(data.baseFeeWei)} gwei</dd></div>
            <div><dt className="text-slate">Block utilization</dt><dd className="font-mono text-ink">{utilization === null ? "—" : `${utilization.toFixed(2)}%`}</dd></div>
          </dl>
        )}
      </div>

      {/* Quoted vs Settled — the differentiator */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="smallcaps">Quoted vs settled</p>
            <p className="mt-1 max-w-xl text-xs text-slate">
              Every gas tool quotes <span className="font-mono">eth_gasPrice</span>. This lamp
              goes one step further: it pulls the receipts of the most recently settled
              transactions and measures what the chain <em>actually charged</em>.
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={settled.refetch}
            disabled={settled.loading}
          >
            {settled.loading ? "Measuring…" : settled.data ? "Measure again" : "Measure what the chain charges"}
          </button>
        </div>
        {settled.loading && !settled.data && (
          <p className="mt-3 text-sm text-slate">Scanning the last 8 blocks and reading their receipts…</p>
        )}
        {settled.error && (
          <div className="empty-panel mt-3 px-5 py-4 text-sm">
            <p className="text-fail">{settled.error}</p>
            <button className="btn-outline mt-2" onClick={settled.refetch}>Retry</button>
          </div>
        )}
        {settled.data && (
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate">Quoted (eth_gasPrice)</p>
                <p className="font-mono text-xl font-semibold text-ink">{gwei(settled.data.quotedWei)}</p>
                <p className="text-xs text-slate">gwei</p>
              </div>
              <div>
                <p className="text-xs text-slate">Settled (avg of {settled.data.count})</p>
                <p className="font-mono text-xl font-semibold text-ink">{gwei(settled.data.avgWei)}</p>
                <p className="text-xs text-slate">gwei · real receipts</p>
              </div>
              <div>
                <p className="text-xs text-slate">Settled range</p>
                <p className="font-mono text-xl font-semibold text-ink">
                  {gwei(settled.data.minWei)}–{gwei(settled.data.maxWei)}
                </p>
                <p className="text-xs text-slate">gwei</p>
              </div>
              <div>
                <p className="text-xs text-slate">Gap per {gasUnits.toLocaleString()}-gas tx</p>
                <p className="font-mono text-xl font-semibold text-ink">
                  {settleGapPhrs !== null ? formatWeiSigned(settleGapPhrs) : "—"}
                </p>
                <p className="text-xs text-slate">PHRS · quote − settled</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate">
              Measured at {settled.data.at} from the most recent settled transactions' receipts.
              A positive gap means the quote over-provisions what most transactions actually pay —
              that's the optimizer's honest saving. A negative gap means recent heavy traffic paid
              above the quote, and the standard tier is the honest recommendation.
            </p>
          </div>
        )}
      </div>

      {/* Sample history */}
      <div>
        <p className="smallcaps">Fee history this session — {history.length} live sample{history.length === 1 ? "" : "s"}</p>
        {history.length === 0 ? (
          <div className="empty-panel mt-2 px-5 py-4 text-sm text-slate">
            {loading ? "Collecting the first sample…" : "Press Refresh to take a live gas-price sample."}
          </div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sample</th>
                  <th>Block</th>
                  <th>Gas price</th>
                  <th>Priority fee</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().slice(0, 12).map((s, i) => (
                  <tr key={`${s.blockNumber}-${i}`}>
                    <td className="font-mono">{history.length - i}</td>
                    <td className="font-mono">{s.blockNumber.toLocaleString()}</td>
                    <td className="font-mono">{gwei(s.gasPriceWei)} gwei</td>
                    <td className="font-mono">{gwei(s.priorityWei)} gwei</td>
                    <td>{s.at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Optimizer */}
      {tiers && (
        <div className="rounded-xl border border-hairline bg-porcelain p-4">
          <p className="smallcaps">Fee recommendation</p>
          <p className="mt-1 text-xs text-slate">
            Tiers computed from the {tiers.n} live sample{tiers.n === 1 ? "" : "s"} above —
            every refresh changes them. Flat testnet gas means flat tiers; the page says so instead of faking variance.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TX_TYPES.map((t) => (
              <button
                key={t.id}
                className={txType === t.id ? "btn-primary" : "btn-outline"}
                onClick={() => setTxType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {URGENCIES.map((u) => (
              <button
                key={u.id}
                className={urgency === u.id ? "btn-primary" : "btn-outline"}
                onClick={() => setUrgency(u.id)}
              >
                {u.label}
              </button>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto">
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
                        <span className="chip ml-2">recommended for {urgency}</span>
                      )}
                    </td>
                    <td className="font-mono">{gwei(r.price)} gwei</td>
                    <td className="font-mono">{phrsCost(r.price, gasUnits)}</td>
                    <td className="text-xs">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate">
            Cost assumes a {gasUnits.toLocaleString()}-gas budget ({TX_TYPES.find((t) => t.id === txType)?.label}).
            Estimated only — the chain settles the effective price at mining time.
          </p>
        </div>
      )}

      {/* Real proof — three mined dust jobs from the task run */}
      <div>
        <p className="smallcaps">Proven on-chain — {lamp.name}</p>
        <p className="mt-1 text-xs text-slate">
          The optimizer's agent already ran all three required paths as real dust transactions on Atlantic.
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          <li>
            <a className="font-mono text-xs text-accent hover:underline break-all" href={`${EXPLORER_TX}0x1c9d62c6496e626ff10ffab8157b587908b0faca92dd71517095de61ba1d3050`} target="_blank" rel="noreferrer">
              Job A — favorable window · 0x1c9d62…3050
            </a>
            <p className="text-xs text-slate">45s deadline, submitted on a favorable reading at t+3.9s; paid 1.000000001 gwei effective vs 10 gwei requested.</p>
          </li>
          <li>
            <a className="font-mono text-xs text-accent hover:underline break-all" href={`${EXPLORER_TX}0x1c8c65374bc2210b221604a64c6190f6145da30a9416e9181f7f85b267ce2366`} target="_blank" rel="noreferrer">
              Job B — deadline-forced · 0x1c8c65…2366
            </a>
            <p className="text-xs text-slate">30s deadline, held then forced at deadline−margin; the deadline was never missed. Paid 1.000000001 gwei effective.</p>
          </li>
          <li>
            <a className="font-mono text-xs text-accent hover:underline break-all" href={`${EXPLORER_TX}0x799d56741f7b31251f59c8e3126a6a5910cdd55302a9ca7451b004fd43717305`} target="_blank" rel="noreferrer">
              Job C — gap-persistence · 0x799d56…7305
            </a>
            <p className="text-xs text-slate">Submitted at the same 10-gwei standard 2.5h later; settled again at 1.000000001 gwei in block 31,486,593 — the quoted-vs-settled gap persists.</p>
          </li>
        </ul>
      </div>
    </div>
  );
}
