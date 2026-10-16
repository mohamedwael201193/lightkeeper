/**
 * T06 Saga Executor — Tier C (CLI-native saga orchestration).
 * SHOWTIME presentation (2026-10-16): rebuilt on the Presentation Standard.
 *
 * The journey: 01 Configure (pick one of three real saga runs) → 02 Run
 * (ProgressLoader over REAL eth_getTransactionReceipt reads — one per step) →
 * 03 Result (ResultCard showpiece + StatStrip + FeedList step timeline).
 *
 * "The saga that really failed": the canonical forced-failure run (approve →
 * lock → execute(0x0) → refund → revoke), the full-success run for contrast,
 * and the crash-recovery run (killed mid-step at exit 137, resumed to
 * SUCCEEDED with one broadcast tx per step), plus a failure-forensics panel
 * (revert reason, finality depth, compensation latency — pure reads).
 *
 * Every hash below is a REAL mined Atlantic tx, copied character-for-character
 * from tasks/t06-saga-executor/evidence.json. Nothing is simulated.
 * LIGHTKEEPER never signs here — reproduction happens in the visitor's own
 * terminal with their own key.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Box,
  Check,
  ChevronDown,
  ExternalLink,
  FileSearch,
  Fuel,
  Layers,
  Radio,
  Receipt,
  RotateCcw,
  Undo2,
  X,
  Zap,
} from "lucide-react";
import type { Lamp } from "../../types";
import { EXPLORER_TX, rpcCall } from "../../hooks/useAtlantic";
import {
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
} from "../ui";
import type { FeedItem, ResultLink, ResultRow, Stat } from "../ui";

interface SagaStep {
  id: string;
  n: string;
  title: string;
  detail: string;
  hash: string;
  block: number;
  /** "0x1" | "0x0" — what the mined receipt actually says. */
  expected: "0x1" | "0x0";
  gas: number;
  /** How this step is rendered: normal, the failure, or a compensation. */
  kind: "step" | "failure" | "compensation";
  /** What the executor classified and decided at this point. */
  decision: string;
  /** Extra one-liner rendered under the step title, e.g. the resume note. */
  note?: string;
}

const RUN_B: SagaStep[] = [
  {
    id: "approve",
    n: "1",
    title: "approve(fixture, 4000)",
    detail:
      "Granted the fixture a 4000-wei allowance — deliberately more than the 2000-wei lock, so the later revoke step is real work, not a no-op.",
    hash: "0x452acae1ec4335ecd0842672c97383b5671e1ad950150224f307dcd17a928ba7",
    block: 31482444,
    expected: "0x1",
    gas: 46663,
    kind: "step",
    decision: "Receipt 0x1 + gate check: allowance ≥ amount — advance.",
  },
  {
    id: "lock",
    n: "2",
    title: "lock(2000)",
    detail:
      "Locked 2000 wei of LKTEST dust into the fixture. Gate check confirmed the locked balance moved 0 → 2000.",
    hash: "0x0371814a1739f58698722db4915da1b718512c9bafcb347da3def4a6576f0eea",
    block: 31482492,
    expected: "0x1",
    gas: 85106,
    kind: "step",
    decision: "Receipt 0x1 + gate check: locked delta = 2000 — advance.",
  },
  {
    id: "execute",
    n: "3",
    title: "execute(minOut = 2001) — impossible",
    detail:
      "This step was DELIBERATELY CONSTRUCTED to fail: we asked execute() for minOut=2001 against a 2000-wei lock. Nothing about this can succeed. To make sure the failure actually reached the chain (cast's client-side eth_estimateGas refuses to broadcast reverting calls), it was sent with an explicit --gas-limit. The chain decided the rest.",
    hash: "0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05",
    block: 31482534,
    expected: "0x0",
    gas: 24231,
    kind: "failure",
    decision:
      "Mined receipt status 0x0 — classified PERMANENT. No retry (exactly one attempt), RUNNING → COMPENSATING.",
  },
  {
    id: "refund",
    n: "C1",
    title: "compensate: refund()",
    detail:
      "First compensating transaction: the fixture returned the locked 2000 wei. Balance gate confirmed every wei restored.",
    hash: "0xe6cac3114397487f6d1b1efec721af968ee8868e196a9d5f6437d35b9fbb60ca",
    block: 31482558,
    expected: "0x1",
    gas: 37560,
    kind: "compensation",
    decision: "Receipt 0x1 — compensation 1 of 2 confirmed.",
  },
  {
    id: "revoke",
    n: "C2",
    title: "compensate: approve(0) — allowance revoke",
    detail:
      "Second compensating transaction: revoked the residual allowance (approve(0)). Final on-chain state: locked = 0, allowance = 0.",
    hash: "0x0e80719119b7fb8781020e5a7fa0fcec01eeec167caa7329ac6781f1cb34759b",
    block: 31482599,
    expected: "0x1",
    gas: 24739,
    kind: "compensation",
    decision: "Receipt 0x1 — saga state COMPENSATED. Final: locked=0, allowance=0, settled=false.",
  },
];

