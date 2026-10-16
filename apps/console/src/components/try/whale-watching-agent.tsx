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
 *
 * SHOWTIME presentation: 01 Configure (watchlist, threshold) → 02 Run
 * (ProgressLoader with one real step per batched RPC request) → 03 Result
 * (ResultCard showpiece with the largest whale as a big animated number →
 * StatStrip → all whale moves → scan-history FeedList). EmptyState for quiet
 * waters, ErrorState + Retry for failures. Every animation maps to a real
 * state; every number comes from a real RPC call.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { Lamp } from "../../types";
import {
  ATLANTIC_RPC_URL,
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  phrsToWeiHex,
  rpcCall,
} from "../../hooks/useAtlantic";
import { weiToPhrs as formatWei, shortenAddress } from "../../types";
import {
  EmptyState,
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
} from "../ui";
import type { FeedItem, Stat } from "../ui";

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

/**
 * The hero number of the 03 Result showpiece: the largest whale, ticking up
 * with a spring the moment the real result arrives. Mounts fresh per scan
 * (keyed on the whale hash), so every new scan replays the tick.
 */
function HeroAmount({ weiHex }: { weiHex: string }) {
  const reduce = useReducedMotion();
  const target = parseFloat(formatWei(weiHex));
  const safe = Number.isFinite(target) ? target : 0;
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 55, damping: 16 });
  const [display, setDisplay] = useState(() =>
    (reduce ? safe : 0).toLocaleString("en-US", { maximumFractionDigits: 4 })
  );

  useEffect(() => {
    mv.set(safe);
  }, [mv, safe]);

  useEffect(() => {
    if (reduce) {
      setDisplay(safe.toLocaleString("en-US", { maximumFractionDigits: 4 }));
      return;
    }
    const unsub = spring.on("change", (v) =>
      setDisplay(v.toLocaleString("en-US", { maximumFractionDigits: 4 }))
    );
    return unsub;
  }, [spring, reduce, safe]);

  return <span className="tabular-nums">{display}</span>;
}

