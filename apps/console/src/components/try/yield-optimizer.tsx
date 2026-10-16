/**
 * T15 · Yield Optimizer — "Net math, not APY theater."
 *
 * Tier A surface: reads the two builder-deployed OctopusVault contracts on
 * Atlantic (Kelp + Kraken) plus the live gas price with plain eth_call /
 * eth_gasPrice — no wallet, no signature, costs nothing. Re-runs the
 * optimizer's actual decision rule live:
 *   net(H) = runway-capped gross − entry fee − exit fee(H) − gas
 * against an honest stay-put (0%) baseline, across all 3 holding horizons
 * for a stake size the visitor picks. The raw-rate ranking (Kraken's 2.5×)
 * loses to the runway cap at long horizons and to friction at short ones —
 * the winner is computed from live chain state, not from a screenshot of a
 * past run.
 *
 * Presentation (FLAGSHIP op): 01 Configure → 02 Run → 03 The Arena.
 * The 03 act is a head-to-head tournament: the two vaults staged as
 * contenders across three horizon rounds, the raw-rate favorite losing to
 * the runway cap and to friction, the net(H) ledger visible per round.
 * The net(H) math below is EXACTLY the pre-SHOWTIME math — only the
 * presentation changed.
 *
 * Honesty label (stated on the page): testnet mechanics demonstration —
 * rewards are valueless testnet PHRS, never real yield.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Check, CircleX, Fuel, Layers, Swords, Trophy } from "lucide-react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  rpcCall,
  useAtlanticRead,
} from "../../hooks/useAtlantic";
import {
  ErrorState,
  ProgressLoader,
  ResultCard,
  StatStrip,
  type Stat,
} from "../ui";

// Vaults from tasks/t15-yield-optimizer/evidence.json (deploys are on-chain, verified)
const KELP = "0xe3212234B17A90cCBC36b0B44845394b62838b08";
const KRAKEN = "0xDC3D4a3f47BB479692239ECC362a16CE3485B283";

// Proof txs (evidence.json) — every number on this page is checkable on the explorer.
const PROOF = {
  kelpDeploy:
    "0x91c13f9cb3e4df65c7d7b23218bb04241ee0cc66a8b0180a16db617b1240feb9",
  krakenDeploy:
    "0x1d01194b335186295860624f6f94f6d6af19c856a9ffcd29d009deaa2601edbd",
  // 141 blocks × 1e13 wei, exact to the wei — the math on screen is the math on chain.
  kelpClaim:
    "0x6452e916d88b5eb7ace2513f0cc49d61df927bfb342344e22f8565f198ea44e2",
} as const;

const SEL = {
  rewardPerBlock: "0x8ae39cac", // rewardPerBlock()
  entryFeeBps: "0x578334ee", // entryFeeBps()
  exitFeeBps: "0x57b17a52", // exitFeeBps()
  minHoldBlocks: "0x13ea58db", // minHoldBlocks()
  totalStaked: "0x817b1cd2", // totalStaked()
  rewardPool: "0x66666aa9", // rewardPool()
  runwayBlocks: "0x2e5939f1", // runwayBlocks()
} as const;

// Measured gas for a full stake → claim → withdraw round-trip, per vault, from
// the live run (evidence.json). Honest constants: REAL measured values, priced
// at the LIVE gas price read below — never assumed.
const MEASURED_GAS: Record<string, bigint> = {
  Kelp: 102375n + 89777n + 53605n,
  Kraken: 105175n + 89777n + 53980n,
};

interface VaultLive {
  address: string;
  name: string;
  rewardPerBlockWei: bigint;
  entryFeeBps: bigint;
  exitFeeBps: bigint;
  minHoldBlocks: bigint;
  totalStakedWei: bigint;
  rewardPoolWei: bigint;
  runwayBlocks: bigint;
  gasTotal: bigint;
}

interface LiveState {
  vaults: VaultLive[];
  gasPriceWei: bigint;
}

async function ethCallUint(address: string, data: string): Promise<bigint> {
  const hex = (await rpcCall("eth_call", [{ to: address, data }, "latest"])) as string;
  return BigInt(hex);
}

async function readVault(address: string, name: string): Promise<VaultLive> {
  const [rewardPerBlockWei, entryFeeBps, exitFeeBps, minHoldBlocks, totalStakedWei, rewardPoolWei, runwayBlocks] =
    await Promise.all(
      (
        [
          SEL.rewardPerBlock,
          SEL.entryFeeBps,
          SEL.exitFeeBps,
          SEL.minHoldBlocks,
          SEL.totalStaked,
          SEL.rewardPool,
          SEL.runwayBlocks,
        ] as const
      ).map((sel) => ethCallUint(address, sel))
    );
  return {
    address,
    name,
    rewardPerBlockWei,
    entryFeeBps,
    exitFeeBps,
    minHoldBlocks,
    totalStakedWei,
    rewardPoolWei,
    runwayBlocks,
    gasTotal: MEASURED_GAS[name] ?? 250000n,
  };
}

/**
 * Progress steps, one per REAL async call. No timer steps, no "computing"
 * step — net(H) is computed synchronously once the reads resolve.
 */