/** Run A — the full-success run, the baseline before anything was broken on
 *  purpose. Dust 1000 wei, run id t06-run-a-20261016-040851. */
const RUN_A: SagaStep[] = [
  {
    id: "approve",
    n: "1",
    title: "approve(fixture, 1000)",
    detail:
      "Approved the fixture for 1000 wei of LKTEST dust — the allowance the lock step will draw from.",
    hash: "0x30183882c8021b6daa017b03d5eecca595bf7faa2128e25eb59ad530e1763a75",
    block: 31481355,
    expected: "0x1",
    gas: 46663,
    kind: "step",
    decision: "Receipt 0x1 + gate check: allowance ≥ 1000 — advance.",
  },
  {
    id: "lock",
    n: "2",
    title: "lock(1000)",
    detail:
      "Locked 1000 wei of LKTEST dust into the fixture.",
    hash: "0xe46a8c40db9656ecb37baf933f1d6044a0e13a03bfdf7e9e03b022d250256587",
    block: 31481383,
    expected: "0x1",
    gas: 80306,
    kind: "step",
    decision: "Receipt 0x1 + gate check: locked delta = 1000 — advance.",
  },
  {
    id: "execute",
    n: "3",
    title: "execute(minOut = 1000)",
    detail:
      "Executed against the full lock — minOut satisfied exactly. The mirror image of Run B's deliberately impossible call.",
    hash: "0x9c2598384dfdbfd688bbd42e4006308decd455a1940bac95da6d2c529100cd43",
    block: 31481413,
    expected: "0x1",
    gas: 25688,
    kind: "step",
    decision: "Receipt 0x1 — advance.",
  },
  {
    id: "settle",
    n: "4",
    title: "settle()",
    detail: "Settled the saga — the clean finish Run B never got.",
    hash: "0xa13311d24cd0aff5eb91c389f14b22e9be8f9cab7958583d00d7785b09ca5873",
    block: 31481460,
    expected: "0x1",
    gas: 46830,
    kind: "step",
    decision: "Receipt 0x1 — saga state SUCCEEDED.",
  },
];

/** Run C — the executor was hard-killed (exit 137) between approve's BROADCAST
 *  and CONFIRMING, then resumed from the state log. Every hash is a REAL mined
 *  Atlantic tx. The idempotency claim: approve appears with exactly ONE
 *  broadcast tx across both invocations — the resume re-read the receipt,
 *  never re-sent it. Dust 1000 wei, run id t06-run-c-20261016-063734. */
