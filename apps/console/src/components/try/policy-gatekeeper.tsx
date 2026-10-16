/**
 * T11 — Policy Gatekeeper: "Every block, explained."
 *
 * Tier B module. The visitor proposes a native_transfer; the task's real
 * policy engine (policy t11-policy-v1) evaluates it client-side against LIVE
 * Atlantic reads (chain id, gas price, the visitor's balance) and renders the
 * seven gate conditions as a named PASS/BLOCK trace — the gate shows its work.
 *
 * Presentation journey — 01 Configure → 02 Check → 03 Result:
 *   01 Configure — the proposed action (recipient / value), policy presets,
 *      the mainnet-refusal preview toggle, wallet connect. Plain form
 *      controls on porcelain.
 *   02 Check — ProgressLoader over the REAL live reads: eth_chainId,
 *      eth_gasPrice, eth_getBalance (only when a wallet is connected). Each
 *      step is exactly one RPC call; the loader advances when a call starts.
 *   03 Result — ResultCard showpiece: the ALLOW / BLOCK / REFUSED verdict as
 *      the headline, the 7-row trace as elegant rows, the verdict JSON
 *      copyable. ALLOW continues into propose → MANDATORY review (to/value,
 *      amber dust warning) → the VISITOR signs in their own wallet with their
 *      own testnet PHRS. DENY and REFUSED_MAINNET are final — nothing is
 *      proposed, nothing is broadcast; the denial is the product.
 *
 * LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only
 * (chain 688689). Never auto-broadcast; review-before-sign always.
 */
import { useState } from "react";
import { AlertTriangle, Ban, ExternalLink, ShieldCheck, ShieldX } from "lucide-react";
import type { Lamp } from "../../types";
import { weiToPhrs } from "../../types";
import {
  ATLANTIC_CHAIN_ID,
  DUST_LIMIT_PHRS,
  EXPLORER_TX,
  isValidAddress,
  phrsToWeiHex,
  rpcCall,
  useProposeAndSign,
} from "../../hooks/useAtlantic";
import { useWallet } from "../WalletContext";
import { ErrorState, ProgressLoader, ResultCard } from "../ui";
import type { ResultRow } from "../ui";

// --- Policy constants (policy t11-policy-v1, tasks/t11-policy-gatekeeper/policy.json) ---
const POLICY_ID = "t11-policy-v1";
const DUST_SINK = "0x000000000000000000000000000000000000dEaD";
const DEPLOYER_SELF = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const STRANGER = "0x1111111111111111111111111111111111111111";
const MAINNET_CHAIN_ID = 1672;
const MAX_GAS_GWEI = 50;
const FEE_RESERVE_PHRS = "0.001";
const PER_ACTION_CAP_PHRS = "0.01";

const DEST_ALLOWLIST: Record<string, string> = {
  [DUST_SINK.toLowerCase()]: "dust sink (verifiably unspendable burn address)",
  [DEPLOYER_SELF.toLowerCase()]: "deployer self",
};

type RowStatus = "pass" | "block";

interface TraceRow {
  key: string;
  name: string;
  status: RowStatus;
  numbers: string;
  note: string;
  rule?: string;
}

interface GateResult {
  decision: "APPROVE" | "DENY" | "REFUSED_MAINNET";
  namedRule: string | null;
  blockReason: string | null;
  rows: TraceRow[];
  reads: { chainId: number | null; gasGwei: number | null; balancePhrs: string | null };
}

function phrsToWei(phrs: string): bigint {
  const s = phrs.trim();
  const [intPart, fracPart = ""] = s.split(".");
  return BigInt(intPart) * 10n ** 18n + BigInt((fracPart + "0".repeat(18)).slice(0, 18));
}

