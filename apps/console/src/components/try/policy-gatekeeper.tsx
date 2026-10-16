/**
 * T11 — Policy Gatekeeper: "Every block, explained."
 *
 * Tier B module. The visitor proposes a native_transfer; the task's real
 * policy engine (policy t11-policy-v1) evaluates it client-side against LIVE
 * Atlantic reads (chain id, gas price, the visitor's balance) and renders the
 * seven gate conditions as a named PASS/BLOCK trace — the gate shows its work.
 *
 * ALLOW path: propose() -> MANDATORY review (to/value, amber dust warning) ->
 * the VISITOR signs in their own wallet with their own testnet PHRS.
 * BLOCK path: the blocking condition is shown with the exact breached number
 * and a plain-language reason; nothing is proposed. A mainnet-preview toggle
 * demonstrates the unconditional REFUSE of chain 1672 (mainnet.enabled=false).
 *
 * LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only.
 */
import { useState } from "react";
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
  const [readError, setReadError] = useState<string | null>(null);

  const walletAddress =
    wallet.status === "connected" || wallet.status === "wrong-network"
      ? wallet.address
      : null;

  async function runGate() {
    cancel();
    setGate(null);
    setReadError(null);
    setEvaluating(true);

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
    try {
      const gasHex = (await rpcCall("eth_gasPrice", [])) as string;
      gasGwei = Number(BigInt(gasHex)) / 1e9;
    } catch {
      /* fail-closed below */
    }
    if (walletAddress) {
      try {
        const balHex = (await rpcCall("eth_getBalance", [walletAddress, "latest"])) as string;
        balanceWei = BigInt(balHex);
      } catch {
        /* fail-closed below */
      }
    }

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

    setEvaluating(false);
    setGate({ decision, namedRule, blockReason, rows });
  }

  const canPropose = gate?.decision === "APPROVE";
  const decisionBanner =
    gate?.decision === "APPROVE" ? (
      <div className="rounded-xl border border-[#9fd8b4] bg-[#eefaf3] p-4">
        <p className="text-sm font-bold text-[#0f7a37]">
          APPROVE — all seven conditions pass. The gate minted a decision: you may propose this transfer.
        </p>
      </div>
    ) : gate?.decision === "DENY" ? (
      <div className="rounded-xl border border-[#f0b4b4] bg-[#fdeeee] p-4">
        <p className="text-sm font-bold text-fail">
          DENY — rule <span className="font-mono">{gate.namedRule}</span>
        </p>
        <p className="mt-1 text-sm text-slate">{gate.blockReason}</p>
        <p className="mt-1 text-xs text-slate">
          The gate refuses to propose this action. Nothing is broadcast; the denial is the product.
        </p>
      </div>
    ) : gate?.decision === "REFUSED_MAINNET" ? (
      <div className="rounded-xl border border-[#f0b4b4] bg-[#fdeeee] p-4">
        <p className="text-sm font-bold text-fail">REFUSED_MAINNET — rule network_firewall</p>
        <p className="mt-1 text-sm text-slate">{gate.blockReason}</p>
      </div>
    ) : null;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-xl font-bold text-ink">Every block, explained</h3>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate">
          Propose a native transfer and the gatekeeper's policy engine ({POLICY_ID}) evaluates it
          against <span className="font-semibold text-ink">live Atlantic reads</span> — chain id,
          gas price, your wallet balance — then shows its work: seven conditions, each PASS or BLOCK
          with the exact numbers.{" "}
          <span className="font-semibold text-ink">{lamp.name}</span> says no before anything
          touches the chain.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="chip chip-info">chain 688689 only</span>
          <span className="chip chip-info">native_transfer ≤ {PER_ACTION_CAP_PHRS} PHRS</span>
          <span className="chip chip-info">gas ≤ {MAX_GAS_GWEI} gwei</span>
          <span className="chip chip-info">fee reserve {FEE_RESERVE_PHRS} PHRS</span>
        </div>
      </div>

      {/* Wallet row */}
      <div className="flex flex-wrap items-center gap-3">
        {walletAddress ? (
          <span className="chip chip-pass">wallet connected · {short(walletAddress)}</span>
        ) : (
          <>
            <button className="btn-outline" onClick={connect}>
              Connect wallet
            </button>
            <span className="text-xs text-slate">
              Needed for the key-present, sender-binding and balance checks. LIGHTKEEPER never sees
              your keys.
            </span>
          </>
        )}
      </div>

      {/* Proposal form */}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="smallcaps mb-1 block !text-slate">To (recipient)</label>
          <input
            className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-outline !px-2 !py-1 !text-xs" onClick={() => setTo(DUST_SINK)}>
              Dust sink (allowlisted)
            </button>
            <button className="btn-outline !px-2 !py-1 !text-xs" onClick={() => setTo(STRANGER)}>
              Stranger address (BLOCK demo)
            </button>
          </div>
        </div>
        <div>
          <label className="smallcaps mb-1 block !text-slate">Value (PHRS)</label>
          <input
            className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
          />
          <p className="mt-2 text-xs text-slate">
            Dust limit {DUST_LIMIT_PHRS} PHRS — the gate's own cap is {PER_ACTION_CAP_PHRS} PHRS.
          </p>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate">
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
          {evaluating ? "Reading Atlantic…" : "Run the gate"}
        </button>
        {readError && <p className="mt-2 text-sm text-fail">{readError}</p>}
      </div>

      {/* Trace — horizontally scrollable so the 4-column table stays sane on 390px phones */}
      {gate && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Condition</th>
                <th>Result</th>
                <th>Numbers</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {gate.rows.map((r) => (
                <tr key={r.key}>
                  <td className="font-mono text-xs text-ink">{r.name}</td>
                  <td>
                    <span className={r.status === "pass" ? "chip chip-pass" : "chip chip-fail"}>
                      {r.status === "pass" ? "PASS" : "BLOCK"}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-ink">{r.numbers}</td>
                  <td className="text-xs text-slate">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="code-block">
            {JSON.stringify(
              {
                policy: POLICY_ID,
                decision: gate.decision,
                rule: gate.namedRule,
                action: { type: "native_transfer", to, value_phrs: value },
              },
              null,
              2
            )}
          </div>

          {decisionBanner}

          {/* ALLOW path — propose, then mandatory review */}
          {canPropose && state === "idle" && (
            <button
              className="btn-primary"
              onClick={() =>
                propose({ to, valuePhrs: value, label: `Gatekeeper-approved: send ${value} PHRS` })
              }
            >
              Propose transfer
            </button>
          )}

          {state === "review" && proposal && (
            <div className="space-y-3 rounded-xl border border-hairline bg-porcelain p-4">
              <p className="text-sm font-semibold text-ink">{proposal.label}</p>
              <p className="font-mono text-xs text-slate">
                to {proposal.to} · {proposal.valuePhrs} PHRS
              </p>
              {/* Review-step dust warning renders as an AMBER warning, not an error. */}
              {error && (
                <p className="rounded-lg border border-[#e3c26a] bg-[#fff8e6] p-3 text-sm font-semibold text-golddeep">
                  ⚠ {error}
                </p>
              )}
              <p className="text-xs text-slate">
                Mandatory review: signing happens in YOUR wallet, from YOUR address, with YOUR
                testnet PHRS. LIGHTKEEPER never moves funds for you.
              </p>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={approve}>
                  Sign in my wallet
                </button>
                <button className="btn-outline" onClick={cancel}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {state === "awaiting-signature" && (
            <p className="text-sm text-slate">Waiting for your wallet…</p>
          )}
          {state === "broadcasting" && (
            <p className="text-sm text-slate">Sent — waiting for Atlantic to mine it…</p>
          )}
          {state === "blocked" && <p className="text-sm text-fail">{error}</p>}
          {state === "error" && <p className="text-sm text-fail">{error}</p>}
          {state === "confirmed" && txHash && (
            <div className="rounded-xl border border-[#9fd8b4] bg-[#eefaf3] p-4">
              <p className="text-sm font-bold text-[#0f7a37]">
                Your tx — signed in your wallet. Confirmed on Atlantic.
              </p>
              <a
                className="font-mono text-sm text-accent hover:underline"
                href={`${EXPLORER_TX}${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View on the explorer
              </a>
            </div>
          )}
        </div>
      )}

      <p className="max-w-3xl text-xs leading-relaxed text-slate">
        This console surface mirrors the task's policy engine (policy {POLICY_ID}). The task's
        full record — 8 named rules, the hash-chained audit trail, the mainnet-refusal demo, and
        the unit tests — is on GitHub at{" "}
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
