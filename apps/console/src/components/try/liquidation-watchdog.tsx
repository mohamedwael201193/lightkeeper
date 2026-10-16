/**
 * T16 · Liquidation Watchdog — "Your position, live risk".
 *
 * FLAGSHIP rebuild (2026-10-16): the risk instrument. One free eth_call to
 * MiniLend.getUserAccountData on Atlantic returns collateral, debt, oracle
 * price and the on-chain health factor; the module renders the verdict as a
 * precision instrument — a state-mapped SVG gauge whose needle swings to the
 * real health factor — the exact oracle price that would liquidate the
 * position as the hero number, and the emotional payoff: "two ways out",
 * the concrete repay-or-top-up rescue paths that restore HF to 1.5, each
 * with its resulting HF. The same math the Telegram watcher fires with.
 *
 * Math (identical to watcher/watch.py and MiniLend.sol — verified by the
 * 31-check regression in tasks/t16-liquidation-watchdog/regression.mjs —
 * DO NOT TOUCH):
 *   zones:  HF < 1.0 liquidatable · HF < 1.1 critical · HF < 1.3 warning
 *           · else healthy · no debt → none (HF infinite, nothing to liquidate)
 *   liquidation price = oracle price / HF
 *   repay leg  = debt − collateral·8/15          (restores HF to 1.5)
 *   top-up leg = debt·15/8 − collateral          (restores HF to 1.5)
 *   debt-free  = no gauge, no division · HF = 0  = liquidatable at any price
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck } from "lucide-react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  isValidAddress,
  rpcCall,
} from "../../hooks/useAtlantic";
import {
  ResultCard,
  EmptyState,
  ErrorState,
  StatStrip,
} from "../ui";

// MiniLend from tasks/t16-liquidation-watchdog/evidence.json (deployed, verified on-chain)
const MINILEND = "0x108989a165a446e1d89CEe3C9936344ea7ADbf4a";
// The demo position from the live run — HF 1.5, Healthy: the opening scene.
const DEMO_ACCOUNT = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";

const SEL = {
  getUserAccountData: "0xbf92857c", // getUserAccountData(address)
} as const;

const HF_SCALE = 10n ** 18n;
const WARN_HF = 13n * 10n ** 17n; // 1.3 — matches watcher/config.yaml
const CRIT_HF = 11n * 10n ** 17n; // 1.1
const HF_ONE = HF_SCALE; // 1.0 — liquidation boundary (contract: liquidate() needs HF < 1)
const TARGET_HF_NUM = 15n; // 1.5 — concrete-action target (as debt*15/8 and collat*8/15)
const GAUGE_CAP = 2n * HF_SCALE; // gauge display cap
const UINT_MAX = (1n << 256n) - 1n;

interface AccountData {
  collateralUsd8: bigint; // USD, 8 decimals
  debtUsd8: bigint; // USD, 8 decimals
  hf: bigint; // 1e18 == 1.0 (type(uint).max when debt-free)
  price8: bigint; // USD per PHRS, 8 decimals (int256, always positive here)
  thresholdBps: bigint;
}

/** One eth_call; throws a plain-language error when the node answers with no data. */
async function readAccount(address: string): Promise<AccountData> {
  const padded = "0x" + SEL.getUserAccountData + address.slice(2).padStart(64, "0");
  const hex = (await rpcCall("eth_call", [{ to: MINILEND, data: padded }, "latest"])) as string;
  const words = hex.slice(2).match(/.{1,64}/g) ?? [];
  if (words.length < 5) throw new Error("MiniLend returned no data — the RPC may be unhealthy. Retry.");
  const [c, d, h, p, t] = words.map((w) => BigInt("0x" + w));
  return { collateralUsd8: c, debtUsd8: d, hf: h, price8: p, thresholdBps: t };
}

/** Format a fixed-decimal bigint (dp decimals) as a trimmed decimal string. */
function fixed(u: bigint, dp: number, maxDp = 4): string {
  const base = 10n ** BigInt(dp);
  const int = u / base;
  let frac = (u % base).toString().padStart(dp, "0").slice(0, maxDp).replace(/0+$/, "");
  return frac ? `${int.toString()}.${frac}` : int.toString();
}

/** Mirror of MiniLend.healthFactor: (collUsd * 8000 * 1e18) / (debtUsd * 10000). */
function hfOf(collUsd8: bigint, debtUsd8: bigint): bigint {
  if (debtUsd8 === 0n) return UINT_MAX;
  return (collUsd8 * 8000n * HF_SCALE) / (debtUsd8 * 10000n);
}