function short(addr: string): string {
  return addr.length > 13 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export default function TryGatekeeper({ lamp }: { lamp: Lamp }) {
  const { state: wallet, connect } = useWallet();
  const { state, proposal, txHash, error, propose, approve, cancel } = useProposeAndSign();

  const [to, setTo] = useState(DUST_SINK);
  const [value, setValue] = useState("0.001");
  const [asMainnet, setAsMainnet] = useState(false);
  const [gate, setGate] = useState<GateResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [checkSteps, setCheckSteps] = useState<string[]>([]);
  const [checkStep, setCheckStep] = useState(0);

  const walletAddress =
    wallet.status === "connected" || wallet.status === "wrong-network"
      ? wallet.address
      : null;

  async function runGate() {
    cancel();
    setGate(null);
    setEvaluating(true);

    // 02 Check — one loader step per REAL live read. The balance read only
    // exists when a wallet is connected (no wallet, no call, no step).
    const steps = [
      "Reading live chain id (eth_chainId)",
      "Reading live gas price (eth_gasPrice)",
      ...(walletAddress ? ["Reading your balance (eth_getBalance)"] : []),
    ];
    setCheckSteps(steps);
    setCheckStep(0);

    const rows: TraceRow[] = [];
    let liveChainId: number | null = null;
    let gasGwei: number | null = null;
    let balanceWei: bigint | null = null;

    // Live reads (Tier A). Fail-closed: an unreadable value blocks its condition.
    try {
      const cidHex = (await rpcCall("eth_chainId", [])) as string;
      liveChainId = Number(BigInt(cidHex));
    } catch {
      /* fail-closed below */
    }
    setCheckStep(1);
    try {
      const gasHex = (await rpcCall("eth_gasPrice", [])) as string;
      gasGwei = Number(BigInt(gasHex)) / 1e9;
    } catch {
      /* fail-closed below */
    }
    if (walletAddress) {
      setCheckStep(2);
      try {
        const balHex = (await rpcCall("eth_getBalance", [walletAddress, "latest"])) as string;
        balanceWei = BigInt(balHex);
      } catch {
        /* fail-closed below */
      }
    }
    setCheckStep(steps.length);

    const effectiveChain = asMainnet ? MAINNET_CHAIN_ID : liveChainId;

    // Condition 1 — key-present (P1 analog): a wallet must be connected to sign.
    rows.push(
      walletAddress
        ? {
            key: "key-present",
            name: "key-present",
            status: "pass",
            numbers: short(walletAddress),
            note: "Wallet connected. LIGHTKEEPER never sees or asks for private keys — signing happens in your wallet.",
          }
        : {
            key: "key-present",
            name: "key-present",
            status: "block",
            numbers: "none",
            note: "No wallet connected. Connect a wallet to evaluate a proposal — the gate cannot bind a signer to nothing.",
          }
    );

    // Condition 2 — sender-binding (P2 analog): the proposal is bound to YOUR address.
    rows.push(
      walletAddress
        ? {
            key: "sender-binding",
            name: "sender-binding",
            status: "pass",
            numbers: short(walletAddress),
            note: "The transaction will be sent from your connected address. The gate never substitutes another signer.",
          }
        : {
            key: "sender-binding",
            name: "sender-binding",
            status: "block",
            numbers: "unbound",
            note: "Cannot bind a sender without a connected wallet.",
          }
    );

    // Condition 3 — network (P3 analog): live chain id must be Atlantic 688689.
    // Mainnet (1672) is REFUSED unconditionally — mainnet.enabled=false.
    if (asMainnet) {
      rows.push({
        key: "network",
        name: "network",
        status: "block",
        numbers: `1672 (preview) · RPC still reads Atlantic`,
        note: "REFUSED — network_firewall: the policy refuses mainnet (chain 1672) unconditionally. No re-confirmation is ever granted; no broadcast path exists.",
        rule: "network_firewall",
      });
    } else if (liveChainId === ATLANTIC_CHAIN_ID) {
      rows.push({
        key: "network",
        name: "network",
        status: "pass",
        numbers: `688689`,
        note: "Live chain id read from the Atlantic RPC — Pharos Atlantic Testnet.",
      });
    } else {
      rows.push({
        key: "network",
        name: "network",
        status: "block",
        numbers: liveChainId === null ? "unreadable" : String(liveChainId),
        note: "Only chain 688689 (Atlantic testnet) is allowed — anything else aborts.",
        rule: "network_firewall",
      });
    }

    // Parse the proposed value once; every amount condition depends on it.
    let valueWei: bigint | null = null;
    try {
      valueWei = phrsToWeiHex(value) ? phrsToWei(value) : null;
    } catch {
      valueWei = null;
    }

    // Condition 4 — balance (P4 analog): balance covers value + fee reserve.
    const reserveWei = phrsToWei(FEE_RESERVE_PHRS);
    if (valueWei === null) {
      rows.push({
        key: "balance",
        name: "balance",
        status: "block",
        numbers: "—",
        note: `Cannot evaluate — "${value}" is not a valid PHRS amount.`,
      });
    } else if (balanceWei === null) {
      rows.push({
        key: "balance",
        name: "balance",
        status: "block",
        numbers: "unreadable",
        note: "Balance could not be read (fail-closed) — connect a wallet so the gate can check value + fee reserve.",
      });
    } else if (balanceWei >= valueWei + reserveWei) {
      rows.push({
        key: "balance",
        name: "balance",
        status: "pass",
        numbers: `${weiToPhrs("0x" + balanceWei.toString(16))} ≥ ${value} + ${FEE_RESERVE_PHRS} reserve`,
        note: "Balance covers the transfer plus the 0.001 PHRS gas reserve.",
      });
    } else {
      rows.push({
        key: "balance",
        name: "balance",
        status: "block",
        numbers: `${weiToPhrs("0x" + balanceWei.toString(16))} < ${value} + ${FEE_RESERVE_PHRS} reserve`,
        note: "Insufficient balance for value plus the mandatory 0.001 PHRS fee reserve.",
      });
    }

    // Condition 5 — threshold: per-action cap for native_transfer (0.01 PHRS).
    if (valueWei === null) {
      rows.push({
        key: "threshold",
        name: "threshold",
        status: "block",
        numbers: "—",
        note: `Cannot evaluate — "${value}" is not a valid PHRS amount.`,
      });
    } else if (valueWei <= phrsToWei(PER_ACTION_CAP_PHRS)) {
      rows.push({
        key: "threshold",
        name: "threshold",
        status: "pass",
        numbers: `${value} ≤ ${PER_ACTION_CAP_PHRS}`,
        note: "Within the per-action cap for native_transfer (dust limit).",
      });
    } else {
      rows.push({
        key: "threshold",
        name: "threshold",
        status: "block",
        numbers: `${value} > ${PER_ACTION_CAP_PHRS}`,
        note: "per_action_caps: native_transfer is capped at 0.01 PHRS per action.",
        rule: "per_action_caps",
      });
    }

    // Condition 6 — gas-sanity: live gas price must be sane (≤ 50 gwei).
    if (gasGwei === null) {
      rows.push({
        key: "gas-sanity",
        name: "gas-sanity",
        status: "block",
        numbers: "unreadable",
        note: "Gas price could not be read from the RPC (fail-closed).",
      });
    } else if (gasGwei <= MAX_GAS_GWEI) {
      rows.push({
        key: "gas-sanity",
        name: "gas-sanity",
        status: "pass",
        numbers: `${gasGwei.toFixed(2)} gwei ≤ ${MAX_GAS_GWEI} gwei`,
        note: "Live gas price from the Atlantic RPC is within the sanity cap.",
      });
    } else {
      rows.push({
        key: "gas-sanity",
        name: "gas-sanity",
        status: "block",
        numbers: `${gasGwei.toFixed(2)} gwei > ${MAX_GAS_GWEI} gwei`,
        note: "Gas price exceeds the 50 gwei sanity cap — the gate waits for calmer fees.",
        rule: "gas",
      });
    }

    // Condition 7 — recipient (destination_allowlist): the policy's named-rule
    // gate on where value may go. Evaluated here as a full trace row so the
    // BLOCK demo shows the failing condition inline, with the exact rule.
    let namedRule: string | null = null;
    let blockReason: string | null = null;
    if (!isValidAddress(to)) {
      rows.push({
        key: "recipient",
        name: "recipient",
        status: "block",
        numbers: to.length > 20 ? `${to.slice(0, 10)}…${to.slice(-6)}` : to || "(empty)",
        note: "Not a valid 0x address — the gate refuses to evaluate it.",
        rule: "destination_allowlist",
      });
      namedRule = "destination_allowlist";
      blockReason = `"${to}" is not a valid 0x address — the gate refuses to evaluate it.`;
    } else {
      const label = DEST_ALLOWLIST[to.toLowerCase()];
      if (label) {
        rows.push({
          key: "recipient",
          name: "recipient",
          status: "pass",
          numbers: `${short(to)} · ${label}`,
          note: "Recipient is on the destination allowlist — the only two addresses the policy will ever pay.",
          rule: "destination_allowlist",
        });
      } else {
        rows.push({
          key: "recipient",
          name: "recipient",
          status: "block",
          numbers: short(to),
          note: `Not allowlisted. The policy pays only the dust sink (${short(DUST_SINK)}) and the deployer (${short(DEPLOYER_SELF)}).`,
          rule: "destination_allowlist",
        });
        namedRule = "destination_allowlist";
        blockReason = `${short(to)} is not allowlisted. Allowed recipients: the dust sink (${short(DUST_SINK)}) and the deployer (${short(DEPLOYER_SELF)}).`;
      }
    }

    // Decision: REFUSE mainnet first, then any block, else APPROVE.
    // The recipient row above already sets namedRule/blockReason when it blocks;
    // otherwise the first blocked row names the rule.
    const blockedRows = rows.filter((r) => r.status === "block");
    let decision: GateResult["decision"];
    if (asMainnet || effectiveChain === MAINNET_CHAIN_ID) {
      decision = "REFUSED_MAINNET";
      namedRule = "network_firewall";
      blockReason =
        "Mainnet (chain 1672) is refused outright — mainnet.enabled=false, re-confirmation required and never granted. No broadcast path exists.";
    } else if (namedRule) {
      decision = "DENY";
    } else if (blockedRows.length > 0) {
      decision = "DENY";
      const first = blockedRows[0];
      namedRule = first.rule ?? first.key;
      blockReason = first.note;
    } else {
      decision = "APPROVE";
    }

    setGate({
      decision,
      namedRule,
      blockReason,
      rows,
      reads: {
        chainId: liveChainId,
        gasGwei,
        balancePhrs: balanceWei === null ? null : weiToPhrs("0x" + balanceWei.toString(16)),
      },
    });
    setEvaluating(false);
  }

  const canPropose = gate?.decision === "APPROVE";

  const verdictJson = gate
    ? JSON.stringify(
        {
          policy: POLICY_ID,
          decision: gate.decision,
          rule: gate.namedRule,
          action: { type: "native_transfer", to, value_phrs: value },
        },
        null,
        2
      )
    : "";

  // 03 Result — the verdict is the showpiece. Drama for a gate: ALLOW in
  // green with a shield, BLOCK / REFUSED in red. Rows are only real reads.
  function renderVerdict() {
    if (!gate) return null;
    const verdictRows: ResultRow[] = [
      { label: "Policy", value: POLICY_ID },
      ...(gate.namedRule ? [{ label: "Blocking rule", value: gate.namedRule }] : []),
      { label: "Proposed action", value: `native_transfer · ${value} PHRS → ${short(to)}` },
      ...(gate.reads.chainId !== null
        ? [{ label: "Live chain id", value: String(gate.reads.chainId) }]
        : []),
      ...(gate.reads.gasGwei !== null
        ? [{ label: "Live gas price", value: `${gate.reads.gasGwei.toFixed(2)} gwei` }]
        : []),
      ...(gate.reads.balancePhrs !== null
        ? [{ label: "Wallet balance", value: `${gate.reads.balancePhrs} PHRS` }]
        : []),
    ];
    const blockReason = gate.blockReason ?? "The gate denied this action.";

    const head =
      gate.decision === "APPROVE"
        ? {
            status: "pass" as const,
            eyebrow: `Gate verdict · policy ${POLICY_ID}`,
            headline: (
              <span className="inline-flex items-center gap-3">
                <ShieldCheck size={40} className="text-pass" aria-hidden />
                ALLOW
              </span>
            ),
            subline:
              "All seven gate conditions pass against live Atlantic reads. Review the proposal below — nothing broadcasts until you sign in your own wallet.",
          }
        : gate.decision === "REFUSED_MAINNET"
          ? {
              status: "fail" as const,
              eyebrow: "Gate verdict · rule network_firewall",
              headline: (
                <span className="inline-flex items-center gap-3">
                  <Ban size={40} className="text-fail" aria-hidden />
                  REFUSED
                </span>
              ),
              subline: blockReason,
            }
          : {
              status: "fail" as const,
              eyebrow: `Gate verdict · rule ${gate.namedRule}`,
              headline: (
                <span className="inline-flex items-center gap-3">
                  <ShieldX size={40} className="text-fail" aria-hidden />
                  BLOCK
                </span>
              ),
              subline: `${blockReason} Nothing is proposed and nothing is broadcast — the denial is the product.`,
            };

    return (
      <ResultCard
        status={head.status}
        eyebrow={head.eyebrow}
        headline={head.headline}
        subline={head.subline}
        rows={verdictRows}
        copyValue={verdictJson}
      >
        <div className="border-t border-hairline pt-5">
          <p className="text-sm font-semibold text-slate">
            The gate's working — seven conditions, each with its numbers
          </p>
          <ol className="mt-2">
            {gate.rows.map((r) => (
              <li
                key={r.key}
                className={`border-t border-hairline py-4 first:border-t-0 first:pt-3 ${
                  r.status === "block" ? "rounded-xl bg-[#FEF4F4] px-4" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-semibold text-ink">{r.name}</span>
                  <span className={r.status === "pass" ? "chip chip-pass" : "chip chip-fail"}>
                    {r.status === "pass" ? "PASS" : "BLOCK"}
                  </span>
                </div>
                {r.rule && <p className="mt-1 font-mono text-xs text-slate">rule: {r.rule}</p>}
                <p className="mt-1 break-words font-mono text-sm text-ink">{r.numbers}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{r.note}</p>
              </li>
            ))}
          </ol>
        </div>
      </ResultCard>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-xl font-bold text-ink">Every block, explained</h3>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink">
          Propose a native transfer and the gatekeeper's policy engine ({POLICY_ID}) evaluates it
          against <span className="font-semibold">live Atlantic reads</span> — chain id, gas price,
          your wallet balance — then shows its work: seven conditions, each PASS or BLOCK with the
          exact numbers. <span className="font-semibold">{lamp.name}</span> says no before anything
          touches the chain.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip chip-info">chain 688689 only</span>
          <span className="chip chip-info">native_transfer ≤ {PER_ACTION_CAP_PHRS} PHRS</span>
          <span className="chip chip-info">gas ≤ {MAX_GAS_GWEI} gwei</span>
          <span className="chip chip-info">fee reserve {FEE_RESERVE_PHRS} PHRS</span>
        </div>
      </div>

      {/* 01 Configure */}
      <section className="space-y-5">
        <p className="text-sm font-semibold text-slate">01 · Configure the proposal</p>

        <div className="flex flex-wrap items-center gap-3">
          {walletAddress ? (
            <span className="chip chip-pass">wallet connected · {short(walletAddress)}</span>
          ) : (
            <>
              <button className="btn-outline" onClick={connect}>
                Connect wallet
              </button>
              <span className="text-sm text-slate">
                Needed for the key-present, sender-binding and balance checks. LIGHTKEEPER never
                sees your keys.
              </span>
            </>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate">
              To (recipient)
            </label>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="btn-outline !px-3 !py-1 !text-sm"
                onClick={() => setTo(DUST_SINK)}
              >
                Dust sink (allowlisted)
              </button>
              <button
                className="btn-outline !px-3 !py-1 !text-sm"
                onClick={() => setTo(STRANGER)}
              >
                Stranger address (BLOCK demo)
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate">Value (PHRS)</label>
            <input
              className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              spellCheck={false}
            />
            <p className="mt-2 text-sm text-slate">
              Dust limit {DUST_LIMIT_PHRS} PHRS — the gate's own cap is {PER_ACTION_CAP_PHRS} PHRS.
            </p>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={asMainnet}
            onChange={(e) => setAsMainnet(e.target.checked)}
          />
          <span>
            Preview: evaluate as <span className="font-mono">mainnet (chain 1672)</span> — see the
            unconditional REFUSE. (A policy preview; the live RPC read still targets Atlantic.)
          </span>
        </label>

        <div>
          <button className="btn-primary" onClick={runGate} disabled={evaluating}>
            {evaluating ? "Checking…" : "Run the gate"}
          </button>
        </div>
      </section>

      {/* 02 Check — live reads, one real call per step */}
      {evaluating && checkSteps.length > 0 && (
        <section className="space-y-4">
          <p className="text-sm font-semibold text-slate">02 · Check — live reads from Atlantic</p>
          <ProgressLoader
            steps={checkSteps}
            current={checkStep}
            title="Evaluating the gate against the live chain"
          />
        </section>
      )}

      {/* 03 Result — the verdict showpiece + Tier B sign flow */}
      {gate && !evaluating && (
        <section className="space-y-5">
          <p className="text-sm font-semibold text-slate">03 · Result — the verdict</p>

          {renderVerdict()}

          {/* ALLOW path — propose, mandatory review, then the visitor signs */}
          {canPropose && (
            <div className="space-y-5">
              {state === "idle" && (
                <div className="space-y-3">
                  <button
                    className="btn-primary"
                    onClick={() =>
                      propose({
                        to,
                        valuePhrs: value,
                        label: `Gatekeeper-approved: send ${value} PHRS`,
                      })
                    }
                  >
                    Propose transfer
                  </button>
                  <p className="text-sm text-slate">
                    Proposing only stages the action for your review — the gate never broadcasts
                    anything on its own.
                  </p>
                </div>
              )}

              {state === "review" && proposal && (
                <>
                  <div className="rounded-2xl border border-[#E3C26A] bg-[#FFFDF4] p-6">
                    <p className="text-sm font-semibold text-slate">
                      Mandatory review — nothing is broadcast yet
                    </p>
                    <h4 className="mt-2 text-lg font-bold text-ink">{proposal.label}</h4>
                    <dl className="mt-4">
                      <div className="border-t border-hairline pt-3">
                        <dt className="text-sm font-semibold text-slate">To</dt>
                        <dd className="mt-1 break-all font-mono text-sm text-ink">
                          {proposal.to}
                        </dd>
                      </div>
                      <div className="mt-3 border-t border-hairline pt-3">
                        <dt className="text-sm font-semibold text-slate">Value</dt>
                        <dd className="mt-1 font-mono text-sm text-ink">
                          {proposal.valuePhrs} PHRS
                        </dd>
                      </div>
                      <div className="mt-3 border-t border-hairline pt-3">
                        <dt className="text-sm font-semibold text-slate">From</dt>
                        <dd className="mt-1 break-all font-mono text-sm text-ink">
                          {walletAddress ?? "your connected wallet"}
                        </dd>
                      </div>
                    </dl>
                    {/* Review-step dust warning renders as an AMBER warning, not an error. */}
                    {error && (
                      <p className="mt-4 flex items-start gap-2 rounded-xl border border-[#E3C26A] bg-[#FFF6DE] p-3 text-sm font-semibold text-golddeep">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
                        <span>{error}</span>
                      </p>
                    )}
                    <p className="mt-4 text-sm leading-relaxed text-ink">
                      This is your last look. Signing happens in YOUR wallet, from YOUR address,
                      with YOUR testnet PHRS — LIGHTKEEPER never moves funds for you.
                    </p>
                  </div>
                  <div className="sticky bottom-4 z-10 flex gap-2 rounded-2xl border border-hairline bg-white/95 p-3 shadow-lg backdrop-blur">
                    <button className="btn-primary flex-1 justify-center" onClick={approve}>
                      Sign in my wallet
                    </button>
                    <button className="btn-outline" onClick={cancel}>
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {(state === "awaiting-signature" || state === "broadcasting") && (
                <ProgressLoader
                  steps={["Sign the transfer in your wallet", "Wait for Atlantic to confirm it"]}
                  current={state === "awaiting-signature" ? 0 : 1}
                  title="Your wallet is in charge — the console only watches"
                />
              )}

              {(state === "blocked" || state === "error") && (
                <div className="space-y-3">
                  <ErrorState
                    title={
                      state === "blocked"
                        ? "The gate stopped the sign flow"
                        : "The sign flow failed"
                    }
                    message={error ?? "Something went wrong."}
                    hint={
                      state === "error" && txHash
                        ? "The transaction may still be on-chain — check its status below."
                        : "Adjust the inputs and run the gate again, or check your wallet's network."
                    }
                    retryLabel="Run the gate again"
                    onRetry={runGate}
                  />
                  {txHash && (
                    <a
                      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                      href={`${EXPLORER_TX}${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View the transaction on the explorer
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  )}
                </div>
              )}

              {state === "confirmed" && txHash && (
                <ResultCard
                  status="pass"
                  eyebrow="Receipt — signed in your wallet"
                  headline="Confirmed on Atlantic"
                  subline={`The ${proposal?.valuePhrs ?? value} PHRS transfer you signed is mined on chain 688689.`}
                  rows={[
                    {
                      label: "Transaction hash",
                      value: <span className="break-all">{txHash}</span>,
                    },
                    {
                      label: "To",
                      value: <span className="break-all">{proposal?.to ?? to}</span>,
                    },
                    { label: "Value", value: `${proposal?.valuePhrs ?? value} PHRS` },
                  ]}
                  copyValue={txHash}
                  links={[{ label: "View on the explorer", href: `${EXPLORER_TX}${txHash}` }]}
                />
              )}
            </div>
          )}
        </section>
      )}

      <p className="max-w-3xl text-sm leading-relaxed text-slate">
        This console surface mirrors the task's policy engine (policy {POLICY_ID}). The task's
        full record — 8 named rules and the hash-chained audit trail — is on GitHub at{" "}
        <a
          className="font-mono text-accent hover:underline"
          href="https://github.com/mohamedwael201193/lightkeeper/tree/main/tasks/t11-policy-gatekeeper"
          target="_blank"
          rel="noreferrer"
        >
          tasks/t11-policy-gatekeeper
        </a>
        . Testnet only: the gate cannot and will not touch mainnet.
      </p>
    </div>
  );
}