const RUN_C: SagaStep[] = [
  {
    id: "approve",
    n: "1",
    title: "approve(fixture, 1000) — broadcast before the crash",
    detail:
      "The executor was hard-killed with os._exit(137) — SIGKILL-like, no cleanup, nothing persisted — between this step's BROADCAST and CONFIRMING. The second invocation replayed the state log, found BROADCAST with a tx hash but no CONFIRMING, and re-read the receipt instead of re-broadcasting.",
    hash: "0x96d304d53c427e155d157a0234297f63b494c18f6317bf616a77bf9f88d16a14",
    block: 31486478,
    expected: "0x1",
    gas: 46663,
    kind: "step",
    decision:
      "At resume: state log shows exactly one BROADCAST line with this tx hash across both invocations — re-read receipt: 0x1. Never re-sent.",
    note: "receipt re-read at resume — never re-broadcast",
  },
  {
    id: "lock",
    n: "2",
    title: "lock(1000)",
    detail: "Rebuilt from the replayed plan after the resume.",
    hash: "0x609b2b06be22646c82d7b6bcacbac8170a38edbd0e9d53ff3675832e4c8bf0b6",
    block: 31486635,
    expected: "0x1",
    gas: 80306,
    kind: "step",
    decision: "Receipt 0x1 — advance.",
  },
  {
    id: "execute",
    n: "3",
    title: "execute(minOut = 1000)",
    detail: "Executed after the resume — the plan survived the crash intact.",
    hash: "0xd9e4fb6dc7c8d998ec0c532cb73211bd2ab927f04881f55ab0273db9c4e5cc62",
    block: 31486759,
    expected: "0x1",
    gas: 25688,
    kind: "step",
    decision: "Receipt 0x1 — advance.",
  },
  {
    id: "settle",
    n: "4",
    title: "settle()",
    detail: "The final step — the saga reaches SUCCEEDED after surviving its own death.",
    hash: "0x9a93fe34fae224cf9ca3e229b3d90a52c94eeeb8379cc09c7f8cb2918f97ea75",
    block: 31486778,
    expected: "0x1",
    gas: 46830,
    kind: "step",
    decision: "Receipt 0x1 — saga state SUCCEEDED.",
  },
];

/** Failure forensics for Run B — all pure reads, zero new spend. */
const FORENSICS = [
  { k: "Revert reason", v: "TestFixture: minOut exceeds locked balance", d: "Confirmed by replaying execute(2001) against block 31482533 — the exact pre-failure chain state. A pure eth_call read; nothing was sent." },
  { k: "Finality depth", v: "3,730 blocks", d: "The 0x0 receipt (block 31482534) measured 3,730 blocks deep — no re-org can move it." },
  { k: "Compensation latency", v: "24 / 41 blocks", d: "Failure @31482534 → refund @31482558 → revoke @31482599. The executor detected the 0x0, classified it permanent, and finished both compensations within 41 blocks." },
];

const REPRODUCE_CMD = `export PATH="$HOME/.foundry/bin:$PATH"
export ATLANTIC_RPC_URL="https://atlantic.dplabs-internal.com"   # your own RPC endpoint
export DEPLOYER_PRIVATE_KEY="<your-private-key>"                  # your own key — never shared
cd ~/workspace/lightkeeper/tasks/t06-saga-executor

# unit tests: receipt classifier, retry table, state machine, gates (no chain writes)
python3 scripts/saga.py --selftest

# full-success saga (dust wei)
python3 scripts/saga.py run-a 1000

# forced-failure saga -> compensation (dust wei)
python3 scripts/saga.py run-b 2000

# crash-recovery saga: hard-kills itself mid-step (exit 137 is the real crash),
# then resume replays the state log -> SUCCEEDED with one broadcast tx per step
python3 scripts/saga.py run-c 1000 --kill-after approve
python3 scripts/saga.py resume t06-run-c-<run-id>`;

/** The crash-recovery story (Run C) as a vivid five-beat timeline. */
const CRASH_NODES = [
  {
    k: "broadcast",
    icon: Radio,
    tone: "text-accent",
    title: "BROADCAST — approve(fixture, 1000)",
    data: "tx 0x96d3…f88d16a14 · block 31486478 · state log: BROADCAST with tx hash",
  },
  {
    k: "killed",
    icon: Zap,
    tone: "text-fail",
    title: "KILLED — os._exit(137), no cleanup",
    data: "Between BROADCAST and CONFIRMING. SIGKILL-like: no state flush, no handler ran.",
  },
  {
    k: "resume",
    icon: RotateCcw,
    tone: "text-accent",
    title: "RESUME — the state log is replayed",
    data: "runs/t06-run-c-20261016-063734 · the parser finds approve BROADCAST, never CONFIRMING",
  },
  {
    k: "reread",
    icon: FileSearch,
    tone: "text-pass",
    title: "RE-READ — the receipt, not a re-broadcast",
    data: "The chain says 0x1. Exactly one BROADCAST line for approve across both invocations.",
    note: "Idempotent by construction: a crash between broadcast and confirm can never double-spend the step.",
  },
  {
    k: "succeeded",
    icon: Check,
    tone: "text-pass",
    title: "SUCCEEDED — lock → execute → settle",
    data: "0x609b…bf0b6 → 0xd9e4…4e5cc62 → 0x9a93…f97ea75 · one broadcast tx per step, even across death",
  },
];

