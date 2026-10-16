/**
 * T25 dApp Support Agent — Tier A (live reads).
 *
 * "Every failed tx, explained": paste ANY Pharos Atlantic tx hash (0x + 64 hex)
 * and the panel fetches the live transaction + receipt and runs a diagnosis
 * engine on it — out of gas, revert reasons decoded from an eth_call replay at
 * block−1 (Error(string), Panic(uint256), custom selectors), silent reverts,
 * intrinsic-gas shortfalls, no-code-at-destination, balance shortfalls, plus
 * honest success / pending / not-found paths.
 *
 * The three preset hashes are the task's REAL mined Atlantic evidence txs,
 * copied character-for-character from tasks/t25-dapp-support-agent/evidence.json.
 * Unknown cases are reported as unknown with the raw receipt — never invented.
 *
 * Tier A only: plain JSON-RPC reads, no wallet, no signature, costs nothing.
 * LIGHTKEEPER never sees, holds, or asks for private keys.
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import { ATLANTIC_RPC_URL, EXPLORER_TX, rpcCall } from "../../hooks/useAtlantic";

/* ------------------------------------------------------------------ */
/* Evidence presets — real mined Atlantic txs (tasks/t25-dapp-support-agent/evidence.json) */
/* ------------------------------------------------------------------ */

interface Preset {
  id: string;
  label: string;
  note: string;
  hash: string;
}

const PRESETS: Preset[] = [
  {
    id: "revert-reason",
    label: "Revert with reason",
    note: "block 31482154 · gas 21,510 / 100,000 · Error(string) decoded from replay",
    hash: "0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23",
  },
  {
    id: "out-of-gas",
    label: "Out of gas",
    note: "block 31482265 · gasUsed == gasLimit == 120,000",
    hash: "0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf",
  },
  {
    id: "panic",
    label: "Solidity panic",
    note: "block 31482171 · Panic(0x11) arithmetic overflow · gas 23,108 / 100,000",
    hash: "0x2c78309c41ce0bd53f611ac5a1ad5e2bfa0e29b7f5e3514b9f0a429c2dcab048",
  },
  {
    id: "success",
    label: "Success (contrast)",
    note: "fixture deploy v2 · status 0x1 — what a healthy receipt looks like",
    hash: "0x48adea8bae24bcc9fa94f175e7a86c424c483f804599ada1dfd72a6ad5aec9e7",
  },
];

/* ------------------------------------------------------------------ */
/* Diagnosis engine                                                   */
/* ------------------------------------------------------------------ */

type VerdictKind = "success" | "failure" | "neutral" | "unknown";

interface Stat {
  label: string;
  value: string;
}

interface Diagnosis {
  kind: VerdictKind;
  verdictId: string;
  title: string;
  explanation: string;
  fixes: string[];
  /** DOC-GROUNDED / READ FROM CHAIN / INFERENCE / UNVERIFIED labels. */
  provenance: string;
  stats: Stat[];
  revertData: string | null;
  rawReceipt: unknown;
}

const PANIC_CODES: Record<string, string> = {
  "0x01": "generic assertion failure — assert(false) was hit",
  "0x11": "arithmetic overflow or underflow",
  "0x12": "division or modulo by zero",
  "0x21": "invalid enum value conversion",
  "0x22": "incorrectly encoded storage byte array",
  "0x31": ".pop() called on an empty array",
  "0x32": "array index out of bounds (or slice too large)",
  "0x41": "too much memory allocated, or array too large",
  "0x51": "call to a zero-initialized internal function",
};

function hexToBigInt(h: string | null | undefined): bigint {
  if (!h) return 0n;
  try {
    return BigInt(h);
  } catch {
    return 0n;
  }
}

function toBlockHex(n: number): string {
  return "0x" + n.toString(16);
}

/** wei → PHRS, trimmed to at most 6 decimals. */
function weiToPhrs(wei: bigint): string {
  const neg = wei < 0n;
  const a = neg ? -wei : wei;
  const whole = a / 1000000000000000000n;
  const frac = (a % 1000000000000000000n).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toLocaleString("en-US") + (frac ? "." + frac : "");
}

function fmtInt(bi: bigint): string {
  return bi.toLocaleString("en-US");
}

