/**
 * T07 — Arbitrage Scanner · try it live (TIER A — live reads, no signature).
 *
 * "Live spread scanner": runs the T07 config→scan→verdict rhythm against the
 * three real T07 venues on Pharos Atlantic (chain 688689) — all via eth_call.
 * Per scan: pin one block → read all three getReserves() at that block →
 * price the 6 WPHRS-start directed cycles with the contract-identical
 * constant-product quote math → net per-leg fees on notionals + slippage
 * + gas + a configurable slippage guard band → verdict OPPORTUNITY
 * (above threshold) or SKIP with the honest machine-readable reason.
 *
 * No mocks: every number on screen was just read from chain. This panel is
 * read-only — it never signs or broadcasts. Execution is the CLI's job
 * (scanner.py --execute); the two mined execution legs are linked below.
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import { EXPLORER_ADDRESS, EXPLORER_TX, rpcCall, useAtlanticRead } from "../../hooks/useAtlantic";

/* ---------- task sources (exact, from tasks/t07-arbitrage-scanner/evidence.json) ---------- */
const VENUES = [
  { name: "poolA", address: "0x8683C6D6EeAA57B03688f43Ad0cbCA0af26Cf464" },
  { name: "poolB", address: "0x432BCd7bc6944Def44015bF00C82Eb50aA18A3F6" },
  { name: "poolC", address: "0x3f0ae6f640f067B2532194a0ef2c869Aa49E587D" },
];
const WPHRS = "0x8a81455a477deeA986ca48cE83ca89C5331Da793";
const TKB = "0x8BAa4fD0329dbf77c9fBFC44448B5669D356bfe1";
const GET_RESERVES_SEL = "0x0902f1ac";
const GET_AMOUNT_OUT_SEL = "0xf140a35a";
const FEE_BPS = 30n;
/* Measured from the mined T07 execution legs (68728 / 68760 gas), honest estimate. */
const GAS_PER_LEG = 68744n;
const STALE_BLOCK_LAG = 50;

const EXEC_LEG1 =
  "0x39fe2154abde86a58418d85667dbec826207b3733eeadb81a877c85e2185de30";
const EXEC_LEG2 =
  "0xdcd894bb8bd2f981f2af78425bb58623f26c724502212b24820f2fca380c58ad";

/* ---------- bigint money helpers ---------- */
function parseUnits(s: string): bigint {
  const t = s.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t))
    throw new Error(`"${s}" is not a valid amount (up to 18 decimals).`);
  const [i, f = ""] = t.split(".");
  return BigInt(i) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
}

function fmt(wei: bigint, digits = 6): string {
  const neg = wei < 0n;
  const a = neg ? -wei : wei;
  const int = a / 10n ** 18n;
  const frac = (a % 10n ** 18n).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return (neg ? "-" : "") + int.toString() + (frac ? "." + frac : "");
}

/** Contract-identical quote: out = (amountIn·9970·rOut) / (rIn·10000 + amountIn·9970). */
function quote(amountIn: bigint, rIn: bigint, rOut: bigint): bigint {
  const withFee = amountIn * (10000n - FEE_BPS);
  return (withFee * rOut) / (rIn * 10000n + withFee);
}

/** Zero-fee constant-product ideal, for the slippage figure. */
function ideal(amountIn: bigint, rIn: bigint, rOut: bigint): bigint {
  return (amountIn * rOut) / (rIn + amountIn);
}

