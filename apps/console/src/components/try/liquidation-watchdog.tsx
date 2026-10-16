/**
 * T16 · Liquidation Watchdog — "Your position, live risk".
 *
 * Tier A surface: paste any address → the watcher's verdict on it. One free
 * eth_call to MiniLend.getUserAccountData on Atlantic (no wallet, no keys)
 * returns collateral, debt, oracle price and the on-chain health factor; the
 * module renders the verdict as a precision risk gauge, the exact oracle
 * price that would trigger liquidation, the price cushion, and the concrete
 * repay-or-top-up amounts that restore HF ≥ 1.5 — the same math the Telegram
 * watcher fires with.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  isValidAddress,
  rpcCall,
} from "../../hooks/useAtlantic";
import {
  ResultCard,
  ProgressLoader,
  EmptyState,
  ErrorState,
  StatStrip,
} from "../ui";

// MiniLend from tasks/t16-liquidation-watchdog/evidence.json (deployed, verified on-chain)
const MINILEND = "0x108989a165a446e1d89CEe3C9936344ea7ADbf4a";
// The dust position from the live run — a working demo address for visitors.
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

type RiskZone = "none" | "healthy" | "warning" | "critical" | "liquidatable";

function zoneOf(hf: bigint, hasDebt: boolean): RiskZone {
  if (!hasDebt) return "none"; // debt-free: HF is infinite, nothing to liquidate
  if (hf < HF_ONE) return "liquidatable";
  if (hf < CRIT_HF) return "critical";
  if (hf < WARN_HF) return "warning";
  return "healthy";
}

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

/**
 * Run phases — one entry per REAL sequential phase of the read. Step 1 is the
 * single eth_call; steps 2–3 are the real compute phases on the returned
 * data (decode the five words incl. the contract-computed health factor, then
 * derive liquidation price / cushion / concrete actions). The loader advances
 * only when a phase's real work completes — never on a timer.
 */
const STEPS = ["Reading position…", "Computing health factor…", "Deriving liquidation price…"];

// ---------------------------------------------------------------------------
// Risk gauge — a precision instrument. Semicircle 0 → 2.0 HF with zone arcs,
// tick marks, threshold markers and a spring-driven needle. The needle
// animates only when a real health-factor value arrives or changes.
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

function RiskGauge({ hf }: { hf: bigint }) {
  const reduce = useReducedMotion();
  const clamped = hf > GAUGE_CAP ? GAUGE_CAP : hf;
  // Integer math: degrees = 180 − 180·(hf / cap), two decimals.
  const targetAngle = 180 - Number((clamped * 18000n) / GAUGE_CAP) / 100;

  const angleMv = useMotionValue(180); // rest = far left (HF 0)
  const spring = useSpring(angleMv, reduce ? { stiffness: 1200, damping: 120 } : { stiffness: 55, damping: 13 });
  useEffect(() => {
    angleMv.set(targetAngle); // real value arrived → needle moves
  }, [targetAngle, angleMv]);
  const x2 = useTransform(spring, (a) => gaugePoint(a, NEEDLE_R)[0]);
  const y2 = useTransform(spring, (a) => gaugePoint(a, NEEDLE_R)[1]);

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
  const markers = [1.0, 1.1, 1.3].map((v) => {
    const deg = 180 - (v / 2) * 180;
    const [ix, iy] = gaugePoint(deg, 82);
    const [ox, oy] = gaugePoint(deg, GR);
    return <line key={v} x1={ix} y1={iy} x2={ox} y2={oy} stroke="#0B1533" strokeWidth={3} />;
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <svg viewBox="0 0 260 142" className="w-full" role="img" aria-label={`Risk gauge: health factor ${fixed(hf, 18, 4)} on a 0 to 2 dial`}>
        {GAUGE_ZONES.map((z) => (
          <path key={z.name} d={gaugeArc(z.from, z.to)} fill="none" stroke={z.color} strokeWidth={16} />
        ))}
        {ticks}
        {markers}
        <motion.line x1={GX} y1={GY} x2={x2} y2={y2} stroke="#0B1533" strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={GX} cy={GY} r={9} fill="#0B1533" />
        <circle cx={GX} cy={GY} r={3.5} fill="#ffffff" />
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {GAUGE_ZONES.map((z) => (
          <span key={z.name} className="inline-flex items-center gap-2 text-sm font-semibold text-slate">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: z.color }} aria-hidden />
            {z.name} · {z.range}
          </span>
        ))}
      </div>
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
  // Add-collateral (PHRS wei) to restore HF 1.5: collatUsd' = debt * 1.5 / 0.8 = debt * 15/8.
  const needCollUsd8 = (acct.debtUsd8 * TARGET_HF_NUM) / 8n;
  const addPhrsWei =
    hasDebt && acct.price8 > 0n && needCollUsd8 > acct.collateralUsd8
      ? ((needCollUsd8 - acct.collateralUsd8) * 10n ** 18n) / acct.price8
      : 0n;
  const hfDisplay =
    acct.hf === (1n << 256n) - 1n ? "∞" : fixed(acct.hf, 18, 4);
  return {
    acct, address, zone, hasDebt, hasPosition,
    liquidationPrice8, cushionBps, repayUsd8, addPhrsWei, hfDisplay,
    danger: zone === "warning" || zone === "critical" || zone === "liquidatable",
  };
}

type Phase = "idle" | "running" | "done" | "error";

