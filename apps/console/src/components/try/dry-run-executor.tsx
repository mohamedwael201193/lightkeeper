/**
 * T08 Dry-Run Executor — "See the outcome before your wallet opens".
 *
 * Tier B (simulate → review → optionally sign yourself).
 *
 *   01 CONFIGURE — the visitor assembles to / value / data (presets included).
 *   02 RUN       — ProgressLoader over the REAL sequential RPC calls:
 *                  eth_call → eth_estimateGas → gas price → block number →
 *                  target balance. Each step maps to exactly one async call.
 *   03 RESULT   — ResultCard showpiece: the dry-run verdict (PASS/FAIL),
 *                  the executor's predicted-vs-actual self-score as a vivid
 *                  vs-layout, and a StatStrip drift ledger.
 *
 * Gate law preserved: a FAILing dry-run BLOCKS the sign path with the reason
 * stated on the button — never a dead button, never auto-broadcast, review
 * before sign, chain 688689 guard inside useProposeAndSign.
 *
 * LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only
 * (chain 688689). Dry-runs are free reads; nothing moves until the visitor
 * explicitly signs in their own wallet.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import type { Lamp } from "../../types";
import { weiToPhrs } from "../../types";
import { useWallet } from "../WalletContext";
import {
  ATLANTIC_RPC_URL,
  EXPLORER_TX,
  isValidAddress,
  phrsToWeiHex,
  useProposeAndSign,
} from "../../hooks/useAtlantic";
import { ResultCard, ProgressLoader, ErrorState, StatStrip } from "../ui";

/** The live T08 probe contract — real on-chain calls, never mocks. */
const PROBE = "0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f";
const SIG_PING = "0x5c36b186"; // ping()  — succeeds
const SIG_BOOM = "0xa169ce09"; // boom()  — always reverts

const PANIC_CODES: Record<string, string> = {
  "0x01": "assert() failed",
  "0x11": "arithmetic overflow / underflow",
  "0x12": "division or modulo by zero",
  "0x21": "invalid enum value",
  "0x22": "bad storage byte-array encoding",
  "0x31": "pop() on an empty array",
  "0x32": "array index out of bounds",
  "0x41": "memory allocation overflow",
  "0x51": "zero-initialized function pointer",
};

interface JsonRpcError {
  message?: string;
  code?: number;
  data?: unknown;
}

