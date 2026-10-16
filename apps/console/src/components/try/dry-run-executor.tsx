/**
 * T08 Dry-Run Executor — "See the outcome before your wallet opens".
 *
 * Tier B (simulate → review → optionally sign yourself).
 *
 *   01 BUILD   — the visitor assembles to / value / data (presets included).
 *   02 DRY-RUN — eth_call + eth_estimateGas against Atlantic, no wallet, no
 *                signature, nothing broadcast. The outcome preview is the
 *                product:
 *                  PASS → gas estimate, 1.2× safety limit, predicted cost.
 *                  FAIL → exact revert reason decoded from the chain's own
 *                         error payload; the sign path is BLOCKED with the
 *                         reason stated — never a dead button.
 *   03 REVIEW  — mandatory review step (to / value / gas / predicted cost /
 *                dust warning as AMBER) after propose(); the visitor approves
 *                in THEIR wallet with THEIR testnet PHRS.
 *   04 SIGNED  — receipt + explorer link: "Your tx — signed in your wallet."
 *
 * LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only
 * (chain 688689). Dry-runs are free reads; nothing is simulated on-chain
 * until the visitor explicitly signs.
 */
import { useState } from "react";
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
    setSimError(null);
    setSim(null);
    try {
      // Stage 1 — eth_call: surfaces the revert reason, zero broadcast.
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
      const returnBytes =
        typeof call.result === "string" && call.result.startsWith("0x")
          ? (call.result.length - 2) / 2
          : 0;

      // Stage 2 — estimateGas: success yields the number, failure the exact reason.
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
      const estimate = BigInt(est.result as string);
      const limit = (estimate * 12n + 9n) / 10n; // ceil(estimate × 1.2)
      const priceHex = (await rpcRaw("eth_gasPrice", [])) as { result?: string };
      const priceWei = BigInt((priceHex.result as string) ?? "0x0");
      const blockHex = (await rpcRaw("eth_blockNumber", [])) as { result?: string };
      const blockNumber = String(BigInt((blockHex.result as string) ?? "0x0"));
      const balHex = (await rpcRaw("eth_getBalance", [t, "latest"])) as { result?: string };
      const targetBalancePhrs =
        typeof balHex.result === "string" ? weiToPhrs(balHex.result) : null;

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
    <div className="space-y-5">
      {/* Header — LIGHTKEEPER-first */}
      <div>
        <p className="smallcaps text-slate">{lamp.name} · simulate before you sign</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">
          See the outcome before your wallet opens
        </h3>
        <p className="mt-1 text-sm text-slate">
          The console runs <code className="font-mono">eth_call</code> +{" "}
          <code className="font-mono">eth_estimateGas</code> against Atlantic first.
          No wallet, no signature, nothing broadcast — the preview is the product.
          Only a passing simulation unlocks the sign button, and signing always
          happens in <em>your</em> wallet, with <em>your</em> testnet PHRS.
        </p>
      </div>

      {/* Step strip */}
      <div className="flex flex-wrap gap-2">
        {["01 Build", "02 Dry-run", "03 Review", "04 Signed"].map((s, i) => {
          const active =
            (i === 0 && !sim) ||
            (i === 1 && simming) ||
            (i === 1 && simFresh) ||
            (i === 2 && (sign.state === "review" || sign.state === "awaiting-signature")) ||
            (i === 3 && sign.state === "confirmed");
          return (
            <span key={s} className={active ? "chip chip-lit" : "chip chip-dim"}>
              {s}
            </span>
          );
        })}
      </div>

      {/* 01 — Builder */}
      <div className="rounded-xl border border-hairline bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-ink">01 · Build the transaction</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            className="btn-outline"
            onClick={() => applyPreset(SIG_PING)}
            disabled={simming}
          >
            Probe <span className="font-mono">ping()</span> — predicts PASS
          </button>
          <button
            className="btn-outline"
            onClick={() => applyPreset(SIG_BOOM)}
            disabled={simming}
          >
            Probe <span className="font-mono">boom()</span> — predicts FAIL
          </button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate">To (0x address)</span>
            <input
              className={inputCls}
              value={to}
              onChange={(e) => setToSafe(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate">Value (PHRS)</span>
              <input
                className={inputCls}
                value={value}
                onChange={(e) => setValueSafe(e.target.value)}
                placeholder="0.001"
                inputMode="decimal"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate">
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={runDryRun} disabled={simming}>
            {simming ? "Dry-running on Atlantic…" : "Dry-run — eth_call + estimateGas"}
          </button>
          {wallet.state.status !== "connected" && (
            <button className="btn-outline" onClick={() => void wallet.connect()}>
              Connect wallet (optional — simulates as your address)
            </button>
          )}
          {wallet.state.status === "connected" && (
            <span className="chip chip-lit">
              {wallet.state.address.slice(0, 10)}…{wallet.state.address.slice(-6)} ·{" "}
              {wallet.state.balance ?? "…"} PHRS
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-slate">
          Dry-running costs nothing and needs no wallet. Connecting lets the
          simulation run as your address, which is also what the chain would see.
        </p>
      </div>

      {/* 02 — Simulation result */}
      {simError && <p className="text-sm text-fail">{simError}</p>}

      {simFresh && sim.kind === "PASS" && (
        <div className="rounded-xl border border-hairline bg-porcelain p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="chip chip-pass">PASS — would succeed</span>
            <span className="text-xs text-slate">{sim.fromLabel}</span>
          </div>
          <table className="data-table">
            <tbody>
              <tr>
                <th>Gas estimate</th>
                <td className="font-mono">{sim.gasEstimate}</td>
              </tr>
              <tr>
                <th>Gas limit (×1.2 safety)</th>
                <td className="font-mono">{sim.gasLimit}</td>
              </tr>
              <tr>
                <th>Gas price</th>
                <td className="font-mono">{sim.gasPriceGwei} gwei</td>
              </tr>
              <tr>
                <th>Predicted cost</th>
                <td className="font-mono">{sim.predictedCostPhrs} PHRS</td>
              </tr>
              <tr>
                <th>Simulated at block</th>
                <td className="font-mono">{sim.blockNumber}</td>
              </tr>
              <tr>
                <th>Call returned</th>
                <td className="font-mono">
                  {sim.returnBytes} byte{sim.returnBytes === 1 ? "" : "s"}
                </td>
              </tr>
              {sim.targetBalancePhrs !== null && (
                <tr>
                  <th>Target balance now</th>
                  <td className="font-mono">
                    {sim.targetBalancePhrs} PHRS
                    {value.trim() !== "0" &&
                      ` → would receive ${value.trim()} PHRS if the tx lands`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate">
            Chain unmodified — no signature was created. Estimates are predictions:
            this network has shown ~28% estimate-vs-actual drift before, which is
            what the 1.2× safety factor absorbs. If the chain moved since block{" "}
            {sim.blockNumber}, re-run the dry-run before signing.
          </p>
        </div>
      )}

      {simFresh && sim.kind === "FAIL" && (
        <div className="rounded-xl border border-fail/40 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="chip chip-fail">FAIL — would revert</span>
            <span className="text-xs text-slate">
              caught at the <span className="font-mono">{sim.stage}</span> stage · {sim.fromLabel}
            </span>
          </div>
          <p className="mb-1 text-xs font-medium text-slate">
            Revert reason, decoded from the chain's own error payload (
            {sim.revertEncoding}):
          </p>
          <div className="code-block mb-3">{sim.revertReason}</div>
          {sim.revertHex && (
            <p className="mb-3 break-all font-mono text-xs text-slate">{sim.revertHex}</p>
          )}
          {/* Blocked sign — the reason is stated on the button itself, never dead. */}
          <button
            className="btn-outline"
            disabled
            title={`Blocked: the dry-run failed — ${sim.revertReason}`}
          >
            Sign — blocked: would revert: {sim.revertReason.slice(0, 60)}
            {sim.revertReason.length > 60 ? "…" : ""}
          </button>
          <p className="mt-2 text-xs text-slate">
            The sign path stays blocked until a dry-run passes. Fix the inputs
            (or try the passing probe preset) — nothing was broadcast, nothing
            was signed.
          </p>
        </div>
      )}

      {/* 03 — Propose → mandatory review */}
      {canPropose && (
        <div className="rounded-xl border border-hairline bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-ink">03 · Propose to your wallet</p>
          <p className="mb-3 text-sm text-slate">
            The simulation passed. Proposing opens the mandatory review step —
            you approve only there, in your own wallet.
          </p>
          <button
            className="btn-primary"
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

      {sign.state === "review" && sign.proposal && (
        <div className="rounded-xl border border-hairline bg-porcelain p-4">
          <p className="mb-1 text-sm font-semibold text-ink">03 · Review — mandatory</p>
          <table className="data-table mb-3">
            <tbody>
              <tr>
                <th>To</th>
                <td className="break-all font-mono">{sign.proposal.to}</td>
              </tr>
              <tr>
                <th>Value</th>
                <td className="font-mono">{sign.proposal.valuePhrs} PHRS</td>
              </tr>
              {simFresh && sim.kind === "PASS" && (
                <>
                  <tr>
                    <th>Gas limit</th>
                    <td className="font-mono">{sim.gasLimit} (×1.2 of {sim.gasEstimate})</td>
                  </tr>
                  <tr>
                    <th>Predicted cost</th>
                    <td className="font-mono">{sim.predictedCostPhrs} PHRS</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          {/* Dust warning surfaces through `error` in review state → AMBER, not red. */}
          {sign.error && (
            <p className="mb-3 rounded-lg border border-golddeep/40 bg-golddeep/10 px-3 py-2 text-sm font-semibold text-golddeep">
              ⚠ {sign.error}
            </p>
          )}
          <p className="mb-3 text-xs text-slate">
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
          <div className="flex flex-wrap gap-2">
            {wallet.state.status !== "connected" ? (
              <button className="btn-outline" onClick={() => void wallet.connect()}>
                Connect wallet to continue
              </button>
            ) : (
              <button className="btn-primary" onClick={() => void sign.approve()}>
                Sign in my wallet
              </button>
            )}
            <button className="btn-outline" onClick={sign.cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {sign.state === "awaiting-signature" && (
        <p className="text-sm text-slate">Waiting for your wallet… check the popup and review the transaction there too.</p>
      )}
      {sign.state === "broadcasting" && (
        <p className="text-sm text-slate">Sent — waiting for Atlantic to mine it…</p>
      )}
      {(sign.state === "blocked" || sign.state === "error") && sign.error && (
        <div className="rounded-xl border border-fail/40 bg-white p-4">
          <p className="text-sm text-fail">{sign.error}</p>
          <div className="mt-3 flex gap-2">
            {sign.state === "blocked" && wallet.state.status !== "connected" && (
              <button className="btn-outline" onClick={() => void wallet.connect()}>
                Connect wallet
              </button>
            )}
            <button className="btn-outline" onClick={sign.cancel}>
              Start over
            </button>
          </div>
        </div>
      )}

      {/* 04 — Confirmed */}
      {sign.state === "confirmed" && sign.txHash && (
        <div className="rounded-xl border border-hairline bg-porcelain p-4">
          <span className="chip chip-pass">04 · Confirmed</span>
          <p className="mt-2 text-sm font-semibold text-ink">
            Your tx — signed in your wallet.
          </p>
          <p className="mt-1 break-all font-mono text-xs text-slate">{sign.txHash}</p>
          <a
            className="mt-2 inline-block font-mono text-sm text-accent hover:underline"
            href={`${EXPLORER_TX}${sign.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on the Atlantic explorer →
          </a>
          <div className="mt-3">
            <button className="btn-outline" onClick={sign.cancel}>
              Build another dry-run
            </button>
          </div>
        </div>
      )}

      {/* Honest footer */}
      <p className="text-xs text-slate">
        The task's CLI gate ran this same pipeline on Atlantic:{" "}
        <span className="font-mono">boom()</span> predicted a revert and the
        broadcaster refused it; <span className="font-mono">ping()</span> predicted
        PASS and the real broadcast matched. Evidence lives in the task's{" "}
        <span className="font-mono">evidence.json</span>. Try the same two cases
        above — live, from your own wallet.
      </p>
    </div>
  );
}
