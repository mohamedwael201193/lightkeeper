/**
 * T21 — Whale-Watching Agent · "Whale radar" (Tier A: live reads only,
 * no wallet, costs nothing).
 *
 * Native PHRS transfers emit no logs, so the agent reads blocks directly —
 * eth_getBlockByNumber with full transactions — filters by a configurable
 * whale threshold, and renders from → to → value rows ranked largest-first
 * with explorer links.
 *
 * The differentiator: a configurable whale radar — threshold + window size
 * are yours, moves touching the agent's six-address watchlist are labelled
 * with their honest on-chain labels (never invented), and the whole scan is
 * one batched RPC round trip per 50 blocks, not a slow sequential crawl.
 * (RPC-verified: 50 blocks in ~12s batched vs ~3min sequential.)
 *
 * Polling is strictly user-triggered: a manual "Scan" button, plus an
 * explicitly labeled auto-refresh with an on/off switch (off by default).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lamp } from "../../types";
import {
  ATLANTIC_RPC_URL,
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

interface ScanRecord {
  at: string;
  from: number;
  to: number;
  inspected: number;
  whales: number;
  largestWei: string | null;
}

/**
 * The agent's shipped watchlist (tasks/t21-whale-watching-agent/src/config.yaml).
 * Labels describe ONLY what is verifiable on-chain — unknown identities are
 * never invented. Counterparties not on this list render shortened, unlabeled.
 */
const WATCHLIST: Record<string, string> = {
  "0xf76e6b0920e9332ff4410f6dd53f01722abc71a3": "LIGHTKEEPER deployer (self)",
  "0x7d5bbc5e294896860278134da3898171043b2a5e": "T21 self-seed sink",
  "0xec0aecf6c778f44aea12ee17afb38f4e0af0a2a4": "observed transactor",
  "0x95a16e1898b09cce5e03765baa55c8c112cb80c2": "observed transactor",
  "0x6f34a6f94f529bf10313ba77cc34314389dd204e": "observed transactor",
  "0x838800b758277cc111b2d48ab01e5e164f8e9471": "observed transactor",
};

const labelFor = (addr: string): string | null =>
  WATCHLIST[addr.toLowerCase()] ?? null;

const MAX_BLOCKS = 100;
const AUTO_INTERVAL_MS = 30000;
const BATCH_LIMIT = 50; // blocks per batched RPC request (RPC-verified)

/**
 * One HTTP POST carrying a JSON-RPC batch: every requested block comes back
 * in a single round trip instead of a slow sequential crawl. Throws
 * plain-language Errors, matching the hook's contract.
 */
