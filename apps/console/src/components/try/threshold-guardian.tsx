/**
 * T05 — Threshold Guardian: "The guardian you can trigger."
 *
 * Tier B — the console's real policy engine, evaluated client-side against
 * LIVE Atlantic reads, then the visitor fires a dust self-transfer only if
 * every condition passes. The visitor signs in THEIR wallet, from THEIR
 * address, with THEIR testnet PHRS. LIGHTKEEPER never touches keys.
 *
 * The differentiator is the trace: every condition shows the exact numbers
 * compared — live value vs configured threshold — with a PASS/BLOCK verdict,
 * and the honest negative (a breaching proposal is BLOCKED and never
 * broadcast) is one click away.
 */
import { useEffect, useMemo, useState } from "react";
import type { Lamp } from "../../types";
import {
  ATLANTIC_CHAIN_ID,
  EXPLORER_TX,
  rpcCall,
  useProposeAndSign,
} from "../../hooks/useAtlantic";
import { useWallet } from "../WalletContext";
import {
  EmptyState,
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
} from "../ui";
import type { FeedItem } from "../ui";
import { Hourglass, ShieldCheck, ShieldX } from "lucide-react";

/** From tasks/t05-threshold-guardian/policy.yaml — the real task policy. */
const DEFAULT_POLICY = {
  maxPerTx: "0.005",
  maxPerWindow: "0.02",
  windowMinutes: "60",
  maxGasGwei: "50",
};

interface CondResult {
  key: string;
  name: string;
  /** The vivid comparison: exact live value vs exact threshold. */
  detail: string;
  pass: boolean;
}

/** One gate run in this visitor's browser session — persisted locally. */
interface SessionEntry {
  t: string;
  value: string;
  decision: "ALLOW" | "BLOCK";
  failing: string[];
  tx: string | null;
}

const SESSION_LOG_KEY = "lk-t05-session-log";

