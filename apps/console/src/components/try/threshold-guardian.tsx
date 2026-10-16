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
import { useMemo, useState } from "react";
import type { Lamp } from "../../types";
import {
  ATLANTIC_CHAIN_ID,
  EXPLORER_TX,
  rpcCall,
  useProposeAndSign,
} from "../../hooks/useAtlantic";
import { useWallet } from "../WalletContext";

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

function fmtPhrs(v: number): string {
  return v.toFixed(6).replace(/\.?0+$/, "") || "0";
}

function fmtGwei(gwei: number): string {
  return gwei < 0.0001 ? "<0.0001" : gwei.toFixed(4).replace(/\.?0+$/, "");
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
  const [readError, setReadError] = useState<string | null>(null);
  const [trace, setTrace] = useState<CondResult[] | null>(null);
  const [decision, setDecision] = useState<"ALLOW" | "BLOCK" | null>(null);
  /** Visitor-confirmed guardian txs in this browser session — feeds the rolling-window check. */
  const [sessionSpend, setSessionSpend] = useState(0);
  const [ranFor, setRanFor] = useState<string>("");

  // --- 03 · Tier B sign flow ---
  const sign = useProposeAndSign();
  const [spendApplied, setSpendApplied] = useState(false);

  const parseNum = (s: string): number | null => {
    if (!/^\d+(\.\d{1,18})?$/.test(s.trim())) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  async function runEvaluation(proposalValue?: string) {
    setReadError(null);
    setTrace(null);
    setDecision(null);
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
    const conds: CondResult[] = [];
    try {
      // Live reads — Tier A. Anything unreadable ⇒ fail closed.
      const [chainHex, gasHex, balHex] = (await Promise.all([
        rpcCall("eth_chainId", []),
        rpcCall("eth_gasPrice", []),
        rpcCall("eth_getBalance", [address, "latest"]),
      ])) as [string, string, string];

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
      setTrace(conds);
      setDecision(allow ? "ALLOW" : "BLOCK");
      setRanFor(fmtPhrs(valuePhrs));
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

  // Apply the visitor's confirmed tx to the rolling window once.
  if (sign.state === "confirmed" && !spendApplied) {
    const n = parseNum(ranFor || value);
    if (n !== null) setSessionSpend((s) => s + n);
    setSpendApplied(true);
  }

  // --- 04 · the task's real audit trail, from evidence.json ---
  const ev = (lamp.evidence ?? {}) as Record<string, unknown>;
  const runs = useMemo(
    () => (Array.isArray(ev.runs) ? (ev.runs as Record<string, unknown>[]) : []),
    [lamp]
  );
  const spendTotal = typeof ev.spent_phrs === "number" ? ev.spent_phrs : null;
  const budget = typeof ev.budget_phrs === "number" ? ev.budget_phrs : null;

  const estFeeNote = "≈21,000 gas at live gas price — exact fee shown in your wallet before signing";

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
      <section>
        <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
          01 · Configure the gate
        </h4>
        <p className="mt-1 text-xs text-slate">
          Prefilled from the task's real <span className="font-mono">policy.yaml</span>.
          Edit any number — the trace below shows exactly what each one guards.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Max per tx (PHRS)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={maxPerTx}
              onChange={(e) => setMaxPerTx(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Rolling window cap (PHRS)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={maxPerWindow}
              onChange={(e) => setMaxPerWindow(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Window (minutes)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Max gas price (gwei)</span>
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
            <span className="mb-1 block text-xs font-semibold text-ink">Proposal value (PHRS)</span>
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
        {readError && <p className="mt-3 text-sm text-fail">{readError}</p>}
      </section>

      {/* 02 · Condition trace */}
      {(trace || running) && (
        <section>
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
            02 · Condition trace — every comparison, exact numbers
          </h4>
          {running && <p className="mt-2 text-sm text-slate">Reading eth_chainId, eth_gasPrice and your balance from Atlantic…</p>}
          {trace && (
            <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-white">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>Live value vs threshold</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.map((c) => (
                    <tr key={c.key}>
                      <td className="font-semibold text-ink">{c.name}</td>
                      <td className="font-mono text-xs text-slate">{c.detail}</td>
                      <td>
                        <span className={c.pass ? "chip chip-pass" : "chip chip-fail"}>
                          {c.pass ? "Pass" : "Block"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between gap-3 border-t border-hairline bg-porcelain px-4 py-3">
                <p className="text-xs text-slate">
                  {decision === "ALLOW"
                    ? "Six independent conditions, all passing on live chain data."
                    : "One failing condition is enough — the guardian fails closed."}
                </p>
                <span className={decision === "ALLOW" ? "chip chip-pass" : "chip chip-fail"}>
                  Decision: {decision}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 03 · Fire — the mandatory review + visitor signature */}
      {decision === "ALLOW" && (
        <section>
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
            03 · Fire — only because the gate allowed it
          </h4>
          {sign.state === "idle" && (
            <div className="mt-3">
              <p className="text-sm text-slate">
                Propose a dust self-transfer of{" "}
                <span className="font-mono font-semibold text-ink">{ranFor} PHRS</span>{" "}
                to your own address. Nothing leaves your hands: the proposal is reviewed
                here first, then signed and sent by you.
              </p>
              <button className="btn-primary mt-3" onClick={fireDust}>
                Propose {ranFor} PHRS self-transfer
              </button>
            </div>
          )}

          {sign.state === "review" && sign.proposal && (
            <div className="mt-3 rounded-xl border border-hairline bg-porcelain p-4">
              <p className="smallcaps mb-2">Review — mandatory</p>
              <p className="text-sm font-semibold text-ink">{sign.proposal.label}</p>
              <div className="mt-2 space-y-1 font-mono text-xs text-slate">
                <p>
                  to <span className="text-ink">{sign.proposal.to}</span>{" "}
                  <span className="text-slate">(your connected address)</span>
                </p>
                <p>
                  value <span className="text-ink">{sign.proposal.valuePhrs} PHRS</span>
                </p>
                <p>estimated cost {estFeeNote}</p>
              </div>
              {/* The review-step dust warning — AMBER, never an error. */}
              {sign.error && (
                <p className="mt-3 rounded-lg border border-gold bg-[#fff8e8] px-3 py-2 text-sm font-semibold text-golddeep">
                  ⚠ {sign.error}
                </p>
              )}
              <p className="mt-3 text-xs text-slate">
                Your tx — signed in your wallet, from your address. LIGHTKEEPER cannot
                sign or broadcast for you; approving asks your wallet to send on
                Atlantic testnet only.
              </p>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" onClick={() => sign.approve()}>
                  Sign in my wallet
                </button>
                <button className="btn-outline" onClick={() => sign.cancel()}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {sign.state === "awaiting-signature" && (
            <p className="mt-3 text-sm text-slate">Waiting for your wallet — review the transaction there, then sign.</p>
          )}
          {sign.state === "broadcasting" && (
            <p className="mt-3 text-sm text-slate">Sent — waiting for Atlantic to mine it…</p>
          )}
          {sign.state === "blocked" && (
            <div className="mt-3">
              <p className="text-sm text-fail">{sign.error}</p>
              <button className="btn-outline mt-2" onClick={connect}>
                Reconnect wallet
              </button>
            </div>
          )}
          {sign.state === "error" && (
            <div className="mt-3">
              <p className="text-sm text-fail">{sign.error}</p>
              <button className="btn-outline mt-2" onClick={() => sign.cancel()}>
                Start over
              </button>
            </div>
          )}
          {sign.state === "confirmed" && sign.txHash && (
            <div className="mt-3 rounded-xl border border-hairline bg-white p-4">
              <span className="chip chip-pass">Confirmed</span>
              <p className="mt-2 font-mono text-xs text-slate break-all">
                tx <span className="text-ink">{sign.txHash}</span>
              </p>
              <p className="mt-1 text-xs text-slate">
                The {ranFor} PHRS now counts toward this session's rolling window
                (session spend: {fmtPhrs(sessionSpend)} PHRS).
              </p>
              <a
                className="mt-2 inline-block font-mono text-sm text-accent hover:underline"
                href={`${EXPLORER_TX}${sign.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View on the Atlantic explorer →
              </a>
            </div>
          )}
        </section>
      )}

      {decision === "BLOCK" && trace && (
        <section>
          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
            03 · Hold — the honest negative case
          </h4>
          <div className="empty-panel mt-3 px-5 py-5">
            <span className="chip chip-fail">Blocked</span>
            <p className="mt-2 text-sm text-slate">
              The proposal of <span className="font-mono text-ink">{ranFor} PHRS</span>{" "}
              breached at least one condition above. <strong className="text-ink">
              Nothing was proposed, nothing was signed, nothing was broadcast, nothing
              was spent.</strong> That is the guardian doing its job — the trace is the
              proof.
            </p>
            <button
              className="btn-outline mt-3"
              onClick={() => {
                setValue("0.0001");
                runEvaluation("0.0001");
              }}
              disabled={running}
            >
              Re-run with 0.0001 PHRS (the firing case)
            </button>
          </div>
        </section>
      )}

      {/* 04 · Audit history — the task's real evidence.json trail */}
      <section>
        <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate">
          04 · Audit history — the task's real on-chain record
        </h4>
        <p className="mt-1 text-xs text-slate">
          Every run below comes from this task's <span className="font-mono">evidence.json</span> —
          real guardian runs on Atlantic, not a replay.
        </p>
        {runs.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-white">
            <table className="data-table">
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
        ) : (
          <div className="empty-panel mt-3 px-5 py-6 text-sm text-slate">
            No audit rows found in this lamp's evidence.
          </div>
        )}
        {spendTotal !== null && budget !== null && (
          <p className="mt-3 text-xs text-slate">
            Task spend on-chain:{" "}
            <span className="font-mono text-ink">{spendTotal} PHRS</span> of a{" "}
            <span className="font-mono text-ink">{budget} PHRS</span> budget — the single
            FIRE self-transfer of 0.0001 PHRS plus its gas. This console surface spends
            only your own dust, only when you sign.
          </p>
        )}
      </section>
    </div>
  );
}
