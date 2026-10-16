/**
 * T28 Multi-Protocol Aggregator — Tier A (live reads, no wallet, costs nothing).
 *
 * "One view, every venue": the console reads all three real T28 venues on
 * Atlantic (two SimpleVaults + one SimpleLending) at one pinned block via
 * plain JSON-RPC, normalizes TVL / APYs / share price / utilization /
 * liquidity depth into ONE ranked board, and names the winner for a deposit
 * or borrow intent the visitor configures.
 *
 * A venue whose read fails — or whose address holds no bytecode — is marked
 * UNREACHABLE, never zero-filled. The eth_getCode gate below is the load-
 * bearing honesty check: an eth_call against a dead address returns 0x and
 * the venue would look alive with 0.00% APY.
 *
 * No execution happens on this page; the run command stays in the CLI
 * (panel at the bottom).
 *
 * Addresses copied character-for-character from
 * tasks/t28-multi-protocol-aggregator/evidence.json. Selectors are the
 * 4-byte function selectors of src/SimpleVault.sol and src/SimpleLending.sol
 * (all 11 verified live against Atlantic on 2026-10-16).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { ArrowDownRight, ShieldAlert, Trophy } from "lucide-react";
import type { Lamp } from "../../types";
import { EXPLORER_ADDRESS, rpcCall } from "../../hooks/useAtlantic";
import {
  EmptyState,
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
} from "../ui";
import type { FeedItem } from "../ui";

const WEI = 10n ** 18n;

/* Function selectors (cast sig on the two venue contracts). */
const SEL = {
  totalAssets: "0x01e1d114", // totalAssets()
  supplyApyBps: "0xa0592dad", // supplyApyBps()
  sharePrice: "0x87269729", // sharePrice()
  utilizationBps: "0x975e900e", // utilizationBps()
  borrowApyBps: "0x2301f13f", // borrowApyBps()
  availableLiquidity: "0x74375359", // availableLiquidity()
  totalSupplied: "0x630fd0ac", // totalSupplied()
} as const;

interface VenueDef {
  id: string;
  name: string;
  kind: "vault" | "lending";
  address: string;
  note: string;
}

const VENUES: VenueDef[] = [
  {
    id: "T28-VAULT-A",
    name: "MeridianVault",
    kind: "vault",
    address: "0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9",
    note: "2.5% target-APY vault",
  },
  {
    id: "T28-VAULT-B",
    name: "HalcyonVault",
    kind: "vault",
    address: "0x6F34a6f94f529Bf10313bA77cc34314389Dd204E",
    note: "5.2% target-APY vault",
  },
  {
    id: "T28-LEND",
    name: "TidepoolLending",
    kind: "lending",
    address: "0x95a16e1898B09CcE5e03765Baa55C8C112cb80C2",
    note: "utilization-rate lending pool",
  },
];

interface VenueQuote {
  def: VenueDef;
  ok: boolean;
  error?: string;
  supplyApyBps: number;
  borrowApyBps: number | null;
  tvlWei: bigint;
  liquidityWei: bigint;
  sharePriceWei: bigint | null;
  utilizationBps: number | null;
}

interface Snapshot {
  block: number;
  at: string;
  quotes: VenueQuote[];
}

function unreachable(def: VenueDef, error: string): VenueQuote {
  return {
    def,
    ok: false,
    error,
    supplyApyBps: 0,
    borrowApyBps: null,
    tvlWei: 0n,
    liquidityWei: 0n,
    sharePriceWei: null,
    utilizationBps: null,
  };
}

async function ethCall(to: string, data: string, block: string): Promise<bigint> {
  const hex = (await rpcCall("eth_call", [{ to, data }, block])) as string;
  if (typeof hex !== "string" || !hex.startsWith("0x")) {
    throw new Error(`unexpected eth_call result from ${to}`);
  }
  return BigInt(hex);
}

/**
 * The gate — DO NOT WEAKEN. Same semantics as aggregate.py's
 * venue_reachable: an address with no bytecode must be UNREACHABLE, because
 * an eth_call would return 0x and the venue would look alive with 0.00% APY.
 * Dead venues are NEVER zero-filled.
 */
