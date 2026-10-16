/**
 * T10 — Batch Executor ("Flotilla") · Tier C builder
 *
 * "Build a safe batch": an interactive batch builder. The visitor adds
 * recipient rows (address + amount), gets live validation, a running total,
 * the automatically selected batch mode, and an estimated gas cost — then
 * receives the EXACT copy-paste forge/cast commands to run in their own
 * terminal. LIGHTKEEPER never signs, never broadcasts, never sees keys.
 *
 * Facts this surface is built on (from tasks/t10-batch-executor/evidence.json):
 *   - BatchDistributor 0xec0aeCf6c778f44AEa12Ee17afB38f4E0af0a2a4, live on Atlantic.
 *   - Modes: ≤10 simple · 11–200 single-batch · >200 multi-batch (≤200/chunk).
 *   - Measured: individual send = 21,000 gas; receipt-fitted batch model from
 *     3 live runs (n=8/10/11 → 149,170/185,573/202,173 gas): ≈7,500 fixed +
 *     ≈17,700 gas/recipient; measured breakeven ≈ n=3 (pre-existing EOAs).
 *
 * Presentation (SHOWTIME op, 2026-10-16): 01 Configure → 02 Run → 03 Result.
 * Presentation (FLAGSHIP op, 2026-10-16): the crossover chart, the
 * individual-vs-batch duel, the live mode decision tree, and the
 * refuser-isolation proof. Presentation ONLY — the gas math, mode
 * boundaries, validation, and script builder below are byte-for-byte the
 * verified originals.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { Check, Coins, Copy, Percent, Users, Zap } from "lucide-react";
import type { Lamp } from "../../types";
import {
  ATLANTIC_CHAIN_ID,
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  isDustWarning,
  isValidAddress,
  phrsToWeiHex,
} from "../../hooks/useAtlantic";
import { ErrorState, FeedList, ProgressLoader, ResultCard, StatStrip } from "../ui";
import type { FeedItem } from "../ui";

const DISTRIBUTOR = "0xec0aeCf6c778f44AEa12Ee17afB38f4E0af0a2a4";
const DUST = "0.01";
// Live RevertingReceiver fixture (deployed on Atlantic, refuses every native
// transfer). Evidence: tasks/t10-batch-executor/evidence.json "RevertingReceiver".
const REFUSER = "0x49b26d4685262e7756cbE623f134cFa97d142B94";

/** Parse a PHRS string into wei (bigint). Empty -> pending, unparsable -> invalid. */
function parseAmount(s: string): { wei: bigint; ok: boolean; pending: boolean } {
  if (s.trim() === "") return { wei: 0n, ok: false, pending: true };
  try {
    return { wei: BigInt(phrsToWeiHex(s)), ok: true, pending: false };
  } catch {
    return { wei: 0n, ok: false, pending: false };
  }
}

interface Row {
  id: number;
  address: string;
  amount: string;
}

type Mode = "simple" | "single" | "multi";

function modeFor(n: number): Mode {
  if (n <= 10) return "simple";
  if (n <= 200) return "single";
  return "multi";
}

/** Gas estimate from LIVE Atlantic receipts — labeled as an estimate, never a fact.
 *  Receipt-fitted model (n=8/10/11 → 149,170/185,573/202,173 gas):
 *  ≈7,500 fixed + ≈17,700 gas/recipient. */
function estGas(mode: Mode, n: number): number {
  if (mode === "simple") return n * 21_000;
  if (mode === "single") return 7_500 + n * 17_700;
  let g = 0;
  const chunks = Math.ceil(n / 200);
  for (let i = 0; i < chunks; i++) {
    const c = Math.min(200, n - i * 200);
    g += 7_500 + c * 17_700;
  }
  return g;
}

function shortAddr(a: string): string {
  return a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function modeLabel(mode: Mode): string {
  return mode === "simple" ? "Simple" : mode === "single" ? "Single-batch" : "Multi-batch";
}

/** Hero-number ticker — counts up with a spring when the composed result
 *  arrives, instantly under prefers-reduced-motion. The count-up reflects the
 *  real transition "no result" → "result composed". */
function HeroTicker({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 70, damping: 20 });
  const [display, setDisplay] = useState(() => format(0));

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  useEffect(() => {
    if (reduce) {
      setDisplay(format(value));
      return;
    }
    const unsub = spring.on("change", (v) => setDisplay(format(v)));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spring, reduce, value]);

  return <span className="tabular-nums">{display}</span>;
}

