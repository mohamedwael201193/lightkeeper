/**
 * T14 — Portfolio Assistant "try it live" (Tier A: live reads, no wallet, no signature).
 *
 * A three-act journey: 01 Configure (address) → 02 Run (honest ProgressLoader over
 * the three real read phases: balances → activity → gas) → 03 Result (ResultCard
 * showpiece: the PHRS balance as the hero number with an animated ticker —
 * the only honest "total" on a testnet with no price feeds — plus StatStrip,
 * clean tabs, and the Activity feed as a FeedList).
 *
 * Paste any address to read any portfolio. Below, the keeper's reference — the
 * LIGHTKEEPER operator wallet's block-pinned evidence snapshot — is shown as a
 * historical record, not live data.
 *
 * LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only (688689).
 */
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { EyeOff, RefreshCw, Wallet } from "lucide-react";
import type { Lamp } from "../../types";
import { useWallet } from "../WalletContext";
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  isValidAddress,
  rpcCall,
} from "../../hooks/useAtlantic";
import {
  EmptyState,
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
} from "../ui";
import type { FeedItem, Stat } from "../ui";

/** Verified token registry — mirrors tasks/t14-portfolio-assistant/sources.yaml. */
interface TokenDef {
  symbol: string;
  decimals: number;
  /** Contract address; null = native PHRS. */
  address: string | null;
  note: string;
}

const TOKENS: TokenDef[] = [
  { symbol: "PHRS", decimals: 18, address: null, note: "native — eth_getBalance" },
  { symbol: "USDC", decimals: 6, address: "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B", note: "Pharos Token Registry, code-verified" },
  { symbol: "USDT", decimals: 6, address: "0xE7E84B8B4f39C507499c40B4ac199B050e2882d5", note: "Pharos Token Registry, code-verified" },
  { symbol: "WBTC", decimals: 18, address: "0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4", note: "Pharos Token Registry, code-verified" },
  { symbol: "WETH", decimals: 18, address: "0x7d211F77525ea39A0592794f793cC1036eEaccD5", note: "Pharos Token Registry, code-verified" },
  { symbol: "WPHRS", decimals: 18, address: "0x838800b758277CC111B2d48Ab01e5E164f8E9471", note: "Pharos Token Registry, code-verified" },
  { symbol: "LPK", decimals: 18, address: "0x7d9C06353DdfeBC078A3a834A672CBF10aa06Ab9", note: "KeeperToken, deployed by T14 (tx 0xbf309a96…10cc59b02e54ba0578a310b555dc23)" },
];

const TOKEN_BY_ADDRESS: Record<string, TokenDef> = Object.fromEntries(
  TOKENS.filter((t) => t.address !== null).map((t) => [t.address!.toLowerCase(), t])
);
const ERC20_ADDRESSES = Object.keys(TOKEN_BY_ADDRESS);

/** Keeper's reference: LIGHTKEEPER operator wallet, evidence.json snapshot, block 31483013. */
const REFERENCE = {
  address: "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
  block: 31483013,
  rows: [
    { symbol: "PHRS", formatted: "5.865657109313757106" },
    { symbol: "USDC", formatted: "18.5" },
    { symbol: "USDT", formatted: "0" },
    { symbol: "WBTC", formatted: "0" },
    { symbol: "WETH", formatted: "0" },
    { symbol: "WPHRS", formatted: "0.0025" },
    { symbol: "LPK", formatted: "1,000,000" },
  ] as { symbol: string; formatted: string }[],
  txs: 139,
};

const ATLANTIC_CHAIN_ID = 688689;
const BALANCE_OF = "0x70a08231";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
const GETLOGS_MAX_BLOCKS = 1000; // enforced by the Atlantic node
const ACTIVITY_WINDOW_BLOCKS = 5000; // last 5,000 blocks (5 pages × 2 dirs = 10 getLogs calls)
const MAX_EVENTS = 12;

function balanceOfData(address: string): string {
  return BALANCE_OF + address.replace(/^0x/, "").padStart(64, "0");
}

