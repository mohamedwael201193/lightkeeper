/**
 * T25 dApp Support Agent — Tier A (live reads).
 *
 * "Every failed tx, explained": paste ANY Pharos Atlantic tx hash (0x + 64 hex)
 * and the panel fetches the live transaction + receipt and runs a diagnosis
 * engine on it — out of gas, revert reasons decoded from an eth_call replay at
 * block−1 (Error(string), Panic(uint256), custom selectors — including for
 * reverted contract deployments, whose init code is replayed), silent reverts,
 * intrinsic-gas shortfalls, no-code-at-destination, native-balance shortfalls,
 * ERC-20 transferFrom allowance / token-balance shortfalls (read at block−1),
 * plus honest success / pending / not-found paths.
 *
 * The three preset hashes are the task's REAL mined Atlantic evidence txs,
 * copied character-for-character from tasks/t25-dapp-support-agent/evidence.json.
 * Unknown cases are reported as unknown with the raw receipt — never invented.
 *
 * Tier A only: plain JSON-RPC reads, no wallet, no signature, costs nothing.
 * LIGHTKEEPER never sees, holds, or asks for private keys.
 */
import { useState } from "react";
import { Wrench } from "lucide-react";
import type { Lamp } from "../../types";
import { ATLANTIC_RPC_URL, EXPLORER_TX, rpcCall } from "../../hooks/useAtlantic";
import { ErrorState, ProgressLoader, ResultCard } from "../ui";

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
    id: "allowance",
    label: "transferFrom — allowance too small",
    note: "block 31486989 · transferFrom of 1 SDT, 0 approved · allowance read at block−1",
    hash: "0x8e655c344f8d30ca23d8369eb2c6594d86acf3b07616ff7cfbe0cb6f51dadd01",
  },
  {
    id: "token-balance",
    label: "transferFrom — owner held too few tokens",
    note: "block 31487003 · transferFrom of 2,000 SDT, 10,000 approved, 1,000 held",
    hash: "0x9e1561f8ba0e8d3482707bd336a8d1d96f62a19a0cd08e7645b89f25ce9e0613",
  },
  {
    id: "constructor",
    label: "Constructor reverted",
    note: "block 31487042 · constructor reverted with reason · init code replayed",
    hash: "0x1e70dc673ec96753bf6c45962186a4586db0b663c0ff81912707d53958f4e167",
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

const SEL_TRANSFERFROM = "0x23b872dd"; // transferFrom(address,address,uint256)
const SEL_ALLOWANCE = "0xdd62ed3e"; // allowance(address,address)
const SEL_BALANCEOF = "0x70a08231"; // balanceOf(address)

/** 20-byte address → 32-byte ABI word (lowercase hex, no 0x prefix). */
function padAddr(a: string): string {
  return a.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}

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

/** Diagnosis engine entry — exported for the live-chain test harness. */
export async function diagnose(
  hash: string,
  /**
   * Presentation hook only: fires 0 → "Reading the transaction",
   * 1 → "Reading the receipt", 2 → "Diagnosing the failure" as each real
   * RPC phase starts. Never affects the verdict or its evidence.
   */
  onStep?: (phase: number) => void
): Promise<Diagnosis> {
  onStep?.(0);
  const tx = (await rpcCall("eth_getTransactionByHash", [hash])) as TxLike | null;
  onStep?.(1);
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
  onStep?.(2);
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

  // (c) parallel evidence: code at destination, balance pre-check, replay,
  // plus ERC-20 transferFrom pre-condition reads (allowance + token balance).
  // The replay also covers contract creation: eth_call with the init code and
  // no `to` reproduces a constructor revert.
  const inputLower = (t.input ?? "0x").toLowerCase();
  // calldata layout (with 0x prefix): selector[2:10] owner-word[10:74]
  // spender-word[74:138] amount-word[138:202]
  const isTransferFrom =
    !!t.to && inputLower.startsWith(SEL_TRANSFERFROM) && inputLower.length >= 202;
  const tfOwner = isTransferFrom ? "0x" + inputLower.slice(10, 74).slice(-40) : null;
  const tfAmount = isTransferFrom ? hexToBigInt("0x" + inputLower.slice(138, 202)) : 0n;

  const [codeRes, balRes, replayRes, allowRes, tokBalRes] = await Promise.allSettled([
    t.to ? rpcCall("eth_getCode", [t.to, blockMinus1]) : Promise.resolve("0x"),
    t.value && hexToBigInt(t.value) > 0n
      ? rpcCall("eth_getBalance", [t.from, blockMinus1])
      : Promise.resolve(null),
    t.input && t.input !== "0x"
      ? replayCall(
          t.to
            ? { from: t.from, to: t.to, data: t.input, value: t.value }
            : { from: t.from, data: t.input, value: t.value },
          blockMinus1
        )
      : Promise.resolve({ ok: false as const, data: null, message: "no calldata to replay" }),
    isTransferFrom && tfOwner
      ? rpcCall("eth_call", [
          { to: t.to, data: SEL_ALLOWANCE + padAddr(tfOwner) + padAddr(t.from) },
          blockMinus1,
        ])
      : Promise.resolve(null),
    isTransferFrom && tfOwner
      ? rpcCall("eth_call", [{ to: t.to, data: SEL_BALANCEOF + padAddr(tfOwner) }, blockMinus1])
      : Promise.resolve(null),
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

  // (d2) transferFrom with insufficient allowance or owner token balance.
  // The token contract rejected the call before any logic ran; the reads at
  // block-1 name the exact shortfall. (Mirrors the CLI agent's Branch C.)
  if (isTransferFrom && tfOwner && code !== null && code !== "0x") {
    const allowance =
      allowRes.status === "fulfilled" && allowRes.value ? hexToBigInt(String(allowRes.value)) : null;
    const tokenBal =
      tokBalRes.status === "fulfilled" && tokBalRes.value ? hexToBigInt(String(tokBalRes.value)) : null;
    if (allowance !== null && tfAmount > allowance) {
      return {
        kind: "failure",
        verdictId: "insufficient_allowance",
        title: "transferFrom rejected — allowance too small",
        explanation: `At the block before this transaction, ${tfOwner} had approved this sender for ${fmtInt(allowance)} token units, but the transferFrom tried to move ${fmtInt(tfAmount)} — a shortfall of ${fmtInt(tfAmount - allowance)} units. The token contract refused before moving anything; the fee was still paid.`,
        fixes: [
          `From the OWNER's wallet, call approve(sender, at least ${fmtInt(tfAmount)}) on the token contract first — approvals must come from the token holder, not the spender.`,
          "Then resend the transferFrom unchanged; the gas settings were fine.",
          "Beware stale approvals: an earlier approve() for a smaller amount does not stack — the latest approval is the whole allowance.",
        ],
        provenance: "READ FROM CHAIN — allowance(owner, spender) and balanceOf(owner) read via eth_call at block−1.",
        stats,
        revertData: null,
        rawReceipt: r,
      };
    }
    if (tokenBal !== null && tfAmount > tokenBal) {
      return {
        kind: "failure",
        verdictId: "insufficient_token_balance",
        title: "transferFrom rejected — owner held too few tokens",
        explanation: `The allowance was sufficient, but at the block before this transaction the owner ${tfOwner} held only ${fmtInt(tokenBal)} token units while the transferFrom tried to move ${fmtInt(tfAmount)} — a shortfall of ${fmtInt(tfAmount - tokenBal)} units. The token contract refused; the fee was still paid.`,
        fixes: [
          "Reduce the transfer amount to what the owner actually holds, or fund the owner with more tokens first.",
          "Then resend the transferFrom — no approval change is needed since the allowance already covered the amount.",
        ],
        provenance: "READ FROM CHAIN — balanceOf(owner) read via eth_call at block−1; allowance already covered the amount.",
        stats,
        revertData: null,
        rawReceipt: r,
      };
    }
  }

  // (e) call into an address with no code: wrong address, or contract gone.
  // Guarded on t.to — contract creation has no destination by definition.
  if (t.to && code !== null && code === "0x" && t.input !== "0x") {
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

  // (f) replay decoded revert data — calls only; contract creation is
  // handled by (h) below, which frames the same payload as a deployment.
  if (t.to && revertPayload) {
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

  // (h) constructor revert (contract creation). The replay above ran the init
  // code, so a reverting constructor often yields decodable data too.
  // Placed before the silent branch: a failed deployment is never "silent".
  if (!t.to) {
    if (revertPayload) {
      const reason = decodeErrorString(revertPayload);
      if (reason !== null) {
        return {
          kind: "failure",
          verdictId: "revert_constructor_reason",
          title: "Deployment reverted with a reason",
          explanation: `The constructor rejected the deployment and explained itself: "${reason}". No contract was created at any address, and the ${weiToPhrs(gasUsed * price)} PHRS gas was still paid.`,
          fixes: [
            `Fix whatever the reason names — "${reason}" — then redeploy with the same gas settings.`,
            "Simulate the deployment locally first (forge script against a fork) so constructor reverts surface before they cost gas.",
          ],
          provenance: "READ FROM CHAIN — constructor revert reason decoded from an eth_call replay of the init code at block−1 (Error(string)).",
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
          verdictId: "revert_constructor_panic",
          title: `Deployment hit Solidity panic ${panicHex} — ${meaning}`,
          explanation: `The constructor hit a Solidity panic (${panicHex}): ${meaning}. The deployment was rolled back — no contract exists — and the gas was still paid.`,
          fixes: [
            "Check the constructor's arithmetic and array access against the deployed arguments — panics fire on violated invariants, not bad gas.",
            "Simulate the deployment locally first so constructor panics surface before they cost gas.",
          ],
          provenance: "READ FROM CHAIN — Panic(uint256) decoded from an eth_call replay of the init code at block−1. Code meanings are INFERENCE from standard EVM semantics.",
          stats,
          revertData: revertPayload,
          rawReceipt: r,
        };
      }
      const selector = revertPayload.slice(0, 10);
      return {
        kind: "failure",
        verdictId: "revert_constructor_custom",
        title: `Deployment reverted — custom error ${selector}`,
        explanation: `The constructor reverted with a custom error whose selector is ${selector}. No contract was created, and the gas was still paid. The error name lives in the contract source, which this panel cannot read from the chain.`,
        fixes: [
          `Look up ${selector} in the contract source to get the error name, then fix the constructor inputs it guards.`,
          "Simulate the deployment locally first so constructor reverts surface before they cost gas.",
        ],
        provenance: "READ FROM CHAIN — raw revert payload from an eth_call replay of the init code at block−1; selector reported, never invented.",
        stats,
        revertData: revertPayload,
        rawReceipt: r,
      };
    }
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

  // (g) silent revert: no payload at all. (Only reachable for calls now —
  // contract creation is handled above.)
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
/* Component — presentation rebuilt on the LIGHTKEEPER standard.       */
/* 01 Configure (hash + real mined presets) → 02 Run (ProgressLoader,  */
/* one step per real RPC phase) → 03 Result (ResultCard showpiece:     */
/* the named root cause as the headline, the evidence as elegant rows, */
/* the fix as a callout). The diagnosis engine above is untouched.     */
/* ------------------------------------------------------------------ */

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** ProgressLoader phases — one entry per real async phase in diagnose(). */
const STEPS = ["Reading the transaction", "Reading the receipt", "Diagnosing the failure"];

/** The named root cause, short enough to fit two lines at 390px. */
const HEADLINES: Record<string, string> = {
  not_found: "No such transaction on Atlantic",
  pending_or_dropped: "Broadcast — not yet mined",
  success: "Confirmed — executed successfully",
  intrinsic_gas_too_low: "Gas limit below the 21,000 minimum",
  out_of_gas: "Out of gas",
  insufficient_balance: "Sender couldn't cover value + fee",
  insufficient_allowance: "transferFrom rejected — allowance too small",
  insufficient_token_balance: "transferFrom rejected — owner held too few tokens",
  no_code_at_destination: "No contract at the destination",
  revert_with_reason: "Contract reverted — with a reason",
  revert_panic: "Solidity panic",
  revert_custom: "Custom error",
  revert_constructor_reason: "Deployment reverted — with a reason",
  revert_constructor_panic: "Deployment hit a Solidity panic",
  revert_constructor_custom: "Deployment reverted — custom error",
  revert_constructor: "Contract deployment reverted",
  revert_silent: "Silent revert — no reason given",
  unknown: "Unknown cause — raw receipt below",
};

function statusOf(kind: VerdictKind): "pass" | "fail" | "neutral" {
  if (kind === "success") return "pass";
  if (kind === "failure") return "fail";
  return "neutral";
}

function shortAddr(v: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(v) ? `${v.slice(0, 10)}…${v.slice(-6)}` : v;
}

/** Raw RPC/network errors never reach the user — translate before rendering. */
function translateError(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/HTTP \d+/.test(m)) return m; // already plain-language from the hardened RPC layer
  if (/timed out|timeout/i.test(m))
    return "The Atlantic RPC stopped responding before the diagnosis finished — retry in a moment.";
  if (/fetch|network|Failed/i.test(m))
    return "Your connection couldn't reach the Atlantic RPC — check you're online and retry.";
  return m || "The Atlantic RPC did not answer — retry in a moment.";
}

export default function TrySupport({ lamp }: { lamp: Lamp }) {
  const [input, setInput] = useState("");
  const [activeHash, setActiveHash] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [touched, setTouched] = useState(false);
  const [copied, setCopied] = useState(false);

  const valid = HASH_RE.test(input.trim());

  const run = async (hash: string) => {
    const h = hash.trim();
    setTouched(true);
    if (!HASH_RE.test(h)) return;
    setLoading(true);
    setError(null);
    setDiag(null);
    setShowRaw(false);
    setCopied(false);
    setStep(0);
    setActiveHash(h);
    try {
      setDiag(await diagnose(h, (s) => setStep(s)));
    } catch (e) {
      setError(translateError(e));
    } finally {
      setLoading(false);
    }
  };

  const copySummary = async () => {
    if (!diag || !activeHash) return;
    const text =
      `${diag.title}\n\n${diag.explanation}\n\nWhat to do next:\n` +
      diag.fixes.map((f) => `- ${f}`).join("\n") +
      `\n\nProvenance: ${diag.provenance}\nExplorer: ${EXPLORER_TX}${activeHash}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const rows =
    diag?.stats.map((s) => ({
      label: s.label,
      value: <span title={s.value}>{shortAddr(s.value)}</span>,
    })) ?? [];

  return (
    <div className="space-y-6">
      {/* 01 — Configure */}
      <section aria-label="Configure the diagnosis">
        <p className="text-sm font-semibold text-slate mb-3">01 · Configure — the transaction to diagnose</p>

        <div className="rounded-2xl border border-hairline bg-porcelain p-4 sm:p-5">
          <p className="text-sm leading-relaxed text-ink">
            <strong>{lamp.name}</strong>: every failed tx, explained. Paste{" "}
            <strong>any</strong> Pharos Atlantic transaction hash — a preset
            below or <strong>your own failed transaction</strong> — and get a
            plain-language diagnosis with the receipt to prove it.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            Live JSON-RPC reads against Atlantic (chain 688689). No wallet, no
            signature, costs nothing. Unknown cases say "unknown" and show the
            raw receipt — nothing is invented.
          </p>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-semibold text-slate" htmlFor="t25-hash">
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
            <button
              className="btn-primary min-h-[44px] shrink-0"
              onClick={() => run(input)}
              disabled={loading}
            >
              {loading ? "Diagnosing…" : "Diagnose"}
            </button>
          </div>
          {touched && input.trim() !== "" && !valid && (
            <p className="mt-2 text-sm text-fail">
              That doesn't look like a tx hash — expected 0x followed by exactly
              64 hex characters.
            </p>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-slate">
            Try a real failure — mined on Atlantic
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
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
                  {p.hash.slice(0, 12)}…{p.hash.slice(-8)}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate">{p.note}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 02 — Run */}
      {loading && (
        <section aria-label="Diagnosis in progress">
          <p className="text-sm font-semibold text-slate mb-3">02 · Run</p>
          <ProgressLoader
            steps={STEPS}
            current={step}
            title={`Diagnosing ${activeHash?.slice(0, 14)}…${activeHash?.slice(-6)}`}
          />
        </section>
      )}

      {error && !loading && (
        <section aria-label="Diagnosis failed">
          <p className="text-sm font-semibold text-slate mb-3">02 · Run</p>
          <ErrorState
            title="Couldn't read Atlantic"
            message={error}
            hint="This panel only reads the chain — nothing was signed and nothing was spent."
            retryLabel="Retry"
            onRetry={activeHash ? () => run(activeHash) : undefined}
          />
        </section>
      )}

      {/* 03 — Result */}
      {diag && !loading && !error && activeHash && (
        <section aria-label="Diagnosis result">
          <p className="text-sm font-semibold text-slate mb-3">03 · Result</p>

          <ResultCard
            eyebrow="Diagnosis — Pharos Atlantic"
            headline={HEADLINES[diag.verdictId] ?? diag.title}
            subline={diag.explanation}
            rows={rows}
            links={[
              { label: "View on the Atlantic explorer", href: `${EXPLORER_TX}${activeHash}` },
            ]}
            copyValue={activeHash}
            status={statusOf(diag.kind)}
          >
            {/* The fix, as a callout */}
            <div className="rounded-xl border-l-4 border-accent bg-tint p-4 sm:p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <Wrench size={16} className="shrink-0 text-accent" aria-hidden />
                What to do next
              </p>
              <ol className="mt-2 space-y-1.5">
                {diag.fixes.map((f, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink">
                    <span className="font-bold text-accent" aria-hidden>
                      {i + 1}.
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
            </div>

            {diag.revertData && (
              <div className="mt-5">
                <p className="mb-1.5 text-sm font-semibold text-slate">
                  Revert payload (from replay)
                </p>
                <div className="break-all rounded-xl border border-hairline bg-porcelain p-3 font-mono text-xs leading-relaxed text-ink">
                  {diag.revertData}
                </div>
              </div>
            )}

            <p className="mt-5 text-xs leading-relaxed text-slate">
              <span className="font-bold text-ink">Provenance: </span>
              {diag.provenance}
            </p>

            {diag.rawReceipt != null && (
              <div className="mt-3">
                <button
                  type="button"
                  className="btn-outline !min-h-0 !px-3 !py-1.5 text-xs"
                  onClick={() => setShowRaw((v) => !v)}
                >
                  {showRaw ? "Hide raw receipt" : "Show raw receipt"}
                </button>
                {showRaw && (
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre rounded-xl border border-hairline bg-porcelain p-3 font-mono text-xs leading-relaxed text-ink">
                    {JSON.stringify(diag.rawReceipt, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </ResultCard>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-outline" onClick={() => run(activeHash)}>
              Re-run diagnosis
            </button>
            <button type="button" className="btn-outline" onClick={copySummary}>
              {copied ? "Copied to clipboard" : "Copy plain-language summary"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
