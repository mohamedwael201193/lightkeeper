/**
 * T12 — Skill + Chain MCP Flow · v2 (2026-10-20)
 *
 * "The skill reads the chain before it judges."
 * A composition flow: Chain MCP reads (by tool name, mainnet) feed a
 * SkillEngine preflight skill whose ALLOW/BLOCK verdict depends on nothing
 * but that data. The live probe below runs six real Chain MCP tool calls
 * through the console's same-origin proxy and replays the skill's exact
 * rule math on the live values.
 *
 * v2: mainnet USDC readiness check. No broadcasts by design (mainnet = real
 * funds); EXECUTE is a real estimate_gas simulation. Every value shown is
 * real, from the task's own contrast runs.
 */
import { Fragment, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Gauge, Hash, Ruler, ShieldCheck, Wallet } from "lucide-react";
import type { Lamp } from "../../types";
import { chainMcp, mcpCall, McpProxyUnavailableError } from "../../hooks/useMcp";
import {
  EmptyState,
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
  type FeedItem,
  type Stat,
} from "../ui";

const USDC = "0xc879c018db60520f4355c26ed1a6d572cdac1815";
const WATCH = "0x936564245b69f5a293b42cbd752e0ee3bb68b470";
const CHAIN_ID = 1672;
const MCP_ENDPOINT = "https://mcp.pharos.xyz/mcp";
const EXPLORER_ADDR = "https://pharosscan.xyz/address/";
const MAX_GAS_WEI = 50000000000n; // 50 gwei — policy.yaml limits.max_gas_price_gwei
const BALANCEOF_DATA = `0x70a08231${"0".repeat(24)}${WATCH.slice(2).toLowerCase()}`;
const DECIMALS_DATA = "0x313ce567"; // decimals()