const RUN_STEPS = [
  "Reading Kelp vault rate card",
  "Reading Kraken vault rate card",
  "Reading live gas price",
];

async function readLive(onStep?: (i: number) => void): Promise<LiveState> {
  const step = (i: number) => onStep?.(i);
  step(0);
  const kelp = await readVault(KELP, "Kelp");
  step(1);
  const kraken = await readVault(KRAKEN, "Kraken");
  step(2);
  const gasPriceHex = (await rpcCall("eth_gasPrice", [])) as string;
  step(3);
  return { vaults: [kelp, kraken], gasPriceWei: BigInt(gasPriceHex) };
}

/** Format wei as a trimmed PHRS string. */
function weiPhrs(wei: bigint, dp = 6): string {
  const base = 10n ** 18n;
  const int = wei / base;
  const frac = (wei % base).toString().padStart(18, "0").slice(0, dp).replace(/0+$/, "");
  return frac ? `${int.toString()}.${frac}` : int.toString();
}

/** Signed net figure: "+0.001542" / "-0.000387" / "+0". */
function fmtNet(wei: bigint, dp = 6): string {
  if (wei < 0n) return `-${weiPhrs(-wei, dp)}`;
  return `+${weiPhrs(wei, dp)}`;
}

/** bps → "0.5%" / "1%" / "0%" (integer division would print 50bps as "0%"). */
function fmtBps(bps: bigint): string {
  const whole = bps / 100n;
  const rem = bps % 100n;
  if (rem === 0n) return `${whole.toString()}%`;
  return `${whole.toString()}.${rem.toString().padStart(2, "0").replace(/0+$/, "")}%`;
}

function fmtGwei(wei: bigint): string {
  const g = Number(wei) / 1e9;
  if (g >= 100) return g.toFixed(0);
  if (g >= 10) return g.toFixed(1);
  return g.toFixed(2);
}

/** num/den as a percent with 1 decimal. */
function fmtShare(num: bigint, den: bigint): string {
  if (den <= 0n) return "100.0";
  return (Number((num * 1000n) / den) / 10).toFixed(1);
}

const PRINCIPALS = [0.01, 0.02, 0.05] as const;
const HORIZONS = [100, 400, 1000] as const;

interface NetRow {
  v: VaultLive;
  entryFee: bigint;
  exitFee: bigint;
  gasCost: bigint;
  grossRaw: bigint;
  capped: bigint;
  netGain: bigint;
  sharePct: string;
}

/**
 * The optimizer's decision rule, factored per horizon — byte-identical math
 * to the pre-SHOWTIME single-horizon version.
 */
function computeNetRow(
  v: VaultLive,
  gasPriceWei: bigint,
  horizon: number,
  principalWei: bigint
): NetRow {
  const entryFee = (principalWei * v.entryFeeBps) / 10000n;
  const netStake = principalWei - entryFee;
  const denom = v.totalStakedWei + netStake;
  // Marginal pro-rata share, computed in integer wei like the contract does.
  const grossRaw = denom > 0n ? (v.rewardPerBlockWei * BigInt(horizon) * netStake) / denom : 0n;
  // Runway cap: the vault can never pay more than its funded pool.
  const capped = grossRaw > v.rewardPoolWei ? v.rewardPoolWei : grossRaw;
  const exitFee = BigInt(horizon) < v.minHoldBlocks ? (netStake * v.exitFeeBps) / 10000n : 0n;
  const gasCost = v.gasTotal * gasPriceWei;
  const netGain = capped - entryFee - exitFee - gasCost;
  return { v, entryFee, exitFee, gasCost, grossRaw, capped, netGain, sharePct: fmtShare(netStake, denom) };
}

interface HorizonResult {
  horizon: number;
  rows: NetRow[];
  naive: NetRow;
  winner: NetRow;
  stayPutWins: boolean;
}