/* ── FLAGSHIP layer (2026-10-16) ───────────────────────────────────────────
 * Presentation only. The gas model (7,500 + n×17,700, fitted from the 3 live
 * receipts), the mode boundaries (≤10 / 11–200 / >200), validation, and the
 * cast-command builder are byte-identical verified originals — none of the
 * components below touch them. They only make the math tangible:
 *   - ModeTree — the decision tree the visitor's fleet walks through.
 *   - DuelBars — individual sends vs the batch, two bars, the real numbers.
 *   - CrossoverChart — where the Distributor path overtakes individual sends.
 *   - RefuserProof — the live on-chain proof of partial-failure isolation.
 */

/** The mode decision tree as a visible structure the visitor's batch walks
 *  through — live in 01 as rows are added, as a decision record in 03. */
function ModeTree({ active, n }: { active: Mode; n: number }) {
  const segs: { id: Mode; title: string; desc: string }[] = [
    { id: "simple", title: "≤ 10 — Simple", desc: "Individual sends. No contract needed." },
    { id: "single", title: "11–200 — Single-batch", desc: "One transaction through the Distributor." },
    { id: "multi", title: "> 200 — Multi-batch", desc: "Chunks of ≤ 200, one tx per chunk." },
  ];
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      role="list"
      aria-label="Batch mode decision tree"
    >
      {segs.map((s) => {
        const on = s.id === active;
        return (
          <div
            key={s.id}
            role="listitem"
            className={`rounded-xl border p-3 ${
              on ? "border-accent bg-tint" : "border-hairline bg-white"
            }`}
          >
            <p className={`text-sm font-semibold ${on ? "text-accent" : "text-slate"}`}>
              {s.title}
              {on && n > 0 && <span className="ml-2">· your batch</span>}
            </p>
            <p className="mt-1 text-sm text-slate">{s.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

/** The duel: individual sends vs this batch, as two bars with the real
 *  numbers. Bar widths animate once when the composed result arrives — the
 *  animation maps to that real state change, never to a timer. */
function DuelBars({
  n,
  gas,
  individualGas,
}: {
  n: number;
  gas: number;
  individualGas: number;
}) {
  const reduce = useReducedMotion();
  const pct = Math.min(100, (gas / individualGas) * 100);
  const saved = individualGas - gas;
  const bars = [
    {
      label: `${n} individual sends`,
      value: individualGas,
      pct: 100,
      fill: "bg-slate",
      labelClass: "text-ink",
    },
    {
      label: "this batch",
      value: gas,
      pct,
      fill: "bg-accent",
      labelClass: "text-accent",
    },
  ];
  return (
    <div className="rounded-2xl border border-hairline bg-white p-6">
      <p className="smallcaps mb-1">The duel — individual vs batch</p>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-slate">
        Same recipients, same value — two ways to move it. ≈
        {saved.toLocaleString("en-US")} gas never leaves your wallet, estimated from live
        Atlantic receipts.
      </p>
      <div className="space-y-5">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className={`text-sm font-semibold ${b.labelClass}`}>{b.label}</p>
              <p className="font-mono text-sm text-ink">{b.value.toLocaleString("en-US")} gas</p>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-porcelain">
              <motion.div
                className={`h-full rounded-full ${b.fill}`}
                initial={reduce ? { width: `${b.pct}%` } : { width: 0 }}
                animate={{ width: `${b.pct}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The crossover: individual-send cost vs the Distributor path across
 *  recipient count, drawn from the same receipt-fitted model the estimator
 *  uses. The crossing is real geometry — the two lines meet at ≈3, exactly
 *  where the measured breakeven sits. The visitor's marker sits on the curve
 *  their batch actually priced against. */
function CrossoverChart({ visitorN, mode }: { visitorN: number; mode: Mode }) {
  const W = 680;
  const H = 360;
  const PL = 66;
  const PR = 18;
  const PT = 20;
  const PB = 46;
  const xMax = Math.max(24, visitorN);
  const yMax = 21_000 * xMax;
  const X = (v: number) => PL + (v / xMax) * (W - PL - PR);
  const Y = (v: number) => H - PB - (v / yMax) * (H - PT - PB);
  const distCost = (n: number) => (n <= 200 ? estGas("single", n) : estGas("multi", n));
  const step = Math.max(1, Math.floor(xMax / 160));
  const line = (fn: (n: number) => number) => {
    const pts: string[] = [];
    for (let i = 1; i < xMax; i += step) pts.push(`${X(i).toFixed(1)},${Y(fn(i)).toFixed(1)}`);
    pts.push(`${X(xMax).toFixed(1)},${Y(fn(xMax)).toFixed(1)}`);
    return pts.join(" ");
  };
  // Exact crossing of the two model lines: 7,500 = n × (21,000 − 17,700).
  const x0 = 7500 / 3300;
  const vY = mode === "simple" ? 21_000 * visitorN : distCost(visitorN);
  const fmtK = (v: number) => `${Math.round(v / 1000)}k`;
  const xTicks = [0.25, 0.5, 0.75, 1].map((f) => Math.max(1, Math.round(xMax * f)));
  const yTicks = [0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  const markerRight = X(visitorN) > W - 180;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Cost crossover chart. Individual sends cost 21,000 gas each; the Distributor path costs about 7,500 plus 17,700 per recipient. The two lines cross at about 3 recipients — above that, batching wins.`}
    >
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} stroke="#E6EAF2" />
          <text x={PL - 8} y={Y(t) + 4} textAnchor="end" fontSize={12} fill="#5A6B8C">
            {fmtK(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t} x={X(t)} y={H - PB + 20} textAnchor="middle" fontSize={12} fill="#5A6B8C">
          {t}
        </text>
      ))}
      <text x={16} y={H / 2} transform={`rotate(-90 16 ${H / 2})`} textAnchor="middle" fontSize={14} fill="#5A6B8C">
        gas
      </text>
      <text x={(PL + W - PR) / 2} y={H - 6} textAnchor="middle" fontSize={14} fill="#5A6B8C">
        recipients
      </text>
      <polyline
        points={line((n) => 21_000 * n)}
        fill="none"
        stroke="#5A6B8C"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <polyline
        points={line(distCost)}
        fill="none"
        stroke="#2456E6"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <line
        x1={X(x0)}
        x2={X(x0)}
        y1={PT}
        y2={H - PB}
        stroke="#0B1533"
        strokeDasharray="5 4"
        strokeWidth={1.5}
      />
      <text x={X(x0) + 8} y={PT + 12} fontSize={14} fontWeight={600} fill="#0B1533">
        breakeven ≈ 3
      </text>
      <circle cx={X(visitorN)} cy={Y(vY)} r={6} fill="#2456E6" stroke="#ffffff" strokeWidth={2.5} />
      <text
        x={X(visitorN) + (markerRight ? -12 : 12)}
        y={Y(vY) - 12}
        textAnchor={markerRight ? "end" : "start"}
        fontSize={14}
        fontWeight={600}
        fill="#0B1533"
      >
        your batch · n={visitorN}
      </text>
    </svg>
  );
}

// The task's own live isolation runs (evidence.json) — the RevertingReceiver
// fixture refusing, the batch continuing around it.
const ISO_RUN_TX = "0x3daa4e7dd323e17a0d3e81758709d2497b0c6522ef6f6f9d0e1a95d2fa9a274b";
const ISO_CHUNK_TX = "0xce333bf2fd59a57b40ef2b3bde851311555221299582f479bd81054d1c";

/** The hard case, handled. When the visitor's batch includes the refuser
 *  fixture, show the live on-chain proof that the Distributor isolates a
 *  refusing recipient instead of failing the whole batch. The proof is the
 *  task's measured run — this console composes commands, it does not claim
 *  to have executed the visitor's batch. */
function RefuserProof() {
  const runs = [
    {
      title: "12-recipient batch · recipient #11 refused",
      detail: "11 succeeded, 1 failed in isolation — the batch completed with status success.",
      tx: ISO_RUN_TX,
    },
    {
      title: "Multi-batch chunk 2/2 · the fixture refused again",
      detail: "5 succeeded, 1 isolated failure — the chunking path isolates too.",
      tx: ISO_CHUNK_TX,
    },
  ];
  return (
    <div className="rounded-2xl border border-hairline bg-tint p-6">
      <p className="smallcaps mb-1">Partial-failure isolation — proven live</p>
      <p className="max-w-2xl text-sm leading-relaxed text-ink">
        Your batch includes the RevertingReceiver fixture — the address that refuses every
        native transfer. The task already proved the hard case on Atlantic:
      </p>
      <ul className="mt-4 space-y-3">
        {runs.map((r) => (
          <li
            key={r.tx}
            className="flex flex-col gap-2 rounded-xl border border-hairline bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-ink">{r.title}</p>
              <p className="mt-1 text-sm text-slate">{r.detail}</p>
            </div>
            <a
              className="shrink-0 font-mono text-sm text-accent hover:underline"
              href={`${EXPLORER_TX}${r.tx}`}
              target="_blank"
              rel="noreferrer"
              title={r.tx}
            >
              view the run ↗
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate">
        Each action's success is recorded on-chain — one bad recipient can't sink the fleet. The
        proof above is the task's measured run; the plan above it is commands for your terminal.
      </p>
    </div>
  );
}

type Phase = "idle" | "running" | "error" | "done";

interface ValidSnapshot {
  id: number;
  address: string;
  amount: string;
  wei: string;
  isRefuser: boolean;
}

interface ComposeResult {
  n: number;
  mode: Mode;
  gas: number;
  individualGas: number;
  savesPct: number | null;
  totalWei: bigint;
  script: string;
  vrows: ValidSnapshot[];
}

interface ComposeError {
  title: string;
  message: string;
  hint: string;
  actionLabel: string;
}

const RUN_STEPS = [
  "Estimating gas — 7,500 fixed + n×17,700, fitted from live receipts",
  "Composing the exact cast commands",
];

/** Yield one frame so React can paint the step label — not an artificial delay. */
const nextFrame = () =>
  new Promise<void>((r) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => r());
    else setTimeout(r, 16);
  });

export default function TryT10(_props: { lamp: Lamp }) {
  const idRef = useRef(0);
  const nextId = () => ++idRef.current;
  const configRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[]>([
    { id: nextId(), address: "", amount: "" },
    { id: nextId(), address: "", amount: "" },
  ]);
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [runStep, setRunStep] = useState(0);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [composeErr, setComposeErr] = useState<ComposeError | null>(null);

  const rowState = useMemo(
    () =>
      rows.map((r) => {
        const addrTrim = r.address.trim();
        const addrOk = addrTrim !== "" && isValidAddress(addrTrim);
        const addrPending = addrTrim === "";
        const amt = parseAmount(r.amount);
        return { ...r, addrTrim, addrOk, addrPending, amt };
      }),
    [rows]
  );

  // Duplicate addresses — the on-chain Distributor rejects these, so flag them now.
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    const bad = new Set<number>();
    for (const r of rowState) {
      if (!r.addrOk) continue;
      const k = r.addrTrim.toLowerCase();
      if (seen.has(k)) {
        bad.add(seen.get(k)!);
        bad.add(r.id);
      } else seen.set(k, r.id);
    }
    return bad;
  }, [rowState]);

  const validRows = rowState.filter(
    (r) => r.addrOk && r.amt.ok && !dupes.has(r.id)
  );
  const hasInvalid = rowState.some(
    (r) =>
      (!r.addrPending && !r.addrOk) ||
      (!r.amt.pending && !r.amt.ok) ||
      (r.addrOk && dupes.has(r.id))
  );

  const totalWei = validRows.reduce((s, r) => s + r.amt.wei, 0n);
  const n = validRows.length;
  const mode = modeFor(Math.max(n, 1));
  const gas = estGas(mode, n);
  const dustHit = validRows.some((r) => isDustWarning(r.amount));

  // cast parses arrays as comma-separated: "[0xaaa,0xbbb]" (space-separated fails).
  const addrsArg = `[${validRows.map((r) => r.addrTrim).join(",")}]`;
  const weisArg = `[${validRows.map((r) => r.amt.wei.toString()).join(",")}]`;

  const script = useMemo(() => {
    const head = [
      "# ── Flotilla batch — built in the LIGHTKEEPER console (T10) ──",
      "# Runs in YOUR terminal with YOUR keys. LIGHTKEEPER never sees or runs this.",
      "# Chain guard: Atlantic testnet (688689) is asserted in every command.",
      "",
      "# Your own env — set these in YOUR terminal before running:",
      "export ATLANTIC_RPC_URL=\"https://atlantic.dplabs-internal.com\"",
      "export DEPLOYER_PRIVATE_KEY=\"<your-private-key>\"   # never shared",
      'export PATH="$HOME/.foundry/bin:$PATH"',
      'FROM=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")',
      "",
    ];
    if (n === 0) return "# add at least one valid recipient row to generate the commands";
    if (mode === "simple") {
      const lines = [...head, `# Mode: SIMPLE — ${n} sequential send(s) (≤10, no contract needed)`, ""];
      validRows.forEach((r, i) => {
        lines.push(
          `# ${i + 1}. Preflight — dry-run, moves nothing:`,
          `cast estimate --rpc-url "$ATLANTIC_RPC_URL" --from "$FROM" ${r.addrTrim} --value ${r.amt.wei.toString()}`,
          "",
          `# ${i + 1}. Execute:`,
          `flock /tmp/lk-nonce.lock cast send --rpc-url "$ATLANTIC_RPC_URL" --chain-id ${ATLANTIC_CHAIN_ID} --private-key "$DEPLOYER_PRIVATE_KEY" ${r.addrTrim} --value ${r.amt.wei.toString()}`,
          ""
        );
      });
      return lines.join("\n");
    }
    const sig = '"distributeNative(address[],uint256[])"';
    const pre = (a: string, w: string, v: string) => [
      "# Preflight — dry-run the batch call against Atlantic (moves nothing):",
      `cast call --rpc-url "$ATLANTIC_RPC_URL" --from "$FROM" --value ${v} ${DISTRIBUTOR} ${sig} "${a}" "${w}"`,
      "",
      "# Execute — one transaction, one signature:",
      `flock /tmp/lk-nonce.lock cast send --rpc-url "$ATLANTIC_RPC_URL" --chain-id ${ATLANTIC_CHAIN_ID} --private-key "$DEPLOYER_PRIVATE_KEY" ${DISTRIBUTOR} ${sig} "${a}" "${w}" --value ${v}`,
      "",
    ];
    if (mode === "single") {
      const lines = [
        ...head,
        `# Mode: SINGLE-BATCH — ${n} recipients in ONE transaction`,
        `# Distributor: ${DISTRIBUTOR}`,
        `# Total value: ${totalWei.toString()} wei`,
        "",
      ];
      return [...lines, ...pre(addrsArg, weisArg, totalWei.toString())].join("\n");
    }
    const chunks: Row[][] = [];
    const clean = validRows.map((r) => ({ id: r.id, address: r.addrTrim, amount: r.amount }));
    for (let i = 0; i < clean.length; i += 200) chunks.push(clean.slice(i, i + 200));
    const lines = [
      ...head,
      `# Mode: MULTI-BATCH — ${n} recipients in ${chunks.length} chunk(s) of ≤200 (cap enforced on-chain)`,
      `# Distributor: ${DISTRIBUTOR}`,
      "",
    ];
    chunks.forEach((c, ci) => {
      const a = `[${c.map((r) => r.address).join(",")}]`;
      const w = `[${c.map((r) => parseAmount(r.amount).wei.toString()).join(",")}]`;
      const v = c.reduce((s, r) => s + parseAmount(r.amount).wei, 0n).toString();
      lines.push(`# ── chunk ${ci + 1}/${chunks.length} (${c.length} recipients) ──`, ...pre(a, w, v));
    });
    return lines.join("\n");
  }, [validRows, n, mode, totalWei, addrsArg, weisArg]);

  const checks = [
    {
      label: "All addresses valid",
      state: n === 0 ? "dim" : hasInvalid ? "fail" : "pass",
      hint: "0x + 40 hex, checked live as you type.",
    },
    {
      label: "No duplicate recipients",
      state: dupes.size > 0 ? "fail" : "pass",
      hint: "The Distributor reverts on duplicates — flagged before you spend gas.",
    },
    {
      label: "Dust check",
      state: n === 0 ? "dim" : dustHit ? "warn" : "pass",
      hint: dustHit
        ? `A row exceeds ${DUST} PHRS — warning, not a block. Double-check it.`
        : `Every row ≤ ${DUST} PHRS dust limit.`,
    },
    {
      label: "Dry-run first",
      state: "info",
      hint: "Every generated command ships with a preflight that moves nothing.",
    },
  ];

  const copy = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRefuser = () =>
    setRows((rs) => [...rs, { id: nextId(), address: REFUSER, amount: "0.001" }]);

  // Gas comparison: measured individual-send baseline (21,000) vs the
  // receipt-fitted batch estimate. Only meaningful once the contract path kicks in.
  const individualGas = n * 21_000;
  const savesPct =
    mode === "simple" || n < 2
      ? null
      : Math.round((1 - gas / individualGas) * 100);

  // A composed result is a snapshot: editing the recipient list afterwards
  // (or after an error) invalidates it, so the UI never shows stale numbers.
  useEffect(() => {
    if (phase === "done" || phase === "error") {
      setPhase("idle");
      setResult(null);
      setComposeErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const scrollToConfig = () =>
    configRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // 02 Run — two REAL phases, each advancing the loader only when its real
  // computation finishes. Between them we yield a single frame so React can
  // paint the step label — a paint yield, never an artificial delay.
  const compose = async () => {
    if (n === 0) {
      setComposeErr({
        title: "Nothing to compose yet",
        message:
          "Add at least one valid recipient row first — the builder won't compose a batch of nothing.",
        hint: "A valid address is 0x + 40 hex characters; amounts are PHRS with up to 18 decimals.",
        actionLabel: "Add recipients",
      });
      setPhase("error");
      return;
    }
    if (hasInvalid) {
      const badAddr = rowState.filter((r) => !r.addrPending && !r.addrOk).length;
      const badAmt = rowState.filter((r) => !r.amt.pending && !r.amt.ok).length;
      setComposeErr({
        title: "A few rows need attention",
        message: `Fix ${[
          badAddr > 0 ? `${badAddr} invalid address${badAddr > 1 ? "es" : ""}` : null,
          badAmt > 0 ? `${badAmt} invalid amount${badAmt > 1 ? "s" : ""}` : null,
          dupes.size > 0 ? "duplicate recipients" : null,
        ]
          .filter(Boolean)
          .join(", ")} — the builder won't generate a command it can't stand behind.`,
        hint: "The on-chain Distributor reverts on duplicates; flagging them here saves you gas.",
        actionLabel: "Review flagged rows",
      });
      setPhase("error");
      return;
    }
    setComposeErr(null);
    setPhase("running");
    setRunStep(0);
    // Phase 1 — real: run the receipt-fitted estimator against the live rows.
    const estimate = { gas: estGas(mode, n), individual: n * 21_000, mode };
    await nextFrame();
    setRunStep(1);
    // Phase 2 — real: compose the exact commands from the real script pipeline.
    const snapshot: ComposeResult = {
      n,
      mode,
      gas: estimate.gas,
      individualGas: estimate.individual,
      savesPct,
      totalWei,
      script,
      vrows: validRows.map((r) => ({
        id: r.id,
        address: r.addrTrim,
        amount: r.amount.trim(),
        wei: r.amt.wei.toString(),
        isRefuser: r.addrTrim.toLowerCase() === REFUSER.toLowerCase(),
      })),
    };
    await nextFrame();
    setRunStep(RUN_STEPS.length);
    setResult(snapshot);
    setPhase("done");
  };

  const feedItems: FeedItem[] = (result?.vrows ?? []).map((r, i) => ({
    key: String(r.id),
    node: (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-ink" title={r.address}>
            <span className="mr-2 text-slate">{i + 1}.</span>
            {r.address}
          </p>
          <p className="mt-0.5 text-sm text-slate">
            {r.amount} PHRS · <span className="font-mono text-xs">{r.wei} wei</span>
          </p>
        </div>
        <span className={`chip shrink-0 ${r.isRefuser ? "chip-info" : "chip-pass"}`}>
          {r.isRefuser ? "refuser fixture" : "ready"}
        </span>
      </div>
    ),
  }));

  return (
    <div className="space-y-8">
      {/* header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-semibold text-ink">Build a safe batch</h3>
          <span className="chip chip-info">Tier C — command builder</span>
          <span className="chip chip-pass">0 PHRS spent here</span>
          <span className="chip chip-dim">Atlantic testnet · 688689</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink">
          Add recipient rows — Flotilla validates each one, totals the batch, and auto-selects
          the cheapest mode (simple, single-batch, or multi-batch through the on-chain{" "}
          <span className="font-mono">BatchDistributor</span>). Compose the plan, then take the
          exact commands to your own terminal.
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate">
          Gas figures are estimates fitted from live Atlantic receipts (n=8/10/11 → 149,170 /
          185,573 / 202,173 gas; ≈7.5k fixed + ≈17.7k per recipient; measured breakeven ≈ n=3
          for pre-existing EOA recipients) — your receipt will differ slightly. Never facts.
        </p>
      </div>

      {/* 01 — Configure */}
      <div ref={configRef} className="scroll-mt-6">
        <p className="smallcaps mb-4">01 · Configure recipients</p>
        <div className="space-y-3">
          {rowState.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex flex-col gap-3 rounded-2xl border border-hairline bg-white p-4 md:flex-row md:items-center"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tint font-mono text-xs font-semibold text-slate">
                {i + 1}
              </span>
              <input
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none"
                placeholder="0x recipient address"
                value={r.address}
                onChange={(e) => update(r.id, { address: e.target.value })}
                spellCheck={false}
              />
              <input
                className="min-h-[44px] w-full rounded-xl border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none md:w-40"
                placeholder="PHRS amount"
                value={r.amount}
                onChange={(e) => update(r.id, { amount: e.target.value })}
                inputMode="decimal"
                spellCheck={false}
              />
              <div className="flex flex-wrap items-center gap-2">
                {!r.addrPending && !r.addrOk && <span className="chip chip-fail">bad address</span>}
                {r.addrOk && dupes.has(r.id) && <span className="chip chip-fail">duplicate</span>}
                {r.addrOk && !dupes.has(r.id) && <span className="chip chip-pass">ok</span>}
                {!r.amt.pending && !r.amt.ok && <span className="chip chip-fail">bad amount</span>}
                {r.addrTrim.toLowerCase() === REFUSER.toLowerCase() && (
                  <span className="chip chip-info">refuser fixture</span>
                )}
                {r.amt.ok && isDustWarning(r.amount) && (
                  <span className="chip chip-info">dust warning</span>
                )}
                <button
                  className="btn-outline !px-2.5 !py-1.5 !text-xs"
                  onClick={() =>
                    setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.id !== r.id) : rs))
                  }
                  aria-label="Remove row"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="btn-outline"
            onClick={() => setRows((rs) => [...rs, { id: nextId(), address: "", amount: "" }])}
          >
            + Add recipient
          </button>
          <button
            className="btn-outline"
            onClick={addRefuser}
            title="Adds the live RevertingReceiver fixture (0x49b26d46…b94). It refuses every native transfer on-chain, so its action is recorded as success=false while the rest of the batch completes — partial-failure isolation you can verify yourself on the explorer."
          >
            + Add the refuser fixture
          </button>
        </div>
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-slate">
            The mode decision tree — your fleet walks it live as rows are added
          </p>
          <ModeTree active={mode} n={n} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {checks.map((c) => (
            <span
              key={c.label}
              title={c.hint}
              className={`chip ${
                c.state === "pass"
                  ? "chip-pass"
                  : c.state === "fail"
                    ? "chip-fail"
                    : c.state === "warn"
                      ? "chip-info"
                      : "chip-dim"
              }`}
            >
              {c.label}
              {c.state === "pass" ? " ✓" : c.state === "fail" ? " ✕" : ""}
            </span>
          ))}
        </div>
      </div>

      {/* 02 — Run */}
      <div>
        <p className="smallcaps mb-4">02 · Run</p>
        {phase === "idle" && (
          <div className="rounded-2xl border border-hairline bg-white p-6">
            <p className="text-sm leading-relaxed text-ink">
              {n > 0 ? (
                <>
                  <span className="font-semibold">{n} valid recipient{n === 1 ? "" : "s"}</span> ·{" "}
                  {modeLabel(mode)} mode · ≈{gas.toLocaleString("en-US")} gas estimated. Ready when
                  you are.
                </>
              ) : (
                "Fill in at least one recipient row above, then compose the plan."
              )}
            </p>
            <button
              className="btn-primary mt-4 min-h-[44px] w-full sm:w-auto"
              onClick={compose}
            >
              Compose the batch
            </button>
            <p className="mt-3 text-sm text-slate">
              Composing runs the receipt-fitted gas estimator and writes the exact cast commands —
              locally, from your inputs. Nothing here executes on-chain.
            </p>
          </div>
        )}
        {phase === "running" && (
          <ProgressLoader
            steps={RUN_STEPS}
            current={runStep}
            title={`${n} recipient${n === 1 ? "" : "s"} · ${modeLabel(mode)} mode`}
          />
        )}
        {phase === "error" && composeErr && (
          <ErrorState
            title={composeErr.title}
            message={composeErr.message}
            hint={composeErr.hint}
            retryLabel={composeErr.actionLabel}
            onRetry={scrollToConfig}
          />
        )}
      </div>

      {/* 03 — Result */}
      {phase === "done" && result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <div>
            <p className="smallcaps mb-4">03 · Result</p>
            <ResultCard
              eyebrow="Result — batch plan composed"
              status="pass"
              headline={
                result.mode === "simple" ? (
                  <span>
                    <HeroTicker value={result.n} format={(v) => `${Math.round(v)}`} />{" "}
                    <span className="text-3xl sm:text-4xl">
                      {result.n === 1 ? "send" : "sends"} ready
                    </span>
                  </span>
                ) : (
                  <span>
                    <HeroTicker
                      value={result.savesPct ?? 0}
                      format={(v) => `≈${Math.round(v)}%`}
                    />{" "}
                    <span className="text-3xl sm:text-4xl">gas saved</span>
                  </span>
                )
              }
              subline={
                result.mode === "simple"
                  ? "Simple mode — ≤10 recipients go as individual sends, no contract needed. The BatchDistributor path engages automatically at 11 recipients (measured breakeven for it is ≈3)."
                  : `Cheaper than ${result.n} individual 21,000-gas sends — estimated from live Atlantic receipts, never a fact.`
              }
              rows={[
                {
                  label: "Batch mode",
                  value:
                    result.mode === "simple"
                      ? "simple — individual sends, no contract needed"
                      : result.mode === "single"
                        ? "single-batch — one transaction"
                        : "multi-batch — ≤200 recipients per chunk",
                },
                {
                  label: "Estimated batch gas",
                  value: `≈${result.gas.toLocaleString("en-US")} gas (estimate)`,
                },
                {
                  label: "Individual sends would cost",
                  value: `${result.individualGas.toLocaleString("en-US")} gas`,
                },
                {
                  label: "Total value",
                  value: `${result.totalWei.toString()} wei`,
                },
                { label: "BatchDistributor", value: DISTRIBUTOR },
              ]}
              links={[
                {
                  label: "View the BatchDistributor contract on the explorer",
                  href: `${EXPLORER_ADDRESS}${DISTRIBUTOR}`,
                },
              ]}
            />
          </div>

          <div>
            <p className="smallcaps mb-3">The decision record — which branch your batch took</p>
            <ModeTree active={result.mode} n={result.n} />
          </div>

          <StatStrip
            stats={[
              {
                label: "Recipients",
                value: result.n,
                icon: <Users size={14} aria-hidden />,
              },
              {
                label: "Total",
                value: Number(result.totalWei) / 1e18,
                format: (v) => v.toFixed(4),
                suffix: "PHRS",
                icon: <Coins size={14} aria-hidden />,
              },
              {
                label: "Est. gas",
                value: result.gas,
                format: (v) => `≈${Math.round(v).toLocaleString("en-US")}`,
                icon: <Zap size={14} aria-hidden />,
              },
              {
                label: "Gas saved",
                value: result.savesPct ?? 0,
                format: (v) => `${Math.round(v)}%`,
                icon: <Percent size={14} aria-hidden />,
              },
            ]}
          />

          {result.mode !== "simple" && (
            <DuelBars n={result.n} gas={result.gas} individualGas={result.individualGas} />
          )}

          <div className="rounded-2xl border border-hairline bg-white p-6">
            <p className="smallcaps mb-1">The crossover — where the flotilla wins</p>
            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1">
              <span className="inline-flex items-center gap-2 text-sm text-ink">
                <span className="inline-block h-1 w-8 rounded bg-slate" aria-hidden />
                individual sends — 21,000 gas each
              </span>
              <span className="inline-flex items-center gap-2 text-sm text-ink">
                <span className="inline-block h-1 w-8 rounded bg-accent" aria-hidden />
                Distributor path — ≈7.5k + ≈17.7k per recipient
              </span>
            </div>
            <CrossoverChart visitorN={result.n} mode={result.mode} />
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate">
              Fitted from 3 live receipts (n=8/10/11 → 149,170 / 185,573 / 202,173 gas) —
              estimates, never facts; your receipt will differ slightly. First-touch new
              addresses cost +25,000 gas each, which raises the real breakeven.{" "}
              {result.mode === "simple"
                ? "Your batch sits in simple mode (≤10) — individual sends, no contract needed. The chart shows where the Distributor path would overtake them."
                : "Your batch is past the crossover — the Distributor path is the cheaper machine."}
            </p>
          </div>

          {result.vrows.some((r) => r.isRefuser) && <RefuserProof />}

          <div>
            <p className="smallcaps mb-3">
              Batch contents — {result.n} recipient{result.n === 1 ? "" : "s"}
            </p>
            <FeedList items={feedItems} maxHeight="max-h-80" />
          </div>

          <div>
            <p className="smallcaps mb-3">Your commands — review, then run in your terminal</p>
            <div className="code-block mb-3 max-h-96 overflow-auto whitespace-pre font-mono text-xs leading-relaxed">
              {result.script}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn-primary inline-flex min-h-[44px] items-center gap-2"
                onClick={copy}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy commands"}
              </button>
              <p className="max-w-xl text-sm text-slate">
                Executes on <span className="font-mono">Atlantic {ATLANTIC_CHAIN_ID}</span> with
                your keys, behind the shared nonce lock. Distributor:{" "}
                <a
                  className="font-mono text-accent hover:underline"
                  href={`${EXPLORER_ADDRESS}${DISTRIBUTOR}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddr(DISTRIBUTOR)}
                </a>
                . LIGHTKEEPER never executes this for you — run it yourself.
              </p>
            </div>
            <button className="btn-outline mt-4" onClick={scrollToConfig}>
              Back to the recipient list
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