export default function TryLiquidationWatchdog({ lamp }: { lamp: Lamp }) {
  void lamp; // page shell renders the name — the module doesn't need it
  const [input, setInput] = useState(DEMO_ACCOUNT);
  const [checked, setChecked] = useState(DEMO_ACCOUNT);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const autoRan = useRef(false);

  const valid = isValidAddress(input);
  const running = phase === "running";

  const run = useCallback(async (address: string) => {
    setPhase("running");
    setStep(0);
    setErrorMsg(null);
    try {
      const acct = await readAccount(address); // phase 1 — the real eth_call
      setStep(1);
      // phases 2–3 — real compute on the returned data (decode incl. the
      // contract-computed HF; derive liquidation price, cushion, actions)
      const v = buildVerdict(acct, address);
      setStep(STEPS.length);
      setChecked(address);
      setVerdict(v);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "The Atlantic RPC did not answer.");
      setPhase("error");
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

  return (
    <div className="space-y-6">
      {/* 01 · Configure */}
      <section aria-label="Configure">
        <p className="text-sm font-semibold text-slate">01 · Configure</p>
        <h3 className="mt-2 text-lg font-semibold text-ink">Your position, live risk</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink">
          Paste any address and get the watcher&apos;s verdict on it: collateral, debt, oracle
          price and the on-chain health factor — plus the exact price that would liquidate
          it and the concrete repay-or-top-up that restores HF ≥ 1.5. One free{" "}
          <span className="font-mono">eth_call</span>. No wallet, no keys.
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
      </section>

      {/* 02 · Run — only while real work is in flight */}
      {running && (
        <section aria-label="Reading position">
          <p className="mb-3 text-sm font-semibold text-slate">02 · Reading</p>
          <ProgressLoader steps={STEPS} current={step} title={checked} />
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
          <EmptyState
            title="Debt-free — nothing to liquidate"
            message={`This address holds $${fixed(v.acct.collateralUsd8, 8)} of collateral and owes nothing, so the on-chain health factor is infinite. The watcher only pages debt positions; this one would never trigger it.`}
            actionLabel="Try the demo position"
            onAction={onDemo}
          />
        </section>
      )}

      {showResult && v && (
        <section aria-label="Result">
          <p className="mb-3 text-sm font-semibold text-slate">03 · Verdict</p>
          <ResultCard
            eyebrow={`Risk verdict · ${v.address}`}
            headline={ZONE_VERDICT[v.zone as Exclude<RiskZone, "none">].headline}
            subline={
              <>
                Health factor <strong>{v.hfDisplay}</strong> — read live from MiniLend.{" "}
                {ZONE_VERDICT[v.zone as Exclude<RiskZone, "none">].blurb}
              </>
            }
            status={ZONE_VERDICT[v.zone as Exclude<RiskZone, "none">].status}
            copyValue={v.address}
            rows={[
              { label: "Oracle price", value: `$${fixed(v.acct.price8, 8)}` },
              { label: "Liquidation threshold", value: `${(Number(v.acct.thresholdBps) / 100).toFixed(0)}%` },
              { label: "Position", value: v.address },
            ]}
            links={[
              { label: "View MiniLend on the explorer", href: `${EXPLORER_ADDRESS}${MINILEND}` },
              { label: "View position on the explorer", href: `${EXPLORER_ADDRESS}${v.address}` },
            ]}
          >
            <RiskGauge hf={v.acct.hf} />
            {v.acct.hf > GAUGE_CAP && (
              <p className="mt-2 text-center text-sm text-slate">
                Gauge capped at 2.0 — the real health factor is {v.hfDisplay}.
              </p>
            )}

            {/* Exact liquidation price — the second-biggest number on the page */}
            <div className="mt-6 rounded-2xl border border-hairline bg-porcelain p-6">
              <p className="text-sm font-semibold text-slate">Exact liquidation price</p>
              {v.acct.hf > 0n ? (
                <>
                  <p className="mt-1 font-display text-4xl tracking-tight text-ink sm:text-5xl">
                    ${fixed(v.liquidationPrice8, 8)}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
                    Anyone may call <span className="font-mono">liquidate()</span> the moment the
                    oracle price falls to this level (currently ${fixed(v.acct.price8, 8)}). The
                    watcher alerts at 1.3 (warning) and 1.1 (critical) — before the chain gets
                    a vote.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 font-display text-4xl tracking-tight text-ink sm:text-5xl">
                    Any price
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
                    Collateral is gone while debt remains, so this position can be liquidated
                    at any price — right now.
                  </p>
                </>
              )}
            </div>

            <div className="mt-6">
              <StatStrip
                stats={[
                  {
                    label: "Price cushion",
                    value: Number(v.cushionBps) / 100,
                    format: (n) => `${n.toFixed(1)}%`,
                  },
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
                ]}
              />
            </div>

            {v.danger ? (
              <div className="mt-6 rounded-2xl border border-hairline bg-white p-6">
                <p className="text-sm font-semibold text-slate">Concrete action — restore health factor to 1.5</p>
                <p className="mt-2 text-base leading-relaxed text-ink">
                  Repay <strong>${fixed(v.repayUsd8, 8)}</strong> of debt,{" "}
                  <strong>or</strong> add{" "}
                  <strong>{(Number(v.addPhrsWei) / 1e18).toFixed(6)} PHRS</strong> collateral.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate">
                  The same two numbers the Telegram watcher fires with — computed from this
                  live read with the exact restore-to-target formula.
                </p>
              </div>
            ) : (
              <p className="mt-6 text-sm leading-relaxed text-ink">
                No action needed. If the price drops, the concrete repay-or-top-up numbers
                appear here.
              </p>
            )}
          </ResultCard>

          <p className="mt-4 text-sm leading-relaxed text-slate">
            All numbers come from a single <span className="font-mono">getUserAccountData()</span>{" "}
            eth_call against MiniLend — the same call the watcher uses. This page never sees
            or asks for private keys.
          </p>
        </section>
      )}
    </div>
  );
}