function padTopic(address: string): string {
  return "0x" + "0".repeat(24) + address.toLowerCase().replace(/^0x/, "");
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatUnits(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const int = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0");
  if (frac.length > 6) frac = frac.slice(0, 6); // display precision cap; full value on hover
  frac = frac.replace(/0+$/, "");
  const out = frac ? `${int}.${frac}` : int.toString();
  return (neg ? "-" : "") + out;
}

/** Display format for the animated hero ticker: up to 4 trimmed fraction digits. */
function formatTicker(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function hexToNumber(hex: string): number {
  return Number(BigInt(hex));
}

let atlanticVerified = false;
/** The RPC endpoint only serves Atlantic, but verify chain ID before any read. */
async function ensureAtlantic(): Promise<void> {
  if (atlanticVerified) return;
  const id = (await rpcCall("eth_chainId", [])) as string;
  if (BigInt(id) !== BigInt(ATLANTIC_CHAIN_ID)) {
    throw new Error(
      `Wrong network: the endpoint answered chain ${id}, this surface reads Atlantic (688689) only.`
    );
  }
  atlanticVerified = true;
}

interface RowResult {
  token: TokenDef;
  status: "ok" | "unknown";
  balance: string; // human-formatted, or "—"
  full: string | null; // full-precision value for hover
}

interface PortfolioResult {
  block: number;
  rows: RowResult[];
  txCount: number | null;
}

async function readPortfolio(address: string): Promise<PortfolioResult> {
  await ensureAtlantic();
  const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
  const block = hexToNumber(blockHex);

  const reads: Promise<RowResult>[] = TOKENS.map(async (token): Promise<RowResult> => {
    try {
      let raw: bigint;
      if (token.address === null) {
        const hex = (await rpcCall("eth_getBalance", [address, blockHex])) as string;
        raw = BigInt(hex);
      } else {
        const hex = (await rpcCall("eth_call", [
          { to: token.address, data: balanceOfData(address) },
          blockHex,
        ])) as string;
        raw = BigInt(hex);
      }
      return {
        token,
        status: "ok",
        balance: formatUnits(raw, token.decimals),
        full: `full precision: ${raw.toString()} base units`,
      };
    } catch {
      // No code at address, non-standard token, RPC hiccup — report as unknown, never zero.
      return { token, status: "unknown", balance: "—", full: null };
    }
  });

  const rows = await Promise.all(reads);
  let txCount: number | null = null;
  try {
    const n = (await rpcCall("eth_getTransactionCount", [address, blockHex])) as string;
    txCount = hexToNumber(n);
  } catch {
    txCount = null;
  }
  return { block, rows, txCount };
}

interface ActivityEvent {
  txHash: string;
  block: number;
  dir: "in" | "out" | "self";
  from: string;
  to: string;
  symbol: string;
  amount: string;
  tokenAddress: string;
}

interface ActivityResult {
  from: number;
  to: number;
  events: ActivityEvent[];
}

async function readActivity(address: string): Promise<ActivityResult> {
  await ensureAtlantic();
  const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
  const to = hexToNumber(blockHex);
  const from = Math.max(0, to - ACTIVITY_WINDOW_BLOCKS + 1);
  const self = padTopic(address);

  const calls: Promise<unknown[]>[] = [];
  for (let hi = to; hi >= from; hi -= GETLOGS_MAX_BLOCKS) {
    const lo = Math.max(from, hi - GETLOGS_MAX_BLOCKS + 1);
    const range = {
      address: ERC20_ADDRESSES,
      fromBlock: "0x" + lo.toString(16),
      toBlock: "0x" + hi.toString(16),
    };
    // sent (from == wallet) and received (to == wallet) — one call each per page,
    // since the address filter covers all six registry tokens at once.
    calls.push(rpcCall("eth_getLogs", [{ ...range, topics: [TRANSFER_TOPIC, self] }]) as Promise<unknown[]>);
    calls.push(rpcCall("eth_getLogs", [{ ...range, topics: [TRANSFER_TOPIC, null, self] }]) as Promise<unknown[]>);
  }
  const pages = await Promise.all(calls);

  const seen = new Set<string>();
  const events: ActivityEvent[] = [];
  for (const page of pages) {
    for (const l of page as Array<{
      address: string; blockNumber: string; transactionHash: string; topics: string[]; data: string;
    }>) {
      if (seen.has(l.transactionHash)) continue;
      seen.add(l.transactionHash);
      const token = TOKEN_BY_ADDRESS[l.address.toLowerCase()];
      if (!token) continue;
      const fromAddr = "0x" + l.topics[1].slice(-40);
      const toAddr = "0x" + l.topics[2].slice(-40);
      const dir: ActivityEvent["dir"] =
        fromAddr.toLowerCase() === address.toLowerCase() && toAddr.toLowerCase() === address.toLowerCase()
          ? "self"
          : fromAddr.toLowerCase() === address.toLowerCase()
            ? "out"
            : "in";
      events.push({
        txHash: l.transactionHash,
        block: hexToNumber(l.blockNumber),
        dir,
        from: fromAddr,
        to: toAddr,
        symbol: token.symbol,
        amount: formatUnits(BigInt(l.data), token.decimals),
        tokenAddress: l.address,
      });
    }
  }
  events.sort((a, b) => b.block - a.block);
  return { from, to, events: events.slice(0, MAX_EVENTS) };
}

interface GasResult {
  block: number;
  gasPriceGwei: string;
  balance: string;
  simpleTransfers: number;
}

async function readGas(address: string): Promise<GasResult> {
  await ensureAtlantic();
  const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
  const [gpHex, balHex] = (await Promise.all([
    rpcCall("eth_gasPrice", []),
    rpcCall("eth_getBalance", [address, blockHex]),
  ])) as string[];
  const gasPrice = BigInt(gpHex);
  const balance = BigInt(balHex);
  const perTx = 21000n * gasPrice;
  return {
    block: hexToNumber(blockHex),
    gasPriceGwei: formatUnits(gasPrice, 9),
    balance: formatUnits(balance, 18),
    simpleTransfers: perTx > 0n ? Number(balance / perTx) : 0,
  };
}

/** Translate an RPC failure into plain language. Raw RPC strings never render. */
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/wrong network/i.test(msg)) {
    return "The RPC endpoint answered for the wrong network, so every read was refused. Nothing was charged and nothing changed on chain.";
  }
  if (/did not answer|stopped responding|fetch|network|timeout/i.test(msg)) {
    return "The Atlantic node didn't answer in time. Your address wasn't read and nothing on chain changed.";
  }
  return "The read failed before any data arrived. The node may be busy — retry in a moment.";
}