interface Verdict {
  horizons: HorizonResult[];
  bestRow: NetRow;
  bestHorizon: HorizonResult;
  gasGwei: string;
  poolsEmpty: boolean;
  rateRatio: string;
}

/**
 * THE UPSET, named. The tournament verdict card's headline is the sentence a
 * human would say out loud: the raw-rate favorite loses to the runway cap
 * (or to friction), and net math crowns the real winner. All inputs are the
 * live-computed verdict — nothing hardcoded.
 */
function tournamentVerdict(v: Verdict): {
  headline: ReactNode;
  subline: ReactNode;
  positive: boolean;
  favoriteLosesToCap: boolean;
} {
  const hz = v.bestHorizon;
  const w = v.bestRow;
  if (hz.stayPutWins) {
    return {
      headline: "Stay put.",
      positive: false,
      favoriteLosesToCap: false,
      subline: (
        <>
          <span className="font-semibold text-ink">
            Every venue nets negative at every horizon.
          </span>{" "}
          A full stake → claim → withdraw round-trip costs real gas at today&rsquo;s {v.gasGwei} gwei,
          and {hz.naive.v.name}&rsquo;s {v.rateRatio}× headline rate can&rsquo;t clear it. Its pool only
          funds {hz.naive.v.runwayBlocks.toString()} more blocks anyway — the raw APY is theater twice
          over. This is the optimizer&rsquo;s honest default, computed from live chain state.
        </>
      ),
    };
  }
  const naiveLost = hz.naive.v.address !== w.v.address;
  if (naiveLost) {
    return {
      headline: <>The {v.rateRatio}× favorite loses.</>,
      positive: w.netGain > 0n,
      favoriteLosesToCap: true,
      subline: (
        <>
          <span className="font-semibold text-ink">
            {hz.naive.v.name}&rsquo;s raw rate is {v.rateRatio}× {w.v.name}&rsquo;s
          </span>{" "}
          — but its reward pool only funds {hz.naive.v.runwayBlocks.toString()} more blocks, so the
          runway cap ends its run. Net math crowns{" "}
          <span className="font-semibold text-ink">
            {w.v.name} at {hz.horizon} blocks: {fmtNet(w.netGain)} PHRS
          </span>{" "}
          after entry/exit fees and gas.
        </>
      ),
    };
  }
  return {
    headline: (
      <>
        {w.v.name} wins at {hz.horizon} blocks.
      </>
    ),
    positive: w.netGain > 0n,
    favoriteLosesToCap: false,
    subline: (
      <>
        <span className="font-semibold text-ink">
          {w.v.name}: net {fmtNet(w.netGain)} PHRS
        </span>{" "}
        after entry/exit fees and gas. The raw APY ranking agrees here — but the cap still bounds the
        upside: the pool only funds {w.v.runwayBlocks.toString()} more blocks, so the gross is capped
        at what the vault actually holds, never projected.
      </>
    ),
  };
}

/**
 * One contender's panel inside an arena round: the net figure as the
 * headline, the compact net(H) ledger, and the one-line reason it won or
 * lost the round. Every number comes from computeNetRow — untouched math.
 */