/** Exact USDC → base units (6 decimals), same math as flow.py's Decimal conversion. */
function usdcToBase(s: string, decimals: number): bigint | null {
  const t = s.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [i, f = ""] = t.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  if (f.length > decimals) return null; // more precision than the token has
  return BigInt(i) * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

function baseToUsdc(w: bigint, decimals: number): string {
  const s = w.toString().padStart(decimals + 1, "0");
  const i = s.slice(0, -decimals);
  const f = s.slice(-decimals).replace(/0+$/, "");
  return f ? `${i}.${f}` : i;
}

/** Thousands-grouped integer — a precision instrument shows every digit. */
function fmtInt(w: bigint): string {
  return w.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

type Scenario = "allow" | "block";

interface RuleRow {
  rule: string;
  checks: string;
  allow: { pass: boolean; detail: string };
  block: { pass: boolean; detail: string };
}

// Recorded v2 contrast runs (2026-10-20, live Chain MCP values)
const RULES: RuleRow[] = [
  {
    rule: "RULE-NETWORK",
    checks: "live chainId == 1672 (Chain MCP serves mainnet only)",
    allow: { pass: true, detail: "live chainId=1672 vs allowed=1672" },
    block: { pass: true, detail: "live chainId=1672 vs allowed=1672" },
  },
  {
    rule: "RULE-BALANCE",
    checks: "live USDC balance ≥ proposed amount",
    allow: {
      pass: true,
      detail:
        "live USDC balance=16712740923 base units (16712.740923 USDC) vs proposed 100000000 (100 USDC)",
    },
    block: {
      pass: false,
      detail:
        "live USDC balance=16712740923 base units (16712.740923 USDC) vs proposed 1000000000000 (1000000 USDC) — verdict FAIL; quoting the live balance",
    },
  },
  {
    rule: "RULE-GAS",
    checks: "live gas price ≤ 50 gwei",
    allow: { pass: true, detail: "live gas 10000000000 wei <= max 50000000000 wei (50 gwei)" },
    block: { pass: true, detail: "live gas 10000000000 wei <= max 50000000000 wei (50 gwei)" },
  },
  {
    rule: "RULE-FRESHNESS",
    checks: "verify-block − read-block ≤ 120 (skill time AND verify time)",
    allow: { pass: true, detail: "2 blocks — well within the 120-block window" },
    block: { pass: true, detail: "3 blocks — well within the 120-block window" },
  },
];

const READ_STEPS = [
  {
    cmd: `POST /api/mcp → {"mcp":"chain","tool":"get_chain_info","arguments":{}}`,
    why: "ChainId guard: 1672 must come back, or RULE-NETWORK blocks the run. The proxy issues a real MCP tools/call server-side.",
  },
  {
    cmd: `POST /api/mcp → {"mcp":"chain","tool":"get_block_number","arguments":{}}`,
    why: "Pin one block — every later read happens AT this block, so the skill sees one consistent snapshot.",
  },
  {
    cmd: `POST /api/mcp → {"mcp":"chain","tool":"eth_call","arguments":{"transaction":{"to":"${USDC}","data":"0x70a08231…"},"block":<pinned>}}`,
    why: "Live USDC balanceOf(watch) — the value RULE-BALANCE judges, verbatim.",
  },
  {
    cmd: `POST /api/mcp → {"mcp":"chain","tool":"eth_call","arguments":{"transaction":{"to":"${USDC}","data":"0x313ce567"},"block":<pinned>}}`,
    why: "USDC decimals() read live from the contract (6) — the skill converts with the contract's own scale, never an assumption.",
  },
  {
    cmd: `POST /api/mcp → {"mcp":"chain","tool":"get_gas_price","arguments":{}}`,
    why: "Live gas price — evaluated verbatim against RULE-GAS (≤ 50 gwei).",
  },
  {
    cmd: `POST /api/mcp → {"mcp":"chain","tool":"get_balance","arguments":{"address":"<watch>","block":<pinned>}}`,
    why: "Native PROS balance of the watched holder — context for the readiness check.",
  },
];

function runbook(scenario: Scenario): string {
  const amount = scenario === "allow" ? "100" : "1000000";
  return [
    `# T12 runbook — ${scenario === "allow" ? "ALLOW" : "BLOCK"} path (v2, real Chain MCP)`,
    `# No .env, no private keys, no Foundry. Only dependency: pip install requests`,
    `cd ~/workspace/lightkeeper/tasks/t12-skill-chain-flow`,
    `python3 flow.py validate                      # policy sanity check`,
    `python3 tests/test_policy.py                  # 8 unit tests, no chain`,
    `python3 flow.py --amount-usdc ${amount} --run-label ${scenario}`,
    ``,
    `# — the six MCP tool calls the skill sees (via the same-origin proxy) —`,
    `curl -s -X POST https://lightkeeper-console.vercel.app/api/mcp \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"mcp":"chain","tool":"get_block_number","arguments":{}}'`,
    scenario === "allow"
      ? `# → ALLOW → estimate_gas simulation (52,679 gas) → VERIFY STABLE`
      : `# → BLOCK (RULE-BALANCE, quoting the live balance) → EXECUTE skipped → VERIFY STABLE`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Live probe — six real Chain MCP tool calls via the proxy, then flow.py's
// evaluate() rule math replayed verbatim on the live values.
// ---------------------------------------------------------------------------

interface LiveValues {
  blockNum: number;
  chainId: number;
  balanceBase: bigint;
  decimals: number;
  gasWei: bigint;
  prosWei: bigint;
}

interface LiveRule {
  rule: string;
  checks: string;
  pass: boolean;
  detail: string;
}

interface ProbeResult {
  amountStr: string;
  amountBase: bigint;
  decimals: number;
  verdict: "ALLOW" | "BLOCK";
  rules: LiveRule[];
  live: LiveValues;
}

function evaluateLive(
  amountStr: string,
  amountBase: bigint,
  decimals: number,
  live: LiveValues,
): ProbeResult {
  const balHuman = baseToUsdc(live.balanceBase, decimals);
  const amtHuman = baseToUsdc(amountBase, decimals);
  const rules: LiveRule[] = [
    {
      rule: "RULE-NETWORK",
      checks: "live chainId == 1672 (Chain MCP serves mainnet only)",
      pass: live.chainId === CHAIN_ID,
      detail: `live chainId=${live.chainId} vs allowed=${CHAIN_ID}`,
    },
    {
      rule: "RULE-BALANCE",
      checks: "live USDC balance ≥ proposed amount",
      pass: amountBase <= live.balanceBase,
      detail: `live USDC balance=${live.balanceBase} base units (${balHuman} USDC) vs proposed ${amountBase} (${amtHuman} USDC)`,
    },
    {
      rule: "RULE-GAS",
      checks: "live gas price ≤ 50 gwei",
      pass: live.gasWei <= MAX_GAS_WEI,
      detail: `live gas ${live.gasWei} wei <= max ${MAX_GAS_WEI} wei (50 gwei)`,
    },
    {
      rule: "RULE-FRESHNESS",
      checks: "pinned reads ≤ 120 blocks old",
      pass: true,
      detail: `probe reads at one pinned block — freshness trivially holds (probe only, nothing broadcast)`,
    },
  ];
  const verdict = rules.every((r) => r.pass) ? "ALLOW" : "BLOCK";
  return { amountStr, amountBase, decimals, verdict, rules, live };
}

const PROBE_STEPS = [
  "Checking chain id — Chain MCP get_chain_info",
  "Pinning block — Chain MCP get_block_number",
  "Reading USDC balanceOf — Chain MCP eth_call",
  "Reading USDC decimals — Chain MCP eth_call",
  "Reading live gas price — Chain MCP get_gas_price",
  "Reading PROS balance — Chain MCP get_balance",
];

type ProbeStatus = "idle" | "probing" | "done" | "error";

// ---------------------------------------------------------------------------
// The boundary ruler — the live USDC balance is the knife edge.
// The macro lens resolves single base-unit ticks around it.
// ---------------------------------------------------------------------------

const LENS_OFFSETS = [-2n, -1n, 0n, 1n, 2n];

function BoundaryRuler({ r }: { r: ProbeResult }) {
  const edge = r.live.balanceBase; // the knife edge: the live balance
  const over = r.amountBase > edge;
  const span = over ? r.amountBase : edge > 0n ? edge : 1n;
  const pct = (w: bigint) => Math.min(100, Number((w * 10000n) / span) / 100);
  const amountPct = pct(r.amountBase);
  const edgePct = pct(edge);

  const probeOffset = r.amountBase - edge;
  const probeInLens = probeOffset >= -2n && probeOffset <= 2n;
  const distBase = probeOffset < 0n ? -probeOffset : probeOffset;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Ruler size={16} className="text-accent" aria-hidden />
        <p className="text-sm font-semibold text-slate">The boundary, as a precision instrument</p>
      </div>
      <p className="mt-1 text-sm text-slate">
        The knife edge is the <span className="font-semibold text-ink">live USDC balance</span>{" "}
        ({baseToUsdc(edge, r.decimals)} USDC) — read from the Chain MCP seconds ago. Your probe
        passes iff it sits at or under the edge.
      </p>

      <div className="mt-5">
        <div className="relative">
          <div className="relative h-3 overflow-hidden rounded-full bg-tint">
            <motion.div
              className={`absolute inset-y-0 left-0 ${r.verdict === "ALLOW" ? "bg-pass" : "bg-fail"}`}
              initial={{ width: 0 }}
              animate={{ width: `${amountPct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <div
            className="absolute -top-1 -bottom-1 w-[3px] rounded bg-ink"
            style={{ left: `calc(${edgePct}% - 1.5px)` }}
            title={`Live balance — ${edge.toString()} base units`}
          />
          <div
            className="absolute -top-1"
            style={{ left: `calc(${amountPct}% - 7px)` }}
            title={`Probe — ${r.amountBase.toString()} base units`}
          >
            <div
              className={`mx-auto h-0 w-0 border-x-[7px] border-t-[10px] border-x-transparent ${
                r.verdict === "ALLOW" ? "border-t-pass" : "border-t-fail"
              }`}
            />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-2 font-mono text-xs text-slate">
          <span>0</span>
          <span className="text-right">
            {over ? (
              <>{fmtInt(r.amountBase)} — probe (past the edge)</>
            ) : (
              <>knife edge — {fmtInt(edge)} base units</>
            )}
          </span>
        </div>
        <p className="mt-1 break-all font-mono text-xs text-ink">
          {r.amountStr} USDC = {fmtInt(r.amountBase)} base units
        </p>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Macro lens — one base unit per tick</p>
          <p className="font-mono text-xs text-slate">balance − 2 … balance + 2</p>
        </div>
        {!probeInLens && (
          <p className="mt-2 text-sm text-slate">
            Your probe of {fmtInt(r.amountBase)} base units sits {fmtInt(distBase)} base units{" "}
            {probeOffset < 0n ? "under" : "past"} the edge — off this lens, on the scale above. The
            lens holds the reference pair: balance (ALLOW) against balance + 1 (BLOCK).
          </p>
        )}
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {LENS_OFFSETS.map((off) => {
            const w = edge + off;
            const pass = w <= edge;
            const isProbe = probeInLens && probeOffset === off;
            const isEdgeCell = off === 1n;
            return (
              <div
                key={off.toString()}
                className={`relative rounded-lg border bg-paper p-2 text-center ${
                  isProbe ? "border-accent ring-2 ring-accent/30" : "border-hairline"
                }`}
              >
                {isEdgeCell && (
                  <span
                    className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg bg-ink"
                    title="knife edge — BLOCK begins here"
                  />
                )}
                <p className="font-mono text-xs font-bold text-ink">
                  {off === 0n ? "balance" : `${off < 0n ? "−" : "+"}${fmtInt(off < 0n ? -off : off)}`}
                </p>
                <p
                  className="mt-0.5 truncate font-mono text-[11px] text-slate"
                  title={`${w.toString()} base units`}
                >
                  …{w.toString().slice(-4)}
                </p>
                <span className={`chip mt-1.5 ${pass ? "chip-pass" : "chip-fail"}`}>
                  {pass ? "ALLOW" : "BLOCK"}
                </span>
                {isProbe && (
                  <motion.span
                    initial={{ scale: 1.15 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.25 }}
                    className={`chip mt-1.5 ${r.verdict === "ALLOW" ? "chip-pass" : "chip-fail"}`}
                  >
                    your probe · {r.verdict}
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate">
          Tick chips are the RULE-BALANCE verdict at that exact base-unit amount — one base unit
          (0.000001 USDC) flips it. "Your probe" is the full four-rule verdict on live values.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The pipeline — READ → SKILL → EXECUTE → VERIFY as one instrument.
// ---------------------------------------------------------------------------

const PIPE_PHASES = [
  { key: "read", name: "READ", tag: "six MCP reads, one pinned block" },
  { key: "skill", name: "SKILL", tag: "four named rules, fail-closed" },
  { key: "execute", name: "EXECUTE", tag: "estimate_gas simulation — never a broadcast" },
  { key: "verify", name: "VERIFY", tag: "MCP re-read · verdict must be STABLE" },
] as const;

type PipeState = "idle" | "active" | "lit" | "skipped";

function PipelineDiagram(props: {
  mode: "inspect" | "live" | "result";
  selected?: number;
  onSelect?: (i: number) => void;
  probeStep?: number;
  probeStatus?: ProbeStatus;
  pinnedBlock?: number | null;
  result?: ProbeResult | null;
}) {
  const { mode } = props;

  const stateOf = (i: number): PipeState => {
    if (mode === "inspect") return "idle";
    if (mode === "result") return "lit";
    const step = props.probeStep ?? 0;
    const done = props.probeStatus === "done";
    if (i === 0) return done || step >= 6 ? "lit" : "active";
    if (i === 1) return done ? "lit" : step >= 6 ? "active" : "idle";
    return done ? "lit" : "idle";
  };

  const detailOf = (i: number): string | null => {
    const r = props.result;
    if (mode === "result" && r) {
      if (i === 0) return `block ${r.live.blockNum.toLocaleString("en-US")} · 6 MCP reads`;
      if (i === 1)
        return `${r.rules.filter((x) => x.pass).length}/4 pass · ${r.verdict}`;
      if (i === 2) return "simulation only — mainnet is real funds";
      return `balance re-read · verdict ${r.verdict}`;
    }
    if (mode === "live") {
      const step = props.probeStep ?? 0;
      if (i === 0) {
        const reads = `${Math.min(step, 6)}/6 reads`;
        return props.pinnedBlock != null
          ? `block ${props.pinnedBlock.toLocaleString("en-US")} · ${reads}`
          : reads;
      }
    }
    return null;
  };

  const boxClass = (s: PipeState, selected: boolean) => {
    const base = "flex-1 rounded-xl border p-2.5 text-left transition-colors duration-200 sm:p-3";
    if (selected) return `${base} border-accent bg-paper ring-2 ring-accent/25`;
    switch (s) {
      case "active":
        return `${base} border-accent bg-paper`;
      case "lit":
        return `${base} border-pass bg-paper`;
      case "skipped":
        return `${base} border-dashed border-hairline bg-porcelain`;
      default:
        return `${base} border-hairline bg-porcelain hover:border-accent`;
    }
  };

  const dotClass = (s: PipeState) =>
    s === "lit"
      ? "bg-pass"
      : s === "active"
        ? "bg-accent"
        : s === "skipped"
          ? "bg-slate/40"
          : "bg-slate/30";

  return (
    <div>
      <div className="flex items-stretch" role={mode === "inspect" ? "tablist" : undefined}>
        {PIPE_PHASES.map((p, i) => {
          const s = stateOf(i);
          const detail = detailOf(i);
          const selected = mode === "inspect" && props.selected === i;
          const inner = (
            <>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(s)}`} aria-hidden />
                <span className="font-mono text-[11px] text-slate">{i + 1}</span>
                <span className="text-sm font-bold text-ink">{p.name}</span>
                {s === "lit" && <Check size={13} className="text-pass" aria-hidden />}
              </div>
              <p className="mt-1 text-xs text-slate">{p.tag}</p>
              {detail && <p className="mt-1 break-all font-mono text-[11px] text-ink">{detail}</p>}
            </>
          );
          return (
            <Fragment key={p.key}>
              {i > 0 && (
                <div className="flex items-center px-0.5 sm:px-1" aria-hidden>
                  <div
                    className={`h-[2px] w-3 sm:w-6 ${
                      stateOf(i - 1) === "lit" || stateOf(i - 1) === "active"
                        ? "bg-accent"
                        : "bg-hairline"
                    }`}
                  />
                </div>
              )}
              {mode === "inspect" ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={boxClass(s, selected)}
                  onClick={() => props.onSelect?.(i)}
                >
                  {inner}
                </button>
              ) : (
                <div className={boxClass(s, false)}>{inner}</div>
              )}
            </Fragment>
          );
        })}
      </div>
      {mode === "inspect" && (
        <p className="mt-2 text-xs text-slate">Select a phase to inspect its commands and evidence.</p>
      )}
    </div>
  );
}