function padded(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

interface VenueRead {
  name: string;
  address: string;
  r0: bigint;
  r1: bigint;
}

interface ScanResult {
  pinnedBlock: number;
  tipBlock: number;
  lag: number;
  venues: VenueRead[];
  gasPriceWei: bigint;
  sizeWei: bigint;
  thresholdWei: bigint;
  guardBps: number;
  best: {
    leg1Venue: string;
    leg2Venue: string;
    leg1Out: bigint;
    leg2Out: bigint;
    gross: bigint;
    fee1: bigint;
    fee2: bigint;
    slip1: bigint;
    slip2: bigint;
  };
  gasWei: bigint;
  guardWei: bigint;
  net: bigint;
  verdict: "OPPORTUNITY" | "SKIP";
  skipReason: string | null;
  onChainMatch: boolean | null;
  onChainNote: string;
}

async function runScan(sizeWei: bigint, thresholdWei: bigint, guardBps: number): Promise<ScanResult> {
  // 1. Pin one block for the whole scan.
  const tipHex = (await rpcCall("eth_blockNumber", [])) as string;
  const pinned = Number(BigInt(tipHex));
  const blockTag = "0x" + pinned.toString(16);

  // 2. Read all three venues at the pinned block, in parallel.
  const reads = await Promise.all(
    VENUES.map(async (v): Promise<VenueRead> => {
      const hex = (await rpcCall("eth_call", [{ to: v.address, data: GET_RESERVES_SEL }, blockTag])) as string;
      const body = hex.startsWith("0x") ? hex.slice(2) : hex;
      if (body.length < 128) throw new Error(`Venue ${v.name} returned a short reserve read — treated as a failed source, never as zero.`);
      return {
        name: v.name,
        address: v.address,
        r0: BigInt("0x" + body.slice(0, 64)),
        r1: BigInt("0x" + body.slice(64, 128)),
      };
    })
  );

  const gasPriceWei = BigInt((await rpcCall("eth_gasPrice", [])) as string);

  // 3. Fresh tip for the staleness check (pinned >50 behind tip = STALE_QUOTE).
  const tipHex2 = (await rpcCall("eth_blockNumber", [])) as string;
  const tipBlock = Number(BigInt(tipHex2));
  const lag = tipBlock - pinned;

  let verdict: "OPPORTUNITY" | "SKIP" = "SKIP";
  let skipReason: string | null = null;
  if (lag > STALE_BLOCK_LAG) skipReason = "STALE_QUOTE";
  else if (reads.some((v) => v.r0 === 0n || v.r1 === 0n)) skipReason = "NO_LIQUIDITY";

  // 4. Price the 6 WPHRS-start directed cycles (buy TKB on venue X, sell back on venue Y).
  let best: ScanResult["best"] | null = null;
  for (const v1 of reads) {
    for (const v2 of reads) {
      if (v1.name === v2.name) continue;
      const leg1Out = quote(sizeWei, v1.r0, v1.r1); // WPHRS -> TKB on v1
      const leg2Out = quote(leg1Out, v2.r1, v2.r0); // TKB -> WPHRS on v2
      if (leg1Out === 0n || leg2Out === 0n) continue;
      const gross = leg2Out - sizeWei;
      if (!best || gross > best.gross) {
        const fee1 = (sizeWei * FEE_BPS) / 10000n;
        const fee2 = (leg1Out * FEE_BPS) / 10000n;
        best = {
          leg1Venue: v1.name,
          leg2Venue: v2.name,
          leg1Out,
          leg2Out,
          gross,
          fee1,
          fee2,
          slip1: ideal(sizeWei, v1.r0, v1.r1) - leg1Out,
          slip2: ideal(leg1Out, v2.r1, v2.r0) - leg2Out,
        };
      }
    }
  }

  const gasWei = 2n * GAS_PER_LEG * gasPriceWei;
  const guardWei = (sizeWei * BigInt(guardBps)) / 10000n;
  const net = best ? best.gross - gasWei - guardWei : 0n;

  if (!skipReason) {
    if (!best) skipReason = "SOURCE_DOWN";
    else if (net <= 0n) skipReason = "NEGATIVE_NET";
    else if (net <= thresholdWei) skipReason = "BELOW_THRESHOLD";
  }
  verdict = skipReason ? "SKIP" : "OPPORTUNITY";

  // 5. On-chain cross-check: quote the winning route's legs through the contracts themselves.
  let onChainMatch: boolean | null = null;
  let onChainNote = "not checked";
  if (best) {
    try {
      const v1 = reads.find((v) => v.name === best.leg1Venue)!;
      const v2 = reads.find((v) => v.name === best.leg2Venue)!;
      const data1 =
        GET_AMOUNT_OUT_SEL +
        sizeWei.toString(16).padStart(64, "0") +
        padded(WPHRS);
      const data2 =
        GET_AMOUNT_OUT_SEL +
        best.leg1Out.toString(16).padStart(64, "0") +
        padded(TKB);
      const [q1, q2] = await Promise.all([
        rpcCall("eth_call", [{ to: v1.address, data: data1 }, blockTag]) as Promise<string>,
        rpcCall("eth_call", [{ to: v2.address, data: data2 }, blockTag]) as Promise<string>,
      ]);
      const oq1 = BigInt(q1);
      const oq2 = BigInt(q2);
      onChainMatch = oq1 === best.leg1Out && oq2 === best.leg2Out;
      onChainNote = onChainMatch
        ? "contract quotes match the panel math exactly (wei-identical)"
        : "MISMATCH — the contracts disagree with the panel math; treat the scan as untrusted";
    } catch {
      onChainMatch = null;
      onChainNote = "contract cross-check failed — quotes below are the panel's math, flagged unverified";
    }
  }

  return {
    pinnedBlock: pinned,
    tipBlock,
    lag,
    venues: reads,
    gasPriceWei,
    sizeWei,
    thresholdWei,
    guardBps,
    best: best ?? {
      leg1Venue: "—", leg2Venue: "—", leg1Out: 0n, leg2Out: 0n, gross: 0n,
      fee1: 0n, fee2: 0n, slip1: 0n, slip2: 0n,
    },
    gasWei,
    guardWei,
    net,
    verdict,
    skipReason,
    onChainMatch,
    onChainNote,
  };
}

const inputCls =
  "w-full rounded-lg border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30";

export default function TryArbitrageScanner({ lamp }: { lamp: Lamp }) {
  const [size, setSize] = useState("10");
  const [threshold, setThreshold] = useState("0.05");
  const [guard, setGuard] = useState("0.5");
  const [inputError, setInputError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);

  const { data, loading, error, refetch } = useAtlanticRead<ScanResult>(
    async () => {
      const guardBps = Math.round(parseFloat(guard) * 100);
      return runScan(parseUnits(size), parseUnits(threshold), guardBps);
    },
    [runId],
    { auto: runId > 0 }
  );

  const start = () => {
    setInputError(null);
    try {
      const s = parseUnits(size);
      const t = parseUnits(threshold);
      const g = parseFloat(guard);
      if (s <= 0n) throw new Error("Trade size must be above zero.");
      if (t < 0n) throw new Error("Threshold cannot be negative.");
      if (!Number.isFinite(g) || g < 0 || g > 50)
        throw new Error("Slippage guard must be between 0 and 50%.");
      setRunId((n) => n + 1);
    } catch (e) {
      setInputError(e instanceof Error ? e.message : "Invalid input.");
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="chip">TIER A · LIVE READ</span>
        <span className="chip">NO SIGNATURE · COSTS NOTHING</span>
      </div>

      <h3 className="smallcaps !text-ink mb-2">Live spread scanner</h3>
      <p className="mb-5 max-w-3xl text-sm leading-relaxed text-slate">
        The T07 <strong className="text-ink">config → scan → verdict</strong> rhythm, live in your
        browser. One scan pins a block, reads the three real T07 venues on Atlantic testnet via{" "}
        <code className="font-mono text-xs">eth_call</code>, prices the six WPHRS-start directed
        cycles with the contract-identical constant-product math (fees 30 bps/leg on the notional),
        nets slippage + gas + your slippage guard — then rules{" "}
        <strong className="text-ink">OPPORTUNITY</strong> above your threshold or{" "}
        <strong className="text-ink">SKIP</strong> with the honest reason. Every number below was
        just read from chain; nothing here is a mock. (The CLI scanner additionally prices the six
        TKB-start cycles.)
      </p>

      {/* config */}
      <div className="mb-5 grid gap-3 rounded-xl border border-hairline bg-porcelain p-4 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
            Trade size (WPHRS)
          </span>
          <input className={inputCls} value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
            Profit threshold (WPHRS)
          </span>
          <input className={inputCls} value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
            Slippage guard (%)
          </span>
          <input className={inputCls} value={guard} onChange={(e) => setGuard(e.target.value)} inputMode="decimal" />
        </label>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={start} disabled={loading}>
            {loading ? "Scanning Atlantic…" : "Run scan"}
          </button>
        </div>
      </div>
      {inputError && <p className="mb-4 text-sm text-fail">{inputError}</p>}
      {error && <p className="mb-4 text-sm text-fail">{error}</p>}
      {loading && <p className="mb-4 text-sm text-slate">Reading venues at a pinned block…</p>}

      {/* results */}
      {data && !loading && (
        <div className="space-y-5">
          <p className="font-mono text-xs text-slate">
            pinned block {data.pinnedBlock} · tip {data.tipBlock} (lag {data.lag}) · gas price{" "}
            {fmt(data.gasPriceWei, 4)} gwei · size {fmt(data.sizeWei)} WPHRS
          </p>

          {/* venues */}
          <div>
            <h4 className="smallcaps !text-ink mb-2">The venues, just read</h4>
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Venue</th>
                    <th>Reserves (WPHRS / TKB)</th>
                    <th>Implied price (TKB per WPHRS)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.venues.map((v) => (
                    <tr key={v.name}>
                      <td className="font-semibold">
                        <a
                          className="font-mono text-xs text-accent hover:underline"
                          href={`${EXPLORER_ADDRESS}${v.address}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {v.name}
                        </a>
                      </td>
                      <td className="font-mono">{fmt(v.r0, 2)} / {fmt(v.r1, 2)}</td>
                      <td className="font-mono">{(Number(v.r1) / Number(v.r0)).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* best route + decomposition */}
          <div>
            <h4 className="smallcaps !text-ink mb-2">Best route &amp; cost decomposition</h4>
            <p className="mb-3 text-sm text-slate">
              <strong className="text-ink">{data.best.leg1Venue}</strong> →{" "}
              <strong className="text-ink">{data.best.leg2Venue}</strong>: swap{" "}
              <span className="font-mono">{fmt(data.sizeWei)}</span> WPHRS →{" "}
              <span className="font-mono">{fmt(data.best.leg1Out)}</span> TKB, then back to{" "}
              <span className="font-mono">{fmt(data.best.leg2Out)}</span> WPHRS.
            </p>
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <tbody>
                  <tr><td>Gross spread (leg2 out − size)</td><td className="font-mono text-right">{fmt(data.best.gross)} WPHRS</td></tr>
                  <tr><td>Fee, leg 1 — 30 bps on the notional (embedded in the quote)</td><td className="font-mono text-right">{fmt(data.best.fee1)} WPHRS</td></tr>
                  <tr><td>Fee, leg 2 — 30 bps on the notional (embedded in the quote)</td><td className="font-mono text-right">{fmt(data.best.fee2)} WPHRS</td></tr>
                  <tr><td>Slippage leg 1 — quoted vs zero-fee ideal</td><td className="font-mono text-right">{fmt(data.best.slip1)} TKB</td></tr>
                  <tr><td>Slippage leg 2 — quoted vs zero-fee ideal</td><td className="font-mono text-right">{fmt(data.best.slip2)} WPHRS</td></tr>
                  <tr><td>Gas — 2 legs × {GAS_PER_LEG.toString()} gas × live price (PHRS 1:1 by test construction)</td><td className="font-mono text-right">{fmt(data.gasWei)} WPHRS</td></tr>
                  <tr><td>Slippage guard — your {data.guardBps / 100}% buffer on size</td><td className="font-mono text-right">{fmt(data.guardWei)} WPHRS</td></tr>
                  <tr><td className="font-semibold text-ink">Net</td><td className="font-mono text-right font-semibold text-ink">{fmt(data.net)} WPHRS</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate">
              Contract cross-check: {data.onChainNote}.
              {data.onChainMatch === false && " The scan above is untrusted — the on-chain quotes disagreed."}
            </p>
          </div>

          {/* verdict */}
          <div className="rounded-xl border border-hairline bg-porcelain p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={data.verdict === "OPPORTUNITY" ? "chip-pass" : "chip-fail"}>
                {data.verdict === "OPPORTUNITY" ? "◉ OPPORTUNITY" : `○ SKIP — ${data.skipReason}`}
              </span>
              <span className="text-sm text-slate">
                net <span className="font-mono">{fmt(data.net)} WPHRS</span> vs threshold{" "}
                <span className="font-mono">{fmt(data.thresholdWei)} WPHRS</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-slate">
              {data.verdict === "OPPORTUNITY"
                ? "This scan's economics clear your threshold. Acting is the CLI's job — this panel never signs or broadcasts."
                : data.skipReason === "BELOW_THRESHOLD"
                  ? "Same real spread, your threshold says no — nothing is prepared. A truthful skip beats a fabricated opportunity."
                  : data.skipReason === "NEGATIVE_NET"
                    ? "The best route loses money after gas and your slippage guard — no trade is worth preparing."
                    : data.skipReason === "STALE_QUOTE"
                      ? "The pinned block lagged the tip too far — quotes are not trusted. Re-run the scan."
                      : "A price source failed or a venue is empty — failed reads are errors, never zeros."}
            </p>
            <button className="btn-outline mt-3" onClick={refetch} disabled={loading}>
              Re-run scan (free)
            </button>
          </div>

          {/* prior on-chain proof */}
          <div className="text-xs text-slate">
            <p className="mb-1 font-semibold text-ink">This venue set has already paid out on-chain:</p>
            <p className="font-mono">
              <a className="text-accent hover:underline" href={`${EXPLORER_TX}${EXEC_LEG1}`} target="_blank" rel="noreferrer">
                arb leg 1 {EXEC_LEG1.slice(0, 10)}…{EXEC_LEG1.slice(-8)}
              </a>{" · "}
              <a className="text-accent hover:underline" href={`${EXPLORER_TX}${EXEC_LEG2}`} target="_blank" rel="noreferrer">
                arb leg 2 {EXEC_LEG2.slice(0, 10)}…{EXEC_LEG2.slice(-8)}
              </a>
            </p>
            <p className="mt-2">
              Tier A — live reads only. LIGHTKEEPER never sees, holds, or asks for private keys.
              Full scanner + execution harness: task <strong className="text-ink">{lamp.name}</strong> in the repo.
            </p>
          </div>
        </div>
      )}

      {!data && !loading && runId === 0 && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          Set your size, threshold and slippage guard, then run a scan — Atlantic's real venue
          reserves will appear here, priced at a pinned block.
        </div>
      )}
    </div>
  );
}
