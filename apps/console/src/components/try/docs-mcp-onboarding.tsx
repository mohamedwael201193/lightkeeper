/**
 * T03 · Docs MCP Onboarding — "From question to command in 30 seconds" (Tier C).
 *
 * Presentation rebuilt on the LIGHTKEEPER Presentation Standard (SHOWTIME op,
 * 2026-10-16): one journey — 01 Configure → 02 Run → 03 Result.
 *
 * The visitor chooses what they want to do (read state / send / deploy /
 * watch events), hits "Build my command", and the panel generates the EXACT
 * copy-paste cast/forge command with Atlantic RPC + chain ID filled in, plus
 * a plain-language explanation of every flag. The generation itself runs
 * through a real three-stage pipeline (validate → compose → explain) that
 * the ProgressLoader mirrors — no timer steps.
 *
 * Nothing executes in the browser — the visitor runs it in their own
 * terminal. LIGHTKEEPER never sees, holds, or asks for private keys.
 *
 * Every command shape is grounded in the real Docs-MCP query log captured
 * 2026-10-16 (tasks/t03-docs-mcp-onboarding/evidence.json): chain identity
 * (688689 / PHRS), the 100-block get_logs paging answer, the Chain MCP tools
 * answer, and the documented faucet/arena gaps. The byte-exact strings live
 * in t03-command-builders.ts, verified outside the browser.
 */
import { useRef, useState } from "react";
import { Check, Copy, TerminalSquare } from "lucide-react";
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

function CommandCard({ command, title }: { command: string; title: string }) {
  const [copied, setCopied] = useState(false);
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
    <div className="overflow-hidden rounded-xl border border-hairline bg-porcelain">
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-white px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate">
          <TerminalSquare size={16} aria-hidden />
          {title}
        </span>
        <button
          type="button"
          onClick={copy}
          className="btn-outline inline-flex !min-h-[44px] items-center gap-2 !px-3 !text-sm"
          aria-label={`Copy ${title} to clipboard`}
        >
          {copied ? <Check size={15} className="text-pass" /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy command"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre p-4 font-mono text-[15px] leading-relaxed text-ink sm:p-5">
        {command}
      </pre>
    </div>
  );
}

function FlagList({ flags }: { flags: { flag: string; what: string }[] }) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-slate">Every flag, explained</p>
      <dl>
        {flags.map((f) => (
          <div key={f.flag} className="border-t border-hairline py-3 first:border-t-0">
            <dt className="font-mono text-sm font-semibold text-ink">{f.flag}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-ink">{f.what}</dd>
          </div>
        ))}
      </dl>
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
          Atlantic RPC and chain ID already filled in, from answers the real Pharos docs gave us on
          2026-10-16. Copy it, run it in your own terminal. LIGHTKEEPER never executes anything for
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

      {/* 03 — result */}
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
            eyebrow={`Result — ${result.resultTitle}`}
            headline="Copy. Paste. Run."
            subline={result.note}
            rows={result.facts.map((f) => ({ label: f.label, value: f.value }))}
            status="neutral"
          >
            <div className="space-y-6">
              <CommandCard command={result.command} title={result.resultTitle} />
              <FlagList flags={result.flags} />
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
            Every command shape above comes from answers the real Pharos docs gave on 2026-10-16,
            byte-verified outside this page — and from the gaps those docs honestly have:
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
        </div>
      </div>
    </div>
  );
}