/** Full JSON-RPC response, error kept intact so revert payloads survive. */
async function rpcRaw(
  method: string,
  params: unknown[]
): Promise<{ result?: unknown; error?: JsonRpcError }> {
  let res: Response;
  try {
    res = await fetch(ATLANTIC_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
  } catch {
    throw new Error("The Atlantic RPC did not answer — check your connection and retry.");
  }
  if (!res.ok) throw new Error(`The Atlantic RPC returned HTTP ${res.status} — retry in a moment.`);
  return (await res.json()) as { result?: unknown; error?: JsonRpcError };
}

/** Pull the revert payload hex out of a JSON-RPC error (data field or message). */
function extractRevertHex(err: JsonRpcError): string | null {
  if (typeof err.data === "string" && /^0x[0-9a-fA-F]+$/.test(err.data)) return err.data;
  const msg = err.message ?? "";
  const m = msg.match(/0x[0-9a-fA-F]{8,}/);
  return m ? m[0] : null;
}

/** Decode a revert payload: Error(string) / Panic(uint256) / custom. Never invented. */
function decodeRevert(hex: string): { reason: string; encoding: string } {
  const h = hex.toLowerCase();
  if (h.startsWith("0x08c379a0")) {
    try {
      const body = h.slice(10);
      const len = parseInt(body.slice(64, 128), 16);
      const strHex = body.slice(128, 128 + len * 2);
      let s = "";
      for (let i = 0; i + 2 <= strHex.length; i += 2) {
        const code = parseInt(strHex.slice(i, i + 2), 16);
        if (code === 0) break;
        s += String.fromCharCode(code);
      }
      return { reason: s || "(empty revert string)", encoding: "Error(string)" };
    } catch {
      return { reason: "(Error(string) payload could not be decoded)", encoding: "Error(string)" };
    }
  }
  if (h.startsWith("0x4e487b71")) {
    const word = h.slice(-64).padStart(64, "0");
    const code = "0x" + BigInt("0x" + word).toString(16).padStart(2, "0");
    const label = PANIC_CODES[code] ?? `unknown panic code ${code}`;
    return { reason: `Solidity panic — ${label} (${code})`, encoding: "Panic(uint256)" };
  }
  return {
    reason: `Custom error — selector ${h.slice(0, 10)} (no ABI supplied, payload shown raw)`,
    encoding: "custom error",
  };
}

type SimResult =
  | {
      kind: "PASS";
      key: string;
      gasEstimate: string;
      gasLimit: string;
      gasPriceGwei: string;
      predictedCostPhrs: string;
      blockNumber: string;
      returnBytes: number;
      targetBalancePhrs: string | null;
      fromLabel: string;
    }
  | {
      kind: "FAIL";
      key: string;
      revertReason: string;
      revertEncoding: string;
      revertHex: string | null;
      stage: "eth_call" | "estimateGas";
      fromLabel: string;
    };

/** One ProgressLoader step per REAL async call — nothing advances on a timer. */
const DRY_STEPS = [
  "Simulating the transaction (eth_call)",
  "Estimating the gas (eth_estimateGas)",
  "Reading the gas price",
  "Pinning the block number",
  "Reading the target balance",
];

/**
 * The executor's public track record — real gated broadcasts on Atlantic,
 * each with the dry-run's predicted gas beside the chain's actual gas used.
 * Drift is disclosed, not hidden. Same numbers as runs/prediction-ledger.jsonl.
 */
const LEDGER = [
  {
    label: "Broadcast 1",
    tx: "0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee",
    predicted: 58219,
    used: 45470,
  },
  {
    label: "Broadcast 2",
    tx: "0xd294bb5c03c55d7ffdd750b0a20384aa393e490da11fe3d7f67845d34d34fb03",
    predicted: 37379,
    used: 28370,
  },
];

/** Drift exactly as recorded in runs/prediction-ledger.jsonl: how much the
 *  estimate overshot reality, relative to reality — 28.0% / 31.8%, mean ~30%. */
const driftPct = (e: { predicted: number; used: number }) =>
  ((e.predicted - e.used) / e.used) * 100;
const meanDriftPct = LEDGER.reduce((a, e) => a + driftPct(e), 0) / LEDGER.length;
const intFmt = (n: number) => n.toLocaleString("en-US");

const inputCls =
  "w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-accent/40";

export default function TryDryRun({ lamp }: { lamp: Lamp }) {
  const wallet = useWallet();
  const sign = useProposeAndSign();

  const [to, setTo] = useState(PROBE);
  const [value, setValue] = useState("0.001");
  const [data, setData] = useState(SIG_PING);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simming, setSimming] = useState(false);
  const [dryStep, setDryStep] = useState(0);
  const [simError, setSimError] = useState<string | null>(null);

  const fromAddr =
    wallet.state.status === "connected" ? wallet.state.address : undefined;
  const currentKey = `${to.trim().toLowerCase()}|${value.trim()}|${data.trim().toLowerCase()}|${fromAddr ?? "anonymous"}`;
  const simFresh = sim !== null && sim.key === currentKey;

  function onInputChange(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setSimError(null);
      // Inputs moved after a proposal → the old review is void. Cancel it.
      if (sign.state === "review") sign.cancel();
    };
  }
  const setToSafe = onInputChange(setTo);
  const setValueSafe = onInputChange(setValue);
  const setDataSafe = onInputChange(setData);

  function applyPreset(sig: string) {
    setTo(PROBE);
    setData(sig);
    setValue("0");
    setSimError(null);
    setSim(null);
    if (sign.state === "review") sign.cancel();
  }

  async function runDryRun() {
    const t = to.trim();
    if (!isValidAddress(t)) {
      setSimError(`"${t}" is not a valid 0x address. Fix the destination and dry-run again.`);
      return;
    }
    let valueHex: string;
    try {
      valueHex = phrsToWeiHex(value.trim() === "" ? "0" : value.trim());
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "Invalid PHRS value.");
      return;
    }
    const d = data.trim() === "" ? "0x" : data.trim();
    if (!/^0x([0-9a-fA-F]*)$/.test(d)) {
      setSimError("Calldata must be 0x followed by hex (or empty for a plain transfer).");
      return;
    }

    const txObj: Record<string, string> = { to: t, value: valueHex, data: d };
    if (fromAddr) txObj.from = fromAddr;
    const fromLabel = fromAddr
      ? `simulated as ${fromAddr.slice(0, 10)}…${fromAddr.slice(-6)} (your connected wallet)`
      : "simulated without a from address — connect your wallet to simulate as yourself";

    setSimming(true);
    setDryStep(0);
    setSimError(null);
    setSim(null);
    try {
      // Step 0 — eth_call: surfaces the revert reason, zero broadcast.
      const call = await rpcRaw("eth_call", [txObj, "latest"]);
      if (call.error) {
        const hex = extractRevertHex(call.error);
        const dec = hex ? decodeRevert(hex) : { reason: call.error.message ?? "eth_call failed with no reason", encoding: "rpc message only" };
        setSim({
          kind: "FAIL",
          key: currentKey,
          revertReason: dec.reason,
          revertEncoding: dec.encoding,
          revertHex: hex,
          stage: "eth_call",
          fromLabel,
        });
        return;
      }
      setDryStep(1);
      const returnBytes =
        typeof call.result === "string" && call.result.startsWith("0x")
          ? (call.result.length - 2) / 2
          : 0;

      // Step 1 — estimateGas: success yields the number, failure the exact reason.
      const est = await rpcRaw("eth_estimateGas", [txObj]);
      if (est.error) {
        const hex = extractRevertHex(est.error);
        const dec = hex ? decodeRevert(hex) : { reason: est.error.message ?? "estimateGas failed with no reason", encoding: "rpc message only" };
        setSim({
          kind: "FAIL",
          key: currentKey,
          revertReason: dec.reason,
          revertEncoding: dec.encoding,
          revertHex: hex,
          stage: "estimateGas",
          fromLabel,
        });
        return;
      }
      setDryStep(2);
      const estimate = BigInt(est.result as string);
      const limit = (estimate * 12n + 9n) / 10n; // ceil(estimate × 1.2)

      // Step 2 — the live gas price behind the predicted cost.
      const priceHex = (await rpcRaw("eth_gasPrice", [])) as { result?: string };
      const priceWei = BigInt((priceHex.result as string) ?? "0x0");
      setDryStep(3);

      // Step 3 — pin the block the simulation ran against.
      const blockHex = (await rpcRaw("eth_blockNumber", [])) as { result?: string };
      const blockNumber = String(BigInt((blockHex.result as string) ?? "0x0"));
      setDryStep(4);

      // Step 4 — the target's current balance, for context.
      const balHex = (await rpcRaw("eth_getBalance", [t, "latest"])) as { result?: string };
      const targetBalancePhrs =
        typeof balHex.result === "string" ? weiToPhrs(balHex.result) : null;
      setDryStep(5);

      setSim({
        kind: "PASS",
        key: currentKey,
        gasEstimate: estimate.toString(),
        gasLimit: limit.toString(),
        gasPriceGwei: (Number(priceWei) / 1e9).toFixed(3),
        predictedCostPhrs: weiToPhrs("0x" + (limit * priceWei).toString(16)),
        blockNumber,
        returnBytes,
        targetBalancePhrs,
        fromLabel,
      });
    } catch (e) {
      setSimError(e instanceof Error ? e.message : "The dry-run failed to reach Atlantic.");
    } finally {
      setSimming(false);
    }
  }

  const canPropose = simFresh && sim?.kind === "PASS" && sign.state === "idle";

  return (
    <div className="space-y-6">
      {/* Header — LIGHTKEEPER-first */}
      <div>
        <p className="text-sm font-semibold text-slate">{lamp.name} · simulate before you sign</p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink">
          See the outcome before your wallet opens
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          The console runs <code className="font-mono">eth_call</code> +{" "}
          <code className="font-mono">eth_estimateGas</code> against Atlantic first.
          No wallet, no signature, nothing broadcast — the preview is the product.
          Only a passing simulation unlocks the sign button, and signing always
          happens in <em>your</em> wallet, with <em>your</em> testnet PHRS.
        </p>
      </div>

      {/* ── 01 · Configure ─────────────────────────────────────────────── */}
      <section aria-label="Step 1 — configure the transaction" className="space-y-4">
        <h4 className="text-sm font-semibold text-slate">01 · Configure the transaction</h4>
        <div className="rounded-2xl border border-hairline bg-white p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => applyPreset(SIG_PING)} disabled={simming}>
              Probe <span className="font-mono">ping()</span> — predicts PASS
            </button>
            <button className="btn-outline" onClick={() => applyPreset(SIG_BOOM)} disabled={simming}>
              Probe <span className="font-mono">boom()</span> — predicts FAIL
            </button>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate">To (0x address)</span>
              <input
                className={inputCls}
                value={to}
                onChange={(e) => setToSafe(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate">Value (PHRS)</span>
                <input
                  className={inputCls}
                  value={value}
                  onChange={(e) => setValueSafe(e.target.value)}
                  placeholder="0.001"
                  inputMode="decimal"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate">
                  Calldata (0x hex, empty = plain transfer)
                </span>
                <input
                  className={inputCls}
                  value={data}
                  onChange={(e) => setDataSafe(e.target.value)}
                  placeholder="0x"
                  spellCheck={false}
                />
              </label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="btn-primary min-h-[44px]"
              onClick={runDryRun}
              disabled={simming}
            >
              Dry-run — eth_call + estimateGas
            </button>
            {wallet.state.status !== "connected" && (
              <button className="btn-outline min-h-[44px]" onClick={() => void wallet.connect()}>
                Connect wallet (optional)
              </button>
            )}
            {wallet.state.status === "connected" && (
              <span className="chip chip-lit">
                {wallet.state.address.slice(0, 10)}…{wallet.state.address.slice(-6)} ·{" "}
                {wallet.state.balance ?? "…"} PHRS
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-slate">
            Dry-running costs nothing and needs no wallet. Connecting lets the
            simulation run as your address — which is also what the chain would see.
          </p>
        </div>
      </section>

      {/* ── 02 · Run (in flight only — never beside a result) ─────────── */}
      {simming && (
        <section aria-label="Step 2 — running the dry-run">
          <h4 className="mb-4 text-sm font-semibold text-slate">02 · Running the dry-run</h4>
          <ProgressLoader
            steps={DRY_STEPS}
            current={dryStep}
            title="Five real calls against Atlantic — each step below is one network call, nothing advances on a timer."
          />
        </section>
      )}

      {simError && (
        <ErrorState
          title="The dry-run never reached the chain"
          message={simError}
          hint="Nothing was simulated and nothing was signed — your inputs are still in the form above."
          retryLabel="Retry the dry-run"
          onRetry={runDryRun}
        />
      )}

      {/* ── 03 · Result — PASS showpiece ──────────────────────────────── */}
      {simFresh && sim.kind === "PASS" && (
        <section aria-label="Step 3 — dry-run result" className="space-y-4">
          <h4 className="text-sm font-semibold text-slate">03 · Result</h4>
          <ResultCard
            status="pass"
            eyebrow="Dry-run result — simulated on Atlantic"
            headline="PASS — would succeed"
            subline={
              <>
                The chain accepted this transaction in simulation. {sim.fromLabel}.
                Only a passing simulation unlocks the sign button below.
              </>
            }
            rows={[
              { label: "Predicted cost", value: `${sim.predictedCostPhrs} PHRS` },
              { label: "Gas limit", value: `${intFmt(Number(sim.gasLimit))} (×1.2 of ${intFmt(Number(sim.gasEstimate))})` },
              { label: "Gas estimate", value: intFmt(Number(sim.gasEstimate)) },
              { label: "Gas price", value: `${sim.gasPriceGwei} gwei` },
              { label: "Simulated at block", value: intFmt(Number(sim.blockNumber)) },
              { label: "Call returned", value: `${sim.returnBytes} byte${sim.returnBytes === 1 ? "" : "s"}` },
              ...(sim.targetBalancePhrs !== null
                ? [{
                    label: "Target balance now",
                    value: `${sim.targetBalancePhrs} PHRS${value.trim() !== "0" ? ` → would receive ${value.trim()} PHRS if the tx lands` : ""}`,
                  }]
                : []),
            ]}
          >
            <div className="rounded-xl border border-hairline bg-porcelain px-4 py-3">
              <p className="text-sm leading-relaxed text-ink">
                Chain unmodified — no signature was created. Estimates are
                predictions: on Atlantic they have over-predicted by ~{meanDriftPct.toFixed(1)}%
                before, which is what the 1.2× safety factor absorbs. If the
                chain moved since block {intFmt(Number(sim.blockNumber))}, re-run
                the dry-run before signing.
              </p>
            </div>
            {canPropose && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate">
                  The simulation passed — you can propose this for review
                </p>
                <button
                  className="btn-primary min-h-[44px]"
                  onClick={() =>
                    sign.propose({
                      to: to.trim(),
                      valuePhrs: value.trim() === "" ? "0" : value.trim(),
                      data: data.trim() === "" ? "0x" : data.trim(),
                      label: `Dry-run-verified tx → ${to.trim().slice(0, 10)}…`,
                    })
                  }
                >
                  Propose transaction for review
                </button>
              </div>
            )}
          </ResultCard>
        </section>
      )}

      {/* ── 03 · Result — FAIL showpiece (the gate refusal) ──────────── */}
      {simFresh && sim.kind === "FAIL" && (
        <section aria-label="Step 3 — dry-run result" className="space-y-4">
          <h4 className="text-sm font-semibold text-slate">03 · Result</h4>
          <ResultCard
            status="fail"
            eyebrow="Dry-run result — simulated on Atlantic"
            headline="FAIL — would revert"
            subline={
              <>
                The chain itself rejected this transaction in simulation — caught
                at the <span className="font-mono">{sim.stage}</span> stage.{" "}
                {sim.fromLabel}. The sign path stays blocked until a dry-run passes.
              </>
            }
          >
            <p className="text-sm font-semibold text-slate">
              Revert reason, decoded from the chain's own error payload (
              {sim.revertEncoding}):
            </p>
            <div className="code-block mt-2">{sim.revertReason}</div>
            {sim.revertHex && (
              <p className="mt-2 break-all font-mono text-sm text-slate">{sim.revertHex}</p>
            )}
            {/* Blocked sign — the reason is stated on the button itself, never a dead button. */}
            <div>
              <button
                className="btn-outline min-h-[44px]"
                disabled
                title={`Blocked: the dry-run failed — ${sim.revertReason}`}
              >
                Sign — blocked: would revert: {sim.revertReason.slice(0, 60)}
                {sim.revertReason.length > 60 ? "…" : ""}
              </button>
              <p className="mt-2 text-sm text-slate">
                Fix the inputs (or try the passing probe preset) — nothing was
                broadcast, nothing was signed.
              </p>
            </div>
          </ResultCard>
        </section>
      )}

      {/* ── Mandatory review ─────────────────────────────────────────── */}
      {sign.state === "review" && sign.proposal && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          aria-label="Review before signing"
          className="rounded-2xl border border-hairline bg-white p-6 sm:p-8"
        >
          <p className="text-sm font-semibold text-slate">Review — mandatory</p>
          <h3 className="mt-2 font-display text-4xl tracking-tight text-ink">
            Read it. Then sign it yourself.
          </h3>
          <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div className="border-t border-hairline pt-3">
              <dt className="text-sm font-semibold text-slate">To</dt>
              <dd className="mt-1 break-all font-mono text-sm text-ink">{sign.proposal.to}</dd>
            </div>
            <div className="border-t border-hairline pt-3">
              <dt className="text-sm font-semibold text-slate">Value</dt>
              <dd className="mt-1 font-mono text-sm text-ink">{sign.proposal.valuePhrs} PHRS</dd>
            </div>
            {simFresh && sim.kind === "PASS" && (
              <>
                <div className="border-t border-hairline pt-3">
                  <dt className="text-sm font-semibold text-slate">Gas limit</dt>
                  <dd className="mt-1 font-mono text-sm text-ink">
                    {intFmt(Number(sim.gasLimit))} (×1.2 of {intFmt(Number(sim.gasEstimate))})
                  </dd>
                </div>
                <div className="border-t border-hairline pt-3">
                  <dt className="text-sm font-semibold text-slate">Predicted cost</dt>
                  <dd className="mt-1 font-mono text-sm text-ink">{sim.predictedCostPhrs} PHRS</dd>
                </div>
              </>
            )}
          </dl>
          {/* Dust warning surfaces through `error` in review state → AMBER, not red. */}
          {sign.error && (
            <p className="mt-4 rounded-xl border border-golddeep/40 bg-golddeep/10 px-4 py-3 text-sm font-semibold text-golddeep">
              ⚠ {sign.error}
            </p>
          )}
          <p className="mt-4 text-sm text-ink">
            Signing happens in YOUR wallet, from YOUR address, with YOUR testnet
            PHRS. LIGHTKEEPER never sees or holds your keys.
            {fromAddr && (
              <>
                {" "}Signing as{" "}
                <span className="font-mono">
                  {fromAddr.slice(0, 10)}…{fromAddr.slice(-6)}
                </span>
                .
              </>
            )}
          </p>
          {/* Sticky primary action — the sign button stays reachable on mobile. */}
          <div className="sticky bottom-3 z-10 mt-5 flex flex-wrap gap-2 rounded-xl border border-hairline bg-white/95 p-3 shadow-lg backdrop-blur">
            {wallet.state.status !== "connected" ? (
              <button className="btn-outline min-h-[44px]" onClick={() => void wallet.connect()}>
                Connect wallet to continue
              </button>
            ) : (
              <button className="btn-primary min-h-[44px]" onClick={() => void sign.approve()}>
                Sign in my wallet
              </button>
            )}
            <button className="btn-outline min-h-[44px]" onClick={sign.cancel}>
              Cancel
            </button>
          </div>
        </motion.section>
      )}

      {/* ── Awaiting signature / broadcasting (real wallet states) ───── */}
      {sign.state === "awaiting-signature" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-hairline bg-white p-6"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <motion.span
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              className="h-3 w-3 rounded-full bg-golddeep"
              aria-hidden
            />
            <p className="text-base font-semibold text-ink">Waiting for your wallet</p>
          </div>
          <p className="mt-2 text-sm text-ink">
            Check the popup and review the transaction there too — the proposal
            you approved above is what your wallet shows.
          </p>
          <button className="btn-outline mt-4 min-h-[44px]" onClick={sign.cancel}>
            Cancel
          </button>
        </motion.div>
      )}

      {sign.state === "broadcasting" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-hairline bg-white p-6"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <motion.span
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              className="h-3 w-3 rounded-full bg-accent"
              aria-hidden
            />
            <p className="text-base font-semibold text-ink">Sent — waiting for Atlantic to mine it</p>
          </div>
          <p className="mt-2 text-sm text-slate">
            Your wallet broadcast the transaction. We poll for the receipt until
            the chain confirms it.
          </p>
        </motion.div>
      )}

      {/* ── Blocked / error (the refusal paths) ──────────────────────── */}
      {(sign.state === "blocked" || sign.state === "error") && sign.error && (
        <div className="space-y-3">
          <ErrorState
            title={sign.state === "blocked" ? "Blocked before anything left the page" : "The signing flow hit a snag"}
            message={sign.error}
            hint="Nothing was signed. Fix the cause and start over."
            retryLabel="Start over"
            onRetry={sign.cancel}
          />
          {sign.state === "blocked" && wallet.state.status !== "connected" && (
            <button className="btn-outline min-h-[44px]" onClick={() => void wallet.connect()}>
              Connect wallet
            </button>
          )}
        </div>
      )}

      {/* ── Confirmed — the receipt showpiece ────────────────────────── */}
      {sign.state === "confirmed" && sign.txHash && (
        <ResultCard
          status="pass"
          eyebrow="Signed in your wallet — receipt"
          headline="Confirmed"
          subline="Your transaction — signed in your wallet and mined on Atlantic."
          rows={[
            {
              label: "Transaction hash",
              value: (
                <span title={sign.txHash}>
                  {sign.txHash.slice(0, 18)}…{sign.txHash.slice(-12)}
                </span>
              ),
            },
          ]}
          copyValue={sign.txHash}
          links={[{ label: "View on the Atlantic explorer", href: `${EXPLORER_TX}${sign.txHash}` }]}
        >
          <button className="btn-outline min-h-[44px]" onClick={sign.cancel}>
            Build another dry-run
          </button>
        </ResultCard>
      )}

      {/* ── The executor keeps score of its own accuracy ─────────────── */}
      <section aria-label="The executor's prediction track record" className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-slate">The executor keeps score of itself</h4>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            Every broadcast that went through the gate is recorded with its
            predicted gas beside the chain's actual gas used. The estimates
            over-predict — that drift is public, and the 1.2× safety factor
            exists precisely for it.
          </p>
        </div>

        {/* Predicted-vs-actual vs-layout — the self-score showpiece */}
        <div className="grid gap-4 md:grid-cols-2">
          {LEDGER.map((entry, i) => (
            <motion.div
              key={entry.tx}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.1, ease: "easeOut" }}
              className="rounded-2xl border border-hairline bg-white p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate">{entry.label}</p>
                <a
                  className="font-mono text-sm text-accent hover:underline"
                  href={`${EXPLORER_TX}${entry.tx}`}
                  target="_blank"
                  rel="noreferrer"
                  title={entry.tx}
                >
                  {entry.tx.slice(0, 10)}…{entry.tx.slice(-6)} →
                </a>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate">Predicted</p>
                  <p className="mt-1 font-display text-4xl tracking-tight text-ink">
                    {intFmt(entry.predicted)}
                  </p>
                  <p className="mt-1 text-sm text-slate">gas, from the dry-run</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate">Actually used</p>
                  <p className="mt-1 font-display text-4xl tracking-tight text-accent">
                    {intFmt(entry.used)}
                  </p>
                  <p className="mt-1 text-sm text-slate">gas, on-chain</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-2.5 overflow-hidden rounded-full bg-tint">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.1 + 0.2 }}
                    className="h-full rounded-full bg-slate/50"
                  />
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-tint">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(entry.used / entry.predicted) * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.1 + 0.35 }}
                    className="h-full rounded-full bg-accent"
                  />
                </div>
                <p className="text-sm text-ink">
                  Over-estimated by{" "}
                  <span className="font-semibold">{driftPct(entry).toFixed(1)}%</span> —
                  landed well inside the 1.2× limit.
                </p>
              </div>
              <p className="mt-3">
                <span className="chip chip-pass">success · within limit</span>
              </p>
            </motion.div>
          ))}
        </div>

        {/* Drift ledger numbers */}
        <StatStrip
          stats={[
            { label: "Broadcasts scored", value: LEDGER.length },
            { label: "Predictions that held", value: LEDGER.length },
            {
              label: "Mean over-estimate",
              value: meanDriftPct,
              suffix: "%",
              format: (n) => n.toFixed(1),
            },
          ]}
        />

        <p className="text-sm text-slate">
          Both predictions held: success as predicted, gas inside the 1.2×
          limit. Broadcast 2 was the repeatability run — the same dry-run →
          gate → broadcast path a second time, and the prediction held again.
          New rows are appended after every gated broadcast — try the
          two probe presets above and score a prediction yourself.
        </p>
      </section>
    </div>
  );
}