function hfDisplayOf(hf: bigint): string {
  return hf === UINT_MAX ? "∞" : fixed(hf, 18, 4);
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type RiskZone = "none" | "healthy" | "warning" | "critical" | "liquidatable";

function zoneOf(hf: bigint, hasDebt: boolean): RiskZone {
  if (!hasDebt) return "none"; // debt-free: HF is infinite, nothing to liquidate
  if (hf < HF_ONE) return "liquidatable";
  if (hf < CRIT_HF) return "critical";
  if (hf < WARN_HF) return "warning";
  return "healthy";
}

const ZONE_NAME: Record<RiskZone, string | null> = {
  none: null,
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  liquidatable: "Liquidatable",
};

const ZONE_VERDICT: Record<
  Exclude<RiskZone, "none">,
  { headline: string; status: "pass" | "neutral" | "fail"; blurb: string }
> = {
  healthy: {
    headline: "Healthy",
    status: "pass",
    blurb: "Collateral comfortably covers the debt. The watcher stays silent.",
  },
  warning: {
    headline: "Warning",
    status: "neutral",
    blurb: "The watcher would page now — the health factor crossed below 1.3.",
  },
  critical: {
    headline: "Critical",
    status: "fail",
    blurb: "The watcher would page urgently — the health factor crossed below 1.1.",
  },
  liquidatable: {
    headline: "Liquidatable",
    status: "fail",
    blurb: "Health factor below 1.0 — anyone may call liquidate() right now.",
  },
};

// ---------------------------------------------------------------------------
// Risk gauge — a precision instrument. Semicircle 0 → 2.0 HF with zone arcs,
// tick marks, threshold markers and a needle that swings (0.6s ease-out) to
// the real health factor — the Swing transition, mapped to the reading
// resolving. Parked (hf === null) before the first real read.
// ---------------------------------------------------------------------------
const GX = 130; // gauge center x
const GY = 128; // gauge center y
const GR = 100; // zone-arc radius
const NEEDLE_R = 82;

function gaugePoint(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [GX + r * Math.cos(rad), GY - r * Math.sin(rad)];
}

/** SVG arc for the HF interval [v0, v1] on the 0–2.0 dial. */
function gaugeArc(v0: number, v1: number): string {
  const a0 = 180 - (v0 / 2) * 180;
  const a1 = 180 - (v1 / 2) * 180;
  const [x0, y0] = gaugePoint(a0, GR);
  const [x1, y1] = gaugePoint(a1, GR);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${GR} ${GR} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const GAUGE_ZONES = [
  { from: 0, to: 1.0, color: "#fca5a5", name: "Liquidatable", range: "below 1.0" },
  { from: 1.0, to: 1.1, color: "#fdba74", name: "Critical", range: "1.0 – 1.1" },
  { from: 1.1, to: 1.3, color: "#fde68a", name: "Warning", range: "1.1 – 1.3" },
  { from: 1.3, to: 2.0, color: "#86efac", name: "Healthy", range: "1.3 – 2.0" },
];

function RiskGauge({ hf, zone }: { hf: bigint | null; zone: RiskZone }) {
  const reduce = useReducedMotion();
  const parked = hf === null;
  const clamped = parked ? 0n : hf > GAUGE_CAP ? GAUGE_CAP : hf;
  // Integer math: degrees = 180 − 180·(hf / cap), two decimals.
  const targetAngle = 180 - Number((clamped * 18000n) / GAUGE_CAP) / 100;

  const angle = useMotionValue(180); // rest = far left (HF 0)
  useEffect(() => {
    if (parked || reduce) {
      angle.set(parked ? 180 : targetAngle);
      return;
    }
    // The Swing: one 0.6s ease-out to the real value — nothing else moves.
    const controls = animate(angle, targetAngle, { duration: 0.6, ease: "easeOut" });
    return () => controls.stop();
  }, [parked, targetAngle, angle, reduce]);
  const x2 = useTransform(angle, (a) => gaugePoint(a, NEEDLE_R)[0]);
  const y2 = useTransform(angle, (a) => gaugePoint(a, NEEDLE_R)[1]);

  const ticks: React.ReactNode[] = [];
  for (let t = 0; t <= 2.0001; t += 0.25) {
    const major = Math.abs(t * 2 - Math.round(t * 2)) < 1e-9;
    const deg = 180 - (t / 2) * 180;
    const [ix, iy] = gaugePoint(deg, major ? 86 : 92);
    const [ox, oy] = gaugePoint(deg, GR);
    ticks.push(
      <line
        key={t.toFixed(2)}
        x1={ix} y1={iy} x2={ox} y2={oy}
        stroke="#0B1533"
        strokeOpacity={major ? 0.75 : 0.35}
        strokeWidth={major ? 2.5 : 1.5}
      />
    );
    if (major) {
      const [lx, ly] = gaugePoint(deg, 70);
      ticks.push(
        <text key={`l${t.toFixed(2)}`} x={lx} y={ly + 4} textAnchor="middle" fontSize={11} fill="#0B1533" fontFamily="ui-monospace, monospace">
          {t.toFixed(1)}
        </text>
      );
    }
  }
  // Threshold markers at 1.0 / 1.1 / 1.3 (the contract + watcher lines).
  const markers = [1.0, 1.1, 1.3].map((val) => {
    const deg = 180 - (val / 2) * 180;
    const [ix, iy] = gaugePoint(deg, 82);
    const [ox, oy] = gaugePoint(deg, GR);
    return <line key={val} x1={ix} y1={iy} x2={ox} y2={oy} stroke="#0B1533" strokeWidth={3} />;
  });

  const activeName = ZONE_NAME[zone];
  const readout = parked ? "—" : hfDisplayOf(hf as bigint);

  return (
    <div className="mx-auto w-full max-w-md">
      <svg
        viewBox="0 0 260 142"
        className="w-full"
        role="img"
        aria-label={
          parked
            ? "Risk gauge, awaiting a position read"
            : `Risk gauge: health factor ${readout}, zone ${activeName}`
        }
      >
        {GAUGE_ZONES.map((z) => (
          <path key={z.name} d={gaugeArc(z.from, z.to)} fill="none" stroke={z.color} strokeWidth={16} />
        ))}
        {ticks}
        {markers}
        <motion.line x1={GX} y1={GY} x2={x2} y2={y2} stroke="#0B1533" strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={GX} cy={GY} r={9} fill="#0B1533" />
        <circle cx={GX} cy={GY} r={3.5} fill="#ffffff" />
      </svg>
      <p className="mt-1 text-center font-mono text-3xl tabular-nums text-ink" aria-hidden={parked}>
        {readout}
      </p>
      <p className="mt-0.5 text-center text-sm font-semibold text-slate">
        {parked ? "on-chain health factor" : `on-chain health factor · ${activeName}`}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {GAUGE_ZONES.map((z) => {
          const active = activeName === z.name;
          return (
            <span
              key={z.name}
              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-sm font-semibold ${
                active ? "bg-tint text-ink ring-2 ring-ink" : "text-slate"
              }`}
            >
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: z.color }} aria-hidden />
              {z.name} · {z.range}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Liquidation fuse — the tripwire made visible. A horizontal bar from 0 to
// the current oracle price: everything at or below the liquidation price is
// liquidation territory, the rest is the cushion. Widths are the real values.
// ---------------------------------------------------------------------------
function LiquidationFuse({
  priceNow8,
  liqPrice8,
  cushionBps,
}: {
  priceNow8: bigint;
  liqPrice8: bigint;
  cushionBps: bigint;
}) {
  const frac =
    priceNow8 > 0n ? Number((liqPrice8 * 100000n) / priceNow8) / 100000 : 0;
  const pct = Math.max(0, Math.min(1, frac));
  return (
    <div className="mt-5">
      <div
        className="relative h-3 overflow-hidden rounded-full bg-tint"
        role="img"
        aria-label={`Price distance to liquidation: oracle $${fixed(priceNow8, 8)}, liquidatable at $${fixed(liqPrice8, 8)}, cushion ${(Number(cushionBps) / 100).toFixed(1)} percent`}
      >
        <div className="absolute inset-y-0 left-0 bg-[#FCA5A5]" style={{ width: `${pct * 100}%` }} aria-hidden />
        <div className="absolute inset-y-0 right-0 bg-[#86EFAC]" style={{ width: `${(1 - pct) * 100}%` }} aria-hidden />
        <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-ink" style={{ left: `${pct * 100}%` }} aria-hidden />
      </div>
      <div className="mt-2 flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-ink">
          Liquidatable at or below <span className="font-mono">${fixed(liqPrice8, 8)}</span>
        </p>
        <p className="shrink-0 text-right text-sm font-semibold text-ink">
          Oracle now <span className="font-mono">${fixed(priceNow8, 8)}</span>
        </p>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-slate">
        Cushion {(Number(cushionBps) / 100).toFixed(1)}% — the price can fall this far
        before anyone may call <span className="font-mono">liquidate()</span>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View model — every derived number, computed once per real read.
// Formulas are the watcher's, untouched:
//   liquidation price = oracle price / HF
//   repay leg  = debt − collateral·8/15          (restores HF to 1.5)
//   top-up leg = debt·15/8 − collateral          (restores HF to 1.5 — the
//                corrected alert formula; at alert-time state = 0.000500 PHRS)
//   debt-free  = infinite HF → no gauge, no division, EmptyState instead
// ---------------------------------------------------------------------------
interface Verdict {
  acct: AccountData;
  address: string;
  zone: RiskZone;
  hasDebt: boolean;
  hasPosition: boolean;
  liquidationPrice8: bigint;
  cushionBps: bigint;
  repayUsd8: bigint;
  addPhrsWei: bigint;
  addUsd8: bigint;
  hfAfterRepay: bigint;
  hfAfterTopup: bigint;
  hfDisplay: string;
  danger: boolean;
}

function buildVerdict(acct: AccountData, address: string): Verdict {
  const hasDebt = acct.debtUsd8 > 0n;
  const hasPosition = acct.collateralUsd8 > 0n || hasDebt;
  const zone = zoneOf(acct.hf, hasDebt);
  // Liquidation price: HF is linear in price, so p_liq = price / HF.
  // hf == 0 (zero collateral, debt outstanding) means liquidatable at any price.
  const liquidationPrice8 =
    hasDebt && acct.hf > 0n ? (acct.price8 * HF_SCALE) / acct.hf : 0n;
  // Price cushion: how far the oracle price can fall before liquidation.
  const cushionBps =
    hasDebt && acct.price8 > 0n && acct.hf > 0n
      ? ((acct.price8 - liquidationPrice8) * 10000n) / acct.price8
      : 0n;
  // Repay (USD 8dp) to restore HF 1.5: debt' = collatUsd * 0.8 / 1.5 = collatUsd * 8/15.
  // With zero collateral that is the full debt; clamped at 0.
  const targetDebt8 = (acct.collateralUsd8 * 8n) / TARGET_HF_NUM;
  const repayUsd8 = hasDebt && acct.debtUsd8 > targetDebt8 ? acct.debtUsd8 - targetDebt8 : 0n;
  // Add-collateral (USD 8dp, then PHRS wei) to restore HF 1.5:
  // collatUsd' = debt * 1.5 / 0.8 = debt * 15/8.
  const needCollUsd8 = (acct.debtUsd8 * TARGET_HF_NUM) / 8n;
  const addUsd8 =
    hasDebt && needCollUsd8 > acct.collateralUsd8 ? needCollUsd8 - acct.collateralUsd8 : 0n;
  const addPhrsWei =
    hasDebt && acct.price8 > 0n && addUsd8 > 0n
      ? (addUsd8 * 10n ** 18n) / acct.price8
      : 0n;
  // The resulting health factor of each rescue path — the brief's "each with
  // the resulting HF". Repaying the full debt (HF=0 case) restores infinite HF.
  const hfAfterRepay = hasDebt ? hfOf(acct.collateralUsd8, acct.debtUsd8 - repayUsd8) : UINT_MAX;
  const hfAfterTopup = hasDebt ? hfOf(acct.collateralUsd8 + addUsd8, acct.debtUsd8) : UINT_MAX;
  const hfDisplay = hfDisplayOf(acct.hf);
  return {
    acct, address, zone, hasDebt, hasPosition,
    liquidationPrice8, cushionBps, repayUsd8, addPhrsWei, addUsd8,
    hfAfterRepay, hfAfterTopup, hfDisplay,
    danger: zone === "warning" || zone === "critical" || zone === "liquidatable",
  };
}

type Phase = "idle" | "running" | "done" | "error";

export default function TryLiquidationWatchdog({ lamp }: { lamp: Lamp }) {
  void lamp; // page shell renders the name — the module doesn't need it
  const [input, setInput] = useState(DEMO_ACCOUNT);
  const [checked, setChecked] = useState(DEMO_ACCOUNT);
  const [inflight, setInflight] = useState<string | null>(null);
  const [seq, setSeq] = useState(0); // read counter — each reading gets a fresh needle swing
  const [phase, setPhase] = useState<Phase>("idle");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const autoRan = useRef(false);

  const valid = isValidAddress(input);
  const running = phase === "running";

  const run = useCallback(async (address: string) => {
    setPhase("running");
    setInflight(address);
    setSeq((s) => s + 1);
    setErrorMsg(null);
    try {
      const acct = await readAccount(address); // the one real eth_call
      const v = buildVerdict(acct, address); // real compute on the returned data
      setChecked(address);
      setVerdict(v);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "The Atlantic RPC did not answer.");
      setPhase("error");
    } finally {
      setInflight(null);
    }
  }, []);

  // Land on the demo position: the full journey plays once, on real data.
  useEffect(() => {
    if (!autoRan.current) {
      autoRan.current = true;
      void run(DEMO_ACCOUNT);
    }
  }, [run]);

  const onCheck = () => {
    if (valid && !running) void run(input.trim());
  };
  const onRefresh = () => {
    if (!running) void run(checked);
  };
  const onDemo = () => {
    setInput(DEMO_ACCOUNT);
    if (!running) void run(DEMO_ACCOUNT);
  };

  const v = verdict;
  const showResult = phase === "done" && v && v.hasPosition && v.hasDebt;
  const showEmpty = phase === "done" && v && !v.hasPosition;
  const showDebtFree = phase === "done" && v && v.hasPosition && !v.hasDebt;
  const verdictCopy = v && v.zone !== "none" ? ZONE_VERDICT[v.zone] : null;

  return (
    <div className="space-y-6">
      {/* 01 · Configure */}
      <section aria-label="Configure">
        <p className="text-sm font-semibold text-slate">01 · Configure</p>
        <h3 className="mt-2 text-lg font-semibold text-ink">Your position, live risk</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink">
          One free read tells you if a position is safe — and exactly how to save it if it
          isn&apos;t. Collateral, debt, oracle price and the on-chain health factor come from
          a single <span className="font-mono">eth_call</span> to MiniLend; the gauge, the
          liquidation price and the two ways out are all derived from that one read.
        </p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-hairline bg-white px-3 py-1.5 text-sm font-semibold text-ink">
          <ShieldCheck size={16} className="text-accent" aria-hidden />
          Tier A — live reads, no wallet, costs nothing
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="w-full rounded-xl border border-hairline bg-white px-4 py-2.5 font-mono text-sm text-ink placeholder:text-slate"
            placeholder="0x… account address"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCheck();
            }}
            aria-label="Position address to check"
          />
          <div className="flex shrink-0 gap-2">
            <button className="btn-primary min-h-[44px]" onClick={onCheck} disabled={!valid || running}>
              {running ? "Reading…" : "Check risk"}
            </button>
            <button className="btn-outline min-h-[44px]" onClick={onRefresh} disabled={running}>
              Refresh
            </button>
          </div>
        </div>
        {!valid && input.trim().length > 0 && (
          <p className="mt-2 text-sm text-fail">That is not a valid 0x address — 40 hex characters after 0x.</p>
        )}

        {phase === "idle" && (
          <div className="mt-6 rounded-2xl border border-hairline bg-white p-6 sm:p-8">
            <RiskGauge hf={null} zone="none" />
            <p className="mt-2 text-center text-sm text-slate">
              The needle wakes when a position is read — the demo position loads automatically.
            </p>
          </div>
        )}
      </section>

      {/* 02 · Reading — a single honest heartbeat for the single real call */}
      {running && (
        <section aria-label="Reading position">
          <p className="mb-3 text-sm font-semibold text-slate">02 · Reading</p>
          <div className="rounded-2xl border border-hairline bg-white p-5 sm:p-6" aria-live="polite">
            <div className="flex items-center gap-3">
              <motion.span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.55, 1] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              />
              <p className="text-base font-medium text-ink">
                Calling <span className="font-mono">MiniLend.getUserAccountData</span>
                {inflight ? `(${shortAddr(inflight)})` : ""}…
              </p>
            </div>
            <p className="mt-2 font-mono text-sm text-slate">
              eth_call · {SEL.getUserAccountData} · Atlantic 688689 · free read, nothing moves on-chain
            </p>
          </div>
        </section>
      )}

      {/* 03 · Verdict */}
      {phase === "error" && (
        <section aria-label="Result">
          <p className="mb-3 text-sm font-semibold text-slate">03 · Verdict</p>
          <ErrorState
            title="The read failed"
            message={errorMsg ?? "The Atlantic RPC did not answer."}
            hint="This is a free read — nothing was spent and nothing changed on-chain. Check your connection and try again."
            onRetry={onRefresh}
          />
        </section>
      )}

      {showEmpty && v && (
        <section aria-label="Result">
          <p className="mb-3 text-sm font-semibold text-slate">03 · Verdict</p>
          <EmptyState
            title="No position at this address"
            message="Zero collateral and zero debt on MiniLend — nothing to liquidate, and the watcher would stay silent. That's an honest answer, not an error."
            actionLabel="Try the demo position"
            onAction={onDemo}
          />
        </section>
      )}

      {showDebtFree && v && (
        <section aria-label="Result">
          <p className="mb-3 text-sm font-semibold text-slate">03 · Verdict</p>
          <ResultCard
            eyebrow={`Risk verdict · ${shortAddr(v.address)}`}
            headline="Debt-free"
            subline={
              <>
                This address holds <strong>${fixed(v.acct.collateralUsd8, 8)}</strong> of
                collateral and owes nothing — the on-chain health factor is infinite. The
                watcher&apos;s thresholds (1.3 / 1.1) never apply here; this position can
                never trigger it.
              </>
            }
            status="pass"
            copyValue={v.address}
            rows={[
              { label: "Collateral", value: `$${fixed(v.acct.collateralUsd8, 8)}` },
              { label: "Debt", value: "$0" },
              { label: "Position", value: <span title={v.address}>{shortAddr(v.address)}</span> },
            ]}
            links={[
              { label: "View MiniLend on the explorer", href: `${EXPLORER_ADDRESS}${MINILEND}` },
              { label: "View position on the explorer", href: `${EXPLORER_ADDRESS}${v.address}` },
            ]}
          />
          <p className="mt-4 text-sm leading-relaxed text-slate">
            Every number above comes from a single <span className="font-mono">getUserAccountData()</span>{" "}
            eth_call against MiniLend — the same call the Telegram watcher uses. This page never
            asks for private keys. What the keeper can&apos;t see: positions on other pools —
            this verdict covers MiniLend on Atlantic only.
          </p>
        </section>
      )}

      {showResult && v && verdictCopy && (
        <section aria-label="Result">
          <p className="mb-3 text-sm font-semibold text-slate">03 · Verdict</p>
          <ResultCard
            eyebrow={`Risk verdict · ${shortAddr(v.address)}`}
            headline={verdictCopy.headline}
            subline={
              <>
                Health factor <strong className="font-mono">{v.hfDisplay}</strong> — read live
                from MiniLend on Atlantic. {verdictCopy.blurb}
              </>
            }
            status={verdictCopy.status}
            copyValue={v.address}
            rows={[
              { label: "Oracle price", value: `$${fixed(v.acct.price8, 8)}` },
              { label: "Liquidation threshold", value: `${(Number(v.acct.thresholdBps) / 100).toFixed(0)}%` },
              { label: "Position", value: <span title={v.address}>{shortAddr(v.address)}</span> },
            ]}
            links={[
              { label: "View MiniLend on the explorer", href: `${EXPLORER_ADDRESS}${MINILEND}` },
              { label: "View position on the explorer", href: `${EXPLORER_ADDRESS}${v.address}` },
            ]}
          >
            {/* The instrument — the needle swings to the real health factor */}
            <RiskGauge key={`${v.address}:${seq}`} hf={v.acct.hf} zone={v.zone} />
            {v.acct.hf > GAUGE_CAP && (
              <p className="mt-2 text-center text-sm text-slate">
                Gauge capped at 2.0 — the real health factor is {v.hfDisplay}.
              </p>
            )}

            {/* The tripwire — the exact liquidation price is the hero number */}
            <div className="mt-8 rounded-2xl border border-hairline bg-porcelain p-6">
              <p className="text-sm font-semibold text-slate">Exact liquidation price</p>
              {v.acct.hf > 0n ? (
                <>
                  <p className="mt-1 font-display text-4xl tracking-tight text-ink sm:text-5xl">
                    ${fixed(v.liquidationPrice8, 8)}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
                    The oracle price at which anyone may call{" "}
                    <span className="font-mono">liquidate()</span> on this position. The
                    watcher pages at 1.3 (warning) and 1.1 (critical) — before the chain
                    gets a vote.
                  </p>
                  <LiquidationFuse
                    priceNow8={v.acct.price8}
                    liqPrice8={v.liquidationPrice8}
                    cushionBps={v.cushionBps}
                  />
                </>
              ) : (
                <>
                  <p className="mt-1 font-display text-4xl tracking-tight text-ink sm:text-5xl">
                    Any price
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
                    Collateral is gone while debt remains, so this position is liquidatable
                    right now — at any price.
                  </p>
                </>
              )}
            </div>

            <div className="mt-8">
              <StatStrip
                stats={[
                  {
                    label: "Health factor",
                    value: Number(v.acct.hf) / 1e18,
                    format: (n) => n.toFixed(4),
                  },
                  {
                    label: "Collateral",
                    value: Number(v.acct.collateralUsd8) / 1e8,
                    format: (n) => `$${n.toFixed(4)}`,
                  },
                  {
                    label: "Debt",
                    value: Number(v.acct.debtUsd8) / 1e8,
                    format: (n) => `$${n.toFixed(4)}`,
                  },
                  {
                    label: "Price cushion",
                    value: Number(v.cushionBps) / 100,
                    format: (n) => `${n.toFixed(1)}%`,
                  },
                ]}
              />
            </div>

            {/* The escape plan — two designed ways out, each with its resulting HF */}
            <div className="mt-8">
              <p className="text-sm font-semibold text-slate">
                {v.danger ? "Concrete action — the escape plan" : "The escape plan — standing by"}
              </p>
              <h4 className="mt-1 font-display text-2xl tracking-tight text-ink sm:text-3xl">
                Two ways out
              </h4>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink">
                {v.danger
                  ? "Pick one. Each path provably restores the health factor to 1.5 — the same two numbers the Telegram watcher fires with."
                  : "Already at HF ≥ 1.5, so both paths read zero. If the price falls, the concrete numbers appear here."}
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-hairline bg-white p-6">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate">
                    <ArrowDownToLine size={16} className="text-accent" aria-hidden />
                    Way 1 · Repay debt
                  </p>
                  <p className="mt-3 font-display text-4xl tracking-tight text-ink">
                    ${fixed(v.repayUsd8, 8)}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate">
                    {v.danger ? (
                      <>
                        Debt falls to{" "}
                        <span className="font-mono text-ink">
                          ${fixed(v.acct.debtUsd8 - v.repayUsd8, 8)}
                        </span>{" "}
                        → health factor{" "}
                        <span className="font-mono text-ink">{hfDisplayOf(v.hfAfterRepay)}</span>
                      </>
                    ) : (
                      <>Nothing to repay — the debt is already at the 1.5 target.</>
                    )}
                  </p>
                </div>
                <div className="rounded-2xl border border-hairline bg-white p-6">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate">
                    <ArrowUpFromLine size={16} className="text-accent" aria-hidden />
                    Way 2 · Add PHRS collateral
                  </p>
                  <p className="mt-3 font-display text-4xl tracking-tight text-ink">
                    {fixed(v.addPhrsWei, 18, 6)} <span className="text-2xl text-slate">PHRS</span>
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate">
                    {v.danger ? (
                      <>
                        Collateral rises to{" "}
                        <span className="font-mono text-ink">
                          ${fixed(v.acct.collateralUsd8 + v.addUsd8, 8)}
                        </span>{" "}
                        → health factor{" "}
                        <span className="font-mono text-ink">{hfDisplayOf(v.hfAfterTopup)}</span>
                      </>
                    ) : (
                      <>Nothing to add — the collateral already covers the 1.5 target.</>
                    )}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate">
                Repay = debt − collateral·8/15 · Add = debt·15/8 − collateral — the
                watcher&apos;s exact restore-to-1.5 formulas, computed from this live read.
              </p>
            </div>
          </ResultCard>

          <p className="mt-4 text-sm leading-relaxed text-slate">
            Every number above comes from a single <span className="font-mono">getUserAccountData()</span>{" "}
            eth_call against MiniLend — the same call the Telegram watcher uses. This page never
            asks for private keys. What the keeper can&apos;t see: positions on other pools —
            this verdict covers MiniLend on Atlantic only.
          </p>
        </section>
      )}
    </div>
  );
}