/** Decode Error(string): 0x08c379a0 + offset + length + utf8 bytes. */
function decodeErrorString(data: string): string | null {
  try {
    if (!data.startsWith("0x08c379a0")) return null;
    const body = data.slice(10);
    if (body.length < 128) return null;
    const len = parseInt(body.slice(64, 128), 16);
    const bytesHex = body.slice(128, 128 + len * 2);
    const bytes = new Uint8Array(bytesHex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bytesHex.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Decode Panic(uint256): 0x4e487b71 + 32-byte code. */
function decodePanic(data: string): string | null {
  try {
    if (!data.startsWith("0x4e487b71") || data.length < 10 + 64) return null;
    const code = BigInt("0x" + data.slice(10, 10 + 64));
    const hex = "0x" + code.toString(16).padStart(2, "0");
    return hex;
  } catch {
    return null;
  }
}

/**
 * eth_call replay that PRESERVES the RPC error's `data` field (the revert
 * payload). The shared rpcCall() drops it by design, so this panel does its
 * own Tier-A fetch for the replay step only.
 */
async function replayCall(
  call: Record<string, string>,
  blockHex: string
): Promise<{ ok: true; data: string } | { ok: false; data: string | null; message: string }> {
  const res = await fetch(ATLANTIC_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_call", params: [call, blockHex] }),
  });
  if (!res.ok) throw new Error(`The Atlantic RPC returned HTTP ${res.status} — retry in a moment.`);
  const json = (await res.json()) as {
    result?: unknown;
    error?: { message?: string; code?: number; data?: unknown };
  };
  if (json.error) {
    return {
      ok: false,
      data: typeof json.error.data === "string" ? json.error.data : null,
      message: json.error.message ?? "execution reverted",
    };
  }
  return { ok: true, data: typeof json.result === "string" ? json.result : "0x" };
}

interface TxLike {
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice?: string;
  input: string;
}

interface ReceiptLike {
  status?: string;
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice?: string;
  logs?: unknown[];
  contractAddress?: string | null;
}

async function diagnose(hash: string): Promise<Diagnosis> {
  const tx = (await rpcCall("eth_getTransactionByHash", [hash])) as TxLike | null;
  const receipt = (await rpcCall("eth_getTransactionReceipt", [hash])) as ReceiptLike | null;

  const baseStats = (r: ReceiptLike, t: TxLike): Stat[] => {
    const gasUsed = hexToBigInt(r.gasUsed);
    const gasLimit = hexToBigInt(t.gas);
    const price = hexToBigInt(r.effectiveGasPrice ?? t.gasPrice);
    return [
      { label: "Block", value: String(parseInt(r.blockNumber, 16)) },
      { label: "From", value: t.from },
      { label: "To", value: t.to ?? "(contract creation)" },
      { label: "Value", value: `${weiToPhrs(hexToBigInt(t.value))} PHRS` },
      { label: "Gas used / limit", value: `${fmtInt(gasUsed)} / ${fmtInt(gasLimit)}` },
      { label: "Fee paid", value: `${weiToPhrs(gasUsed * price)} PHRS` },
      { label: "Logs emitted", value: String((r.logs ?? []).length) },
    ];
  };

  /* ---- not found ------------------------------------------------ */
  if (!tx && !receipt) {
    return {
      kind: "neutral",
      verdictId: "not_found",
      title: "No such transaction on Atlantic",
      explanation:
        "Atlantic has no record of this hash: it was never broadcast here, the hash is mistyped, or it belongs to a different network (this panel reads Pharos Atlantic testnet, chain 688689 only).",
      fixes: [
        "Re-check the hash character by character — 0x followed by exactly 64 hex characters.",
        "Confirm the transaction was sent on Pharos Atlantic (chain id 688689), not another chain.",
        "If you only just sent it, your wallet may not have broadcast yet — check the wallet's activity tab.",
      ],
      provenance: "READ FROM CHAIN — eth_getTransactionByHash and eth_getTransactionReceipt both returned null.",
      stats: [],
      revertData: null,
      rawReceipt: null,
    };
  }

  /* ---- tx known but no receipt: pending or dropped ---------------- */
  if (tx && !receipt) {
    return {
      kind: "neutral",
      verdictId: "pending_or_dropped",
      title: "Broadcast, but not mined yet — or dropped",
      explanation:
        "The transaction exists but Atlantic has no receipt for it: it is sitting in the mempool waiting for a block, or it was dropped and will never mine. Public RPC cannot tell these two apart, so this panel reports the uncertainty instead of guessing.",
      fixes: [
        "Wait a few blocks and hit Diagnose again — the receipt appears the moment it mines.",
        "If it stays unmined, send a replacement with the SAME nonce and a higher gas price to speed it up (or a 0-value self-send to cancel).",
        "If the wallet shows it as failed/dropped, just resend — nothing was executed and no fee was paid for a dropped tx.",
      ],
      provenance: "READ FROM CHAIN — transaction exists, receipt is null. Pending-vs-dropped is unknowable from public RPC: stated, not guessed.",
      stats: [
        { label: "From", value: tx.from },
        { label: "To", value: tx.to ?? "(contract creation)" },
        { label: "Gas limit", value: fmtInt(hexToBigInt(tx.gas)) },
        { label: "Value", value: `${weiToPhrs(hexToBigInt(tx.value))} PHRS` },
      ],
      revertData: null,
      rawReceipt: null,
    };
  }

  const t = tx as TxLike;
  const r = receipt as ReceiptLike;
  const status = (r.status ?? "").toLowerCase();
  const gasUsed = hexToBigInt(r.gasUsed);
  const gasLimit = hexToBigInt(t.gas);
  const price = hexToBigInt(r.effectiveGasPrice ?? t.gasPrice);
  const blockN = parseInt(r.blockNumber, 16);
  const blockMinus1 = blockN > 0 ? toBlockHex(blockN - 1) : "0x0";

  /* ---- success --------------------------------------------------- */
  if (status === "0x1") {
    const stats = baseStats(r, t);
    if (r.contractAddress) stats.push({ label: "Contract created", value: r.contractAddress });
    const warn: string[] = [];
    if (gasLimit > 0n && gasUsed * 100n >= gasLimit * 95n) {
      warn.push(
        "Heads-up: this used ≥95% of its gas limit. It succeeded, but an identical call with slightly more work could run out of gas — raise the limit a little next time."
      );
    }
    return {
      kind: "success",
      verdictId: "success",
      title: "Confirmed — the transaction executed successfully",
      explanation:
        "The receipt status is 0x1: every state change in this transaction went through. " +
        (r.contractAddress
          ? "It deployed a contract — the new address is listed below."
          : "Value moved and/or contract logic ran exactly as the calldata asked.") +
        (warn.length ? " " + warn[0] : ""),
      fixes:
        warn.length > 0
          ? ["Consider a ~20% higher gas limit for repeat calls of the same function."]
          : ["Nothing to fix — this is what a healthy Atlantic receipt looks like."],
      provenance: "READ FROM CHAIN — receipt status 0x1, gas and fee from the mined receipt.",
      stats,
      revertData: null,
      rawReceipt: r,
    };
  }

  /* ---- failure path: gather evidence (best effort, never fatal) -- */
  const stats = baseStats(r, t);

  // (a) intrinsic gas: a simple transfer needs 21,000; below that nothing can run.
  if (gasLimit > 0n && gasLimit < 21000n) {
    return {
      kind: "failure",
      verdictId: "intrinsic_gas_too_low",
      title: "Gas limit below the 21,000 minimum",
      explanation: `The gas limit was ${fmtInt(gasLimit)} — below the 21,000 gas every transaction intrinsically costs before a single instruction runs. Execution never started; the whole limit was consumed as the fee.`,
      fixes: [
        "Set the gas limit to at least 21,000 for a plain PHRS transfer, more for contract calls (calldata and contract logic cost extra).",
        "Let the wallet estimate the gas instead of typing a number by hand.",
      ],
      provenance: "READ FROM CHAIN — gasLimit from the transaction vs the 21,000 intrinsic minimum (standard EVM rule).",
      stats,
      revertData: null,
      rawReceipt: r,
    };
  }

  // (b) out of gas: the classic gasUsed == gasLimit signature.
  if (gasLimit > 0n && gasUsed === gasLimit) {
    const fixes: string[] = [
      "Resend the same call with 1.5–2× the gas limit — the burned fee is unrecoverable, the retry is not.",
      "Unused gas is refunded, so a generous limit only costs what the call actually burns.",
    ];
    let provenance = "READ FROM CHAIN — receipt gasUsed equals the transaction gasLimit (direct receipt read).";
    try {
      const est = (await rpcCall("eth_estimateGas", [
        { from: t.from, to: t.to ?? undefined, data: t.input, value: t.value },
        "latest",
      ])) as string;
      const estN = hexToBigInt(est);
      if (estN > 0n) {
        const suggested = (estN * 13n) / 10n;
        fixes.unshift(
          `A live estimate for this exact call just returned ${fmtInt(estN)} gas — retry with a limit of ≈${fmtInt(suggested)} (+30% headroom).`
        );
        provenance += " Retry suggestion from a live eth_estimateGas on Atlantic.";
      }
    } catch {
      /* estimate unavailable — the 1.5–2× guidance stands on its own */
    }
    return {
      kind: "failure",
      verdictId: "out_of_gas",
      title: "Out of gas",
      explanation: `The call consumed all ${fmtInt(gasLimit)} gas and was halted mid-execution — every state change was rolled back, but the ${weiToPhrs(gasUsed * price)} PHRS fee was still paid to the block producer.`,
      fixes,
      provenance,
      stats,
      revertData: null,
      rawReceipt: r,
    };
  }

  // (c) parallel evidence: code at destination, balance pre-check, replay.
  const [codeRes, balRes, replayRes] = await Promise.allSettled([
    t.to ? rpcCall("eth_getCode", [t.to, blockMinus1]) : Promise.resolve("0x"),
    t.value && hexToBigInt(t.value) > 0n
      ? rpcCall("eth_getBalance", [t.from, blockMinus1])
      : Promise.resolve(null),
    t.to && t.input && t.input !== "0x"
      ? replayCall({ from: t.from, to: t.to, data: t.input, value: t.value }, blockMinus1)
      : Promise.resolve({ ok: false as const, data: null, message: "no calldata to replay" }),
  ]);
  const code = codeRes.status === "fulfilled" ? String(codeRes.value) : null;
  const balance = balRes.status === "fulfilled" && balRes.value ? hexToBigInt(String(balRes.value)) : null;
  const replay = replayRes.status === "fulfilled" ? replayRes.value : null;

  // (d) insufficient native balance: value + max fee exceeded what the sender held.
  const value = hexToBigInt(t.value);
  if (balance !== null && value > 0n && balance < value + gasLimit * price) {
    return {
      kind: "failure",
      verdictId: "insufficient_balance",
      title: "Sender could not cover value + fee",
      explanation: `At the block before this transaction, the sender held ${weiToPhrs(balance)} PHRS but the transaction needed ${weiToPhrs(value)} PHRS of value plus up to ${weiToPhrs(gasLimit * price)} PHRS of gas — a shortfall of ${weiToPhrs(value + gasLimit * price - balance)} PHRS.`,
      fixes: [
        "Top up the sender with testnet PHRS from the faucet, then resend.",
        "Or lower the value and/or the gas limit so value + limit × price fits the balance.",
      ],
      provenance: "READ FROM CHAIN — eth_getBalance at block−1 vs value + gasLimit × gas price.",
      stats,
      revertData: null,
      rawReceipt: r,
    };
  }

  // (e) call into an address with no code: wrong address, or contract gone.
  if (code !== null && code === "0x" && t.input !== "0x") {
    return {
      kind: "failure",
      verdictId: "no_code_at_destination",
      title: "The destination had no contract code",
      explanation: `At the block before execution, ${t.to} held no contract code, yet the transaction carried calldata meant for a contract. Nothing could execute: either the address is wrong, it is a plain wallet (an EOA), or the contract was never deployed on Atlantic.`,
      fixes: [
        "Double-check the contract address and that you are on Pharos Atlantic (chain 688689) — a mainnet or other-testnet address will be empty here.",
        "Verify the contract is actually deployed: paste the address into the Atlantic explorer and look for a Contract tab.",
        "If you meant to send plain PHRS, drop the calldata — a value-only transfer to a wallet succeeds.",
      ],
      provenance: "READ FROM CHAIN — eth_getCode at block−1 returned 0x for the destination.",
      stats,
      revertData: null,
      rawReceipt: r,
    };
  }

  // (f) replay decoded revert data.
  const revertPayload =
    replay && !replay.ok && replay.data
      ? replay.data
      : replay && replay.ok && replay.data && replay.data !== "0x"
        ? replay.data
        : null;

  if (revertPayload) {
    const reason = decodeErrorString(revertPayload);
    if (reason !== null) {
      return {
        kind: "failure",
        verdictId: "revert_with_reason",
        title: "Contract reverted with a reason",
        explanation: `Replaying the exact call against the pre-transaction state reproduces the revert, and the contract explained itself: "${reason}". The logic rejected the call on purpose — this is a bug in the inputs or the caller's permissions, not a gas problem.`,
        fixes: [
          `Fix whatever the reason names — "${reason}" — then resend with the same gas settings.`,
          "No gas-limit change will help: a reverting call reverts at any limit.",
          "If the reason is cryptic, open the contract's source (explorer Contract tab) and search for the require() that emits it.",
        ],
        provenance: "READ FROM CHAIN — revert reason decoded from an eth_call replay at block−1 (Error(string), selector 0x08c379a0).",
        stats,
        revertData: revertPayload,
        rawReceipt: r,
      };
    }

    const panicHex = decodePanic(revertPayload);
    if (panicHex !== null) {
      const meaning = PANIC_CODES[panicHex] ?? "undocumented panic code";
      return {
        kind: "failure",
        verdictId: "revert_panic",
        title: `Solidity panic ${panicHex} — ${meaning}`,
        explanation: `The contract hit a Solidity panic (${panicHex}): ${meaning}. Panics are the compiler's safety nets firing — the inputs or the contract's own arithmetic violated an invariant the code assumed would hold.`,
        fixes: [
          "Check the inputs for the classic triggers: token amounts that overflow, division by a zero amount, or an out-of-range array index.",
          "If you wrote the contract, add explicit require() checks with messages before the panicking operation — panics give callers no reason string.",
          "Resending unchanged will revert again; the call's logic must change, not its gas.",
        ],
        provenance:
          "READ FROM CHAIN — Panic(uint256) decoded from an eth_call replay at block−1. Code meanings are INFERENCE from standard EVM semantics (no Pharos doc page covers revert decoding).",
        stats,
        revertData: revertPayload,
        rawReceipt: r,
      };
    }

    if (/^0x[0-9a-fA-F]{8}$/.test(revertPayload) || revertPayload.length >= 10) {
      const selector = revertPayload.slice(0, 10);
      return {
        kind: "failure",
        verdictId: "revert_custom",
        title: `Custom error — selector ${selector}`,
        explanation: `The contract reverted with a custom error whose 4-byte selector is ${selector}. The name and parameters live in the contract's ABI, which this panel cannot read from the chain — so the selector is reported honestly instead of guessed.`,
        fixes: [
          `Look up ${selector} in the contract's verified source or ABI (explorer Contract tab) to get the error name and its parameters.`,
          "Custom errors usually guard specific preconditions (wrong phase, already claimed, not the owner) — the parameter values in the payload are the clue.",
        ],
        provenance: "READ FROM CHAIN — raw revert payload from an eth_call replay at block−1; selector reported, never invented.",
        stats,
        revertData: revertPayload,
        rawReceipt: r,
      };
    }
  }

  // (g) silent revert: no payload at all.
  if (replay && !replay.ok && (replay.data === "0x" || replay.data === null)) {
    const share = gasLimit > 0n ? Number((gasUsed * 100n) / gasLimit) : 0;
    const early = share < 10;
    return {
      kind: "failure",
      verdictId: "revert_silent",
      title: "Silent revert — no reason given",
      explanation:
        `The call reverted without any reason string or error data${early ? `, and it died after burning only ${share}% of its gas — a guard at the very top of the function (an ownership, allowance, or balance check) almost certainly rejected it` : ` after burning ${share}% of its gas, so the failure happened deep inside the call`}. The contract gave no explanation; the receipt is the whole story.`,
      fixes: early
        ? [
            "Check the entry guards first: is the caller the owner / approved spender? Is the token allowance and balance sufficient? Is the contract paused or past its deadline?",
            "Replay the call in your own terminal with a trace (cast run --trace) to see exactly which require() fired.",
            "If this is your contract, replace bare require() with require(cond, \"reason\") — silent reverts are undebuggable for users.",
          ]
        : [
            "The revert happened late in execution — suspect state-dependent logic (a swap with too little output, a claim already taken).",
            "Replay with a trace (cast run --trace) to find the exact failing step.",
            "If this is your contract, add reason strings to every require().",
          ],
      provenance:
        "READ FROM CHAIN — empty revert payload from an eth_call replay at block−1. The early/late read is INFERENCE from the gas-burn share.",
      stats,
      revertData: replay.data,
      rawReceipt: r,
    };
  }

  // (h) constructor revert (contract creation with no `to`).
  if (!t.to) {
    return {
      kind: "failure",
      verdictId: "revert_constructor",
      title: "Contract deployment reverted",
      explanation:
        "This was a contract creation and its constructor reverted — the deployment was rolled back, no contract exists at any new address, and the gas was still paid.",
      fixes: [
        "Check the constructor's require() conditions: initial parameters, owner setup, and any external calls it makes.",
        "Deploy locally first (forge script / hardhat run against a fork) so constructor reverts surface before they cost gas.",
      ],
      provenance: "READ FROM CHAIN — status 0x0 on a transaction with no `to` (contract creation).",
      stats,
      revertData: null,
      rawReceipt: r,
    };
  }

  /* ---- unknown: never invent a diagnosis --------------------------- */
  return {
    kind: "unknown",
    verdictId: "unknown",
    title: "Unknown cause — here is the raw receipt",
    explanation:
      "The receipt says the transaction failed, but none of the known failure signatures matched: it was not out of gas, the replay produced no decodable revert data, and the destination held code. Rather than invent a cause, this panel shows you the raw receipt — the honest answer is that the cause needs a trace.",
    fixes: [
      "Run a full execution trace in your terminal: cast run --trace <hash> --rpc-url https://atlantic.dplabs-internal.com",
      "Check the Atlantic explorer's internal-transactions view for this hash.",
      "If the contract is yours, add revert reasons — this exact case is why silent failures are hard.",
    ],
    provenance: "UNVERIFIED — no known signature matched; the receipt below is raw chain data.",
    stats,
    revertData: replay && !replay.ok ? replay.data : null,
    rawReceipt: r,
  };
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function chipClass(kind: VerdictKind): string {
  if (kind === "success") return "chip chip-pass";
  if (kind === "failure") return "chip chip-fail";
  return "chip chip-info";
}

export default function TrySupport({ lamp }: { lamp: Lamp }) {
  const [input, setInput] = useState("");
  const [activeHash, setActiveHash] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [touched, setTouched] = useState(false);

  const valid = HASH_RE.test(input.trim());

  const run = async (hash: string) => {
    const h = hash.trim();
    setTouched(true);
    if (!HASH_RE.test(h)) return;
    setLoading(true);
    setError(null);
    setDiag(null);
    setShowRaw(false);
    setActiveHash(h);
    try {
      setDiag(await diagnose(h));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Atlantic RPC did not answer — retry in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tier A honesty header */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <p className="smallcaps mb-2">Tier A — live reads, paste any hash</p>
        <p className="text-sm text-ink">
          <strong>{lamp.name}</strong>: every failed tx, explained. Paste{" "}
          <strong>any</strong> Pharos Atlantic transaction hash — one of the
          presets below, or <strong>your own failed transaction</strong> — and
          get a plain-language diagnosis with the receipt to prove it.
        </p>
        <p className="mt-2 text-xs text-slate">
          Live JSON-RPC reads against Atlantic (chain 688689). No wallet, no
          signature, costs nothing. LIGHTKEEPER never sees, holds, or asks for
          private keys. Unknown cases say "unknown" and show the raw receipt —
          nothing is invented.
        </p>
      </div>

      {/* Input */}
      <div>
        <label className="smallcaps mb-2 block" htmlFor="t25-hash">
          Transaction hash
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="t25-hash"
            className="min-w-0 flex-1 rounded-xl border border-hairline bg-white px-4 py-3 font-mono text-sm text-ink placeholder:text-slate/60"
            placeholder="0x… (64 hex characters)"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setTouched(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") run(input);
            }}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="btn-primary shrink-0" onClick={() => run(input)} disabled={loading}>
            {loading ? "Reading Atlantic…" : "Diagnose"}
          </button>
        </div>
        {touched && input.trim() !== "" && !valid && (
          <p className="mt-1 text-xs text-fail">
            That doesn't look like a tx hash — expected 0x followed by exactly 64 hex characters.
          </p>
        )}
      </div>

      {/* Presets — the real evidence txs */}
      <div>
        <p className="smallcaps mb-2">Try a real failure — mined on Atlantic</p>
        <div className="grid gap-2 md:grid-cols-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`rounded-xl border bg-white p-3 text-left transition-colors hover:border-accent ${
                activeHash === p.hash ? "border-accent" : "border-hairline"
              }`}
              onClick={() => {
                setInput(p.hash);
                run(p.hash);
              }}
              disabled={loading}
            >
              <span className="block text-sm font-bold text-ink">{p.label}</span>
              <span className="mt-0.5 block font-mono text-xs text-slate">
                {p.hash.slice(0, 14)}…{p.hash.slice(-8)}
              </span>
              <span className="mt-1 block text-xs text-slate">{p.note}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-fail bg-white p-4">
          <p className="text-sm font-bold text-fail">Couldn't read Atlantic</p>
          <p className="mt-1 text-sm text-slate">{error}</p>
          {activeHash && (
            <button className="btn-outline mt-3" onClick={() => run(activeHash)}>
              Retry
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="empty-panel px-5 py-6">
          <p className="text-sm text-slate">
            Fetching the transaction + receipt from Atlantic, then running the diagnosis engine…
          </p>
        </div>
      )}

      {/* Diagnosis result */}
      {diag && !loading && (
        <div className="space-y-4">
          <div className="rounded-xl border border-hairline bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={chipClass(diag.kind)}>{diag.verdictId.replace(/_/g, " ")}</span>
              <a
                className="font-mono text-xs text-accent hover:underline"
                href={`${EXPLORER_TX}${activeHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {activeHash?.slice(0, 18)}…{activeHash?.slice(-8)} ↗
              </a>
            </div>
            <h3 className="mt-3 text-lg font-bold text-ink">{diag.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink">{diag.explanation}</p>

            {diag.stats.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
                <table className="data-table">
                  <tbody>
                    {diag.stats.map((s) => (
                      <tr key={s.label}>
                        <td className="whitespace-nowrap font-semibold text-slate">{s.label}</td>
                        <td className="break-all font-mono text-xs text-ink">{s.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {diag.revertData && (
              <div className="mt-4">
                <p className="smallcaps mb-1">Revert payload (from replay)</p>
                <div className="code-block break-all font-mono text-xs">{diag.revertData}</div>
              </div>
            )}

            <div className="mt-4 rounded-xl bg-porcelain p-4">
              <p className="smallcaps mb-2">What to do next</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
                {diag.fixes.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>

            <p className="mt-3 text-xs text-slate">
              <span className="font-bold text-ink">Provenance: </span>
              {diag.provenance}
            </p>

            {diag.rawReceipt != null && (
              <div className="mt-3">
                <button
                  className="btn-outline !min-h-0 !px-3 !py-1.5 text-xs"
                  onClick={() => setShowRaw((v) => !v)}
                >
                  {showRaw ? "Hide raw receipt" : "Show raw receipt"}
                </button>
                {showRaw && (
                  <div className="code-block mt-2 max-h-72 overflow-auto whitespace-pre font-mono text-xs">
                    {JSON.stringify(diag.rawReceipt, null, 2)}
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="btn-outline" onClick={() => run(activeHash ?? "")}>
            Re-run diagnosis
          </button>
        </div>
      )}

      <p className="text-xs text-slate">
        Diagnosis engine mirrors the task's CLI agent{" "}
        <span className="font-mono">tasks/t25-dapp-support-agent/src/support_agent.py</span> and
        deepens it: intrinsic-gas shortfall, no-code-at-destination, early/late silent-revert
        heuristic, and a live <span className="font-mono">eth_estimateGas</span> retry suggestion
        for out-of-gas cases. Full evidence and transcripts live in the repo at{" "}
        <span className="font-mono">tasks/t25-dapp-support-agent/</span>.
      </p>
    </div>
  );
}