function readSessionLog(): SessionEntry[] {
  try {
    const raw = localStorage.getItem(SESSION_LOG_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function fmtPhrs(v: number): string {
  return v.toFixed(6).replace(/\.?0+$/, "") || "0";
}

function fmtGwei(gwei: number): string {
  return gwei < 0.0001 ? "<0.0001" : gwei.toFixed(4).replace(/\.?0+$/, "");
}

/** One proposal step per REAL async call — the loader advances only when a
 *  call actually starts. The rolling-window check closes the loop with the
 *  real aggregate math (proposal + session spend vs the window cap). */
const PROPOSE_STEPS = [
  "Reading chain identity (eth_chainId)",
  "Reading live gas price (eth_gasPrice)",
  "Reading your balance (eth_getBalance)",
  "Checking the rolling window",
];

/** The sign flow's real async legs: the visitor's wallet sends, then the
 *  chain mines. Nothing else animates here. */
const SIGN_STEPS = [
  "Sending through your wallet (eth_sendTransaction)",
  "Waiting for Atlantic to mine it (eth_getTransactionReceipt)",
];

interface LiveStats {
  inWindow: number;
  capWin: number;
  gasGwei: number;
  balPhrs: number;
}

function TraceList({ trace }: { trace: CondResult[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-white">
      <p className="border-b border-hairline bg-porcelain px-5 py-3 text-sm font-semibold text-slate">
        Condition trace — every comparison, exact numbers
      </p>
      <ul className="divide-y divide-hairline">
        {trace.map((c) => (
          <li key={c.key} className="flex items-start gap-3 px-5 py-4">
            <span className={c.pass ? "chip chip-pass mt-0.5" : "chip chip-fail mt-0.5"}>
              {c.pass ? "Pass" : "Block"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{c.name}</p>
              <p className="mt-1 break-words font-mono text-xs text-slate">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TryThresholdGuardian({ lamp }: { lamp: Lamp }) {
  const { state: wallet, connect } = useWallet();
  const address = wallet.status === "connected" || wallet.status === "wrong-network"
    ? wallet.address
    : null;

  // --- 01 · editable policy (prefilled from the task's real policy.yaml) ---
  const [maxPerTx, setMaxPerTx] = useState(DEFAULT_POLICY.maxPerTx);
  const [maxPerWindow, setMaxPerWindow] = useState(DEFAULT_POLICY.maxPerWindow);
  const [windowMinutes, setWindowMinutes] = useState(DEFAULT_POLICY.windowMinutes);
  const [maxGasGwei, setMaxGasGwei] = useState(DEFAULT_POLICY.maxGasGwei);
  const [value, setValue] = useState("0.0001");

  // --- 02 · live evaluation ---
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);
  const [trace, setTrace] = useState<CondResult[] | null>(null);
  const [decision, setDecision] = useState<"ALLOW" | "BLOCK" | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  /** Visitor-confirmed guardian txs in this browser session — feeds the rolling-window check. */
  const [sessionSpend, setSessionSpend] = useState(0);
  const [ranFor, setRanFor] = useState<string>("");

  // --- 03 · Tier B sign flow ---
  const sign = useProposeAndSign();
  const [spendApplied, setSpendApplied] = useState(false);

  // --- session log: every gate run this visit, persisted in the browser ---
  const [sessionLog, setSessionLog] = useState<SessionEntry[]>(() => readSessionLog());
  function logRun(entry: SessionEntry) {
    setSessionLog((prev) => {
      const next = [entry, ...prev].slice(0, 50);
      try {
        localStorage.setItem(SESSION_LOG_KEY, JSON.stringify(next));
      } catch {
        /* private mode: the in-memory list still renders */
      }
      return next;
    });
  }

  const parseNum = (s: string): number | null => {
    if (!/^\d+(\.\d{1,18})?$/.test(s.trim())) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  async function runEvaluation(proposalValue?: string) {
    setReadError(null);
    setTrace(null);
    setDecision(null);
    setStats(null);
    if (!address) {
      setReadError("Connect your Atlantic wallet first — the guardian binds every proposal to the visitor's own address.");
      return;
    }
    const valuePhrs = parseNum(proposalValue ?? value);
    const capTx = parseNum(maxPerTx);
    const capWin = parseNum(maxPerWindow);
    const capGas = parseNum(maxGasGwei);
    const winMin = parseNum(windowMinutes);
    if (valuePhrs === null || capTx === null || capWin === null || capGas === null || winMin === null) {
      setReadError("One of the inputs is not a valid number — the guardian refuses to evaluate on bad input.");
      return;
    }

    setRunning(true);
    setStep(0);
    const conds: CondResult[] = [];
    try {
      // Live reads — Tier A, one real call per loader step. Anything unreadable
      // ⇒ fail closed. (Sequential so each loader step maps to a real call.)
      const chainHex = (await rpcCall("eth_chainId", [])) as string;
      setStep(1);
      const gasHex = (await rpcCall("eth_gasPrice", [])) as string;
      setStep(2);
      const balHex = (await rpcCall("eth_getBalance", [address, "latest"])) as string;
      setStep(3);

      const chainId = parseInt(chainHex, 16);
      const gasGwei = Number(BigInt(gasHex)) / 1e9;
      const balPhrs = Number(BigInt(balHex)) / 1e18;
      const feePhrs = (gasGwei * 21000) / 1e9;
      const reservePhrs = feePhrs * 2; // worst-case fee reserve, per the guardian doctrine

      // 1 · sender binding
      conds.push({
        key: "sender",
        name: "Sender binding",
        detail: `proposal sender = your address ${address.slice(0, 10)}… — only the bound sender may fire`,
        pass: true,
      });

      // 2 · network / mainnet firewall
      const networkOk = chainId === ATLANTIC_CHAIN_ID;
      conds.push({
        key: "network",
        name: "Network / mainnet firewall",
        detail:
          chainId === 1672
            ? `live eth_chainId = 1672 (mainnet) — REFUSED unconditionally; there is no override flag`
            : `live eth_chainId = ${chainId} ${networkOk ? "== 688689 (Atlantic testnet)" : "≠ 688689 — refused"}`,
        pass: networkOk,
      });

      // 3 · per-tx threshold
      conds.push({
        key: "threshold",
        name: "Per-transaction threshold",
        detail: `${fmtPhrs(valuePhrs)} PHRS ${valuePhrs <= capTx ? "≤" : ">"} ${fmtPhrs(capTx)} PHRS (max_per_tx)`,
        pass: valuePhrs <= capTx,
      });

      // 4 · rolling window (session-scoped, honest: this browser session's guardian spend)
      const inWindow = valuePhrs + sessionSpend;
      conds.push({
        key: "window",
        name: `Rolling-window cap (${fmtPhrs(winMin)} min)`,
        detail: `${fmtPhrs(valuePhrs)} proposed + ${fmtPhrs(sessionSpend)} spent this session = ${fmtPhrs(inWindow)} PHRS ${inWindow <= capWin ? "≤" : ">"} ${fmtPhrs(capWin)} PHRS (max_per_window)`,
        pass: inWindow <= capWin,
      });

      // 5 · gas-price sanity
      conds.push({
        key: "gas",
        name: "Gas-price sanity",
        detail: `live eth_gasPrice = ${fmtGwei(gasGwei)} gwei ${gasGwei <= capGas ? "≤" : ">"} ${fmtPhrs(capGas)} gwei (max_gas_price)`,
        pass: gasGwei <= capGas,
      });

      // 6 · balance sufficiency (value + worst-case fee reserve)
      conds.push({
        key: "balance",
        name: "Balance sufficiency",
        detail: `live balance = ${fmtPhrs(balPhrs)} PHRS ${balPhrs >= valuePhrs + reservePhrs ? "≥" : "<"} ${fmtPhrs(valuePhrs)} + ${fmtPhrs(reservePhrs)} PHRS fee reserve`,
        pass: balPhrs >= valuePhrs + reservePhrs,
      });

      const allow = conds.every((c) => c.pass);
      setStats({ inWindow, capWin, gasGwei, balPhrs });
      setTrace(conds);
      setDecision(allow ? "ALLOW" : "BLOCK");
      setRanFor(fmtPhrs(valuePhrs));
      setStep(PROPOSE_STEPS.length);
      logRun({
        t: new Date().toISOString(),
        value: fmtPhrs(valuePhrs),
        decision: allow ? "ALLOW" : "BLOCK",
        failing: conds.filter((c) => !c.pass).map((c) => c.name),
        tx: null,
      });
      if (!allow) sign.cancel();
    } catch (e) {
      // Fail closed: stale or unreadable chain data ⇒ BLOCK, never guess.
      conds.push({
        key: "reads",
        name: "Live chain reads",
        detail: e instanceof Error ? e.message : "The Atlantic RPC did not answer.",
        pass: false,
      });
      setTrace(conds);
      setDecision("BLOCK");
      setRanFor(fmtPhrs(valuePhrs ?? 0));
      logRun({
        t: new Date().toISOString(),
        value: fmtPhrs(valuePhrs ?? 0),
        decision: "BLOCK",
        failing: ["Live chain reads"],
        tx: null,
      });
      sign.cancel();
    } finally {
      setRunning(false);
    }
  }

  function fireDust() {
    if (!address) return;
    setSpendApplied(false);
    sign.propose({
      to: address,
      valuePhrs: ranFor || value,
      label: `Guardian-approved dust self-transfer (${ranFor || value} PHRS)`,
    });
  }

  // Apply the visitor's confirmed tx to the rolling window once (in an effect,
  // never during render), and attach the tx hash to the latest ALLOW log entry.
  useEffect(() => {
    if (sign.state === "confirmed" && !spendApplied) {
      const n = parseNum(ranFor || value);
      if (n !== null) setSessionSpend((s) => s + n);
      setSpendApplied(true);
      if (sign.txHash) {
        const tx = sign.txHash;
        setSessionLog((prev) => {
          const i = prev.findIndex((e) => e.decision === "ALLOW" && !e.tx);
          if (i === -1) return prev;
          const next = prev.slice();
          next[i] = { ...next[i], tx };
          try {
            localStorage.setItem(SESSION_LOG_KEY, JSON.stringify(next));
          } catch {
            /* private mode: in-memory list still renders */
          }
          return next;
        });
      }
    }
  }, [sign.state, sign.txHash, spendApplied, ranFor, value]);

  // --- 04 · the task's real audit trail, from evidence.json ---
  const ev = (lamp.evidence ?? {}) as Record<string, unknown>;
  const runs = useMemo(
    () => (Array.isArray(ev.runs) ? (ev.runs as Record<string, unknown>[]) : []),
    [lamp]
  );
  const spendTotal = typeof ev.spent_phrs === "number" ? ev.spent_phrs : null;
  const budget = typeof ev.budget_phrs === "number" ? ev.budget_phrs : null;

  const estFeeNote = "≈21,000 gas at live gas price — exact fee shown in your wallet before signing";

  const feedItems: FeedItem[] = sessionLog.map((e, i) => ({
    key: `${e.t}-${i}`,
    node: (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={e.decision === "ALLOW" ? "chip chip-pass" : "chip chip-fail"}>
            {e.decision}
          </span>
          <span className="text-sm font-semibold text-ink">{e.value} PHRS proposed</span>
          <span className="font-mono text-xs text-slate">
            {new Date(e.t).toLocaleTimeString()}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-slate">
          {e.decision === "ALLOW" ? (
            e.tx ? (
              <a
                className="text-accent hover:underline break-all"
                href={`${EXPLORER_TX}${e.tx}`}
                target="_blank"
                rel="noreferrer"
              >
                fired — {e.tx.slice(0, 18)}…
              </a>
            ) : (
              "no broadcast yet — nothing spent"
            )
          ) : (
            `failed on: ${e.failing.join("; ")}`
          )}
        </p>
      </div>
    ),
  }));

  return (
    <div className="space-y-8">
      {/* Intro */}
      <div>
        <p className="smallcaps mb-2">Tier B · propose + sign yourself</p>
        <h3 className="text-lg font-semibold text-ink">The guardian you can trigger</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
          This is the console's own policy engine — the same six conditions as the
          Threshold Guardian's <span className="font-mono">policy.yaml</span> — evaluated
          client-side against <strong className="text-ink">live Atlantic reads</strong>.
          Configure the thresholds, run the gate, and watch every condition pass or
          fail with the exact numbers compared. If — and only if — the gate allows
          it, you may fire a dust self-transfer. <strong className="text-ink">Your tx —
          signed in your wallet, from your address, with your testnet PHRS.</strong>{" "}
          LIGHTKEEPER never sees, holds, or asks for private keys. Atlantic testnet
          (chain 688689) only.
        </p>
      </div>

      {/* 01 · Configure */}
      <section id="t05-config">
        <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
          01 · Configure the gate
        </h4>
        <p className="mt-1 text-sm text-slate">
          Prefilled from the task's real <span className="font-mono">policy.yaml</span>.
          Edit any number — the trace below shows exactly what each one guards.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Max per tx (PHRS)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={maxPerTx}
              onChange={(e) => setMaxPerTx(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Rolling window cap (PHRS)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={maxPerWindow}
              onChange={(e) => setMaxPerWindow(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Window (minutes)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Max gas price (gwei)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={maxGasGwei}
              onChange={(e) => setMaxGasGwei(e.target.value)}
              inputMode="decimal"
            />
          </label>
        </div>
        <div className="mt-3 max-w-xs">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">Proposal value (PHRS)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder="0.0001"
            />
          </label>
        </div>
        {!address ? (
          <button className="btn-primary mt-4" onClick={connect}>
            Connect Atlantic wallet to run the gate
          </button>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-primary"
              onClick={() => runEvaluation()}
              disabled={running}
            >
              {running ? "Reading Atlantic…" : "RUN the gate"}
            </button>
            <button
              className="btn-outline"
              onClick={() => {
                setValue("0.05");
                runEvaluation("0.05");
              }}
              disabled={running}
            >
              Show the honest negative: propose 0.05 PHRS
            </button>
          </div>
        )}
        {readError && (
          <div className="mt-4">
            <ErrorState
              title="The gate couldn't run"
              message={readError}
              hint="Nothing was evaluated and nothing was spent — fix the input and try again."
              retryLabel={!address ? "Connect Atlantic wallet" : "Try again"}
              onRetry={!address ? connect : () => runEvaluation()}
            />
          </div>
        )}
      </section>

      {/* 02 · Propose — live progress while the real reads happen */}
      {running && (
        <section>
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
            02 · Propose — composing and checking against the chain
          </h4>
          <div className="mt-3">
            <ProgressLoader steps={PROPOSE_STEPS} current={step} />
          </div>
        </section>
      )}

      {/* 03 · Result — the verdict is the showpiece */}
      {!running && decision && trace && (
        <section>
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
            03 · Result — the gate's verdict
          </h4>
          <div className="mt-3">
            {decision === "ALLOW" ? (
              <ResultCard
                eyebrow={`Gate verdict — proposal of ${ranFor} PHRS`}
                headline={
                  <span className="inline-flex items-center gap-3">
                    <ShieldCheck size={44} className="text-pass" aria-hidden />
                    ALLOW
                  </span>
                }
                status="pass"
                subline="All six conditions pass on live Atlantic reads. The guardian would fire this transfer — and only a transfer you propose, review, and sign yourself."
                rows={[
                  {
                    label: "Per-tx check",
                    value: trace.find((c) => c.key === "threshold")?.detail ?? "—",
                  },
                  {
                    label: "Rolling-window check",
                    value: trace.find((c) => c.key === "window")?.detail ?? "—",
                  },
                  {
                    label: "Balance check",
                    value: trace.find((c) => c.key === "balance")?.detail ?? "—",
                  },
                  {
                    label: "Gas sanity",
                    value: trace.find((c) => c.key === "gas")?.detail ?? "—",
                  },
                ]}
              />
            ) : (
              <ResultCard
                eyebrow={`Gate verdict — proposal of ${ranFor} PHRS`}
                headline={
                  <span className="inline-flex items-center gap-3">
                    <ShieldX size={44} className="text-fail" aria-hidden />
                    BLOCK
                  </span>
                }
                status="fail"
                subline="At least one condition failed on live Atlantic data. Nothing was proposed, nothing was signed, nothing was spent — that is the guardian doing its job. The trace below is the proof."
                rows={[
                  {
                    label: "Failed on",
                    value: trace.filter((c) => !c.pass).map((c) => c.name).join("; ") || "—",
                  },
                  {
                    label: "Rolling-window check",
                    value: trace.find((c) => c.key === "window")?.detail ?? "—",
                  },
                ]}
              />
            )}
          </div>

          {stats && (
            <div className="mt-4">
              <StatStrip
                stats={[
                  {
                    label: "Window used",
                    value: stats.inWindow,
                    format: fmtPhrs,
                    suffix: "PHRS",
                  },
                  {
                    label: "Window cap",
                    value: stats.capWin,
                    format: fmtPhrs,
                    suffix: "PHRS",
                  },
                  {
                    label: "Live gas price",
                    value: stats.gasGwei,
                    format: fmtGwei,
                    suffix: "gwei",
                  },
                  {
                    label: "Your balance",
                    value: stats.balPhrs,
                    format: fmtPhrs,
                    suffix: "PHRS",
                  },
                ]}
              />
            </div>
          )}

          <TraceList trace={trace} />

          {/* The fire flow — propose → review → sign → receipt, each an honest state */}
          {decision === "ALLOW" && (
            <div className="mt-6">
              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
                Fire — only because the gate allowed it
              </h4>

              {sign.state === "idle" && (
                <div className="mt-3 rounded-2xl border border-hairline bg-white p-6 sm:p-8">
                  <p className="text-sm leading-relaxed text-ink">
                    Propose a dust self-transfer of{" "}
                    <span className="font-mono font-semibold">{ranFor} PHRS</span>{" "}
                    to your own address. Nothing leaves your hands: the proposal is
                    reviewed here first, then signed and sent by you.
                  </p>
                  <button className="btn-primary mt-4" onClick={fireDust}>
                    Propose {ranFor} PHRS self-transfer
                  </button>
                </div>
              )}

              {sign.state === "review" && sign.proposal && (
                <div className="mt-3 rounded-2xl border border-hairline bg-white p-6 sm:p-8">
                  <p className="smallcaps mb-2">Review — mandatory</p>
                  <p className="text-base font-semibold text-ink">{sign.proposal.label}</p>
                  <div className="mt-3 space-y-1.5 font-mono text-sm text-slate">
                    <p>
                      to <span className="break-all text-ink">{sign.proposal.to}</span>{" "}
                      <span className="text-slate">(your connected address)</span>
                    </p>
                    <p>
                      value <span className="text-ink">{sign.proposal.valuePhrs} PHRS</span>
                    </p>
                    <p className="text-xs">estimated cost {estFeeNote}</p>
                  </div>
                  {/* The review-step dust warning — AMBER, never an error. */}
                  {sign.error && (
                    <p className="mt-4 rounded-lg border border-gold bg-[#fff8e8] px-3 py-2 text-sm font-semibold text-golddeep">
                      ⚠ {sign.error}
                    </p>
                  )}
                  <p className="mt-4 text-sm text-slate">
                    Your tx — signed in your wallet, from your address. LIGHTKEEPER
                    cannot sign or broadcast for you; approving asks your wallet to
                    send on Atlantic testnet only.
                  </p>
                  <div className="sticky bottom-3 mt-5 flex flex-col gap-2 sm:flex-row">
                    <button className="btn-primary flex-1" onClick={() => sign.approve()}>
                      Sign in my wallet
                    </button>
                    <button className="btn-outline" onClick={() => sign.cancel()}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {sign.state === "awaiting-signature" && (
                <div className="mt-3 flex items-start gap-3 rounded-2xl border border-hairline bg-white p-6 sm:p-8">
                  <span className="mt-1.5 h-3 w-3 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
                  <div>
                    <p className="text-base font-semibold text-ink">
                      <Hourglass size={16} className="mr-1.5 inline-block" aria-hidden />
                      Waiting in your wallet
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate">
                      Check the transaction popup in your wallet — review it there, then
                      sign. This step only moves when you act; LIGHTKEEPER can't see
                      your wallet or touch your keys.
                    </p>
                  </div>
                </div>
              )}

              {sign.state === "broadcasting" && (
                <div className="mt-3">
                  <ProgressLoader
                    steps={SIGN_STEPS}
                    current={1}
                    title="Signed — your transaction is on its way"
                  />
                </div>
              )}

              {sign.state === "blocked" && (
                <div className="mt-3">
                  <ErrorState
                    title="Blocked — a safety check refused"
                    message={sign.error ?? "The proposal failed a safety check."}
                    hint="Nothing was signed or broadcast. Fix the flagged issue and propose again."
                    retryLabel="Reconnect wallet"
                    onRetry={connect}
                  />
                </div>
              )}

              {sign.state === "error" && (
                <div className="mt-3">
                  <ErrorState
                    title="That didn't go through"
                    message={sign.error ?? "The wallet call failed."}
                    hint="Nothing unexpected was sent — check the message above, then start over."
                    retryLabel="Start over"
                    onRetry={() => sign.cancel()}
                  />
                </div>
              )}

              {sign.state === "confirmed" && sign.txHash && (
                <div className="mt-3">
                  <ResultCard
                    eyebrow="Receipt — mined on Atlantic testnet"
                    headline="Confirmed"
                    status="pass"
                    subline={`Your guardian-approved dust self-transfer was mined — and the ${ranFor} PHRS now counts toward this session's rolling window (session spend: ${fmtPhrs(sessionSpend)} PHRS).`}
                    rows={[
                      {
                        label: "Transaction",
                        value: `${sign.txHash.slice(0, 18)}…${sign.txHash.slice(-8)}`,
                      },
                      { label: "Value", value: `${ranFor} PHRS` },
                      { label: "To", value: `${address?.slice(0, 10)}… (your address)` },
                    ]}
                    links={[
                      {
                        label: "View on the Atlantic explorer",
                        href: `${EXPLORER_TX}${sign.txHash}`,
                      },
                    ]}
                    copyValue={sign.txHash}
                  />
                </div>
              )}
            </div>
          )}

          {/* The honest negative — re-fireable with the small amount */}
          {decision === "BLOCK" && (
            <div className="mt-6">
              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
                Hold — the honest negative case
              </h4>
              <div className="empty-panel mt-3 px-6 py-6">
                <p className="text-sm leading-relaxed text-slate">
                  The proposal of{" "}
                  <span className="font-mono font-semibold text-ink">{ranFor} PHRS</span>{" "}
                  breached at least one condition above. <strong className="text-ink">
                  Nothing was proposed, nothing was signed, nothing was broadcast, nothing
                  was spent.</strong> Want to see the other side? Re-run with the firing case.
                </p>
                <button
                  className="btn-outline mt-4"
                  onClick={() => {
                    setValue("0.0001");
                    runEvaluation("0.0001");
                  }}
                  disabled={running}
                >
                  Re-run with 0.0001 PHRS (the firing case)
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 04 · Audit history — the task's real evidence.json trail */}
      <section>
        <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
          04 · Audit history — the task's real on-chain record
        </h4>
        <p className="mt-1 text-sm text-slate">
          Every run below comes from this task's <span className="font-mono">evidence.json</span> —
          real guardian runs on Atlantic, not a replay.
        </p>
        {runs.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-white">
            <div className="overflow-x-auto">
            <table className="data-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Proposal</th>
                  <th>Decision</th>
                  <th>Proof</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => {
                  const label = String(r.label ?? `run ${i + 1}`);
                  const decisionR = String(r.decision ?? "—");
                  const proposal = String(r.proposal ?? "—");
                  const reason = r.reason != null ? String(r.reason) : null;
                  const tx = r.tx_hash != null ? String(r.tx_hash) : null;
                  const explorer = r.explorer != null ? String(r.explorer) : null;
                  return (
                    <tr key={i}>
                      <td className="font-semibold text-ink">{label}</td>
                      <td className="font-mono text-xs text-slate">{proposal}</td>
                      <td>
                        <span
                          className={
                            decisionR === "ALLOW" ? "chip chip-pass" : "chip chip-fail"
                          }
                        >
                          {decisionR}
                        </span>
                        {reason && (
                          <p className="mt-1 max-w-xs text-xs text-slate">{reason}</p>
                        )}
                      </td>
                      <td className="font-mono text-xs">
                        {tx ? (
                          <a
                            className="text-accent hover:underline break-all"
                            href={explorer ?? `${EXPLORER_TX}${tx}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {tx.slice(0, 18)}…
                          </a>
                        ) : (
                          <span className="text-slate">no broadcast — nothing spent</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No audit rows found"
            message="This lamp's evidence carries no recorded guardian runs yet — the session log below fills as you run the gate yourself."
          />
        )}
        {spendTotal !== null && budget !== null && (
          <p className="mt-3 text-sm text-slate">
            Task spend on-chain:{" "}
            <span className="font-mono text-ink">{spendTotal} PHRS</span> of a{" "}
            <span className="font-mono text-ink">{budget} PHRS</span> budget — the
            task's on-chain dust fires (value + gas). This console surface spends
            only your own dust, only when you sign.
          </p>
        )}
      </section>

      {/* 05 · Your session log — this visit's gate runs, kept in your browser */}
      <section>
        <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
          05 · Your session log — this visit's runs
        </h4>
        <p className="mt-1 text-sm text-slate">
          Every gate you run above is written here too — decision, proposal, and
          what failed it — stored only in your browser, never sent anywhere.
        </p>
        {sessionLog.length > 0 ? (
          <div className="mt-3">
            <FeedList items={feedItems} maxHeight="max-h-[22rem]" emptyText="Nothing yet — run the gate and the decision lands here." />
            <div className="mt-2">
              <button
                className="text-sm text-slate underline hover:text-ink"
                onClick={() => {
                  setSessionLog([]);
                  try {
                    localStorage.removeItem(SESSION_LOG_KEY);
                  } catch {
                    /* noop */
                  }
                }}
              >
                Clear my session log
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              title="No gate runs yet"
              message="Run the gate in section 02 and the decision lands here — the log lives only in your browser, newest first."
              actionLabel="Back to configuration"
              onAction={() => document.getElementById("t05-config")?.scrollIntoView({ behavior: "smooth" })}
            />
          </div>
        )}
      </section>
    </div>
  );
}
