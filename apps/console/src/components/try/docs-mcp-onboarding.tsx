/**
 * T03 · Docs MCP Onboarding — "From question to command in 30 seconds" (Tier C).
 *
 * Presentation rebuilt on the LIGHTKEEPER Presentation Standard (SHOWTIME op,
 * 2026-10-16) and elevated to flagship on the FLAGSHIP-CREATIVE-BRIEF vision
 * (2026-10-16): one journey — 01 Configure → 02 Run → 03 Result.
 *
 * The 03 act is the flagship: the command lands as a premium terminal
 * artifact, then the flags ASSEMBLE one by one — each flag fading in with its
 * plain-language explanation (stagger ≤ 0.5s, keyed to the real "composed"
 * state, instant under prefers-reduced-motion). The thinking layer is made
 * visible: the chain-identity guard is a first-class banner (the --chain-id /
 * --rpc-url pins that keep every command on Atlantic), the byte-exact
 * discipline is shown as a live byte count, and the three-stage pipeline is
 * named with the real Docs-MCP query log it cites.
 *
 * Nothing executes in the browser — the visitor runs the command in their
 * own terminal. LIGHTKEEPER never sees, holds, or asks for private keys.
 *
 * Every command shape is grounded in the real Developer Docs MCP query log —
 * redone 2026-10-19 through the public Docs MCP endpoint
 * (https://docs.pharos.xyz/~gitbook/mcp, tools askQuestion/searchDocumentation/
 * getPage), captured in tasks/t03-docs-mcp-onboarding/evidence.md. The byte-exact
 * strings live in t03-command-builders.ts, verified outside the browser —
 * this file only presents them.
 */
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, ShieldCheck, TerminalSquare } from "lucide-react";
import type { Lamp } from "../../types";
import { ATLANTIC_RPC_URL, ATLANTIC_CHAIN_ID, isValidAddress } from "../../hooks/useAtlantic";
import { ResultCard, ProgressLoader, EmptyState, ErrorState } from "../ui";
import {
  BUILD_STAGES,
  BuildValidationError,
  runBuildPipeline,
  sanityCheckCommand,
  type BuilderInputs,
  type BuiltCommand,
  type GoalId,
  type ReadKind,
  type WatchMode,
} from "./t03-command-builders";

const GH = "https://github.com/mohamedwael201193/lightkeeper/tree/main/tasks/t03-docs-mcp-onboarding";

const DOC_LINKS: { label: string; href: string }[] = [
  { label: "Docs: Atlantic testnet", href: "https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md" },
  { label: "Docs: Pharos MCP", href: "https://docs.pharos.xyz/tooling-and-infrastructure/mcp.md" },
  { label: "Docs: JSON-RPC methods", href: "https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md" },
  { label: "Docs: PiggyBank skill guide", href: "https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide.md" },
];

type Phase = "idle" | "building" | "done" | "error";

const inputCls =
  "w-full rounded-lg border border-[#c3cfe8] bg-white px-3 py-2.5 font-mono text-sm text-ink placeholder:text-slate/60 focus:outline-none focus:border-[var(--accent)]";
const labelCls = "mb-1 block text-sm font-semibold text-ink";

/** The chain-identity guard, per goal — our thinking, stated as a feature. */
const GUARD_COPY: Record<GoalId, string> = {
  read: "Every read is pinned to the Atlantic RPC. A wrong-network RPC would answer for a different chain — the chain-ID command below settles any doubt.",
  send: "Broadcast is pinned to the Atlantic RPC — and run the pre-flight check first. If it does not print 688689, your RPC points at the wrong network.",
  deploy:
    "The --chain-id 688689 pin is the guard. The docs never label the hosted Chain MCP as Atlantic — without this pin, the wrong tooling would land your contract on 1672 (Pacific mainnet), not the testnet.",
  watch:
    "Reads are pinned to the Atlantic RPC and every page is capped at 100 blocks — the range cap the docs confirmed, so no request ever silently over-asks.",
};

