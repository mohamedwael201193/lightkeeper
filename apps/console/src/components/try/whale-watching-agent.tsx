/**
 * T21 — Whale-Watching Agent · "Whale radar" (Tier A: live reads only,
 * no wallet, costs nothing).
 *
 * Native PHRS transfers emit no logs, so the agent reads blocks directly —
 * eth_getBlockByNumber with full transactions — filters by a configurable
 * whale threshold, and renders from → to → value rows with explorer links.
 * The differentiator: real Atlantic whale flow, live, no API key.
 *
 * Polling is strictly user-triggered: a manual "Scan" button, plus an
 * explicitly labeled auto-refresh with an on/off switch (off by default).
 */
import { useCallback, useRef, useState } from "react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  phrsToWeiHex,
  rpcCall,
} from "../../hooks/useAtlantic";
import { weiToPhrs as formatWei, shortenAddress } from "../../types";

interface WhaleTx {
  hash: string;
  from: string;
  to: string | null;
  valueWei: string;
  blockNumber: number;
}

interface BlockResult {
  number: string;
  transactions: Array<{
    hash: string;
    from: string;
    to: string | null;
    value: string;
  }>;
}

const MAX_BLOCKS = 100;
const AUTO_INTERVAL_MS = 30000;

export default function TryWhaleWatchingAgent({ lamp }: { lamp: Lamp }) {
  const [threshold, setThreshold] = useState("1");
  const [blockCount, setBlockCount] = useState("20");
  const [whales, setWhales] = useState<WhaleTx[] | null>(null);
  const [inspected, setInspected] = useState<number | null>(null);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const timerRef = useRef<number | null>(null);

  const thresholdOk = (() => {
    try {
      phrsToWeiHex(threshold);
      return BigInt(phrsToWeiHex(threshold)) > 0n;
    } catch {
      return false;
    }
  })();
  const nBlocks = Math.max(1, Math.min(MAX_BLOCKS, parseInt(blockCount, 10) || 20));

  const runScan = useCallback(async () => {
    let thresholdWei: bigint;
    try {
      thresholdWei = BigInt(phrsToWeiHex(threshold.trim()));
      if (thresholdWei <= 0n) throw new Error("threshold must be > 0");
    } catch {
      setError(`"${threshold}" is not a valid PHRS amount — up to 18 decimals.`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const tipHex = (await rpcCall("eth_blockNumber", [])) as string;
      const tip = Number(BigInt(tipHex));
      const from = Math.max(0, tip - nBlocks + 1);
      const found: WhaleTx[] = [];
      let txCount = 0;
      for (let n = tip; n >= from; n--) {
        const block = (await rpcCall("eth_getBlockByNumber", [
          "0x" + n.toString(16),
          true,
        ])) as BlockResult | null;
        if (!block) continue;
        for (const tx of block.transactions ?? []) {
          txCount++;
          let value: bigint;
          try {
            value = BigInt(tx.value);
          } catch {
            continue;
          }
          if (value >= thresholdWei) {
            found.push({
              hash: tx.hash,
              from: tx.from,
              to: tx.to,
              valueWei: tx.value,
              blockNumber: n,
            });
          }
        }
      }
      found.sort((a, b) => {
        const d = BigInt(b.valueWei) - BigInt(a.valueWei);
        return d === 0n ? b.blockNumber - a.blockNumber : d > 0n ? 1 : -1;
      });
      setWhales(found);
      setInspected(txCount);
      setRange({ from, to: tip });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Atlantic RPC did not answer.");
    } finally {
      setLoading(false);
    }
  }, [threshold, nBlocks]);

  const stopAuto = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const toggleAuto = useCallback(
    (on: boolean) => {
      setAuto(on);
      stopAuto();
      if (on) {
        void runScan();
        timerRef.current = window.setInterval(() => void runScan(), AUTO_INTERVAL_MS);
      }
    },
    [runScan, stopAuto]
  );

  const thresholdDisplay = (() => {
    try {
      return formatWei(phrsToWeiHex(threshold.trim()));
    } catch {
      return "—";
    }
  })();

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-relaxed text-slate">
        <span className="font-semibold text-ink">{lamp.name}.</span> Native PHRS moves
        emit no logs, so LIGHTKEEPER reads Atlantic's blocks directly — full
        transactions, filtered by your whale threshold, ranked largest-first. No API
        key, no wallet, no signature: live on-chain flow, right here.
      </p>

      {/* 01 · Configure */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <p className="smallcaps mb-3">01 · Set the radar</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">
              Whale threshold (PHRS)
            </span>
            <input
              className="w-40 rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink"
              value={threshold}
              onChange={(e) => {
                setThreshold(e.target.value);
                setWhales(null);
              }}
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">
              Blocks to scan (max {MAX_BLOCKS})
            </span>
            <input
              className="w-40 rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink"
              value={blockCount}
              onChange={(e) => {
                setBlockCount(e.target.value.replace(/[^0-9]/g, ""));
                setWhales(null);
              }}
              spellCheck={false}
            />
          </label>
          <button
            className="btn-primary"
            disabled={!thresholdOk || loading}
            onClick={() => void runScan()}
          >
            {loading ? "Scanning Atlantic…" : "Scan latest blocks"}
          </button>
          <button className="btn-outline" disabled={loading} onClick={() => void runScan()}>
            Refresh
          </button>
          <label className="flex items-center gap-2 text-xs text-slate">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => toggleAuto(e.target.checked)}
            />
            Auto-refresh every 30s{" "}
            <span className="text-fail">(on — untick to stop)</span>
          </label>
        </div>
        {!thresholdOk && threshold && (
          <p className="mt-2 text-xs text-fail">
            Threshold must be a positive PHRS amount (up to 18 decimals).
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-slate">
          Anything moving ≥ <span className="font-mono font-semibold">{thresholdDisplay}</span>{" "}
          PHRS counts as a whale. Thresholds are stated in native PHRS — there is no USD
          price feed on Atlantic, so nothing is ever converted to fiat. Counterparties
          are shown shortened; LIGHTKEEPER never invents identities.
        </p>
      </div>

      {/* 02 · Radar */}
      {error && <p className="text-sm text-fail">{error}</p>}
      {range && inspected !== null && (
        <p className="text-xs text-slate">
          Scanned blocks <span className="font-mono">{range.from.toLocaleString()}</span> →{" "}
          <span className="font-mono">{range.to.toLocaleString()}</span> · {inspected}{" "}
          transactions inspected · {whales?.length ?? 0} whale move
          {(whales?.length ?? 0) === 1 ? "" : "s"}
        </p>
      )}
      {!whales && !loading && !error && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          The radar is quiet — set your threshold and hit{" "}
          <strong className="text-ink">Scan latest blocks</strong>. Every move you see
          below is a real mined transaction on Atlantic.
        </div>
      )}
      {whales && whales.length === 0 && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          Quiet water — no native transfers ≥ {thresholdDisplay} PHRS in the last{" "}
          {nBlocks} blocks. That's an honest empty state, not an error. Lower the
          threshold or widen the block window.
        </div>
      )}
      {whales && whales.length > 0 && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Value (PHRS)</th>
                <th>From</th>
                <th>To</th>
                <th>Block</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {whales.map((w, i) => (
                <tr key={w.hash}>
                  <td>{i + 1}</td>
                  <td className="font-mono font-semibold">
                    {formatWei(w.valueWei)}
                  </td>
                  <td className="font-mono">
                    <a
                      className="text-accent hover:underline"
                      href={`${EXPLORER_ADDRESS}${w.from}`}
                      target="_blank"
                      rel="noreferrer"
                      title={w.from}
                    >
                      {shortenAddress(w.from)}
                    </a>
                  </td>
                  <td className="font-mono">
                    {w.to ? (
                      <a
                        className="text-accent hover:underline"
                        href={`${EXPLORER_ADDRESS}${w.to}`}
                        target="_blank"
                        rel="noreferrer"
                        title={w.to}
                      >
                        {shortenAddress(w.to)}
                      </a>
                    ) : (
                      <span className="text-slate">contract creation</span>
                    )}
                  </td>
                  <td className="font-mono">{w.blockNumber.toLocaleString()}</td>
                  <td className="font-mono">
                    <a
                      className="text-accent hover:underline"
                      href={`${EXPLORER_TX}${w.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      title={w.hash}
                    >
                      {shortenAddress(w.hash)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate">
        Tier A — plain JSON-RPC block reads; no wallet, no signature, costs nothing.
        Click any hash to verify the move on the Atlantic explorer. LIGHTKEEPER never
        sees, holds, or asks for private keys.
      </p>
    </div>
  );
}