type PlanId = "a" | "b" | "c";

interface RunPlan {
  id: PlanId;
  name: string;
  title: string;
  chip: string;
  tagline: string;
  dust: string;
  runId: string;
  steps: SagaStep[];
  headline: string;
  subline: string;
  stats: Stat[];
  rows: ResultRow[];
  links: ResultLink[];
  /** Which story panel renders under the timeline. */
  story: "forensics" | "crash" | "baseline";
}

const PLANS: Record<PlanId, RunPlan> = {
  b: {
    id: "b",
    name: "Run B",
    title: "Forced failure → compensated",
    chip: "COMPENSATED",
    tagline:
      "The saga that really failed: a mined 0x0 revert, detected and answered by two real compensation transactions.",
    dust: "2000 wei LKTEST",
    runId: "t06-run-b-20261016-042903",
    steps: RUN_B,
    headline: "Compensated",
    subline:
      "The executor mined a real 0x0 revert at block 31482534, classified it permanent — no retry — and answered with two real on-chain compensations. Every wei of the 2000-wei dust was restored.",
    stats: [
      { label: "Saga steps", value: 5, icon: <Layers size={15} aria-hidden /> },
      { label: "Mined receipts", value: 5, icon: <Receipt size={15} aria-hidden /> },
      { label: "Blocks elapsed", value: 155, icon: <Box size={15} aria-hidden /> },
      { label: "Gas burned", value: 218299, suffix: "gas", icon: <Fuel size={15} aria-hidden /> },
    ],
    rows: [
      { label: "Run id", value: "t06-run-b-20261016-042903" },
      { label: "Dust", value: "2000 wei LKTEST" },
      { label: "Failure", value: "block 31482534 · status 0x0" },
      { label: "Compensations", value: "refund @31482558 · revoke @31482599" },
      { label: "Final on-chain state", value: "locked = 0 · allowance = 0 · settled = false" },
    ],
    links: [
      { label: "View the 0x0 revert receipt", href: `${EXPLORER_TX}0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05` },
      { label: "View the refund compensation", href: `${EXPLORER_TX}0xe6cac3114397487f6d1b1efec721af968ee8868e196a9d5f6437d35b9fbb60ca` },
      { label: "View the revoke compensation", href: `${EXPLORER_TX}0x0e80719119b7fb8781020e5a7fa0fcec01eeec167caa7329ac6781f1cb34759b` },
    ],
    story: "forensics",
  },
  a: {
    id: "a",
    name: "Run A",
    title: "Full success — the baseline",
    chip: "SUCCEEDED",
    tagline:
      "The clean run: all four steps mine 0x1 receipts. The baseline before anything was broken on purpose.",
    dust: "1000 wei LKTEST",
    runId: "t06-run-a-20261016-040851",
    steps: RUN_A,
    headline: "Succeeded",
    subline:
      "All four steps mined 0x1 receipts — approve, lock, execute, settle — with the gate checks passing at every step. This is the baseline the failure run is measured against.",
    stats: [
      { label: "Saga steps", value: 4, icon: <Layers size={15} aria-hidden /> },
      { label: "Mined receipts", value: 4, icon: <Receipt size={15} aria-hidden /> },
      { label: "Blocks elapsed", value: 105, icon: <Box size={15} aria-hidden /> },
      { label: "Gas burned", value: 199487, suffix: "gas", icon: <Fuel size={15} aria-hidden /> },
    ],
    rows: [
      { label: "Run id", value: "t06-run-a-20261016-040851" },
      { label: "Dust", value: "1000 wei LKTEST" },
      { label: "Blocks", value: "31481355 → 31481460" },
      { label: "Final state", value: "SUCCEEDED — every gate check passed" },
    ],
    links: [
      { label: "View the execute receipt", href: `${EXPLORER_TX}0x9c2598384dfdbfd688bbd42e4006308decd455a1940bac95da6d2c529100cd43` },
      { label: "View the settle receipt", href: `${EXPLORER_TX}0xa13311d24cd0aff5eb91c389f14b22e9be8f9cab7958583d00d7785b09ca5873` },
    ],
    story: "baseline",
  },
  c: {
    id: "c",
    name: "Run C",
    title: "Killed mid-step → resumed to success",
    chip: "SUCCEEDED",
    tagline:
      "The executor was hard-killed at exit 137 between broadcast and confirm. The resume replayed the state log and finished — one broadcast tx per step, even across death.",
    dust: "1000 wei LKTEST",
    runId: "t06-run-c-20261016-063734",
    steps: RUN_C,
    headline: "Resumed to success",
    subline:
      "Killed mid-step with no cleanup. The second invocation replayed the state log, re-read the in-flight receipt instead of re-broadcasting, and finished the saga — idempotent by construction.",
    stats: [
      { label: "Saga steps", value: 4, icon: <Layers size={15} aria-hidden /> },
      { label: "Broadcast txs", value: 4, icon: <Receipt size={15} aria-hidden /> },
      { label: "Blocks elapsed", value: 300, icon: <Box size={15} aria-hidden /> },
      { label: "Exit signal at crash", value: 137, format: (n) => String(Math.round(n)), icon: <Zap size={15} aria-hidden /> },
    ],
    rows: [
      { label: "Run id", value: "t06-run-c-20261016-063734" },
      { label: "Dust", value: "1000 wei LKTEST" },
      { label: "Kill point", value: "approve · between BROADCAST and CONFIRMING" },
      { label: "Idempotency", value: "exactly one BROADCAST line for approve across both invocations" },
      { label: "Final state", value: "SUCCEEDED" },
    ],
    links: [
      { label: "View approve — broadcast before the crash", href: `${EXPLORER_TX}0x96d304d53c427e155d157a0234297f63b494c18f6317bf616a77bf9f88d16a14` },
      { label: "View settle — the resumed finish", href: `${EXPLORER_TX}0x9a93fe34fae224cf9ca3e229b3d90a52c94eeeb8379cc09c7f8cb2918f97ea75` },
    ],
    story: "crash",
  },
};