async function batchRpc(
  requests: Array<{ method: string; params: unknown[] }>
): Promise<unknown[]> {
  const body = requests.map((r, i) => ({
    jsonrpc: "2.0",
    id: i,
    method: r.method,
    params: r.params,
  }));
  let res: Response;
  try {
    res = await fetch(ATLANTIC_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The Atlantic RPC did not answer — check your connection and retry.");
  }
  if (!res.ok) {
    throw new Error(`The Atlantic RPC returned HTTP ${res.status} — retry in a moment.`);
  }
  const json = (await res.json()) as Array<{
    result?: unknown;
    error?: { message?: string; code?: number };
  }>;
  if (!Array.isArray(json)) {
    throw new Error("The Atlantic RPC answered in an unexpected format — retry.");
  }
  return json.map((j) => {
    if (j?.error) {
      throw new Error(
        `Atlantic RPC error: ${j.error.message ?? "unknown error"} (code ${j.error.code ?? "?"})`
      );
    }
    return j?.result;
  });
}

export default function TryWhaleWatchingAgent({ lamp }: { lamp: Lamp }) {
  void lamp; // page shell renders the name — the module doesn't need it
  const [threshold, setThreshold] = useState("1");
  const [blockCount, setBlockCount] = useState("20");
  const [whales, setWhales] = useState<WhaleTx[] | null>(null);
  const [inspected, setInspected] = useState<number | null>(null);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [largestWei, setLargestWei] = useState<string | null>(null);
  const [totalWei, setTotalWei] = useState<string | null>(null);
  const [fieldLog, setFieldLog] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const timerRef = useRef<number | null>(null);
  const scanIdRef = useRef(0);

  const thresholdOk = (() => {
    try {
      return BigInt(phrsToWeiHex(threshold)) > 0n;
    } catch {
      return false;
    }
  })();
  const nBlocks = Math.max(1, Math.min(MAX_BLOCKS, parseInt(blockCount, 10) || 20));

  const runScan = useCallback(async () => {
    const myScan = ++scanIdRef.current;
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
    setProgress("Reading the Atlantic chain tip…");
    try {
      const tipHex = (await rpcCall("eth_blockNumber", [])) as string;
      const tip = Number(BigInt(tipHex));
      const from = Math.max(0, tip - nBlocks + 1);
      const blockNumbers: number[] = [];
      for (let n = tip; n >= from; n--) blockNumbers.push(n);
      const batches = Math.ceil(blockNumbers.length / BATCH_LIMIT);
      setProgress(
        `Reading ${blockNumbers.length} blocks in ${batches} batched request${
          batches === 1 ? "" : "s"
        }…`
      );
      const results: Array<BlockResult | null> = [];
      for (let i = 0; i < blockNumbers.length; i += BATCH_LIMIT) {
        const chunk = blockNumbers.slice(i, i + BATCH_LIMIT);
        const out = await batchRpc(
          chunk.map((n) => ({
            method: "eth_getBlockByNumber",
            params: ["0x" + n.toString(16), true],
          }))
        );
        for (const r of out) results.push((r as BlockResult | null) ?? null);
        if (scanIdRef.current !== myScan) return; // superseded by a newer scan
      }
      const found: WhaleTx[] = [];
      let txCount = 0;
      let total = 0n;
      for (const block of results) {
        if (!block) continue;
        const bn = Number(BigInt(block.number));
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
              blockNumber: bn,
            });
            total += value;
          }
        }
      }
      found.sort((a, b) => {
        const d = BigInt(b.valueWei) - BigInt(a.valueWei);
        return d === 0n ? b.blockNumber - a.blockNumber : d > 0n ? 1 : -1;
      });
      if (scanIdRef.current !== myScan) return;
      setWhales(found);
      setInspected(txCount);
      setRange({ from, to: tip });
      setLargestWei(found.length > 0 ? found[0].valueWei : null);
      setTotalWei(found.length > 0 ? "0x" + total.toString(16) : null);
      setFieldLog((log) =>
        [
          {
            at: new Date().toISOString(),
            from,
            to: tip,
            inspected: txCount,
            whales: found.length,
            largestWei: found.length > 0 ? found[0].valueWei : null,
          },
          ...log,
        ].slice(0, 10)
      );
    } catch (e) {
      if (scanIdRef.current !== myScan) return;
      setError(e instanceof Error ? e.message : "The Atlantic RPC did not answer.");
    } finally {
      if (scanIdRef.current === myScan) {
        setLoading(false);
        setProgress(null);
      }
    }
  }, [threshold, nBlocks]);

  const stopAuto = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Never leave a polling interval running after the view unmounts.
  useEffect(() => () => stopAuto(), [stopAuto]);

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

  const renderAddr = (addr: string, full: string) => {
    const label = labelFor(addr);
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <a
          className="text-accent hover:underline"
          href={`${EXPLORER_ADDRESS}${full}`}
          target="_blank"
          rel="noreferrer"
          title={full}
        >
          {addr}
        </a>
        {label && (
          <span
            className="whitespace-nowrap rounded border border-hairline bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-accent"
            title={`On the agent's watchlist: ${label}`}
          >
            watched · {label}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="smallcaps">Tier A — live reads, no wallet, costs nothing</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Whale radar</h3>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate">
        Native PHRS moves
        emit no logs, so LIGHTKEEPER reads Atlantic's blocks directly — full
        transactions, filtered by your whale threshold, ranked largest-first. No API
        key, no wallet, no signature: live on-chain flow, right here.
      </p>
      </div>

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
              inputMode="decimal"
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
              inputMode="numeric"
            />
          </label>
          <button
            className="btn-primary"
            disabled={!thresholdOk || loading}
            onClick={() => void runScan()}
          >
            {loading ? "Scanning Atlantic…" : "Scan latest blocks"}
          </button>
          <label className="flex items-center gap-2 text-xs text-slate">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => toggleAuto(e.target.checked)}
            />
            Auto-refresh every 30s{" "}
            <span className={auto ? "text-fail" : "text-slate"}>
              {auto ? "(on — untick to stop)" : "(off)"}
            </span>
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
          are shown shortened; LIGHTKEEPER never invents identities. Moves touching the
          agent's watchlist get a <span className="font-semibold text-ink">watched</span>{" "}
          chip with their honest on-chain label.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(WATCHLIST).map(([addr, label]) => (
            <a
              key={addr}
              className="rounded-full border border-hairline bg-paper px-2.5 py-1 font-mono text-[10px] text-slate hover:text-accent"
              href={`${EXPLORER_ADDRESS}${addr}`}
              target="_blank"
              rel="noreferrer"
              title={label}
            >
              {shortenAddress(addr)} · {label}
            </a>
          ))}
        </div>
      </div>

      {/* 02 · Radar */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <p className="smallcaps mb-3">02 · Radar</p>
        {error && (
          <div className="mb-3 rounded-lg border border-hairline bg-paper p-3">
            <p className="text-sm text-fail">{error}</p>
            <button className="btn-outline mt-2" onClick={() => void runScan()}>
              Retry scan
            </button>
          </div>
        )}
        {loading && progress && (
          <p className="mb-3 text-xs text-slate" role="status">
            {progress}
          </p>
        )}
        {range && inspected !== null && !error && (
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate">
            <span>
              Blocks <span className="font-mono text-ink">{range.from.toLocaleString()}</span>{" "}
              → <span className="font-mono text-ink">{range.to.toLocaleString()}</span>
            </span>
            <span>
              <span className="font-mono text-ink">{inspected}</span> transactions inspected
            </span>
            <span>
              <span className="font-mono text-ink">{whales?.length ?? 0}</span> whale
              {(whales?.length ?? 0) === 1 ? " move" : " moves"}
            </span>
            {largestWei && (
              <span>
                Largest <span className="font-mono text-ink">{formatWei(largestWei)} PHRS</span>
              </span>
            )}
            {totalWei && (
              <span>
                Whale volume <span className="font-mono text-ink">{formatWei(totalWei)} PHRS</span>
              </span>
            )}
          </div>
        )}
        {!whales && !loading && !error && (
          <div className="empty-panel px-5 py-6 text-sm text-slate">
            The radar is quiet — set your threshold and hit{" "}
            <strong className="text-ink">Scan latest blocks</strong>. Every move you see
            below is a real mined transaction on Atlantic.
          </div>
        )}
        {whales && whales.length === 0 && !error && (
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
                    <td className="font-mono font-semibold">{formatWei(w.valueWei)}</td>
                    <td className="font-mono">{renderAddr(shortenAddress(w.from), w.from)}</td>
                    <td className="font-mono">
                      {w.to ? (
                        renderAddr(shortenAddress(w.to), w.to)
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
      </div>

      {/* 03 · Field log */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <p className="smallcaps mb-3">03 · Field log</p>
        {fieldLog.length === 0 ? (
          <p className="text-xs text-slate">
            No scans yet this session — every scan you run is recorded here with its
            block range, transaction count, and whale count.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {fieldLog.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex flex-wrap gap-x-4 text-xs text-slate">
                <span className="font-mono text-ink">
                  {r.from.toLocaleString()} → {r.to.toLocaleString()}
                </span>
                <span>
                  <span className="font-mono text-ink">{r.inspected}</span> txs
                </span>
                <span>
                  <span className="font-mono text-ink">{r.whales}</span> whale
                  {r.whales === 1 ? "" : "s"}
                </span>
                {r.largestWei && (
                  <span>
                    largest <span className="font-mono text-ink">{formatWei(r.largestWei)}</span>{" "}
                    PHRS
                  </span>
                )}
                <span className="font-mono">{new Date(r.at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate">
        Tier A — plain JSON-RPC block reads; no wallet, no signature, costs nothing.
        Click any hash to verify the move on the Atlantic explorer. LIGHTKEEPER never
        sees, holds, or asks for private keys.
      </p>
    </div>
  );
}