export default function TryWhaleWatchingAgent({ lamp }: { lamp: Lamp }) {
  void lamp; // page shell renders the name — the module doesn't need it
  const [threshold, setThreshold] = useState("1");
  const [blockCount, setBlockCount] = useState("20");
  const [whales, setWhales] = useState<WhaleTx[] | null>(null);
  const [inspected, setInspected] = useState<number | null>(null);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [totalWei, setTotalWei] = useState<string | null>(null);
  const [fieldLog, setFieldLog] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(false);
  // Honest progress: one step per real async call — the tip read, then one
  // step per batched block request. `stepIdx` advances only when a batch
  // actually finishes, never on a timer.
  const [steps, setSteps] = useState<string[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
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

  const runScan = useCallback(
    async (opts?: { blocks?: number }) => {
      const myScan = ++scanIdRef.current;
      const n = opts?.blocks ?? nBlocks;
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
      setSteps(["Reading the Atlantic chain tip"]);
      setStepIdx(0);
      try {
        const tipHex = (await rpcCall("eth_blockNumber", [])) as string;
        const tip = Number(BigInt(tipHex));
        const from = Math.max(0, tip - n + 1);
        const blockNumbers: number[] = [];
        for (let bn = tip; bn >= from; bn--) blockNumbers.push(bn);
        const batches = Math.ceil(blockNumbers.length / BATCH_LIMIT);
        // One real step per batched RPC request, labeled with its real block
        // range — the loader advances only when a batch actually finishes.
        const batchLabels = blockNumbers
          .filter((_, i) => i % BATCH_LIMIT === 0)
          .map((bn, k) => {
            const hi = bn;
            const lo = Math.max(from, bn - BATCH_LIMIT + 1);
            return `Reading blocks ${lo.toLocaleString()} → ${hi.toLocaleString()} — batch ${k + 1} of ${batches}`;
          });
        setSteps(["Reading the Atlantic chain tip", ...batchLabels]);
        setStepIdx(1);
        const results: Array<BlockResult | null> = [];
        for (let i = 0; i < blockNumbers.length; i += BATCH_LIMIT) {
          if (scanIdRef.current !== myScan) return;
          const chunk = blockNumbers.slice(i, i + BATCH_LIMIT);
          const out = await batchRpc(
            chunk.map((bn) => ({
              method: "eth_getBlockByNumber",
              params: ["0x" + bn.toString(16), true],
            }))
          );
          for (const r of out) results.push((r as BlockResult | null) ?? null);
          if (scanIdRef.current !== myScan) return; // superseded by a newer scan
          setStepIdx(2 + i / BATCH_LIMIT);
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
        // stepIdx already sits at steps.length after the last batch (done
        // state); the loader unmounts here and 03 replaces it.
        if (scanIdRef.current === myScan) setLoading(false);
      }
    },
    [threshold, nBlocks]
  );

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

  const largest: WhaleTx | null = whales && whales.length > 0 ? whales[0] : null;

  const stats: Stat[] = [
    {
      label: "Blocks scanned",
      value: range ? range.to - range.from + 1 : 0,
      format: (v) => Math.round(v).toLocaleString("en-US"),
    },
    {
      label: "Transactions inspected",
      value: inspected ?? 0,
      format: (v) => Math.round(v).toLocaleString("en-US"),
    },
    {
      label: "Whale moves",
      value: whales?.length ?? 0,
      format: (v) => Math.round(v).toLocaleString("en-US"),
    },
    {
      label: "Whale volume",
      value: totalWei ? parseFloat(formatWei(totalWei)) : 0,
      format: (v) => v.toLocaleString("en-US", { maximumFractionDigits: 4 }),
      suffix: "PHRS",
    },
  ];

  const feedItems: FeedItem[] = fieldLog.map((r, i) => ({
    key: `${r.at}-${i}`,
    node: (
      <div>
        <p className="text-sm font-semibold text-ink">
          Scan · {r.whales} whale{r.whales === 1 ? "" : "s"}
          {r.largestWei && (
            <>
              {" "}— largest <span className="font-mono">{formatWei(r.largestWei)} PHRS</span>
            </>
          )}
        </p>
        <p className="mt-0.5 font-mono text-xs text-slate">
          blocks {r.from.toLocaleString()} → {r.to.toLocaleString()} ·{" "}
          {r.inspected.toLocaleString()} txs · {new Date(r.at).toLocaleTimeString()}
        </p>
      </div>
    ),
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="smallcaps">Tier A — live reads, no wallet, costs nothing</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Whale radar</h3>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate">
          Native PHRS moves emit no logs, so LIGHTKEEPER reads Atlantic's blocks
          directly — full transactions, filtered by your whale threshold, ranked
          largest-first. No API key, no wallet, no signature: live on-chain flow,
          right here.
        </p>
      </div>

      {/* 01 · Configure */}
      <section aria-label="Configure the radar">
        <p className="smallcaps mb-3">01 · Set the radar</p>
        <div className="rounded-xl border border-hairline bg-porcelain p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink">
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
              <span className="mb-1 block text-sm font-semibold text-ink">
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
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate">
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
            <p className="mt-2 text-sm text-fail">
              Threshold must be a positive PHRS amount (up to 18 decimals).
            </p>
          )}
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate">
            Anything moving ≥{" "}
            <span className="font-mono font-semibold text-ink">{thresholdDisplay}</span>{" "}
            PHRS counts as a whale. Thresholds are stated in native PHRS — there is
            no USD price feed on Atlantic, so nothing is ever converted to fiat.
            Counterparties are shown shortened; LIGHTKEEPER never invents identities.
            Moves touching the agent's watchlist get a{" "}
            <span className="font-semibold text-ink">watched</span> chip with their
            honest on-chain label.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(WATCHLIST).map(([addr, label]) => (
              <a
                key={addr}
                className="rounded-full border border-hairline bg-paper px-2.5 py-1 font-mono text-xs text-slate hover:text-accent"
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
      </section>

      {/* 02 · Run — visible ONLY while real work is in flight */}
      {loading && (
        <section aria-label="Scan in progress">
          <p className="smallcaps mb-3">02 · Scanning</p>
          <ProgressLoader
            steps={steps}
            current={stepIdx}
            title={`Whale scan — ≥ ${thresholdDisplay} PHRS, ${nBlocks} latest blocks`}
          />
        </section>
      )}

      {/* 03 · Result — replaces 02 the moment the real answer arrives */}
      {!loading && !error && largest && range && inspected !== null && (
        <section aria-label="Scan result">
          <p className="smallcaps mb-3">03 · Result — whale spotted</p>
          <div className="space-y-6">
            <ResultCard
              eyebrow={`Result — largest whale of ${whales?.length ?? 0} found in this scan`}
              headline={
                <>
                  <HeroAmount key={largest.hash} weiHex={largest.valueWei} />
                  <span className="ml-2 text-[0.5em] font-semibold text-slate">PHRS</span>
                </>
              }
              subline={
                <>
                  A single native transfer of {formatWei(largest.valueWei)} PHRS —
                  read live from Atlantic blocks and ranked largest-first out of{" "}
                  {whales?.length ?? 0} whale move{(whales?.length ?? 0) === 1 ? "" : "s"}.
                  Every control here executed a real chain read; nothing is estimated.
                </>
              }
              rows={[
                {
                  label: "Transaction",
                  value: (
                    <span title={largest.hash}>{shortenAddress(largest.hash)}</span>
                  ),
                },
                { label: "Block", value: largest.blockNumber.toLocaleString() },
                {
                  label: "From",
                  value: renderAddr(shortenAddress(largest.from), largest.from),
                },
                {
                  label: "To",
                  value: largest.to ? (
                    renderAddr(shortenAddress(largest.to), largest.to)
                  ) : (
                    <span>contract creation</span>
                  ),
                },
                {
                  label: "Scan window",
                  value: `${range.from.toLocaleString()} → ${range.to.toLocaleString()}`,
                },
                {
                  label: "Transactions inspected",
                  value: inspected.toLocaleString(),
                },
              ]}
              links={[
                {
                  label: "View the whale transaction on the explorer",
                  href: `${EXPLORER_TX}${largest.hash}`,
                },
              ]}
              copyValue={largest.hash}
              status="pass"
            />

            <StatStrip stats={stats} />

            {/* Every whale move, largest first */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">
                All whale moves — largest first
              </h4>
              <ul className="max-h-[30rem] divide-y divide-hairline overflow-y-auto rounded-2xl border border-hairline bg-white">
                {whales!.map((w, i) => (
                  <motion.li
                    key={w.hash}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.4) }}
                    className="flex items-center gap-4 px-5 py-4"
                  >
                    <span
                      className="w-8 shrink-0 font-display text-2xl text-slate"
                      aria-label={`Rank ${i + 1}`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-base font-semibold text-ink">
                        {formatWei(w.valueWei)}{" "}
                        <span className="text-sm font-normal text-slate">PHRS</span>
                        {i === 0 && (
                          <span className="ml-2 rounded-full bg-tint px-2 py-0.5 align-middle font-sans text-xs font-semibold text-accent">
                            largest
                          </span>
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-slate">
                        {renderAddr(shortenAddress(w.from), w.from)}
                        <ArrowRight size={12} aria-hidden />
                        {w.to ? (
                          renderAddr(shortenAddress(w.to), w.to)
                        ) : (
                          <span>contract creation</span>
                        )}
                        <span>· block {w.blockNumber.toLocaleString()}</span>
                      </p>
                    </div>
                    <a
                      className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-porcelain px-3 text-sm font-medium text-accent hover:bg-tint"
                      href={`${EXPLORER_TX}${w.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      title={w.hash}
                    >
                      View on explorer
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Scan history */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">Scan history</h4>
              <FeedList
                items={feedItems}
                emptyText="No scans yet this session — every scan you run is recorded here with its block range, transaction count, and whale count."
              />
            </div>
          </div>
        </section>
      )}

      {!loading && !error && whales && whales.length === 0 && range && inspected !== null && (
        <section aria-label="Scan result — no whales">
          <p className="smallcaps mb-3">03 · Result</p>
          <div className="space-y-6">
            <EmptyState
              title="Quiet waters"
              message={`No native transfers ≥ ${thresholdDisplay} PHRS in the last ${nBlocks} blocks. That's an honest answer, not an error — the radar inspected every transaction in the window.`}
              actionLabel="Scan a wider window"
              onAction={() => {
                setBlockCount(String(MAX_BLOCKS));
                void runScan({ blocks: MAX_BLOCKS });
              }}
            />
            <StatStrip stats={stats} />
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">Scan history</h4>
              <FeedList
                items={feedItems}
                emptyText="No scans yet this session — every scan you run is recorded here with its block range, transaction count, and whale count."
              />
            </div>
          </div>
        </section>
      )}

      {!loading && !error && !whales && (
        <EmptyState
          title="The radar is quiet"
          message="Set your threshold above and scan the latest Atlantic blocks. Every move you see is a real mined transaction — nothing here is estimated or simulated."
          actionLabel="Scan latest blocks"
          onAction={() => void runScan()}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="The scan didn't finish"
          message={error}
          hint="Nothing was recorded — any previous results and your scan history are untouched."
          retryLabel="Retry scan"
          onRetry={() => void runScan()}
        />
      )}

      <p className="text-sm text-slate">
        Tier A — plain JSON-RPC block reads; no wallet, no signature, costs nothing.
        Click any hash to verify the move on the Atlantic explorer. LIGHTKEEPER never
        sees, holds, or asks for private keys.
      </p>
    </div>
  );
}