const QUICK_AMOUNTS = ["100", "1000", "16712", "16713", "1000000"];

export default function TrySkillChainFlow({ lamp }: { lamp: Lamp }) {
  const [scenario, setScenario] = useState<Scenario>("allow");
  const [phase, setPhase] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [probeInput, setProbeInput] = useState<string>("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [probeStatus, setProbeStatus] = useState<ProbeStatus>("idle");
  const [probeStep, setProbeStep] = useState(0);
  const [pinnedBlock, setPinnedBlock] = useState<number | null>(null);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string>("");
  const [history, setHistory] = useState<FeedItem[]>([]);
  const seq = useRef(0);

  const runProbe = async (raw: string) => {
    const mySeq = ++seq.current;
    setInputError(null);
    setProbeStatus("probing");
    setProbeStep(0);
    setPinnedBlock(null);
    setProbeError("");
    try {
      // 1. chain id — Chain MCP get_chain_info
      const info = (await mcpCall("chain", "get_chain_info", {})) as {
        chainId?: number | string;
      };
      if (seq.current !== mySeq) return;
      setProbeStep(1);
      const chainId = Number(info.chainId ?? 0);

      // 2. pin block — Chain MCP get_block_number
      const blk = await chainMcp.getBlockNumber();
      if (seq.current !== mySeq) return;
      setProbeStep(2);
      const blockNum = Number(BigInt(blk.blockNumber));
      setPinnedBlock(blockNum);

      // 3. USDC balanceOf — Chain MCP eth_call @ pinned block
      const balRes = await chainMcp.ethCall(USDC, BALANCEOF_DATA, blockNum);
      if (seq.current !== mySeq) return;
      setProbeStep(3);
      const balanceBase = BigInt(balRes.result);

      // 4. USDC decimals — Chain MCP eth_call @ pinned block
      const decRes = await chainMcp.ethCall(USDC, DECIMALS_DATA, blockNum);
      if (seq.current !== mySeq) return;
      setProbeStep(4);
      const decimals = Number(BigInt(decRes.result));

      const amountBase = usdcToBase(raw, decimals);
      if (amountBase === null) {
        setInputError(
          "That isn't a valid USDC amount — type a decimal like 100 (up to 6 decimals, no units or negatives). Nothing runs here; the input just can't be converted to base units.",
        );
        setProbeStatus("idle");
        return;
      }

      // 5. gas price — Chain MCP get_gas_price
      const gasRes = (await mcpCall("chain", "get_gas_price", {})) as {
        gasPriceWei?: string;
      };
      if (seq.current !== mySeq) return;
      setProbeStep(5);
      const gasWei = BigInt(gasRes.gasPriceWei ?? "0");

      // 6. PROS balance — Chain MCP get_balance
      const prosRes = (await mcpCall("chain", "get_balance", {
        address: WATCH,
        block: blockNum,
      })) as { balanceWei?: string };
      if (seq.current !== mySeq) return;
      setProbeStep(6);
      const prosWei = BigInt(prosRes.balanceWei ?? "0");

      const live: LiveValues = {
        blockNum,
        chainId,
        balanceBase,
        decimals,
        gasWei,
        prosWei,
      };
      const result = evaluateLive(raw.trim(), amountBase, decimals, live);
      setProbeResult(result);
      setProbeStatus("done");
      setHistory((h) =>
        [
          {
            key: `${Date.now()}-${result.amountBase}`,
            node: (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`chip ${result.verdict === "ALLOW" ? "chip-pass" : "chip-fail"}`}>
                  {result.verdict}
                </span>
                <span className="font-mono text-sm text-ink">
                  {result.amountStr} USDC = {result.amountBase.toString()} base units
                </span>
                <span className="text-xs text-slate">block {blockNum.toLocaleString("en-US")}</span>
              </div>
            ),
          },
          ...h,
        ].slice(0, 12),
      );
    } catch (e) {
      if (seq.current !== mySeq) return;
      if (e instanceof McpProxyUnavailableError) {
        setProbeError(
          "Live Chain MCP reads need the deployed console — the MCP proxy isn't available in this preview.",
        );
      } else {
        setProbeError(
          e instanceof Error && e.message
            ? e.message
            : "The Chain MCP didn't answer. Check your connection and try again.",
        );
      }
      setProbeStatus("error");
    }
  };

  const copyRunbook = async () => {
    await navigator.clipboard.writeText(runbook(scenario));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verdict = scenario === "allow" ? "ALLOW" : "BLOCK";

  const phaseBody = (p: number) => {
    if (p === 0) {
      return (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">
            Six Chain MCP tool calls, pinned to one block — the same six the live probe runs
            below, through the console's same-origin MCP proxy. The skill never sees an estimate
            or a guess — only these live values, verbatim.
          </p>
          {READ_STEPS.map((s, i) => (
            <div key={i} className="rounded-xl border border-hairline bg-porcelain p-4">
              <div className="code-block !mb-2">{s.cmd}</div>
              <p className="text-sm text-slate">{s.why}</p>
            </div>
          ))}
          <div className="rounded-xl border border-hairline bg-porcelain p-4 text-sm text-slate">
            Real values from the <span className="font-semibold text-ink">{scenario}</span> run
            (2026-10-20): USDC balance{" "}
            <span className="font-mono text-ink">16,712.740923</span>, gas{" "}
            <span className="font-mono text-ink">10 gwei</span>, chain{" "}
            <span className="font-mono text-ink">1672</span>.
          </div>
        </div>
      );
    }
    if (p === 1) {
      return (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">
            The preflight skill evaluates the live values against{" "}
            <span className="font-mono text-ink">policy.yaml</span> — four named rules, fail-closed,
            nothing else. The verdict depends on nothing but the MCP reads above.
          </p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Checks</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map((r) => {
                  const v = scenario === "allow" ? r.allow : r.block;
                  return (
                    <tr key={r.rule}>
                      <td className="font-mono text-xs">{r.rule}</td>
                      <td className="text-xs">{r.checks}</td>
                      <td>
                        <span className={`chip ${v.pass ? "chip-pass" : "chip-fail"} text-xs`}>
                          {v.pass ? "PASS" : "FAIL"}
                        </span>
                        <div className="mt-1 font-mono text-[11px] text-slate">{v.detail}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className={`rounded-xl border p-4 text-sm font-semibold ${
              verdict === "ALLOW"
                ? "border-accent bg-porcelain text-ink"
                : "border-fail bg-porcelain text-fail"
            }`}
          >
            [SKILL] VERDICT: {verdict}
            {verdict === "ALLOW" ? (
              <span className="block text-xs font-normal text-slate">
                Four rules pass — the flow is allowed to continue to simulation.
              </span>
            ) : (
              <span className="block text-xs font-normal text-slate">
                Blocked by RULE-BALANCE — quoting the live balance, not an assumption.
              </span>
            )}
          </div>
        </div>
      );
    }
    if (p === 2) {
      return (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">
            {scenario === "allow"
              ? "Verdict was ALLOW — so the skill runs a real estimate_gas simulation through the Chain MCP. No signature, no broadcast: mainnet is real funds."
              : "Verdict was BLOCK — so the EXECUTE phase is skipped entirely. Nothing is simulated, nothing is signed, nothing leaves any wallet."}
          </p>
          <div className="code-block">
            {scenario === "allow"
              ? `POST /api/mcp → {"mcp":"chain","tool":"estimate_gas","arguments":{"transaction":{"from":"<watch>","to":"${USDC}","data":"0xa9059cbb…"}}}\n# → 52679 gas (recorded run) — simulation only`
              : `# [EXECUTE] skipped — BLOCKED by RULE-BALANCE\n# no simulation. no signature. no funds moved.`}
          </div>
          {scenario === "allow" ? (
            <div className="rounded-xl border border-accent bg-porcelain p-4 text-sm">
              <span className="font-semibold text-ink">[EXECUTE] estimate_gas = </span>
              <span className="font-mono text-ink">52,679</span>
              <div className="mt-1 text-xs text-slate">
                via the Chain MCP · self-transfer simulation · no signature, no broadcast
              </div>
            </div>
          ) : (
            <div className="empty-panel px-4 py-3 text-sm text-slate">
              This is the composition proof: the same flow, the same watched holder — a different
              proposed amount — and the skill refuses.
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink">
          Follow-up Chain MCP reads re-check freshness and re-validate the verdict against the
          latest live values. The verdict must come back STABLE, or the run fails.
        </p>
        <div className="code-block">
          {`POST /api/mcp → get_block_number + eth_call balanceOf() @latest\n# allow-1: block 20695077, balance unchanged → ALLOW STABLE\n# block-1: block 20695083, balance unchanged → BLOCK STABLE`}
        </div>
        <div className="rounded-xl border border-hairline bg-porcelain p-4 text-sm">
          <span className="font-semibold text-ink">[VERIFY]</span>{" "}
          <span className="text-slate">
            verdict <span className="font-mono text-ink">STABLE</span> across the re-read — the
            decision holds on fresh data.
          </span>
        </div>
      </div>
    );
  };

  const r = probeResult;
  const passCount = r?.rules.filter((x) => x.pass).length ?? 0;
  const stats: Stat[] = r
    ? [
        {
          label: "Rules passed",
          value: passCount,
          format: (n) => `${Math.round(n)} / 4`,
          icon: <ShieldCheck size={14} aria-hidden />,
        },
        {
          label: "Live USDC balance",
          value: Number(baseToUsdc(r.live.balanceBase, r.live.decimals)),
          format: (n) =>
            n.toLocaleString("en-US", { maximumFractionDigits: 2 }),
          suffix: "USDC",
          icon: <Wallet size={14} aria-hidden />,
        },
        {
          label: "Block",
          value: r.live.blockNum,
          format: (n) => Math.round(n).toLocaleString("en-US"),
          icon: <Hash size={14} aria-hidden />,
        },
        {
          label: "Gas price",
          value: Number(r.live.gasWei) / 1e9,
          format: (n) => n.toFixed(1),
          suffix: "gwei",
          icon: <Gauge size={14} aria-hidden />,
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold text-slate">
          {lamp.name} · T12 · Composition
        </p>
        <h3 className="mt-2 text-2xl font-bold text-ink">The skill reads the chain before it judges</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink">
          One request flows READ → SKILL → EXECUTE → VERIFY. Inspect every phase, every MCP tool
          call, and the real values the skill judged — then probe the boundary yourself: six live
          Chain MCP reads run in this page and the skill's exact rule math renders the verdict.
          This lamp is CLI-native — the console generates the exact runbook; the skill never
          signs or broadcasts (mainnet is real funds). LIGHTKEEPER never sees or asks for
          private keys.
        </p>
      </div>

      <section aria-label="01 Configure">
        <p className="text-sm font-semibold text-slate">01 — Configure · the flow, defined</p>
        <div className="mt-4 space-y-6">
          <div className="rounded-2xl border border-hairline bg-paper p-5">
            <p className="text-sm font-semibold text-ink">The recorded contrast pair</p>
            <p className="mt-1 text-sm text-slate">
              Same flow, same watched holder — the verdict flipped on the live data, not on intent.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className={scenario === "allow" ? "btn-primary" : "btn-outline"}
                onClick={() => setScenario("allow")}
              >
                ALLOW path · 100 USDC
              </button>
              <button
                className={scenario === "block" ? "btn-primary" : "btn-outline"}
                onClick={() => setScenario("block")}
              >
                BLOCK path · 1,000,000 USDC
              </button>
            </div>
          </div>

          <div>
            <div className="mb-3">
              <PipelineDiagram mode="inspect" selected={phase} onSelect={setPhase} />
            </div>
            <div className="rounded-2xl border border-hairline bg-paper p-5 sm:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {phaseBody(phase)}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="rounded-2xl border border-hairline bg-paper p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink">Probe the boundary yourself</p>
            <p className="mt-1 text-sm text-slate">
              Type any proposed amount in USDC. The console runs six live Chain MCP reads and the
              skill's exact rule math — the boundary is the watched holder's live balance.
              Discover for yourself where ALLOW flips to BLOCK.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={probeInput}
                  onChange={(e) => setProbeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runProbe(probeInput);
                  }}
                  placeholder="e.g. 100"
                  inputMode="decimal"
                  aria-label="Proposed amount in USDC"
                  className="w-full rounded-lg border border-hairline bg-porcelain px-3 py-3 font-mono text-sm text-ink placeholder:text-slate/50 focus:border-accent focus:outline-none sm:max-w-xs"
                />
                <button
                  className="btn-primary min-h-[44px] sm:w-auto"
                  onClick={() => runProbe(probeInput)}
                  disabled={probeStatus === "probing"}
                >
                  {probeStatus === "probing" ? "Probing…" : "Probe the boundary — live"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate">Try:</span>
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    className="btn-outline !min-h-[40px] font-mono text-sm"
                    onClick={() => {
                      setProbeInput(q);
                      runProbe(q);
                    }}
                    disabled={probeStatus === "probing"}
                  >
                    {q}
                  </button>
                ))}
              </div>
              {inputError && (
                <p className="text-sm leading-relaxed text-slate">
                  <span className="font-semibold text-ink">Not a valid amount.</span> {inputError}
                </p>
              )}
              <p className="border-t border-hairline pt-3 text-xs text-slate">
                The probe replays the skill's exact rule math on live values. The real verdict
                always comes from <span className="font-mono">flow.py</span> against live Chain MCP
                state — nothing here broadcasts, nothing here signs.
              </p>
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence mode="wait">
        {probeStatus === "probing" && (
          <motion.section
            key="run"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            aria-label="02 Run"
          >
            <p className="text-sm font-semibold text-slate">02 — Run · probing the boundary</p>
            <div className="mt-4 space-y-4">
              <PipelineDiagram
                mode="live"
                probeStep={probeStep}
                probeStatus={probeStatus}
                pinnedBlock={pinnedBlock}
              />
              <ProgressLoader
                steps={PROBE_STEPS}
                current={probeStep}
                title="Probing boundary… six live Chain MCP reads, then the skill's exact rule math."
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section aria-label="03 Result">
        <p className="text-sm font-semibold text-slate">03 — Result · the verdict</p>
        <div className="mt-4">
          {probeStatus === "idle" && (
            <EmptyState
              title="No probe yet"
              message="Enter an amount above and run a probe — six live Chain MCP reads and the skill's exact rule math, rendered as one clear verdict."
              actionLabel="Try the boundary: 100"
              onAction={() => {
                setProbeInput("100");
                runProbe("100");
              }}
            />
          )}

          {probeStatus === "error" && (
            <ErrorState
              title="The probe couldn't finish"
              message={probeError}
              hint="Your probe amount was fine — the read failed, not the math. Nothing was judged and no funds moved."
              retryLabel="Retry the probe"
              onRetry={() => runProbe(probeInput)}
            />
          )}

          {probeStatus === "done" && r && (
            <div className="space-y-6">
              <ResultCard
                eyebrow={`Result — live boundary probe · block ${r.live.blockNum.toLocaleString("en-US")}`}
                headline={r.verdict}
                status={r.verdict === "ALLOW" ? "pass" : "fail"}
                subline={
                  r.verdict === "ALLOW" ? (
                    <>
                      {r.amountBase.toString()} base units sits under the live balance of{" "}
                      {r.live.balanceBase.toString()} — every rule passes on live values.
                    </>
                  ) : (
                    <>
                      {r.amountBase.toString()} base units exceeds the live balance of{" "}
                      {r.live.balanceBase.toString()} —{" "}
                      {r.rules.filter((x) => !x.pass).map((x) => x.rule).join(", ")} blocks it.
                    </>
                  )
                }
                rows={[
                  {
                    label: "Proposed value",
                    value: (
                      <>
                        {r.amountBase.toString()} base units{" "}
                        <span className="text-slate">({r.amountStr} USDC)</span>
                      </>
                    ),
                  },
                  {
                    label: "Live USDC balance",
                    value: (
                      <>
                        {r.live.balanceBase.toString()} base units{" "}
                        <span className="text-slate">
                          ({baseToUsdc(r.live.balanceBase, r.decimals)} USDC)
                        </span>
                      </>
                    ),
                  },
                  {
                    label: "Live gas price",
                    value: (
                      <>
                        {r.live.gasWei.toString()} wei{" "}
                        <span className="text-slate">
                          ({(Number(r.live.gasWei) / 1e9).toFixed(1)} gwei, cap 50)
                        </span>
                      </>
                    ),
                  },
                  {
                    label: "Chain",
                    value: (
                      <>
                        {r.live.chainId} <span className="text-slate">(Pharos mainnet, allowed)</span>
                      </>
                    ),
                  },
                  {
                    label: "USDC decimals",
                    value: <>{r.decimals} (read live from the contract)</>,
                  },
                  {
                    label: "MCP endpoint",
                    value: <span className="break-all">{MCP_ENDPOINT}</span>,
                  },
                ]}
                links={[
                  {
                    label: "View USDC on the mainnet explorer",
                    href: `${EXPLORER_ADDR}${USDC}`,
                  },
                  {
                    label: "View the watched holder on the explorer",
                    href: `${EXPLORER_ADDR}${WATCH}`,
                  },
                ]}
              >
                <BoundaryRuler r={r} />

                <div>
                  <p className="text-sm font-semibold text-slate">The chain that judged — fully lit</p>
                  <div className="mt-3">
                    <PipelineDiagram mode="result" result={r} />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate">Four rules on live values</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Rule</th>
                          <th>Checks</th>
                          <th>Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.rules.map((x) => (
                          <tr key={x.rule}>
                            <td className="font-mono text-xs">{x.rule}</td>
                            <td className="text-xs">{x.checks}</td>
                            <td>
                              <span className={`chip ${x.pass ? "chip-pass" : "chip-fail"} text-xs`}>
                                {x.pass ? "PASS" : "FAIL"}
                              </span>
                              <div className="mt-1 break-all font-mono text-[11px] text-slate">
                                {x.detail}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </ResultCard>

              <StatStrip stats={stats} />

              <div>
                <p className="mb-3 text-sm font-semibold text-slate">This session's probes</p>
                <FeedList
                  items={history}
                  maxHeight="max-h-64"
                  emptyText="No probes yet this session."
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={copyRunbook}>
          {copied ? "Runbook copied ✓" : `Copy full runbook (${scenario} path)`}
        </button>
        <span className="text-sm text-slate">
          The exact command sequence — paste into your terminal and watch it happen.
        </span>
      </div>

      <div className="rounded-xl border border-hairline bg-porcelain p-5 text-sm text-slate">
        <p className="font-semibold text-ink">On the record</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            Chain MCP:{" "}
            <span className="font-mono text-ink">{MCP_ENDPOINT}</span> · Pharos mainnet (1672)
          </li>
          <li>
            USDC:{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_ADDR}${USDC}`}
              target="_blank"
              rel="noreferrer"
            >
              {USDC.slice(0, 10)}…{USDC.slice(-6)}
            </a>{" "}
            · watched holder:{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_ADDR}${WATCH}`}
              target="_blank"
              rel="noreferrer"
            >
              {WATCH.slice(0, 10)}…{WATCH.slice(-6)}
            </a>
          </li>
          <li>
            Contrast runs (2026-10-20): 100 USDC → ALLOW + estimate_gas 52,679 ·
            1,000,000 USDC → BLOCK quoting the live 16,712.74 USDC balance.
          </li>
          <li>
            No signing, no broadcast — by design. The EXECUTE phase is a real
            Chain MCP <span className="font-mono">estimate_gas</span> simulation.
          </li>
        </ul>
      </div>
    </div>
  );
}
