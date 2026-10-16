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
 * Percentile tiers mirror the agent-side methodology in
 * tasks/t22-gas-fee-optimizer/evidence/tier-table.json
 * (slow=p25, standard=p50, fast=p75 of observed samples).
 *
 * The two receipts linked below are REAL mined Atlantic transactions,
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

function gwei(wei: bigint): string {
  const whole = wei / 10n ** 9n;
  const rem = wei % 10n ** 9n;
  if (rem === 0n) return whole.toString();
  return `${whole}.${rem.toString().padStart(9, "0").slice(0, 4)}`.replace(/0+$/, "").replace(/\.$/, "");
}

function phrsCost(weiPerGas: bigint, gasUnits: number): string {
  const costWei = weiPerGas * BigInt(gasUnits);
  const phrs = Number(costWei) / Number(WEI);
  return phrs < 0.0001 && phrs > 0 ? phrs.toExponential(2) : phrs.toFixed(6);
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

export default function TryGas({ lamp }: { lamp: Lamp }) {
  const [history, setHistory] = useState<FeeSnapshot[]>([]);
  const [txType, setTxType] = useState<(typeof TX_TYPES)[number]["id"]>("transfer");
  const [urgency, setUrgency] = useState<(typeof URGENCIES)[number]["id"]>("medium");

  const { data, loading, error, refetch } = useAtlanticRead(async () => {
    const snap = await fetchFeeSnapshot();
    setHistory((h) => [...h.slice(-23), snap]);
    return snap;
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
  const tierRows = tiers
    ? [
        { name: "slow", label: "Slow", price: tiers.slow, note: "25th percentile of observed samples" },
        { name: "standard", label: "Standard", price: tiers.standard, note: "median of observed samples" },
        { name: "fast", label: "Fast", price: tiers.fast, note: "75th percentile of observed samples" },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div>
        <p className="smallcaps">Live — Pharos Atlantic testnet</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Never overpay again</h3>
        <p className="mt-1 max-w-2xl text-sm text-slate">
          The optimizer reads Atlantic's gas price <em>right now</em> and recomputes the
          slow / standard / fast tiers from those live samples — not from a static table.
          No wallet needed, no signature, costs nothing. LIGHTKEEPER never holds private keys.
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

      {/* Real proof — two mined dust jobs from the task run */}
      <div>
        <p className="smallcaps">Proven on-chain — {lamp.name}</p>
        <p className="mt-1 text-xs text-slate">
          The optimizer's agent already ran both required paths as real dust transactions on Atlantic.
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
        </ul>
      </div>
    </div>
  );
}