async function gateVenue(def: VenueDef, block: string): Promise<VenueQuote | null> {
  const code = (await rpcCall("eth_getCode", [def.address, block])) as string;
  if (typeof code !== "string" || code === "0x" || code === "0x0") {
    return unreachable(def, "no bytecode at address (get_code empty)");
  }
  return null; // alive — proceed to the quote selectors
}

async function readVenue(def: VenueDef, block: string): Promise<VenueQuote> {
  const gated = await gateVenue(def, block);
  if (gated) return gated;
  try {
    if (def.kind === "vault") {
      const [totalAssets, supplyApyBps, sharePrice] = await Promise.all([
        ethCall(def.address, SEL.totalAssets, block),
        ethCall(def.address, SEL.supplyApyBps, block),
        ethCall(def.address, SEL.sharePrice, block),
      ]);
      return {
        def,
        ok: true,
        supplyApyBps: Number(supplyApyBps),
        borrowApyBps: null,
        tvlWei: totalAssets,
        liquidityWei: totalAssets,
        sharePriceWei: sharePrice,
        utilizationBps: null,
      };
    }
    const [totalSupplied, utilizationBps, borrowApyBps, supplyApyBps, availableLiquidity] =
      await Promise.all([
        ethCall(def.address, SEL.totalSupplied, block),
        ethCall(def.address, SEL.utilizationBps, block),
        ethCall(def.address, SEL.borrowApyBps, block),
        ethCall(def.address, SEL.supplyApyBps, block),
        ethCall(def.address, SEL.availableLiquidity, block),
      ]);
    return {
      def,
      ok: true,
      supplyApyBps: Number(supplyApyBps),
      borrowApyBps: Number(borrowApyBps),
      tvlWei: totalSupplied,
      liquidityWei: availableLiquidity,
      sharePriceWei: null,
      utilizationBps: Number(utilizationBps),
    };
  } catch (e) {
    /* A venue that fails is UNREACHABLE — never zero-filled. */
    return unreachable(def, e instanceof Error ? e.message : "read failed");
  }
}

/* One ProgressLoader entry per real async group. 1 block pin + 3 bytecode
   gates + 3 quote reads = 7 honest steps. The quotes inside a venue fire in
   parallel, so the venue read is one step, not eleven fake ones. */
const STEPS = [
  "Pinning the latest Atlantic block",
  "Gating MeridianVault — checking on-chain bytecode",
  "Reading MeridianVault — 3 quote selectors",
  "Gating HalcyonVault — checking on-chain bytecode",
  "Reading HalcyonVault — 3 quote selectors",
  "Gating TidepoolLending — checking on-chain bytecode",
  "Reading TidepoolLending — 5 quote selectors",
];

async function fetchSnapshotLive(onStep: (done: number) => void): Promise<Snapshot> {
  const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
  const block = parseInt(blockHex, 16);
  onStep(1);

  const quotes: VenueQuote[] = [];
  let step = 1;
  for (const def of VENUES) {
    const gated = await gateVenue(def, blockHex);
    step += 1;
    onStep(step); // gate complete
    if (gated) {
      quotes.push(gated);
      step += 1;
      onStep(step); // nothing to read — still an honest completed step
      continue;
    }
    const quote = await readVenue(def, blockHex);
    quotes.push(quote);
    step += 1;
    onStep(step); // venue quotes complete
  }
  return { block, at: new Date().toLocaleTimeString(), quotes };
}