function short(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-7)}`;
}

type VerifyState = Record<string, "checking" | "match" | "mismatch" | "error">;

function StepBadge({ s }: { s: SagaStep }) {
  if (s.kind === "failure") {
    return (
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fdecec] text-fail"
        aria-hidden
      >
        <X size={18} strokeWidth={3} />
      </span>
    );
  }
  if (s.kind === "compensation") {
    return (
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7f7ee] text-pass"
        aria-hidden
      >
        <Undo2 size={18} />
      </span>
    );
  }
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint font-mono text-sm font-bold text-accentdeep"
      aria-hidden
    >
      {s.n}
    </span>
  );
}

/** The Run C crash-recovery story as a vivid five-beat vertical timeline. */
function CrashTimeline() {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
      <p className="smallcaps mb-1 text-slate">Crash recovery — five beats</p>
      <h3 className="text-lg font-bold text-ink">Killed mid-step, resumed to success</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
        The executor hard-killed itself (<span className="font-mono">os._exit(137)</span> — no
        cleanup, SIGKILL-like) between approve's{" "}
        <span className="font-mono">BROADCAST</span> and{" "}
        <span className="font-mono">CONFIRMING</span>. The resume replayed the state log and
        finished the saga without ever re-broadcasting the in-flight step.
      </p>
      <ol className="relative mt-6 space-y-7 before:absolute before:bottom-3 before:left-5 before:top-3 before:w-px before:bg-hairline">
        {CRASH_NODES.map((n, i) => {
          const Icon = n.icon;
          return (
            <motion.li
              key={n.k}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.06, 0.24), ease: "easeOut" }}
              className="relative flex gap-4"
            >
              <span className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline bg-white">
                <Icon size={18} className={n.tone} aria-hidden />
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-sm font-bold text-ink">{n.title}</p>
                <p className="mt-1 break-words font-mono text-xs leading-relaxed text-slate">
                  {n.data}
                </p>
                {n.note && (
                  <p className="mt-1 text-sm font-medium leading-relaxed text-ink">{n.note}</p>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

export default function TrySagaExecutor({ lamp }: { lamp: Lamp }) {
  const [planId, setPlanId] = useState<PlanId>("b");
  const plan = PLANS[planId];
  const [open, setOpen] = useState<string>("execute");
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [prog, setProg] = useState(0);
  const [verify, setVerify] = useState<VerifyState>({});
  const [verifiedOnce, setVerifiedOnce] = useState(false);
  const [rpcDown, setRpcDown] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectPlan = (id: PlanId) => {
    if (id === planId || phase === "running") return;
    setPlanId(id);
    setOpen(id === "b" ? "execute" : id === "c" ? "approve" : "");
    setVerify({});
    setVerifiedOnce(false);
    setRpcDown(false);
  };

  /** One REAL eth_getTransactionReceipt per step — the loader advances only
   *  when a call actually starts/finishes. Nothing here is on a timer. */
  const verifyReceipts = async () => {
    const p = PLANS[planId];
    setRpcDown(false);
    setPhase("running");
    setProg(0);
    const next: VerifyState = {};
    let answered = 0;
    for (let i = 0; i < p.steps.length; i++) {
      const s = p.steps[i];
      setProg(i);
      setVerify((v) => ({ ...v, [s.id]: "checking" }));
      try {
        const r = (await rpcCall("eth_getTransactionReceipt", [s.hash])) as {
          status?: string;
        } | null;
        next[s.id] =
          r && typeof r.status === "string" && r.status.toLowerCase() === s.expected.toLowerCase()
            ? "match"
            : "mismatch";
        answered += 1;
      } catch {
        next[s.id] = "error";
      }
      setProg(i + 1);
      setVerify({ ...next });
    }
    setVerifiedOnce(true);
    setRpcDown(answered === 0);
    setPhase("idle");
  };

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(REPRODUCE_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the text is still visible in the code block */
    }
  };

  const progSteps = plan.steps.map((s) => `Reading ${s.id} receipt`);

  const feedItems: FeedItem[] = plan.steps.map((s) => {
    const v = verify[s.id];
    const isOpen = open === s.id;
    return {
      key: s.id,
      node: (
        <div>
          <button
            type="button"
            className="flex w-full items-center gap-3 text-left"
            onClick={() => setOpen(isOpen ? "" : s.id)}
            aria-expanded={isOpen}
          >
            <StepBadge s={s} />
            <span className="min-w-0 flex-1">
              <span
                className="block truncate font-mono text-sm font-semibold text-ink"
                title={s.title}
              >
                {s.title}
              </span>
              <span className="mt-0.5 block font-mono text-xs text-slate">
                block {s.block} · {short(s.hash)} · gas {s.gas.toLocaleString()}
              </span>
              {s.note && (
                <span className="mt-0.5 block text-xs font-medium text-pass">↩ {s.note}</span>
              )}
            </span>
            <span className="flex max-w-[42%] shrink-0 flex-wrap items-center justify-end gap-1.5">
              {v === "checking" && <span className="text-xs text-slate">reading…</span>}
              {v === "match" && <span className="chip chip-pass">live ✓</span>}
              {v === "mismatch" && <span className="chip chip-fail">differs</span>}
              {v === "error" && <span className="chip chip-info">unreachable</span>}
              <span className={`chip ${s.expected === "0x0" ? "chip-fail" : "chip-pass"}`}>
                {s.expected === "0x0" ? "0x0 reverted" : "0x1 confirmed"}
              </span>
              <ChevronDown
                size={16}
                aria-hidden
                className={`text-slate transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          {isOpen && (
            <div className="mt-3 border-t border-hairline pt-3">
              <p className="text-sm leading-relaxed text-ink">{s.detail}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate">
                <span className="font-bold text-ink">Executor decision: </span>
                {s.decision}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-hairline bg-porcelain px-3 text-sm font-medium text-accent hover:bg-tint"
                  href={`${EXPLORER_TX}${s.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Receipt on explorer
                  <ExternalLink size={14} aria-hidden />
                </a>
                <span className="font-mono text-xs text-slate">
                  gas {s.gas.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      ),
    };
  });

  const liveRow: ResultRow | null =
    verifiedOnce && !rpcDown
      ? {
          label: "Live verification",
          value: (() => {
            const vals = plan.steps.map((s) => verify[s.id]);
            const m = vals.filter((x) => x === "match").length;
            const d = vals.filter((x) => x === "mismatch").length;
            const e = vals.filter((x) => x === "error").length;
            return `${m} of ${plan.steps.length} receipts match${
              d ? ` · ${d} differ` : ""
            }${e ? ` · ${e} unreachable` : ""}`;
          })(),
        }
      : null;

  const rows = liveRow ? [...plan.rows, liveRow] : plan.rows;

  return (
    <div className="space-y-6">
      {/* 01 — Configure: pick the saga, read the plan, fire the live run */}
      <section aria-label="Configure the saga">
        <p className="smallcaps mb-2 text-slate">01 — Configure</p>
        <div className="rounded-2xl border border-hairline bg-porcelain p-6">
          <p className="text-sm font-bold text-ink">Tier C — CLI-native, read-only here</p>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            <strong>{lamp.name}</strong>: pick one of three real saga runs — a clean success,
            the forced-failure run that mined a <strong>real 0x0 revert</strong>, and the
            crash-recovery run killed mid-step at exit 137.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            Saga orchestration runs in a terminal, not in this page — so the browser signs
            nothing here. LIGHTKEEPER never sees, holds, or asks for private keys.
          </p>
        </div>

        <h2 className="mt-6 text-xl font-bold text-ink">Pick the saga to examine</h2>
        <div
          className="mt-3 grid gap-3 md:grid-cols-3"
          role="group"
          aria-label="Saga run to examine"
        >
          {(Object.keys(PLANS) as PlanId[]).map((id) => {
            const p = PLANS[id];
            const selected = id === planId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectPlan(id)}
                aria-pressed={selected}
                disabled={phase === "running"}
                className={`rounded-2xl border p-5 text-left transition-colors ${
                  selected
                    ? "border-accent bg-white shadow-sm"
                    : "border-hairline bg-white hover:border-accent/60"
                } ${phase === "running" ? "opacity-60" : ""}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="chip chip-pass">{p.chip}</span>
                  {selected && <Check size={16} className="text-accent" aria-hidden />}
                </span>
                <span className="mt-3 block text-base font-bold text-ink">
                  {p.name} — {p.title}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-slate">
                  {p.tagline}
                </span>
                <span className="mt-3 block font-mono text-xs text-slate">
                  {p.dust} · {p.steps.length} txs
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-hairline bg-white p-6">
          <p className="smallcaps mb-1 text-slate">Run plan</p>
          <h3 className="text-lg font-bold text-ink">
            {plan.name} — {plan.title}
          </h3>
          <p className="mt-1 font-mono text-sm text-slate">
            {plan.runId} · {plan.dust}
          </p>
          <ol className="mt-4 space-y-2">
            {plan.steps.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl bg-porcelain px-4 py-3"
              >
                <StepBadge s={s} />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate font-mono text-sm font-semibold text-ink"
                    title={s.title}
                  >
                    {s.title}
                  </span>
                </span>
                <span
                  className={`chip shrink-0 ${s.expected === "0x0" ? "chip-fail" : "chip-pass"}`}
                >
                  expects {s.expected}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-5">
            <button
              type="button"
              className="btn-primary min-h-[44px]"
              onClick={verifyReceipts}
              disabled={phase === "running"}
            >
              Verify receipts on Atlantic
            </button>
            <p className="mt-2 text-sm leading-relaxed text-slate">
              Re-reads each receipt from the chain with{" "}
              <span className="font-mono">eth_getTransactionReceipt</span> — a free RPC read. The
              browser signs nothing.
            </p>
          </div>
        </div>
      </section>

      {/* 02 — Run: honest progress over the real receipt reads */}
      {phase === "running" && (
        <section aria-label="Verifying receipts">
          <p className="smallcaps mb-2 text-slate">02 — Run</p>
          <ProgressLoader
            steps={progSteps}
            current={prog}
            title={`Verifying ${plan.name} receipts on Atlantic`}
          />
        </section>
      )}

      {/* 03 — Result: the showpiece. Replaces 02 the moment the run finishes. */}
      {phase === "idle" && (
        <section aria-label="Result">
          <p className="smallcaps mb-2 text-slate">03 — Result</p>
          {rpcDown ? (
            <ErrorState
              title="Atlantic didn't answer"
              message="None of the receipt reads came back — the RPC endpoint may be unreachable from here right now. Your evidence hashes are untouched; nothing was sent."
              hint="Reads are retried with backoff automatically — wait a moment and try again."
              retryLabel="Retry verification"
              onRetry={verifyReceipts}
            />
          ) : (
            <div className="space-y-6" key={planId}>
              <ResultCard
                eyebrow={`Result — saga ${plan.name}`}
                headline={plan.headline}
                subline={plan.subline}
                rows={rows}
                links={plan.links}
                status="pass"
                copyValue={plan.runId}
              />
              <StatStrip stats={plan.stats} />

              <div>
                <h3 className="mb-2 text-lg font-bold text-ink">Step timeline — every receipt</h3>
                <p className="mb-3 text-sm leading-relaxed text-slate">
                  Expand a step for the executor's decision at that point.{" "}
                  {verifiedOnce
                    ? "The live chips show what the chain just said."
                    : "Use “Verify receipts on Atlantic” above to re-check every receipt live."}
                </p>
                <FeedList items={feedItems} maxHeight="max-h-none" emptyText="No steps." />
              </div>

              {plan.story === "forensics" && (
                <>
                  <div className="rounded-2xl border border-hairline bg-white p-6">
                    <p className="smallcaps mb-3 text-slate">
                      What was constructed vs what the chain decided
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-porcelain p-4">
                        <p className="text-sm font-bold text-golddeep">We constructed</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
                          <li>
                            The impossible input: execute(minOut=2001) against a 2000-wei lock
                          </li>
                          <li>
                            The explicit --gas-limit so cast's estimateGas couldn't swallow the
                            failure client-side
                          </li>
                          <li>The compensation order (refund first, revoke second)</li>
                        </ul>
                      </div>
                      <div className="rounded-xl bg-porcelain p-4">
                        <p className="text-sm font-bold text-pass">The chain decided</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
                          <li>
                            The receipt: <span className="font-mono">status 0x0</span> at block
                            31482534
                          </li>
                          <li>The gas burned: 24,231 — unrecoverable, reported honestly</li>
                          <li>
                            Both compensations mining with status 0x1 and restoring the balance
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-hairline bg-white p-6">
                    <p className="smallcaps mb-3 text-slate">
                      Failure forensics — read from the chain, never sent
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {FORENSICS.map((f) => (
                        <div key={f.k} className="rounded-xl bg-porcelain p-4">
                          <p className="text-sm font-bold text-golddeep">{f.k}</p>
                          <p className="mt-1 font-mono text-sm font-semibold text-ink">{f.v}</p>
                          <p className="mt-2 text-sm leading-relaxed text-slate">{f.d}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {plan.story === "crash" && <CrashTimeline />}
            </div>
          )}
        </section>
      )}

      {/* Tier C reproduce panel — below the result, per the standard */}
      <div className="rounded-2xl border border-hairline bg-white p-6">
        <p className="smallcaps mb-2 text-slate">Tier C — reproduce it</p>
        <h3 className="text-lg font-bold text-ink">Your terminal, your key</h3>
        <div className="code-block whitespace-pre mt-3">{REPRODUCE_CMD}</div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-outline" onClick={copyCmd}>
            {copied ? "Copied ✓" : "Copy commands"}
          </button>
          <p className="text-sm leading-relaxed text-slate">
            The failure step is intentionally constructed (impossible minOut); the compensation
            is automatic. Every broadcast goes through flock and costs dust wei only.
          </p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-slate">
        Full record — state logs, all 13 transactions, receipt-based spend accounting, and the
        runbook — on GitHub at{" "}
        <a
          className="font-mono text-accent hover:underline"
          href="https://github.com/mohamedwael201193/lightkeeper/tree/main/tasks/t06-saga-executor"
          target="_blank"
          rel="noreferrer"
        >
          tasks/t06-saga-executor
        </a>
        .
      </p>
    </div>
  );
}