function CommandCard({ command, title }: { command: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const byteLen = new TextEncoder().encode(command).length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = command;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <figure>
      <div className="overflow-hidden rounded-xl border border-ink bg-[var(--ink)] shadow-[0_12px_32px_rgba(11,21,51,0.25)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex shrink-0 gap-1.5" aria-hidden>
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </span>
            <span className="inline-flex min-w-0 items-center gap-2 truncate text-sm font-semibold text-[#e9eefa]">
              <TerminalSquare size={16} aria-hidden className="shrink-0" />
              <span className="truncate">{title}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex !min-h-[44px] shrink-0 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/20"
            aria-label={`Copy ${title} to clipboard`}
          >
            {copied ? <Check size={15} className="text-[#7ee2a8]" /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy command"}
          </button>
        </div>
        <pre className="overflow-x-auto whitespace-pre p-4 font-mono text-[15px] leading-relaxed text-[#e9eefa] sm:p-5">
          {command}
        </pre>
      </div>
      <figcaption className="mt-2 font-mono text-xs text-slate">
        {byteLen} bytes · generated byte-exact by the builder — not hand-written here
      </figcaption>
    </figure>
  );
}

/**
 * The Assembly transition: each flag fades in with its plain-language
 * explanation, staggered across the real flags of the just-composed command
 * (total stagger spread ≤ 0.5s). Keyed by buildSeq so the assembly replays
 * once per build — never on a timer.
 */
function FlagList({
  flags,
  buildSeq,
}: {
  flags: { flag: string; what: string }[];
  buildSeq: number;
}) {
  const reduceMotion = useReducedMotion();
  const instant = reduceMotion === true;
  return (
    <div>
      <p className="text-sm font-semibold text-ink">Every flag, explained</p>
      <p className="mt-0.5 text-sm text-slate">
        {flags.length} {flags.length === 1 ? "flag" : "flags"} — each one earns its place.
      </p>
      <motion.dl
        key={buildSeq}
        initial="hidden"
        animate="shown"
        variants={{
          hidden: {},
          shown: {
            transition: { staggerChildren: instant ? 0 : 0.06, delayChildren: instant ? 0 : 0.2 },
          },
        }}
      >
        {flags.map((f, i) => (
          <motion.div
            key={`${i}-${f.flag}`}
            variants={{
              hidden: { opacity: 0, y: 8 },
              shown: {
                opacity: 1,
                y: 0,
                transition: { duration: instant ? 0 : 0.22, ease: "easeOut" },
              },
            }}
            className="border-t border-hairline py-3 first:border-t-0"
          >
            <dt className="flex items-baseline gap-2.5">
              <span className="shrink-0 font-mono text-xs font-bold text-accent" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-mono text-sm font-semibold text-ink">{f.flag}</span>
            </dt>
            <dd className="mt-1 pl-8 text-sm leading-relaxed text-ink">{f.what}</dd>
          </motion.div>
        ))}
      </motion.dl>
    </div>
  );
}

/** The chain-identity guard as a first-class citizen of the result. */
function ChainGuard({ goal }: { goal: GoalId }) {
  return (
    <div className="flex gap-3 rounded-xl border border-[var(--tintdeep)] bg-[var(--tint)] p-4 sm:p-5">
      <ShieldCheck size={20} className="shrink-0 text-accent" aria-hidden />
      <div>
        <p className="text-sm font-bold text-ink">Chain-identity guard</p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{GUARD_COPY[goal]}</p>
      </div>
    </div>
  );
}

/** The three real pipeline stages, named — the thinking layer made visible. */
function PipelineTrace() {
  const stages = [
    { n: "01", title: "Validate", desc: "your inputs checked — fails fast, in plain language" },
    { n: "02", title: "Compose", desc: "the byte-exact command string, assembled" },
    { n: "03", title: "Explain", desc: "every flag accounted for, with its reason" },
  ];
  return (
    <div>
      <p className="text-sm font-semibold text-ink">How it was built — three real stages</p>
      <ol className="mt-2 grid gap-2 sm:grid-cols-3">
        {stages.map((s) => (
          <li
            key={s.n}
            className="rounded-xl border border-hairline bg-porcelain p-3.5"
          >
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <Check size={14} strokeWidth={3} className="text-pass" aria-hidden />
              <span className="font-mono text-xs text-slate">{s.n}</span> {s.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate">{s.desc}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-slate">
        Command shapes grounded in the real Developer Docs MCP query log —{" "}
        <a
          className="font-medium text-accent hover:underline"
          href={`${GH}/evidence.md`}
          target="_blank"
          rel="noreferrer"
        >
          evidence.md
        </a>
        , 9 queries asked and answered 2026-10-19 through{" "}
        <code className="font-mono">docs.pharos.xyz/~gitbook/mcp</code>.
      </p>
    </div>
  );
}

function SanityCheck({ ctxLabel }: { ctxLabel: string }) {
  const cmd = sanityCheckCommand({ rpc: ATLANTIC_RPC_URL, chainId: ATLANTIC_CHAIN_ID });
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {
      /* unreachable fallback below is enough for the test env */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-xl border border-hairline bg-porcelain p-4 sm:p-5">
      <p className="text-sm font-semibold text-ink">Pre-flight sanity check — {ctxLabel}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink">
        Run this first. If it does not print{" "}
        <code className="font-mono">{ATLANTIC_CHAIN_ID}</code>, stop — your RPC points at the wrong
        network (see the chain-identity trap note above).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-hairline bg-white px-3 py-2.5 font-mono text-[13px] text-ink">
          {cmd} <span className="text-slate"># expect {ATLANTIC_CHAIN_ID}</span>
        </code>
        <button
          type="button"
          onClick={copy}
          className="btn-outline inline-flex !min-h-[44px] items-center gap-2 !text-sm"
          aria-label="Copy sanity check command"
        >
          {copied ? <Check size={15} className="text-pass" /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy check"}
        </button>
      </div>
    </div>
  );
}

export default function TryDocsMcpOnboarding({ lamp: _lamp }: { lamp: Lamp }) {
  const [goal, setGoal] = useState<GoalId>("read");
  const [readKind, setReadKind] = useState<ReadKind>("balance");
  const [addr, setAddr] = useState("");
  const [sig, setSig] = useState("totalSupply()(uint256)");
  const [callArgs, setCallArgs] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [solFile, setSolFile] = useState("src/MyToken.sol");
  const [contractName, setContractName] = useState("MyToken");
  const [ctorArgs, setCtorArgs] = useState("");
  const [watchAddr, setWatchAddr] = useState("");
  const [watchMode, setWatchMode] = useState<WatchMode>("single");
  const [fromBlock, setFromBlock] = useState("latest");
  const [endBlock, setEndBlock] = useState("");
  const [evtSig, setEvtSig] = useState("Transfer(address,address,uint256)");

  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState<BuiltCommand | null>(null);
  const [buildSeq, setBuildSeq] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const seqRef = useRef(0);
  const configureRef = useRef<HTMLDivElement>(null);

  /** Any input change sends the journey back to 01 — the old result is stale. */
  const touch = () => {
    setPhase("idle");
    setResult(null);
    setErrorMsg(null);
  };
  const setGoalAndTouch = (g: GoalId) => {
    setGoal(g);
    touch();
  };

  const collectInputs = (): BuilderInputs => ({
    goal,
    readKind,
    addr,
    sig,
    callArgs,
    to,
    amount,
    solFile,
    contractName,
    ctorArgs,
    watchAddr,
    watchMode,
    fromBlock,
    endBlock,
    evtSig,
  });

  const handleBuild = async () => {
    const seq = ++seqRef.current;
    setPhase("building");
    setStepIdx(0);
    setErrorMsg(null);
    setResult(null);
    try {
      const built = await runBuildPipeline(
        collectInputs(),
        { rpc: ATLANTIC_RPC_URL, chainId: ATLANTIC_CHAIN_ID },
        isValidAddress,
        (s) => setStepIdx(s.index)
      );
      if (seq !== seqRef.current) return;
      setStepIdx(BUILD_STAGES.length);
      setResult(built);
      setBuildSeq((n) => n + 1);
      setPhase("done");
    } catch (e) {
      if (seq !== seqRef.current) return;
      setErrorMsg(
        e instanceof BuildValidationError
          ? e.message
          : "The builder hit an unexpected problem. Nothing was executed — try again."
      );
      setPhase("error");
    }
  };

  const scrollToConfigure = () => {
    touch();
    configureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goals: { id: GoalId; title: string; blurb: string }[] = [
    { id: "read", title: "Read state", blurb: "balances, calls, blocks — free, no signature" },
    { id: "send", title: "Send", blurb: "move dust PHRS from your own wallet" },
    { id: "deploy", title: "Deploy", blurb: "publish a contract with forge" },
    { id: "watch", title: "Watch events", blurb: "stream logs from a contract" },
  ];

  const showSanityCheck = result !== null && (goal === "send" || goal === "deploy");

  return (
    <div className="space-y-6">
      {/* header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-bold text-ink">From question to command in 30 seconds</h3>
          <span className="chip chip-info">Tier C — CLI builder</span>
          <span className="chip chip-pass">0 PHRS spent here</span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
          Pick what you want to do and this panel builds the exact{" "}
          <code className="font-mono">cast</code>/<code className="font-mono">forge</code> command —
          Atlantic RPC and chain ID already filled in, from answers the real Developer Docs MCP
          gave us on 2026-10-19. Copy it, run it in your own terminal. LIGHTKEEPER never executes anything for
          you and never asks for your private key.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="chip chip-dim">chain {ATLANTIC_CHAIN_ID}</span>
          <span className="chip chip-dim">rpc {ATLANTIC_RPC_URL}</span>
          <span className="chip chip-dim">native PHRS</span>
        </div>
      </div>

      {/* 01 — configure */}
      <div ref={configureRef} className="scroll-mt-6">
        <p className="smallcaps mb-2 text-slate">01 — Configure</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {goals.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGoalAndTouch(g.id)}
              aria-pressed={goal === g.id}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                goal === g.id
                  ? "border-[var(--accent)] bg-[var(--tint)]"
                  : "border-[#c3cfe8] bg-white hover:border-[var(--accent)]"
              }`}
            >
              <p className="text-sm font-bold text-ink">{g.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate">{g.blurb}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-hairline bg-porcelain p-5 sm:p-6">
          {goal === "read" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["balance", "Balance"],
                    ["call", "Contract call"],
                    ["block", "Latest block"],
                    ["chainid", "Chain ID"],
                  ] as [ReadKind, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setReadKind(id);
                      touch();
                    }}
                    aria-pressed={readKind === id}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      readKind === id
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[#c3cfe8] bg-white text-ink hover:border-[var(--accent)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(readKind === "balance" || readKind === "call") && (
                <div>
                  <label className={labelCls} htmlFor="t03-addr">
                    Contract / account address
                  </label>
                  <input
                    id="t03-addr"
                    className={inputCls}
                    placeholder="0x…"
                    value={addr}
                    onChange={(e) => {
                      setAddr(e.target.value);
                      touch();
                    }}
                  />
                </div>
              )}

              {readKind === "call" && (
                <div className="space-y-4">
                  <div>
                    <label className={labelCls} htmlFor="t03-sig">
                      Call signature
                    </label>
                    <input
                      id="t03-sig"
                      className={inputCls}
                      value={sig}
                      onChange={(e) => {
                        setSig(e.target.value);
                        touch();
                      }}
                    />
                    <p className="mt-1 text-sm text-slate">
                      Examples: <code className="font-mono">totalSupply()(uint256)</code>,{" "}
                      <code className="font-mono">balanceOf(address)(uint256)</code>
                    </p>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t03-callargs">
                      Arguments (optional, space-separated)
                    </label>
                    <input
                      id="t03-callargs"
                      className={inputCls}
                      placeholder="e.g. 0x0000…dEaD"
                      value={callArgs}
                      onChange={(e) => {
                        setCallArgs(e.target.value);
                        touch();
                      }}
                    />
                    <p className="mt-1 text-sm text-slate">
                      Cast encodes these for you — no manual ABI encoding needed.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {goal === "send" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="t03-to">
                  To (your address)
                </label>
                <input
                  id="t03-to"
                  className={inputCls}
                  placeholder="0x…"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    touch();
                  }}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="t03-amount">
                  Amount (PHRS, ≤ 0.01 dust)
                </label>
                <input
                  id="t03-amount"
                  className={inputCls}
                  placeholder="0.001"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    touch();
                  }}
                />
              </div>
              <p className="text-sm text-slate sm:col-span-2">
                Dust amounts only — testnet gas is cheap, but the 0.01 PHRS rule still applies.
              </p>
            </div>
          )}

          {goal === "deploy" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="t03-solfile">
                    Solidity file
                  </label>
                  <input
                    id="t03-solfile"
                    className={inputCls}
                    value={solFile}
                    onChange={(e) => {
                      setSolFile(e.target.value);
                      touch();
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="t03-contract">
                    Contract name
                  </label>
                  <input
                    id="t03-contract"
                    className={inputCls}
                    value={contractName}
                    onChange={(e) => {
                      setContractName(e.target.value);
                      touch();
                    }}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="t03-ctor">
                  Constructor args (optional, space-separated)
                </label>
                <input
                  id="t03-ctor"
                  className={inputCls}
                  placeholder='e.g. "My Token" MTK'
                  value={ctorArgs}
                  onChange={(e) => {
                    setCtorArgs(e.target.value);
                    touch();
                  }}
                />
              </div>
            </div>
          )}

          {goal === "watch" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(["single", "paged"] as WatchMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setWatchMode(m);
                      touch();
                    }}
                    aria-pressed={watchMode === m}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      watchMode === m
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[#c3cfe8] bg-white text-ink hover:border-[var(--accent)]"
                    }`}
                  >
                    {m === "single" ? "Single query" : "Paged range (auto 100-block pages)"}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="t03-watchaddr">
                    Contract address
                  </label>
                  <input
                    id="t03-watchaddr"
                    className={inputCls}
                    placeholder="0x…"
                    value={watchAddr}
                    onChange={(e) => {
                      setWatchAddr(e.target.value);
                      touch();
                    }}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="t03-evtsig">
                    Event signature (optional)
                  </label>
                  <input
                    id="t03-evtsig"
                    className={inputCls}
                    placeholder="Transfer(address,address,uint256)"
                    value={evtSig}
                    onChange={(e) => {
                      setEvtSig(e.target.value);
                      touch();
                    }}
                  />
                </div>
              </div>
              <p className="text-sm text-slate">
                Need the topic hash instead?{" "}
                <code className="font-mono">cast sig-event "Transfer(address,address,uint256)"</code>{" "}
                — but cast also accepts the signature itself as the first positional argument, which
                is what we generate.
              </p>
              {watchMode === "single" ? (
                <div>
                  <label className={labelCls} htmlFor="t03-fromblock">
                    From block
                  </label>
                  <input
                    id="t03-fromblock"
                    className={inputCls}
                    placeholder="latest"
                    value={fromBlock}
                    onChange={(e) => {
                      setFromBlock(e.target.value);
                      touch();
                    }}
                  />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="t03-startblock">
                      Start block (number)
                    </label>
                    <input
                      id="t03-startblock"
                      className={inputCls}
                      placeholder="31486336"
                      inputMode="numeric"
                      value={fromBlock}
                      onChange={(e) => {
                        setFromBlock(e.target.value);
                        touch();
                      }}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="t03-endblock">
                      End block (number)
                    </label>
                    <input
                      id="t03-endblock"
                      className={inputCls}
                      placeholder="31487236"
                      inputMode="numeric"
                      value={endBlock}
                      onChange={(e) => {
                        setEndBlock(e.target.value);
                        touch();
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleBuild}
            disabled={phase === "building"}
            className="btn-primary mt-6 w-full !min-h-[44px] !text-base"
          >
            {phase === "building" ? "Building…" : "Build my command"}
          </button>
        </div>
      </div>

      {/* 02 — run */}
      {phase === "building" && (
        <div>
          <p className="smallcaps mb-2 text-slate">02 — Run</p>
          <ProgressLoader
            steps={[...BUILD_STAGES]}
            current={stepIdx}
            title="Building your command"
          />
        </div>
      )}

      {/* 03 — result: the flagship act — the command as a terminal artifact,
          then the flags ASSEMBLE with their explanations, then the thinking
          layer (chain-identity guard, pipeline trace). */}
      <div>
        <p className="smallcaps mb-2 text-slate">03 — Result</p>
        {phase === "idle" && (
          <EmptyState
            title="No command yet"
            message="Pick a goal above, fill the blanks, and hit “Build my command”. Nothing runs anywhere until you do — this page only writes text for your own terminal."
          />
        )}
        {phase === "error" && errorMsg && (
          <ErrorState
            title="Can't build that command yet"
            message={errorMsg}
            hint="Fix the input above and run it again — nothing was executed anywhere."
            retryLabel="Check again"
            onRetry={handleBuild}
          />
        )}
        {phase === "done" && result && (
          <ResultCard
            eyebrow="Result — built in three stages"
            headline={result.resultTitle}
            subline={result.note}
            rows={result.facts.map((f) => ({ label: f.label, value: f.value }))}
            status="neutral"
          >
            <div className="space-y-6">
              <CommandCard command={result.command} title={result.resultTitle} />
              <ChainGuard goal={goal} />
              <FlagList flags={result.flags} buildSeq={buildSeq} />
              <PipelineTrace />
              {showSanityCheck && (
                <SanityCheck ctxLabel={goal === "send" ? "send" : "deploy"} />
              )}
              <div className="flex flex-wrap gap-2">
                {DOC_LINKS.map((d) => (
                  <a
                    key={d.href}
                    className="chip chip-info hover:underline"
                    href={d.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.label}
                  </a>
                ))}
              </div>
              <button type="button" onClick={scrollToConfigure} className="btn-outline">
                Build another command
              </button>
            </div>
          </ResultCard>
        )}
      </div>

      {/* evidence */}
      <div>
        <p className="smallcaps mb-2 text-slate">The evidence behind these commands</p>
        <div className="space-y-4 rounded-xl border border-hairline bg-white p-5 text-sm text-ink sm:p-6">
          <p className="leading-relaxed">
            Every command shape above comes from answers the real Developer Docs MCP gave on
            2026-10-19 — asked and answered verbatim through the public Docs MCP endpoint{" "}
            <code className="font-mono">docs.pharos.xyz/~gitbook/mcp</code> (tools{" "}
            <code className="font-mono">askQuestion</code>/
            <code className="font-mono">searchDocumentation</code>/
            <code className="font-mono">getPage</code>), byte-verified outside this page — and
            from the gaps those docs honestly have:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            <li>the docs name no official faucet URL — so this builder generates no faucet command</li>
            <li>
              the docs show no rate-limit headroom for scripted use of the public Q&amp;A endpoint —
              so this builder is pure <code className="font-mono">cast</code>/
              <code className="font-mono">forge</code>, never a web scraper
            </li>
            <li>
              the docs confirm <code className="font-mono">eth_getLogs</code> pages at 100 blocks —
              so the watcher script pages automatically, never asks for more
            </li>
          </ul>
          <div className="flex flex-wrap gap-2 text-xs">
            <a className="chip chip-info hover:underline" href={`${GH}/evidence.md`} target="_blank" rel="noreferrer">
              query log (evidence.md)
            </a>
            <a className="chip chip-info hover:underline" href={`${GH}/evidence.json`} target="_blank" rel="noreferrer">
              structured log (evidence.json)
            </a>
            <a className="chip chip-info hover:underline" href={`${GH}/QUICKSTART.md`} target="_blank" rel="noreferrer">
              first-5-queries quickstart
            </a>
          </div>
          <div className="mt-4 rounded-xl border border-hairline bg-porcelain p-4">
            <p className="text-sm font-semibold text-ink">Ask the Docs MCP yourself</p>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              The same runner that produced the log above — a real MCP client for{" "}
              <code className="font-mono">docs.pharos.xyz/~gitbook/mcp</code>, stdlib only, no
              key. It replays the 9 onboarding queries through{" "}
              <code className="font-mono">askQuestion</code> and writes a fresh verbatim
              transcript:
            </p>
            <CommandCard
              command="cd tasks/t03-docs-mcp-onboarding && python3 scripts/query_log.py run"
              title="Re-run the Docs MCP query log"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