function weiToPhrs(wei: bigint): string {
  const whole = wei / WEI;
  const rem = wei % WEI;
  if (rem === 0n) return whole.toString();
  const frac = rem
    .toString()
    .padStart(18, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return frac === "" ? whole.toString() : `${whole}.${frac}`;
}

function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function parseAmountToWei(amount: string): bigint | null {
  const s = amount.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
  const [intPart, fracPart = ""] = s.split(".");
  return BigInt(intPart) * WEI + BigInt((fracPart + "0".repeat(18)).slice(0, 18));
}

function shortAddr(a: string): string {
  return `${a.slice(0, 10)}…${a.slice(-7)}`;
}

/** Capital efficiency, exactly as aggregate.py's comparison(): utilization
 *  share for lending, 100% for vaults (all TVL deployed in strategy). */
function capitalEfficiencyPct(q: VenueQuote): number {
  if (!q.ok) return 0;
  return q.def.kind === "lending" ? (q.utilizationBps ?? 0) / 100 : 100;
}

/** Risk flags, same thresholds as aggregate.py risk_flags(). Pure, from the
 *  same live read — no second data source. */
function riskFlags(q: VenueQuote): { level: "high" | "note"; text: string }[] {
  if (!q.ok) return [{ level: "high", text: "UNREACHABLE — excluded from ranking, never zero-filled" }];
  const flags: { level: "high" | "note"; text: string }[] = [];
  const tvlPhrs = Number(q.tvlWei) / 1e18;
  if ((q.utilizationBps ?? 0) > 8000) {
    flags.push({ level: "high", text: "Elevated — utilization above 80%, withdrawal liquidity thin" });
  }
  if (tvlPhrs < 0.0005) {
    flags.push({ level: "high", text: "Thin — TVL below 0.0005 PHRS, dust-scale venue" });
  }
  if (q.def.kind === "vault" && tvlPhrs < 0.001) {
    flags.push({ level: "note", text: "Note — small vault TVL, slippage not modeled" });
  }
  return flags;
}

const CLI_CMD = `export ATLANTIC_RPC_URL="https://atlantic.dplabs-internal.com"   # your own RPC endpoint
export PATH="$HOME/.foundry/bin:$PATH"
cd ~/workspace/lightkeeper/tasks/t28-multi-protocol-aggregator

# full aggregation: pins one block, reads every venue, prints the ranking
python3 aggregate.py run

# explained routing: deposit and borrow intents, per-venue verdict lines
python3 aggregate.py route --intent deposit --amount-wei 1000000000000000
python3 aggregate.py route --intent borrow  --amount-wei 100000000000000

# degraded mode: one venue forced down, the rest must still aggregate
python3 aggregate.py chaos`;

type Intent = "deposit" | "borrow";

/** Big animated percentage for the ResultCard headline — ticks only when
 *  the real APY changes, swaps instantly under reduced motion. */
function AnimatedPct({ bps }: { bps: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(bps / 100);
  const spring = useSpring(mv, { stiffness: 90, damping: 22 });
  const [display, setDisplay] = useState(`${(bps / 100).toFixed(2)}%`);

  useEffect(() => {
    mv.set(bps / 100);
  }, [bps, mv]);

  useEffect(() => {
    const target = `${(bps / 100).toFixed(2)}%`;
    if (reduce) {
      setDisplay(target);
      return;
    }
    const unsub = spring.on("change", (v) => setDisplay(`${v.toFixed(2)}%`));
    return unsub;
  }, [spring, reduce, bps]);

  return <span className="tabular-nums">{display}</span>;
}

type Phase = "running" | "done" | "error";

export default function TryAggregator({ lamp }: { lamp: Lamp }) {
  const [intent, setIntent] = useState<Intent>("deposit");
  const [amount, setAmount] = useState("0.001");
  const [copied, setCopied] = useState(false);

  const [phase, setPhase] = useState<Phase>("running");
  const [step, setStep] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setPhase("running");
    setStep(0);
    setErrorMsg(null);
    try {
      const snap = await fetchSnapshotLive((done) => {
        if (mounted.current) setStep(done);
      });
      if (!mounted.current) return;
      setSnapshot(snap);
      setStep(STEPS.length);
      setPhase("done");
    } catch (e) {
      if (!mounted.current) return;
      setErrorMsg(e instanceof Error ? e.message : "The Atlantic RPC did not answer.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const inputWei = parseAmountToWei(amount);
  const quotes = snapshot?.quotes ?? [];
  const okQuotes = quotes.filter((q) => q.ok);
  const badQuotes = quotes.filter((q) => !q.ok);

  const depositRanking = [...okQuotes].sort((a, b) => b.supplyApyBps - a.supplyApyBps);
  const lendQuote = okQuotes.find((q) => q.def.id === "T28-LEND") ?? null;
  const winner: VenueQuote | null =
    intent === "deposit" ? depositRanking[0] ?? null : lendQuote;

  /** Estimated 1-year output for a deposit of `inputWei` at the venue's
   *  supply APY (simple interest, honest estimate). */
  const estDepositOut = (q: VenueQuote): string =>
    inputWei === null
      ? "—"
      : weiToPhrs(inputWei + (inputWei * BigInt(q.supplyApyBps)) / 10000n);

  /** Estimated 1-year interest cost for borrowing `inputWei` from the lending venue. */
  const estBorrowCost = (q: VenueQuote): string =>
    inputWei === null || q.borrowApyBps === null
      ? "—"
      : weiToPhrs((inputWei * BigInt(q.borrowApyBps)) / 10000n);

  /** Gap behind the winner in percentage points — the comparison a trader wants. */
  const gapVsWinner = (q: VenueQuote): string | null => {
    if (!q.ok || !winner || q.def.id === winner.def.id) return null;
    if (intent !== "deposit") return null;
    const gapPp = (winner.supplyApyBps - q.supplyApyBps) / 100;
    return `−${gapPp.toFixed(2)}pp vs ${winner.def.name}`;
  };

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(CLI_CMD);
    } catch {
      /* clipboard unavailable — the text is still visible in the code block */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const blockNum = (n: number) => n.toLocaleString("en-US");

  /* ---------- 03 Result: hero card content ---------- */
  const heroApyBps =
    intent === "deposit" ? winner?.supplyApyBps : winner?.borrowApyBps ?? null;

  const statStrip = (() => {
    if (!snapshot || okQuotes.length === 0) return null;
    const stats = [
      {
        label: intent === "deposit" ? "Best supply APY" : "Borrow APY",
        value: (heroApyBps ?? 0) / 100,
        format: (n: number) => n.toFixed(2),
        suffix: "%",
        icon: <Trophy size={14} aria-hidden />,
      },
      {
        label: "Venues reachable",
        value: okQuotes.length,
        format: (n: number) => `${Math.round(n)}/3`,
      },
      {
        label: "Combined TVL",
        value: okQuotes.reduce((s, q) => s + Number(q.tvlWei) / 1e18, 0),
        format: (n: number) => n.toFixed(4),
        suffix: "PHRS",
      },
    ];
    if (intent === "deposit" && depositRanking.length >= 2) {
      const first = depositRanking[0];
      const second = depositRanking[1];
      if (first && second) {
        stats.push({
          label: "Lead over runner-up",
          value: (first.supplyApyBps - second.supplyApyBps) / 100,
          format: (n: number) => n.toFixed(2),
          suffix: "pp",
        });
      }
    }
    return <StatStrip stats={stats} />;
  })();

  const feedItems: FeedItem[] = snapshot
    ? [
        {
          key: "pin",
          node: (
            <div>
              <p className="text-sm font-medium text-ink">
                Pinned block {blockNum(snapshot.block)} — every venue read at the same block
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate">
                eth_blockNumber → 0x{snapshot.block.toString(16)} · read {snapshot.at}
              </p>
            </div>
          ),
        },
        ...[...quotes].reverse().map((q) => ({
          key: q.def.id,
          node: (
            <div>
              <p className="text-sm font-medium text-ink">
                {q.ok ? (
                  <>
                    {q.def.name} answered — supply APY {bpsToPct(q.supplyApyBps)}
                    {q.borrowApyBps !== null && ` · borrow APY ${bpsToPct(q.borrowApyBps)}`}
                    , TVL {weiToPhrs(q.tvlWei)} PHRS
                  </>
                ) : (
                  <>{q.def.name} unreachable — {q.error}</>
                )}
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate">
                {q.def.id} · eth_getCode +{" "}
                {q.def.kind === "vault" ? "3" : "5"} eth_call
                {q.ok ? "" : " · excluded, never zero-filled"}
              </p>
            </div>
          ),
        })),
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* ---------- 01 Configure ---------- */}
      <div className="rounded-2xl border border-hairline bg-porcelain p-5 sm:p-6">
        <p className="text-sm font-semibold text-slate">01 — Configure</p>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          <strong>{lamp.name}</strong>: one view over every venue. The board
          reads the <strong>three real T28 venues on Atlantic</strong> (two
          vaults + one lending pool) at one pinned block with plain JSON-RPC —
          TVL, APYs, share price, utilization, liquidity depth — and ranks them
          for the intent you pick. No wallet, no signature, no gas:
          LIGHTKEEPER never sees, holds, or asks for private keys.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-slate">Intent</p>
            <div className="flex gap-2">
              {(["deposit", "borrow"] as Intent[]).map((i) => (
                <button
                  key={i}
                  type="button"
                  className={intent === i ? "btn-primary" : "btn-outline"}
                  onClick={() => setIntent(i)}
                >
                  {i === "deposit" ? "Deposit" : "Borrow"}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[10rem] flex-1">
            <label
              htmlFor="t28-amount"
              className="mb-1.5 block text-sm font-semibold text-slate"
            >
              Input amount (PHRS)
            </label>
            <input
              id="t28-amount"
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.001"
            />
          </div>
          <button
            type="button"
            className="btn-primary min-h-[44px]"
            onClick={() => void run()}
            disabled={phase === "running"}
          >
            {phase === "running" ? "Reading venues…" : "Refresh quotes"}
          </button>
        </div>
        {inputWei === null && (
          <p className="mt-2 text-sm text-fail">
            That amount doesn't parse as PHRS — estimates are hidden until it does.
          </p>
        )}
      </div>

      {/* ---------- 02 Run ---------- */}
      {phase === "running" && (
        <ProgressLoader
          steps={STEPS}
          current={step}
          title="Reading the three T28 venues on Atlantic"
        />
      )}

      {/* ---------- Error ---------- */}
      {phase === "error" && (
        <ErrorState
          title="The venue read failed — loudly, not silently"
          message="The Atlantic RPC didn't answer in time, so no board was drawn. Your settings are kept; nothing here is invented."
          hint={errorMsg ? `What the node said: ${errorMsg}` : undefined}
          retryLabel="Retry read"
          onRetry={() => void run()}
        />
      )}

      {/* ---------- 03 Result ---------- */}
      {phase === "done" && snapshot && (
        <div className="space-y-6">
          {okQuotes.length === 0 ? (
            <EmptyState
              title="No venue answered this read"
              message="All three venues failed their checks just now — the Atlantic RPC is usually just slow. That's an honest answer, not an error: nothing was zero-filled to fake a board."
              actionLabel="Retry read"
              onAction={() => void run()}
            />
          ) : (
            <>
              {winner && heroApyBps != null ? (
                <ResultCard
                  eyebrow={`03 — Result · winner for the ${intent} intent`}
                  headline={
                    <span className="inline-flex flex-wrap items-baseline gap-x-3">
                      <AnimatedPct bps={heroApyBps} />
                      <span className="text-2xl font-normal text-slate sm:text-3xl">
                        {intent === "deposit" ? "supply APY" : "borrow APY"} ·{" "}
                        {winner.def.name}
                      </span>
                    </span>
                  }
                  subline={
                    intent === "deposit"
                      ? `Highest live supply APY of ${okQuotes.length} reachable venue${okQuotes.length > 1 ? "s" : ""} — read at one pinned block, dead venues excluded not zero-filled.`
                      : `The only borrow market on the board — ${weiToPhrs(winner.liquidityWei)} PHRS of liquidity available right now.`
                  }
                  status="pass"
                  rows={[
                    {
                      label: "Winner contract",
                      value: (
                        <span title={winner.def.address}>{shortAddr(winner.def.address)}</span>
                      ),
                    },
                    {
                      label: "Pinned block",
                      value: blockNum(snapshot.block),
                    },
                    {
                      label: "TVL",
                      value: `${weiToPhrs(winner.tvlWei)} PHRS`,
                    },
                    {
                      label: "Capital efficiency",
                      value: `${capitalEfficiencyPct(winner).toFixed(2)}%`,
                    },
                    {
                      label:
                        intent === "deposit"
                          ? "Est. 1-year output"
                          : "Est. 1-year interest cost",
                      value: `${
                        intent === "deposit" ? estDepositOut(winner) : estBorrowCost(winner)
                      } PHRS`,
                    },
                    {
                      label: "Read time",
                      value: snapshot.at,
                    },
                  ]}
                  links={[
                    {
                      label: `View ${winner.def.name} on the explorer`,
                      href: `${EXPLORER_ADDRESS}${winner.def.address}`,
                    },
                  ]}
                  copyValue={winner.def.address}
                />
              ) : (
                <ResultCard
                  eyebrow="03 — Result · borrow intent"
                  headline="No borrow market"
                  subline="TidepoolLending didn't answer this read and vaults accept deposits only — nothing was invented to fill the gap. Switch to the deposit intent for the ranked vault board."
                  status="neutral"
                  rows={[
                    {
                      label: "Reachable venues",
                      value: `${okQuotes.length}/3`,
                    },
                    {
                      label: "Pinned block",
                      value: blockNum(snapshot.block),
                    },
                  ]}
                />
              )}

              {statStrip}

              {/* Venue leaderboard */}
              <div>
                <h3 className="mb-3 text-base font-bold text-ink">
                  Venue leaderboard — ranked for {intent}
                </h3>
                <div className="space-y-3">
                  {(intent === "deposit" ? depositRanking : quotes.filter((q) => q.ok)).map(
                    (q, i) => {
                      const isWinner = winner?.def.id === q.def.id;
                      const gap = gapVsWinner(q);
                      const flags = riskFlags(q);
                      return (
                        <motion.div
                          key={q.def.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: i * 0.06, ease: "easeOut" }}
                          className={`rounded-2xl border p-5 sm:p-6 ${
                            isWinner
                              ? "border-accent/40 bg-white shadow-[0_8px_30px_-12px_rgba(36,86,230,0.25)]"
                              : "border-hairline bg-white"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {isWinner ? (
                              <span className="chip chip-pass inline-flex items-center gap-1">
                                <Trophy size={12} aria-hidden /> Winner
                              </span>
                            ) : (
                              <span className="chip chip-info">#{i + 1}</span>
                            )}
                            <a
                              className="font-mono text-base font-semibold text-accent hover:underline"
                              href={`${EXPLORER_ADDRESS}${q.def.address}`}
                              target="_blank"
                              rel="noreferrer"
                              title={q.def.address}
                            >
                              {q.def.name}
                            </a>
                            <span className="text-sm text-slate">· {q.def.note}</span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                            <p className="font-display text-3xl tracking-tight text-ink">
                              <span className="tabular-nums">{bpsToPct(q.supplyApyBps)}</span>
                              <span className="ml-2 text-base font-normal text-slate">
                                supply APY
                              </span>
                            </p>
                            {q.borrowApyBps !== null && (
                              <p className="text-sm text-ink">
                                <span className="font-mono font-semibold tabular-nums">
                                  {bpsToPct(q.borrowApyBps)}
                                </span>{" "}
                                <span className="text-slate">borrow APY</span>
                              </p>
                            )}
                            {gap && (
                              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                                <ArrowDownRight size={15} className="text-slate" aria-hidden />
                                {gap}
                              </p>
                            )}
                          </div>

                          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-hairline pt-4 sm:grid-cols-3">
                            <div>
                              <dt className="text-sm font-semibold text-slate">TVL</dt>
                              <dd className="mt-1 font-mono text-sm text-ink tabular-nums">
                                {weiToPhrs(q.tvlWei)} PHRS
                              </dd>
                            </div>
                            <div>
                              <dt className="text-sm font-semibold text-slate">
                                Liquidity depth
                              </dt>
                              <dd className="mt-1 font-mono text-sm text-ink tabular-nums">
                                {weiToPhrs(q.liquidityWei)} PHRS
                              </dd>
                            </div>
                            <div>
                              <dt className="text-sm font-semibold text-slate">
                                Capital efficiency
                              </dt>
                              <dd className="mt-1 font-mono text-sm text-ink tabular-nums">
                                {capitalEfficiencyPct(q).toFixed(2)}%
                              </dd>
                            </div>
                            {q.sharePriceWei !== null && (
                              <div>
                                <dt className="text-sm font-semibold text-slate">Share price</dt>
                                <dd className="mt-1 font-mono text-sm text-ink tabular-nums">
                                  {weiToPhrs(q.sharePriceWei)} PHRS/share
                                </dd>
                              </div>
                            )}
                            {q.utilizationBps !== null && (
                              <div>
                                <dt className="text-sm font-semibold text-slate">Utilization</dt>
                                <dd className="mt-1 font-mono text-sm text-ink tabular-nums">
                                  {(q.utilizationBps / 100).toFixed(2)}%
                                </dd>
                              </div>
                            )}
                            <div>
                              <dt className="text-sm font-semibold text-slate">
                                {intent === "deposit" ? "Est. 1-year output" : "Est. 1-year cost"}
                              </dt>
                              <dd className="mt-1 font-mono text-sm text-ink tabular-nums">
                                {intent === "deposit" ? estDepositOut(q) : estBorrowCost(q)} PHRS
                              </dd>
                            </div>
                          </dl>

                          {flags.length > 0 && (
                            <ul className="mt-4 flex flex-wrap gap-2">
                              {flags.map((f) => (
                                <li
                                  key={f.text}
                                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                                    f.level === "high"
                                      ? "bg-fail/10 text-fail"
                                      : "bg-tint text-slate"
                                  }`}
                                >
                                  <ShieldAlert size={12} aria-hidden />
                                  {f.text}
                                </li>
                              ))}
                            </ul>
                          )}
                        </motion.div>
                      );
                    },
                  )}

                  {badQuotes.map((q) => (
                    <motion.div
                      key={q.def.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="rounded-2xl border border-dashed border-hairline bg-porcelain p-5 sm:p-6"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="chip chip-fail">Unreachable</span>
                        <span className="font-mono text-base font-semibold text-ink">
                          {q.def.name}
                        </span>
                        <span className="text-sm text-slate">· {q.def.note}</span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-ink">
                        This venue didn't answer — {q.error ?? "read failed"}. It is
                        excluded from the ranking and never zero-filled: a dead venue
                        must not masquerade as a 0.00% APY venue.
                      </p>
                    </motion.div>
                  ))}
                </div>
                {badQuotes.length > 0 && (
                  <p className="mt-3 text-sm text-slate">
                    {badQuotes.length} venue{badQuotes.length > 1 ? "s" : ""}{" "}
                    unreachable this read — the rest of the board still aggregates
                    and re-ranks. That degraded mode is the point of the aggregator.
                  </p>
                )}
              </div>

              {/* Run log */}
              <div>
                <h3 className="mb-3 text-base font-bold text-ink">Read log</h3>
                <FeedList items={feedItems} maxHeight="max-h-72" />
              </div>
            </>
          )}
        </div>
      )}

      {/* The run command stays CLI */}
      <div className="rounded-2xl border border-hairline bg-porcelain p-5 sm:p-6">
        <h3 className="text-base font-bold text-ink">
          The run command stays in the CLI — your terminal, your key
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          Full aggregation pins one block and runs the explained router, the
          unsigned-tx preparation with an eth_call dry-run gate, and the
          chaos/unreachable demo. Reads cost nothing; writes are dust-only and
          never happen from this page.
        </p>
        <div className="code-block mt-3 whitespace-pre">{CLI_CMD}</div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-outline" onClick={() => void copyCmd()}>
            {copied ? "Copied ✓" : "Copy commands"}
          </button>
          <p className="text-sm text-slate">
            Spend so far: 0.00212 PHRS gas of a 0.15 PHRS budget (evidence.json)
            — every broadcast went through dust amounts.
          </p>
        </div>
      </div>
    </div>
  );
}