type TabId = "balances" | "activity" | "gas";
type Phase = "idle" | "running" | "result" | "error";

const RUN_STEPS = [
  "Reading balances — live, block-pinned",
  "Scanning activity — 10 block-paged getLogs",
  "Checking gas headroom — gas price × balance",
];

/** Number ticker for the hero value. Animates ONLY when the real value changes. */
function AnimatedTicker({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 22 });
  const [display, setDisplay] = useState(() => format(value));

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  useEffect(() => {
    if (reduce) {
      setDisplay(format(value));
      return;
    }
    return spring.on("change", (v) => setDisplay(format(v)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spring, reduce, value]);

  return <span className="tabular-nums">{display}</span>;
}

/**
 * The one beat — a single expanding ring over the hero value when the real
 * result lands. Gone in 0.6s. Maps to "the answer arrived"; instant (absent)
 * under prefers-reduced-motion.
 */
function Beat({ beatKey }: { beatKey: number }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <motion.span
      key={beatKey}
      aria-hidden
      className="pointer-events-none absolute -inset-x-6 inset-y-0 rounded-full border-2 border-accent"
      initial={{ scale: 0.75, opacity: 0.55 }}
      animate={{ scale: 1.3, opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    />
  );
}

/** Zone word for the survival meter — plain language, no PASS/FAIL semantics. */
function zoneWord(transfers: number): string {
  if (transfers < 1) return "stranded";
  if (transfers < 10) return "a handful";
  if (transfers < 100) return "a busy session";
  if (transfers < 1000) return "an operating stretch";
  return "deep runway";
}

/**
 * The survival meter — the gas tab's flagship instrument. Real equation:
 * PHRS balance ÷ (21,000 gas × live gas price) = simple transfers covered.
 * Log-scale meter from 1 to 1,000,000 transfers; the fill and marker animate
 * ONLY when the real value changes.
 */
function SurvivalMeter({ gas }: { gas: GasResult }) {
  const reduce = useReducedMotion();
  const LOG_MAX = 6; // meter spans 10^0 → 10^6 transfers
  const transfers = gas.simpleTransfers;
  const pos = transfers > 0 ? Math.min(Math.log10(Math.max(transfers, 1)) / LOG_MAX, 1) : 0;
  const perTxGwei = 21000 * Number.parseFloat(gas.gasPriceGwei);
  const ticks = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000];

  const fmtCount = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 1 });
  const fmtTick = (n: number) => (n >= 1000 ? `${n / 1000}k` : `${n}`);

  return (
    <div className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate">
        The survival meter
        <span className="chip chip-lit">{zoneWord(transfers)}</span>
      </p>
      <p className="mt-3 font-display text-3xl tracking-tight text-ink sm:text-4xl">
        <span className="tabular-nums">~{fmtCount(transfers)}</span>{" "}
        <span className="font-display text-xl font-normal text-slate">simple transfers</span>
      </p>
      <p className="mt-2 text-sm text-slate">
        {gas.balance} PHRS ÷ (21,000 gas × {gas.gasPriceGwei} Gwei) — the room this
        balance buys at the pinned block.
      </p>

      <div
        className="mt-8"
        role="img"
        aria-label={`Meter: this balance covers about ${fmtCount(transfers)} simple transfers`}
      >
        <div className="relative h-3 rounded-full bg-hairline">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            initial={reduce ? { width: `${pos * 100}%` } : { width: 0 }}
            animate={{ width: `${pos * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
          <div
            className="absolute -top-1 h-5 w-0.5 bg-ink"
            style={{ left: `${pos * 100}%` }}
            aria-hidden
          />
        </div>
        <div className="relative mt-2 h-4 font-mono text-xs text-slate">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2"
              style={{ left: `${(Math.log10(t) / LOG_MAX) * 100}%` }}
            >
              {fmtTick(t)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-porcelain px-4 py-4">
          <p className="text-sm font-semibold text-slate">Gas price</p>
          <p className="mt-1 font-mono text-lg text-ink">{gas.gasPriceGwei} Gwei</p>
          <p className="mt-1 text-sm text-slate">
            eth_gasPrice · block {gas.block.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl bg-porcelain px-4 py-4">
          <p className="text-sm font-semibold text-slate">PHRS balance</p>
          <p className="mt-1 font-mono text-lg text-ink">{gas.balance} PHRS</p>
          <p className="mt-1 text-sm text-slate">
            eth_getBalance · block {gas.block.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl bg-porcelain px-4 py-4">
          <p className="text-sm font-semibold text-slate">Cost per transfer</p>
          <p className="mt-1 font-mono text-lg text-ink">
            {perTxGwei.toLocaleString("en-US", { maximumFractionDigits: 2 })} Gwei
          </p>
          <p className="mt-1 text-sm text-slate">21,000 gas — the simple-transfer unit</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-slate">
        A rough estimate at the pinned block: it assumes simple transfers at the
        current gas price. Contract calls cost more, gas prices move. No fiat
        conversion — testnet assets have no market value.
      </p>
    </div>
  );
}

function ActHeader({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <p className="text-sm font-semibold text-accent">
        {n} · {title}
      </p>
      {hint && <p className="mt-1 text-sm text-slate">{hint}</p>}
    </div>
  );
}

export default function TryPortfolio({ lamp }: { lamp: Lamp }) {
  const { state: wallet, connect } = useWallet();
  const connectedAddress =
    wallet.status === "connected" || wallet.status === "wrong-network"
      ? wallet.address
      : null;

  const [pasted, setPasted] = useState("");
  const pastedValid = isValidAddress(pasted);
  const target = connectedAddress ?? (pastedValid ? pasted.trim() : null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [runStep, setRunStep] = useState(0);
  const [balances, setBalances] = useState<PortfolioResult | null>(null);
  const [activity, setActivity] = useState<ActivityResult | null>(null);
  const [gas, setGas] = useState<GasResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState<TabId>("balances");
  const runId = useRef(0);

  async function run(address: string) {
    const id = ++runId.current;
    setPhase("running");
    setRunStep(0);
    setErrorMsg("");
    setBalances(null);
    setActivity(null);
    setGas(null);
    try {
      const b = await readPortfolio(address);
      if (runId.current !== id) return;
      setBalances(b);
      setRunStep(1);
      const a = await readActivity(address);
      if (runId.current !== id) return;
      setActivity(a);
      setRunStep(2);
      const g = await readGas(address);
      if (runId.current !== id) return;
      setGas(g);
      setRunStep(RUN_STEPS.length);
      setPhase("result");
    } catch (e) {
      if (runId.current !== id) return;
      setErrorMsg(friendlyError(e));
      setPhase("error");
    }
  }

  // One run covers all three reads — auto-run as soon as an address exists.
  useEffect(() => {
    if (target) run(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const phrsRow = balances?.rows.find((r) => r.token.symbol === "PHRS");
  const phrsNum =
    phrsRow && phrsRow.status === "ok" && phrsRow.balance !== "—"
      ? Number.parseFloat(phrsRow.balance)
      : null;
  const tokensHeld =
    balances?.rows.filter((r) => r.status === "ok" && Number(r.balance) !== 0).length ?? 0;

  const stats: Stat[] = [];
  if (gas) {
    stats.push({
      label: "Gas price",
      value: Number.parseFloat(gas.gasPriceGwei),
      format: (n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 }),
      suffix: "Gwei",
    });
    stats.push({
      label: "Transfers covered",
      value: gas.simpleTransfers,
      format: (n) => Math.round(n).toLocaleString("en-US"),
    });
  }
  stats.push({ label: "Tokens held", value: tokensHeld });
  if (balances?.txCount !== null && balances?.txCount !== undefined) {
    stats.push({ label: "Outgoing transactions", value: balances.txCount });
  }

  const portfolioEmpty =
    balances !== null &&
    activity !== null &&
    tokensHeld === 0 &&
    activity.events.length === 0 &&
    (balances.txCount ?? 0) === 0;

  const feedItems: FeedItem[] = (activity?.events ?? []).map((e) => ({
    key: e.txHash,
    node: (
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-ink">
          <span className={`chip ${e.dir === "in" ? "chip-lit" : "chip-dim"}`}>
            {e.dir === "in" ? "received" : e.dir === "out" ? "sent" : "self-transfer"}
          </span>
          <span className="ml-2 font-mono font-semibold">
            {e.amount} {e.symbol}
          </span>{" "}
          <span className="text-slate">
            {e.dir === "out"
              ? `to ${shortAddr(e.to)}`
              : e.dir === "in"
                ? `from ${shortAddr(e.from)}`
                : "within this wallet"}
          </span>
        </p>
        <p className="text-sm text-slate">
          <a
            className="font-mono text-accent hover:underline"
            href={`${EXPLORER_TX}${e.txHash}`}
            target="_blank"
            rel="noreferrer"
            title={e.txHash}
          >
            {e.txHash.slice(0, 10)}…
          </a>{" "}
          · block {e.block.toLocaleString()}
        </p>
      </div>
    ),
  }));

  const tabButton = (id: TabId, label: string) => (
    <button
      key={id}
      type="button"
      className={tab === id ? "btn-primary" : "btn-outline"}
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-8">
      {/* ================= 01 · Configure ================= */}
      <section>
        <ActHeader
          n="01"
          title="Configure"
          hint="Connect your wallet to see your own portfolio live, or paste any Atlantic address. Reading is free and never needs a signature."
        />
        {!connectedAddress && (
          <div className="mb-3">
            <button
              type="button"
              className="btn-primary inline-flex min-h-[44px] items-center gap-2"
              onClick={connect}
            >
              <Wallet size={16} aria-hidden />
              Connect wallet — see your own portfolio
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-h-[44px] w-full min-w-0 flex-1 rounded-lg border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink"
            placeholder="0x… address"
            value={connectedAddress ?? pasted}
            readOnly={!!connectedAddress}
            onChange={(e) => setPasted(e.target.value)}
            aria-label="Atlantic address to inspect"
          />
          {target && phase !== "running" && (
            <button
              type="button"
              className="btn-outline inline-flex min-h-[44px] items-center gap-2"
              onClick={() => run(target)}
            >
              <RefreshCw size={16} aria-hidden />
              Re-read portfolio
            </button>
          )}
        </div>
        {!connectedAddress && pasted.length > 0 && !pastedValid && (
          <p className="mt-1 text-sm text-fail">That is not a valid 0x address (0x + 40 hex).</p>
        )}
        {!target && phase === "idle" && (
          <div className="mt-4">
            <EmptyState
              title="No address yet"
              message="Connect a wallet or paste an Atlantic address above and the keeper will read its portfolio live — PHRS, USDC, USDT, WBTC, WETH, WPHRS and LPK."
              actionLabel="Connect wallet"
              onAction={connect}
            />
          </div>
        )}
      </section>

      {/* ================= 02 · Run ================= */}
      {phase === "running" && target && (
        <section>
          <ActHeader n="02" title="Run" hint="Live network calls — nothing here advances on a timer." />
          <ProgressLoader
            steps={RUN_STEPS}
            current={runStep}
            title={`Reading ${shortAddr(target)} on Atlantic`}
          />
        </section>
      )}

      {/* ================= 03 · Result ================= */}
      {phase === "error" && target && (
        <section>
          <ActHeader n="03" title="Result" />
          <ErrorState
            title="The read failed"
            message={errorMsg}
            hint="Reading is free and changes nothing on chain — the failure is on the read path, not your funds."
            retryLabel="Retry the read"
            onRetry={() => run(target)}
          />
        </section>
      )}

      {phase === "result" && balances && activity && gas && target && (
        <section>
          <ActHeader
            n="03"
            title="Result"
            hint={`Read live at block ${balances.block.toLocaleString()} — block-pinned, one address.`}
          />
          {portfolioEmpty ? (
            <EmptyState
              title="Empty portfolio"
              message={`Every balance read zero at block ${balances.block.toLocaleString()} and no transfers were found in the scanned window. That's an honest answer, not an error.`}
              actionLabel="Re-read portfolio"
              onAction={() => run(target)}
            />
          ) : (
            <>
              <ResultCard
                eyebrow={`Portfolio result — ${shortAddr(target)}`}
                headline={
                  phrsNum !== null ? (
                    <span className="relative inline-block px-6">
                      <Beat beatKey={balances.block} />
                      <AnimatedTicker value={phrsNum} format={formatTicker} />
                      <span className="ml-2 align-middle font-display text-2xl font-normal text-slate">
                        PHRS
                      </span>
                    </span>
                  ) : (
                    <>Balance unreadable</>
                  )
                }
                subline="The native balance is the anchor of an Atlantic portfolio — it pays every gas fee. Testnet assets have no market value, so every figure is in token units; no fiat valuation exists or is implied."
                rows={[
                  {
                    label: "Address",
                    value: (
                      <a
                        className="text-accent hover:underline"
                        href={`${EXPLORER_ADDRESS}${target}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {target}
                      </a>
                    ),
                  },
                  { label: "Read at block", value: balances.block.toLocaleString() },
                  { label: "Tokens read", value: `${TOKENS.length} — the keeper's verified registry` },
                  {
                    label: "Activity scanned",
                    value: `blocks ${activity.from.toLocaleString()}–${activity.to.toLocaleString()} · eth_getLogs Transfer events`,
                  },
                  ...(balances.txCount !== null
                    ? [{ label: "Outgoing transactions", value: balances.txCount.toLocaleString() }]
                    : []),
                ]}
                links={[{ label: "View address on the explorer", href: `${EXPLORER_ADDRESS}${target}` }]}
                copyValue={target}
              />

              <div className="mt-6">
                <StatStrip stats={stats} />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Portfolio views">
                {tabButton("balances", "Balances")}
                {tabButton("activity", `Activity (${activity.events.length})`)}
                {tabButton("gas", "Survival meter")}
              </div>

              <div className="mt-4">
                {/* ---------- Balances tab ---------- */}
                {tab === "balances" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Token</th>
                            <th className="text-right">Balance</th>
                            <th>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {balances.rows.map((r) => (
                            <tr key={r.token.symbol}>
                              <td className="font-semibold text-ink">{r.token.symbol}</td>
                              <td className="text-right font-mono text-ink" title={r.full ?? undefined}>
                                {r.status === "unknown" ? (
                                  <span className="text-slate">unknown</span>
                                ) : (
                                  r.balance
                                )}
                              </td>
                              <td className="text-sm text-slate">
                                {r.token.address === null ? (
                                  "eth_getBalance"
                                ) : (
                                  <a
                                    className="font-mono text-accent hover:underline"
                                    href={`${EXPLORER_ADDRESS}${r.token.address}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={r.token.note}
                                  >
                                    {r.token.address.slice(0, 10)}…
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-sm text-slate">
                      Balances marked "unknown" failed to read (no code, non-standard token, or
                      RPC hiccup) and are never reported as zero. Hover a balance for its full
                      raw precision.
                    </p>
                  </motion.div>
                )}

                {/* ---------- Activity tab ---------- */}
                {tab === "activity" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    {activity.events.length === 0 ? (
                      <EmptyState
                        title="Quiet window"
                        message={`No ERC20 Transfer events involving this address in blocks ${activity.from.toLocaleString()}–${activity.to.toLocaleString()}. That's an honest answer, not an error.`}
                        actionLabel="Re-read portfolio"
                        onAction={() => run(target)}
                      />
                    ) : (
                      <FeedList
                        items={feedItems}
                        emptyText="No transfer events in the scanned window."
                      />
                    )}
                    <p className="mt-3 text-sm text-slate">
                      What the keeper can't see, it says: native PHRS transfers emit no
                      events, so this scan only covers ERC20 Transfers. Events older than
                      the window aren't claimed.
                    </p>
                  </motion.div>
                )}

                {/* ---------- Survival meter tab ---------- */}
                {tab === "gas" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <SurvivalMeter gas={gas} />
                  </motion.div>
                )}
              </div>
              <div className="mt-6 rounded-2xl border border-hairline bg-porcelain p-6 sm:p-8">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <EyeOff size={16} className="text-slate" aria-hidden />
                  What the keeper can't see
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate">
                  <li>
                    Native PHRS transfers emit no events — the activity scan only
                    covers ERC20 <span className="font-mono">Transfer</span> events, never
                    plain PHRS movement.
                  </li>
                  <li>
                    Balances read only the seven registry-verified tokens above —
                    anything else the address holds is outside this surface.
                  </li>
                  <li>
                    The activity window covers the last 5,000 blocks only: the
                    node caps each <span className="font-mono">eth_getLogs</span> page
                    at 1,000 blocks, and older history isn't claimed.
                  </li>
                  <li>
                    No fiat valuation anywhere — testnet assets have no market
                    value, so there is nothing honest to price against.
                  </li>
                </ul>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---- Keeper's reference (historical) ---- */}
      <section>
        <div className="mb-4">
          <p className="text-sm font-semibold text-slate">Keeper's reference</p>
          <p className="mt-1 text-sm text-slate">{`The LIGHTKEEPER operator wallet's portfolio as captured for the task's evidence ledger — pinned at block ${REFERENCE.block.toLocaleString()}, not live data. Your own portfolio above is the live one.`}</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
          <table className="data-table">
            <thead>
              <tr>
                <th>Token</th>
                <th className="text-right">Balance (block {REFERENCE.block.toLocaleString()})</th>
              </tr>
            </thead>
            <tbody>
              {REFERENCE.rows.map((r) => (
                <tr key={r.symbol}>
                  <td className="font-semibold text-ink">{r.symbol}</td>
                  <td className="text-right font-mono text-ink">{r.formatted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate">
          <span>
            Wallet{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_ADDRESS}${REFERENCE.address}`}
              target="_blank"
              rel="noreferrer"
            >
              {REFERENCE.address.slice(0, 10)}…
            </a>
          </span>
          <span>{REFERENCE.txs} outgoing transactions at the snapshot block</span>
          <span>
            LPK deployment{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_TX}0xbf309a965b0546c9464189a976d81fa77010cc59b02e54ba0578a310b555dc23`}
              target="_blank"
              rel="noreferrer"
            >
              0xbf309a96…
            </a>
          </span>
        </div>
      </section>

      <p className="text-sm text-slate">
        Read-only by construction: {lamp.name} has no key, no signer, no broadcast path.
        LIGHTKEEPER never sees, holds, or asks for private keys.
      </p>
    </div>
  );
}