function RoundPanel({
  row,
  winner,
  stayPutWins,
  gasGwei,
}: {
  row: NetRow;
  winner: boolean;
  stayPutWins: boolean;
  gasGwei: string;
}) {
  const capCut = row.grossRaw - row.capped;
  const wonDespiteCap = winner && !stayPutWins && capCut > 0n;
  const lostToCap = !winner && !stayPutWins && capCut > 0n;
  const lostToFriction = !winner && !stayPutWins && !lostToCap && row.netGain <= 0n;
  return (
    <div
      className={`rounded-xl border p-4 ${
        winner && !stayPutWins
          ? "border-accent bg-white shadow-sm"
          : "border-hairline bg-porcelain/70"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">{row.v.name}</p>
        {winner && !stayPutWins && (
          <span className="chip chip-pass">
            <Trophy size={12} aria-hidden />
            Wins
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-[11px] text-slate">
        {weiPhrs(row.v.rewardPerBlockWei, 8)} PHRS/block
      </p>
      <p className="mt-2 font-mono text-2xl tracking-tight text-ink">
        {fmtNet(row.netGain)}{" "}
        <span className="font-sans text-sm font-normal text-slate">PHRS net</span>
      </p>
      <dl className="mt-3 space-y-1.5 border-t border-hairline pt-3 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-slate">Gross, raw</dt>
          <dd className="font-mono text-ink">{weiPhrs(row.grossRaw)}</dd>
        </div>
        {capCut > 0n && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="font-semibold text-fail">Runway cap takes</dt>
            <dd className="font-mono font-semibold text-fail">−{weiPhrs(capCut)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-slate">− Entry fee</dt>
          <dd className="font-mono text-ink">{weiPhrs(row.entryFee)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-slate">− Exit fee</dt>
          <dd className="font-mono text-ink">
            {row.exitFee > 0n ? weiPhrs(row.exitFee) : "waived"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-slate">− Gas, round-trip</dt>
          <dd className="font-mono text-ink">{weiPhrs(row.gasCost)}</dd>
        </div>
      </dl>
      <p className="mt-3 flex items-start gap-1.5 border-t border-hairline pt-3 text-sm leading-relaxed">
        {stayPutWins ? (
          <>
            <CircleX size={14} className="mt-0.5 shrink-0 text-fail" aria-hidden />
            <span className="text-slate">
              Nets negative — the round-trip alone costs {weiPhrs(row.gasCost)} PHRS in gas at{" "}
              {gasGwei} gwei.
            </span>
          </>
        ) : wonDespiteCap ? (
          <>
            <Check size={14} className="mt-0.5 shrink-0 text-pass" aria-hidden />
            <span className="text-ink">
              Wins this round — even the runway cap couldn&rsquo;t stop it.
            </span>
          </>
        ) : winner ? (
          <>
            <Check size={14} className="mt-0.5 shrink-0 text-pass" aria-hidden />
            <span className="text-ink">
              Wins this round — clears entry/exit fees and the round-trip gas.
            </span>
          </>
        ) : lostToCap ? (
          <>
            <CircleX size={14} className="mt-0.5 shrink-0 text-fail" aria-hidden />
            <span className="text-slate">
              Loses to the runway cap — the pool only funds {row.v.runwayBlocks.toString()} more
              blocks.
            </span>
          </>
        ) : lostToFriction ? (
          <>
            <CircleX size={14} className="mt-0.5 shrink-0 text-fail" aria-hidden />
            <span className="text-slate">Loses to friction — entry/exit fees and gas eat the gross.</span>
          </>
        ) : (
          <>
            <CircleX size={14} className="mt-0.5 shrink-0 text-fail" aria-hidden />
            <span className="text-slate">Loses on rate — fewer rewards per block than the winner.</span>
          </>
        )}
      </p>
    </div>
  );
}

export default function TryYieldOptimizer({ lamp }: { lamp: Lamp }) {
  void lamp; // page shell renders the name — the module doesn't need it
  const [principal, setPrincipal] = useState<number>(0.02);
  const [step, setStep] = useState(0);
  const [selectedHorizon, setSelectedHorizon] = useState<number | null>(null);

  const readLiveCb = useCallback(() => readLive(setStep), []);
  const { data, loading, error, refetch } = useAtlanticRead(readLiveCb, ["yield-optimizer-v3"]);

  const verdict: Verdict | null = useMemo(() => {
    if (!data) return null;
    const principalWei = BigInt(Math.round(principal * 1e18));
    const horizons: HorizonResult[] = HORIZONS.map((horizon) => {
      const rows = data.vaults.map((v) => computeNetRow(v, data.gasPriceWei, horizon, principalWei));
      const naive = rows.reduce((a, b) => (b.v.rewardPerBlockWei > a.v.rewardPerBlockWei ? b : a));
      const winner = rows.reduce((a, b) => (b.netGain > a.netGain ? b : a));
      const stayPutWins = winner.netGain <= 0n;
      return { horizon, rows, naive, winner, stayPutWins };
    });
    // The global hero: the single (horizon, venue) pair with the highest net.
    let bestHorizon = horizons[0];
    let bestRow = horizons[0].winner;
    for (const hz of horizons) {
      if (hz.winner.netGain > bestRow.netGain) {
        bestHorizon = hz;
        bestRow = hz.winner;
      }
    }
    const other = bestHorizon.rows.find((r) => r !== bestHorizon.naive) ?? bestHorizon.rows[0];
    const rateRatio =
      Number(bestHorizon.naive.v.rewardPerBlockWei) / Math.max(1, Number(other.v.rewardPerBlockWei));
    const poolsEmpty = data.vaults.every((v) => v.totalStakedWei === 0n);
    return {
      horizons,
      bestRow,
      bestHorizon,
      gasGwei: fmtGwei(data.gasPriceWei),
      poolsEmpty,
      rateRatio: rateRatio.toFixed(1),
    };
  }, [data, principal]);

  const heroHorizon = verdict?.bestHorizon ?? null;
  const activeHorizon = selectedHorizon ?? heroHorizon?.horizon ?? HORIZONS[2];

  const startRun = () => {
    setStep(0);
    refetch();
  };

  const narrative = (hz: HorizonResult) => {
    if (hz.stayPutWins) {
      return (
        <>
          <span className="font-semibold text-ink">
            Stay put at {hz.horizon} blocks.
          </span>{" "}
          Every venue nets negative: a full stake → claim → withdraw round-trip
          costs real gas at today&rsquo;s {verdict?.gasGwei} gwei, and{" "}
          {hz.naive.v.name}&rsquo;s {verdict?.rateRatio}× headline rate
          can&rsquo;t clear it. Its pool only funds{" "}
          {hz.naive.v.runwayBlocks.toString()} more blocks anyway — the raw APY
          is theater twice over. This is the optimizer&rsquo;s honest default, computed
          from live chain state.
        </>
      );
    }
    return (
      <>
        <span className="font-semibold text-ink">
          {hz.winner.v.name} wins at {hz.horizon} blocks: net{" "}
          {fmtNet(hz.winner.netGain)} PHRS
        </span>{" "}
        after entry/exit fees and gas.{" "}
        {hz.naive.v.address !== hz.winner.v.address ? (
          <>
            The naive APY ranking crowns {hz.naive.v.name} (
            {verdict?.rateRatio}× the rate) — but its reward pool only
            funds {hz.naive.v.runwayBlocks.toString()} more blocks, so the
            runway cap flips the ranking. This is the optimizer&rsquo;s actual
            decision rule, computed from live chain state.
          </>
        ) : (
          <>
            The raw APY ranking agrees here — but the cap still bounds the upside:
            the pool only funds {hz.winner.v.runwayBlocks.toString()} more
            blocks, so the gross is capped at what the vault actually holds, never
            projected.
          </>
        )}
      </>
    );
  };

  const tv = verdict ? tournamentVerdict(verdict) : null;
  const favoriteLoses =
    !!verdict &&
    (verdict.bestHorizon.stayPutWins ||
      verdict.bestHorizon.naive.v.address !== verdict.bestHorizon.winner.v.address);
  const stats: Stat[] | null =
    verdict && data
      ? [
          {
            label: "Live gas price",
            value: Number(data.gasPriceWei) / 1e9,
            format: (n) => n.toFixed(2),
            suffix: "gwei",
            icon: <Fuel size={14} aria-hidden />,
          },
          {
            label: "Raw-rate favorite",
            value: Number(verdict.rateRatio),
            format: (n) => `${n.toFixed(1)}×`,
            suffix: `${verdict.bestHorizon.naive.v.name} — ${favoriteLoses ? "loses" : "holds"}`,
            icon: <Swords size={14} aria-hidden />,
          },
          {
            label: verdict.bestHorizon.stayPutWins
              ? "Best net — stay put"
              : `Best net — ${verdict.bestRow.v.name} · ${verdict.bestHorizon.horizon} blocks`,
            value: verdict.bestHorizon.stayPutWins ? 0 : Number(verdict.bestRow.netGain) / 1e18,
            format: (n) =>
              n === 0 ? "0" : `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(6)}`,
            suffix: "PHRS",
            icon: <Trophy size={14} aria-hidden />,
          },
          {
            label: "Rounds priced live",
            value: data.vaults.length * HORIZONS.length,
            format: (n) => Math.round(n).toString(),
            icon: <Layers size={14} aria-hidden />,
          },
        ]
      : null;

  return (
    <div className="space-y-6">
      {/* Header — identity: what the skill does, its on-chain proof. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-slate">Tier A · live reads, no wallet</p>
          <h3 className="mt-1 font-display text-3xl tracking-tight text-ink">
            Yield Optimizer
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink sm:text-base">
            Two vaults enter, net math decides. This module reads both live
            vault rate cards off Atlantic and prices them with the
            optimizer&rsquo;s real decision rule — runway-capped gross, minus
            entry and exit fees, minus gas — against an honest stay-put
            baseline, across three holding horizons. The raw rate lies; the
            net doesn&rsquo;t. Watch the high-APY favorite lose to fees and caps.
          </p>
        </div>
        <button
          className="btn-outline inline-flex min-h-[44px] items-center"
          onClick={startRun}
          disabled={loading}
        >
          {loading ? "Reading…" : data ? "Re-run read" : "Run the read"}
        </button>
      </div>

      {/* 01 · Configure */}
      <section aria-label="01 Configure">
        <p className="text-sm font-semibold text-slate">01 · Configure</p>
        <div className="mt-2 rounded-2xl border border-hairline bg-porcelain p-5 sm:p-6">
          {/* The contenders, staged before the run — names and addresses only,
              no numbers until the live read lands. */}
          <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-xl border border-hairline bg-white p-4">
              <p className="font-semibold text-ink">Kelp</p>
              <p className="mt-1 truncate font-mono text-xs text-slate" title={KELP}>
                {KELP}
              </p>
              <p className="mt-2 text-sm text-slate">Rate card read live when you run.</p>
            </div>
            <div className="flex items-center justify-center" aria-hidden>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-white text-[11px] font-bold text-slate">
                VS
              </span>
            </div>
            <div className="rounded-xl border border-hairline bg-white p-4">
              <p className="font-semibold text-ink">Kraken</p>
              <p className="mt-1 truncate font-mono text-xs text-slate" title={KRAKEN}>
                {KRAKEN}
              </p>
              <p className="mt-2 text-sm text-slate">Rate card read live when you run.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
            <div>
              <p className="text-sm font-semibold text-ink">Stake size</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Stake size">
                {PRINCIPALS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrincipal(p)}
                    aria-pressed={principal === p}
                    className={`${principal === p ? "btn-primary" : "btn-outline"} !min-h-[44px]`}
                  >
                    {p} PHRS
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-[240px] flex-1">
              <p className="text-sm font-semibold text-ink">Holding horizons</p>
              <p className="mt-2 text-sm leading-relaxed text-slate">
                All three horizons — {HORIZONS.join(" / ")} blocks — are priced
                every run; the module crowns the single best venue × horizon
                pair. Nothing to pick, nothing hidden.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary mt-5 inline-flex min-h-[44px] items-center"
            onClick={startRun}
            disabled={loading}
          >
            {loading ? "Reading live state…" : data ? "Re-run live read" : "Run the live read"}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-slate">
            Reads 7 fields per vault plus the live gas price from the Atlantic
            RPC. No wallet, no signature, costs nothing.
          </p>
        </div>
      </section>

      {/* 02 · Run — honest progress, one step per real call. */}
      {loading && (
        <section aria-label="02 Run">
          <p className="text-sm font-semibold text-slate">02 · Run</p>
          <div className="mt-2">
            <ProgressLoader
              steps={RUN_STEPS}
              current={step}
              title="Pricing both vaults against live chain state"
            />
          </div>
        </section>
      )}

      {/* Error — loud, plain-language, retryable. */}
      {error && !loading && (
        <ErrorState
          title="The live read failed"
          message={error}
          hint="This usually means the Atlantic RPC was briefly unreachable. Your stake size is kept — just run it again."
          retryLabel="Retry the read"
          onRetry={startRun}
        />
      )}

      {/* 03 · Result — the climax. */}
      {data && verdict && !loading && (
        <>
          <section aria-label="03 Result">
            <p className="text-sm font-semibold text-slate">03 · Result</p>
            <div className="mt-2">
              <ResultCard
                eyebrow={`Tournament verdict — 2 vaults × 3 horizons · ${verdict.bestHorizon.horizon} blocks`}
                headline={tv?.headline}
                subline={tv?.subline}
                status={tv && tv.positive ? "pass" : "neutral"}
                rows={[
                  { label: "Live gas price", value: `${verdict.gasGwei} gwei` },
                  { label: "Stake priced", value: `${principal} PHRS` },
                  {
                    label: `${verdict.bestRow.v.name} entry fee`,
                    value: `${weiPhrs(verdict.bestRow.entryFee)} PHRS (${fmtBps(verdict.bestRow.v.entryFeeBps)})`,
                  },
                  {
                    label: `${verdict.bestRow.v.name} exit fee`,
                    value:
                      verdict.bestRow.exitFee > 0n
                        ? `${weiPhrs(verdict.bestRow.exitFee)} PHRS (below min hold)`
                        : "Waived — past min hold",
                  },
                  {
                    label: `${verdict.bestRow.v.name} gas, full round-trip`,
                    value: `${weiPhrs(verdict.bestRow.gasCost)} PHRS`,
                  },
                  ...(tv?.favoriteLosesToCap
                    ? [
                        {
                          label: "Why the favorite lost",
                          value: `Runway cap — ${verdict.bestHorizon.naive.v.name}'s pool funds only ${verdict.bestHorizon.naive.v.runwayBlocks.toString()} more blocks`,
                        },
                      ]
                    : []),
                ]}
                links={[
                  { label: "Kelp deploy on explorer", href: `${EXPLORER_TX}${PROOF.kelpDeploy}` },
                  { label: "Kraken deploy on explorer", href: `${EXPLORER_TX}${PROOF.krakenDeploy}` },
                  {
                    label: "Kelp claim — 141 blocks × 1e13, exact to the wei",
                    href: `${EXPLORER_TX}${PROOF.kelpClaim}`,
                  },
                ]}
              />
            </div>
          </section>

          {stats && <StatStrip stats={stats} />}

          {/* The rule — the thinking layer, net(H) shown as a structure. */}
          <section aria-label="The decision rule">
            <p className="text-sm font-semibold text-slate">The rule that decides every round</p>
            <div className="mt-2 rounded-2xl border border-hairline bg-white p-5 sm:p-6">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm text-ink sm:text-base">
                <span>net(H) =</span>
                <span className="rounded-md bg-porcelain px-2 py-0.5">runway-capped gross</span>
                <span aria-hidden>−</span>
                <span className="rounded-md bg-porcelain px-2 py-0.5">entry fee</span>
                <span aria-hidden>−</span>
                <span className="rounded-md bg-porcelain px-2 py-0.5">exit fee(H)</span>
                <span aria-hidden>−</span>
                <span className="rounded-md bg-porcelain px-2 py-0.5">gas</span>
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate">
                The gross is capped at the vault&rsquo;s funded reward pool — never projected. The exit
                fee applies only below the min hold. Gas is the measured live-run round-trip priced at
                the live gas price. All of it in integer wei, exactly like the contracts. The honest
                0% stay-put baseline costs nothing and is priced in every round.
              </p>
            </div>
          </section>

          {/* The arena — three rounds, head to head. Tap a round for its full ledger. */}
          <section aria-label="The arena">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-sm font-semibold text-slate">The arena — three rounds, head to head</p>
              <p className="text-sm text-slate">Tap a round for its full ledger.</p>
            </div>
            <div className="mt-2 space-y-4">
              {verdict.horizons.map((hz, i) => {
                const isActive = hz.horizon === activeHorizon;
                return (
                  <motion.button
                    key={hz.horizon}
                    type="button"
                    onClick={() => setSelectedHorizon(hz.horizon)}
                    aria-pressed={isActive}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.08, ease: "easeOut" }}
                    className={`block w-full rounded-2xl border bg-white p-5 text-left transition-colors sm:p-6 ${
                      isActive ? "border-accent shadow-md" : "border-hairline hover:border-slate/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate">
                        <Swords size={14} aria-hidden className="text-accent" />
                        Round {i + 1} · {hz.horizon} blocks
                      </p>
                      {hz.stayPutWins ? (
                        <span className="chip chip-info">Stay put wins</span>
                      ) : (
                        <span className="chip chip-pass">
                          <Trophy size={12} aria-hidden />
                          {hz.winner.v.name} wins
                        </span>
                      )}
                    </div>
                    <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
                      <RoundPanel
                        row={hz.rows[0]}
                        winner={!hz.stayPutWins && hz.winner.v.address === hz.rows[0].v.address}
                        stayPutWins={hz.stayPutWins}
                        gasGwei={verdict.gasGwei}
                      />
                      <div className="flex items-center justify-center" aria-hidden>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-porcelain text-[11px] font-bold text-slate">
                          VS
                        </span>
                      </div>
                      <RoundPanel
                        row={hz.rows[1]}
                        winner={!hz.stayPutWins && hz.winner.v.address === hz.rows[1].v.address}
                        stayPutWins={hz.stayPutWins}
                        gasGwei={verdict.gasGwei}
                      />
                    </div>
                    {isActive && (
                      <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-accent">
                        <Check size={14} aria-hidden />
                        Full ledger below
                      </p>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* Full ledger for the selected round — the complete net(H) receipt. */}
          <section aria-label="Full ledger">
            <p className="text-sm font-semibold text-slate">Full ledger — the complete net(H) receipt</p>
            {(() => {
              const hz = verdict.horizons.find((h) => h.horizon === activeHorizon) ?? verdict.horizons[0];
              return (
                <div className="mt-2 rounded-2xl border border-hairline bg-white p-5 sm:p-6">
                  <p className="text-sm font-semibold text-ink">
                    Full breakdown — {hz.horizon} blocks
                  </p>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-hairline">
                    <table className="data-table tabular">
                      <thead>
                        <tr>
                          <th>Venue</th>
                          <th>Gross</th>
                          <th>Runway-capped</th>
                          <th>− Entry</th>
                          <th>− Exit</th>
                          <th>− Gas</th>
                          <th>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hz.rows.map((r) => {
                          const isBest = !hz.stayPutWins && hz.winner.v.address === r.v.address;
                          return (
                            <tr key={r.v.address}>
                              <td className="font-semibold text-ink">{r.v.name}</td>
                              <td>{weiPhrs(r.grossRaw)} PHRS</td>
                              <td>{weiPhrs(r.capped)} PHRS</td>
                              <td>{weiPhrs(r.entryFee)} PHRS</td>
                              <td>{weiPhrs(r.exitFee)} PHRS</td>
                              <td>{weiPhrs(r.gasCost)} PHRS</td>
                              <td>
                                <span className={isBest ? "font-semibold text-ink" : ""}>
                                  {fmtNet(r.netGain)} PHRS
                                </span>
                                {isBest && <span className="chip chip-pass ml-2">Winner</span>}
                              </td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td className="font-semibold text-ink">Stay put</td>
                          <td colSpan={5} className="text-slate">
                            Wallet baseline — 0% yield, costs nothing
                          </td>
                          <td>
                            <span className={hz.stayPutWins ? "font-semibold text-ink" : ""}>
                              +0 PHRS
                            </span>
                            {hz.stayPutWins && <span className="chip chip-pass ml-2">Winner</span>}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink">
                    {narrative(hz)}
                  </p>
                  <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate">
                    Gas per venue = measured live-run txs (stake + claim + withdraw) ×
                    live gas price {verdict.gasGwei} gwei. Marginal share at {principal}{" "}
                    PHRS: {hz.rows.map((r) => `${r.v.name} ${r.sharePct}%`).join(" · ")}
                    {verdict.poolsEmpty
                      ? " — both pools are empty right now, so a new staker takes the whole reward stream; that share dilutes the moment anyone else stakes."
                      : " — share falls as total staked rises."}{" "}
                    Exit fee applies only below the min hold (
                    {hz.rows.map((r) => `${r.v.name} ${r.v.minHoldBlocks.toString()}`).join(", ")} blocks).
                  </p>
                </div>
              );
            })()}
          </section>

          {/* Live rate cards — the raw reads the verdict was priced from. */}
          <section aria-label="Live rate cards">
            <p className="text-sm font-semibold text-slate">Live rate cards, read at the latest block</p>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-hairline bg-white">
              <table className="data-table tabular">
                <thead>
                  <tr>
                    <th>Vault</th>
                    <th>Rate / block</th>
                    <th>Entry fee</th>
                    <th>Exit fee (early)</th>
                    <th>Min hold</th>
                    <th>Total staked</th>
                    <th>Reward pool</th>
                    <th>Runway</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vaults.map((v) => (
                    <tr key={v.address}>
                      <td>
                        <a
                          className="font-semibold text-accent hover:underline"
                          href={`${EXPLORER_ADDRESS}${v.address}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {v.name}
                        </a>
                        <p className="mt-0.5 font-mono text-[11px] text-slate">
                          {v.address.slice(0, 10)}…{v.address.slice(-8)}
                        </p>
                      </td>
                      <td>{weiPhrs(v.rewardPerBlockWei, 8)} PHRS</td>
                      <td>{fmtBps(v.entryFeeBps)}</td>
                      <td>{fmtBps(v.exitFeeBps)}</td>
                      <td>{v.minHoldBlocks.toString()} blocks</td>
                      <td>{weiPhrs(v.totalStakedWei)} PHRS</td>
                      <td>{weiPhrs(v.rewardPoolWei)} PHRS</td>
                      <td>{v.runwayBlocks.toString()} blocks</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate">
              Immutable on-chain rate cards — the same numbers the optimizer priced. Hit
              Re-run to re-read.
            </p>
          </section>
        </>
      )}

      <p className="text-xs leading-relaxed text-slate">
        Honesty label: testnet mechanics demonstration — rewards are valueless testnet PHRS,
        never real yield. Discovery note: the Atlantic scan found zero third-party yield
        venues, so these two builder-deployed vaults are the entire live venue set.
      </p>
    </div>
  );
}
