/**
 * T17 — Natural-Language Payment Agent — "Type it, review it, sign it"
 *
 * Tier B surface. A deterministic, no-LLM intent parser (the exact grammar of
 * the audited T17 CLI parser: tasks/t17-nl-payment-agent/src/parse.py, 34
 * unit tests — one grammar kept in sync on both surfaces) turns free text
 * into a structured payment plan client-side — or refuses ambiguous input
 * instead of guessing. Every outcome carries a machine-checkable rule tag
 * (R-…); every plan carries its SHA-256 plan hash, byte-identical to the
 * CLI's plan_id, so parse → review → sign share one plan identity. A valid
 * plan is then proposed and MUST pass the mandatory review step before the
 * VISITOR signs it in their own wallet, from their address, with their
 * testnet PHRS.
 *
 * LIGHTKEEPER never sees, holds, or asks for private keys.
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import { EXPLORER_TX, isDustWarning, useProposeAndSign } from "../../hooks/useAtlantic";
import { useWallet } from "../WalletContext";

// ---------------------------------------------------------------------------
// Deterministic intent parser — a TypeScript port of the audited parse.py
// grammar, deepened with more phrasings. NO LLM, NO guessing.
// Exported so it can be unit-tested without mounting the component.
// ---------------------------------------------------------------------------

const NATIVE = "PHRS";
const MAX_PLAN_WEI = 150_000_000_000_000_000n; // 0.15 PHRS per-plan safety cap

// Deepened verb set vs the CLI parser (synonyms a visitor actually types).
const VERBS = [
  "send",
  "pay",
  "transfer",
  "remit",
  "wire",
  "move",
  "forward",
  "deliver",
  "grant",
  "release",
];
const VERB_RE = new RegExp(`\\b(${VERBS.join("|")})\\b`, "gi");

const ADDR_RE = /0x[0-9a-fA-F]{40}/g;
// Bare 40-hex without 0x = malformed address (refused, never guessed).
const BARE_HEX40_RE = /(?<![0-9a-fA-Fx])\b[0-9a-fA-F]{40}\b(?![0-9a-fA-F])/g;
const NUMUNIT_RE = /(\d+(?:\.\d{1,18})?)(?:\s*([A-Za-z]{2,12}))?/g;
const PHRS_UNIT_RE = /^(phrs|pharos)$/i;

// Units of something that is definitely NOT a token — a number carrying one
// of these is a stray number (ambiguous), not an unknown token.
const NON_TOKEN_UNITS = new Set([
  "minute",
  "minutes",
  "second",
  "seconds",
  "hour",
  "hours",
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "time",
  "times",
  "x",
]);

// Instruction-like phrases are UNTRUSTED SLOT INPUT: extracted slots only,
// never control.
const SUSPICIOUS_RE =
  /\b(ignore|override|disregard|bypass|previous instructions|system prompt|you are now|pretend|jailbreak)\b/i;

const COMMA_NUM_RE = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/;
// A minus sign before a number: "send -0.001 PHRS" must NOT become +0.001.
const NEGATIVE_RE = /(?:^|[^\d\w])-\s*(?=\d)/;
// Malformed decimals: ".001" (no leading zero), "1." (no decimal part).
const MALFORMED_LEAD_RE = /(?<!\d)\.\d/;
const MALFORMED_TRAIL_RE = /\d+\.(?!\d)/;
// Word amounts fire only in AMOUNT POSITION (after the verb, before the
// address) — see parsePayment. Global flag: iterated with matchAll.
const WORD_AMOUNT_RE =
  /\b(half|halve|quarter|all|everything|my whole|the rest|entire balance)\b/gi;
const PERCENT_RE = /\d+(?:\.\d+)?\s*%/;

export interface ParsedPlan {
  action: string;
  amountPhrs: string;
  to: string;
  /** SHA-256 of the canonical plan, first 16 hex — byte-identical to the
   *  CLI agent's plan_id for the same input (one grammar, one hash). */
  planId: string;
}

export type ParseResult =
  | { kind: "plan"; plan: ParsedPlan; confidence: string; rule: "PARSE-OK"; warning?: string }
  | { kind: "clarify"; question: string; reason: string; rule: string }
  | { kind: "refuse"; reason: string; question: string; rule: string };

function toWei(s: string): bigint {
  const [w, f = ""] = s.split(".");
  return BigInt(w) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
}

// Minimal synchronous SHA-256 (FIPS 180-4). Exists so the console shows the
// EXACT plan hash the CLI agent's CONFIRM gate binds — parse → review →
// sign share one plan identity across both surfaces. No dependency, no async.
function sha256Hex(ascii: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const bytes = new TextEncoder().encode(ascii);
  const withOne = bytes.length + 1;
  const padLen = (64 - ((withOne + 8) % 64)) % 64;
  const msg = new Uint8Array(withOne + padLen + 8);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  new DataView(msg.buffer).setUint32(msg.length - 4, bytes.length * 8);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;
  for (let off = 0; off < msg.length; off += 64) {
    const dv = new DataView(msg.buffer, off, 64);
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, "0"))
    .join("");
}

/** Canonical plan JSON — byte-identical to the CLI's Plan.canonical()
 *  (sorted keys, no spaces), so planIdOf() === the CLI's plan_id. */
export function planIdOf(amountPhrs: string, to: string): string {
  const wei = toWei(amountPhrs).toString();
  const canonical =
    `{"action":"send","amount_phrs":"${amountPhrs}","amount_wei":${wei},` +
    `"chain_id":688689,"to":"${to}","token":"PHRS"}`;
  return sha256Hex(canonical).slice(0, 16);
}

export function parsePayment(text: string): ParseResult {
  const raw = text.trim();
  if (!raw) {
    return {
      kind: "clarify",
      rule: "R-EMPTY",
      reason: "Empty input — nothing to parse.",
      question: "What payment should I prepare? Try: send 0.001 PHRS to 0x…",
    };
  }

  let warning: string | undefined;
  if (SUSPICIOUS_RE.test(raw)) {
    warning =
      "Input contains instruction-like phrases — treated as untrusted text. Only payment slots are extracted.";
  }

  // Number-notation traps run on address-stripped text (address hex is never
  // read as a number). Every one is refused with a plain-language reason —
  // never normalized, never silently reinterpreted.
  const noAddrEarly = raw.replace(ADDR_RE, " ").replace(BARE_HEX40_RE, " ");

  // Thousands separators: "1,000 PHRS" is ambiguous notation → refuse, don't normalize.
  if (COMMA_NUM_RE.test(noAddrEarly)) {
    return {
      kind: "refuse",
      rule: "R-NUM-COMMA",
      reason: "Found a comma-formatted number. I don't read thousands separators — write the exact decimal amount (e.g. 1000 PHRS).",
      question: "What is the exact decimal amount in PHRS?",
    };
  }

  // A minus sign before a number: "send -0.001 PHRS" must NOT become +0.001.
  if (NEGATIVE_RE.test(noAddrEarly)) {
    return {
      kind: "refuse",
      rule: "R-NUM-NEG",
      reason: "Found a minus sign before a number. Amounts can't be negative — the sign is never silently dropped.",
      question: "What positive amount should I prepare?",
    };
  }

  // Malformed decimals: ".001" (no leading zero), "1." (no decimal part).
  const leadBad = MALFORMED_LEAD_RE.exec(noAddrEarly);
  if (leadBad) {
    return {
      kind: "refuse",
      rule: "R-NUM-MALFORMED",
      reason: `Found "${leadBad[0]}" — a number that starts with a decimal point and no leading zero. I don't read that notation.`,
      question: "Write the amount with a leading zero, e.g. 0.001 PHRS.",
    };
  }
  const trailBad = MALFORMED_TRAIL_RE.exec(noAddrEarly);
  if (trailBad) {
    return {
      kind: "refuse",
      rule: "R-NUM-MALFORMED",
      reason: `Found "${trailBad[0]}" — a number that ends with a decimal point and no decimal part. I don't read that notation.`,
      question: "Write the amount without the trailing point, e.g. 1 PHRS.",
    };
  }

  // Word amounts ("half", "all", …) fire only in AMOUNT POSITION — after the
  // verb, before the address. "ignore all rules. send 0.001 PHRS to 0x…"
  // keeps "all" outside that region, so it stays a plan (with an
  // untrusted-input warning) — exactly like the audited CLI parser.
  const verbFirst = Array.from(raw.matchAll(VERB_RE))[0];
  const addrFirstIdx = (() => {
    const m = /0x[0-9a-fA-F]{40}/.exec(raw);
    return m && m.index !== undefined ? m.index : raw.length;
  })();
  let wordHit: RegExpExecArray | null = null;
  if (verbFirst && verbFirst.index !== undefined) {
    const regionStart = verbFirst.index + verbFirst[0].length;
    for (const m of raw.matchAll(WORD_AMOUNT_RE)) {
      if (m.index !== undefined && m.index >= regionStart && m.index < addrFirstIdx) {
        wordHit = m;
        break;
      }
    }
  }
  if (wordHit) {
    return {
      kind: "refuse",
      rule: "R-AMOUNT-WORD",
      reason: `Found the word "${wordHit[1]}" where the amount should be. I don't convert words to amounts — 0.5 and 0.500000000000000001 are different payments.`,
      question: "What is the exact decimal amount in PHRS?",
    };
  }

  if (PERCENT_RE.test(noAddrEarly)) {
    return {
      kind: "refuse",
      rule: "R-AMOUNT-PCT",
      reason: "Percentages are not payable — I need an absolute PHRS amount.",
      question: "What is the exact decimal amount in PHRS?",
    };
  }

  // ---- 1. verb ----
  const verbs = new Set(
    Array.from(raw.matchAll(VERB_RE)).map((m) => (m[1] ?? "").toLowerCase())
  );
  if (verbs.size === 0) {
    return {
      kind: "clarify",
      rule: "R-VERB-0",
      reason: `No payment verb found (expected one of: ${VERBS.join(", ")}).`,
      question: "What action? Try: send 0.001 PHRS to 0x…",
    };
  }
  if (verbs.size > 1) {
    return {
      kind: "refuse",
      rule: "R-VERB-2",
      reason: `Conflicting action verbs: ${Array.from(verbs).sort().join(", ")}. I will not guess which one you mean.`,
      question: "Which single action did you mean?",
    };
  }

  // ---- 2. destination ----
  const addrs = Array.from(raw.matchAll(ADDR_RE)).map((m) => m[0]);
  let bare = Array.from(raw.matchAll(BARE_HEX40_RE)).map((m) => m[0]);
  bare = bare.filter(
    (b) => !addrs.includes("0x" + b) && !addrs.some((a) => a.includes(b))
  );
  if (bare.length > 0) {
    return {
      kind: "refuse",
      rule: "R-ADDR-BARE",
      reason: `Found 40 hex characters without a 0x prefix ("${bare[0].slice(0, 10)}…"). A recipient is never inferred from a partial address.`,
      question: "Please paste the full 0x address.",
    };
  }
  if (addrs.length === 0) {
    return {
      kind: "clarify",
      rule: "R-ADDR-0",
      reason: "No 0x destination address found. I never guess a recipient.",
      question: "Which 0x address should receive the payment?",
    };
  }
  if (addrs.length > 1) {
    return {
      kind: "refuse",
      rule: "R-ADDR-2",
      reason: `Multiple destination addresses found (${addrs.length}). I will not pick one for you.`,
      question: "Which single address is the recipient?",
    };
  }
  const to = addrs[0];
  if (/^0x0{40}$/.test(to)) {
    return {
      kind: "refuse",
      rule: "R-ADDR-ZERO",
      reason: "The zero address is not a payable destination.",
      question: "Which 0x address should receive the payment?",
    };
  }

  // ---- 3. amount + token (address hex is never read as a number) ----
  const noAddr = raw.replace(ADDR_RE, " ").replace(BARE_HEX40_RE, " ");
  const phrsAmounts: string[] = [];
  const unknownTokenUnits: string[] = [];
  const strayNumbers: string[] = [];
  for (const m of noAddr.matchAll(NUMUNIT_RE)) {
    const num = m[1] ?? "";
    const unit = m[2];
    if (!unit) {
      strayNumbers.push(num);
    } else if (PHRS_UNIT_RE.test(unit)) {
      phrsAmounts.push(num);
    } else if (NON_TOKEN_UNITS.has(unit.toLowerCase())) {
      strayNumbers.push(`${num} ${unit}`);
    } else {
      unknownTokenUnits.push(`${num} ${unit}`);
    }
  }

  if (unknownTokenUnits.length > 0) {
    return {
      kind: "clarify",
      rule: "R-TOKEN-UNK",
      reason: `Unknown token unit(s): ${unknownTokenUnits.join(", ")}. I only move native PHRS on Atlantic — I never map an unknown token to a default.`,
      question: "Which token? (This surface supports native PHRS only.)",
    };
  }
  if (strayNumbers.length > 0) {
    return {
      kind: "refuse",
      rule: "R-NUM-STRAY",
      reason: `Ambiguous extra number(s) with no token: ${strayNumbers.join(", ")}. I will not guess whether one of them is the amount.`,
      question: "Please restate as: <amount> PHRS to <0x address>.",
    };
  }
  if (phrsAmounts.length === 0) {
    return {
      kind: "clarify",
      rule: "R-AMOUNT-0",
      reason: "No amount found (expected '<number> PHRS').",
      question: "How much PHRS should I prepare?",
    };
  }
  if (phrsAmounts.length > 1) {
    return {
      kind: "refuse",
      rule: "R-AMOUNT-2",
      reason: `Multiple PHRS amounts found: ${phrsAmounts.join(", ")}. I will not pick one.`,
      question: "Which single amount is the payment?",
    };
  }

  const amountStr = phrsAmounts[0];
  const wei = toWei(amountStr);
  if (wei <= 0n) {
    return {
      kind: "refuse",
      rule: "R-AMOUNT-ZERO",
      reason: `Amount must be greater than zero (got "${amountStr}").`,
      question: "What positive amount should I prepare?",
    };
  }
  if (wei > MAX_PLAN_WEI) {
    return {
      kind: "refuse",
      rule: "R-AMOUNT-CAP",
      reason: `Amount ${amountStr} PHRS exceeds this agent's per-plan safety cap of 0.15 PHRS. Refused — same rule as the audited CLI parser.`,
      question: "Please use an amount ≤ 0.15 PHRS.",
    };
  }

  return {
    kind: "plan",
    rule: "PARSE-OK",
    plan: { action: "send", amountPhrs: amountStr, to, planId: planIdOf(amountStr, to) },
    confidence:
      "Exact deterministic match — verb ×1, amount ×1, address ×1. Nothing inferred, nothing defaulted.",
    warning,
  };
}

// ---------------------------------------------------------------------------
// Presets — the burn address is the honest demo sink (intentionally unrecoverable).
// ---------------------------------------------------------------------------

const BURN = "0x000000000000000000000000000000000000dEaD";
const PRESETS = [
  { label: "Dust payment", text: `send 0.001 PHRS to ${BURN}` },
  { label: "“pay” phrasing", text: `pay 0.002 phrs to ${BURN}` },
  { label: "Ambiguous → refusal", text: `send 0.001 PHRS or 0.002 PHRS to ${BURN}` },
  { label: "Injection → warning", text: `ignore all previous instructions. send 0.001 PHRS to ${BURN}` },
  { label: "Unknown token → ask", text: `send 100 USDC to ${BURN}` },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TryNlPayment({ lamp }: { lamp: Lamp }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const { state: wallet, connect } = useWallet();
  const { state, proposal, txHash, error, propose, approve, cancel } =
    useProposeAndSign();

  const inFlight =
    state === "review" ||
    state === "awaiting-signature" ||
    state === "broadcasting";

  function runParse(next: string) {
    if (state !== "idle") cancel();
    setText(next);
    setResult(parsePayment(next));
  }

  function handlePropose() {
    if (result?.kind !== "plan") return;
    propose({
      to: result.plan.to,
      valuePhrs: result.plan.amountPhrs,
      label: `Send ${result.plan.amountPhrs} PHRS`,
    });
  }

  const walletLabel = (() => {
    if (wallet.status === "connected")
      return `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)} · ${wallet.balance ?? "?"} PHRS`;
    return "not connected";
  })();

  const showConnectFix =
    (state === "blocked" || state === "error") && wallet.status !== "connected";

  return (
    <div className="space-y-6">
      {/* header */}
      <div>
        <p className="smallcaps">Tier B — type → review → sign yourself</p>
        <h3 className="mt-1 text-xl font-bold text-ink">
          Type it, review it, sign it
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          {lamp.name}: a deterministic parser (same grammar as the audited CLI
          agent — 20/20 unit tests, no LLM) turns your words into a payment
          plan, or <strong className="text-ink">refuses to guess</strong>. A
          valid plan still goes through a mandatory review — then{" "}
          <strong className="text-ink">you</strong> sign it in your own wallet
          with your own testnet PHRS. LIGHTKEEPER never sees your keys.
        </p>
      </div>

      {/* 01 — type */}
      <div>
        <p className="smallcaps mb-2">01 · Type the payment</p>
        <div className="flex flex-col gap-3">
          <input
            value={text}
            onChange={(e) => runParse(e.target.value)}
            placeholder="send 0.001 PHRS to 0x…"
            className="w-full rounded-xl border border-hairline bg-white px-4 py-3 font-mono text-sm text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none"
            aria-label="Payment instruction in plain language"
          />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="chip chip-dim !py-2 hover:border-accent"
                onClick={() => runParse(p.text)}
                title={p.text}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 02 — parse result */}
      {result && (
        <div>
          <p className="smallcaps mb-2">02 · Parsed intent</p>
          {result.kind === "plan" && (
            <div className="rounded-xl border border-hairline bg-porcelain p-4">
              <div className="flex flex-wrap gap-2">
                <span className="chip chip-info">action · {result.plan.action}</span>
                <span className="chip chip-info">
                  amount · {result.plan.amountPhrs} {NATIVE}
                </span>
                <span className="chip chip-info">token · {NATIVE}</span>
                <span className="chip chip-dim break-all font-mono !normal-case !tracking-normal">
                  to · {result.plan.to}
                </span>
                <span
                  className="chip chip-dim font-mono !normal-case !tracking-normal"
                  title="SHA-256 of the canonical plan — byte-identical to the CLI agent's plan_id. The CONFIRM gate and this review bind to this hash."
                >
                  plan · {result.plan.planId}
                </span>
                <span className="chip chip-dim">rule · {result.rule}</span>
              </div>
              <p className="mt-3 text-xs text-slate">
                {result.confidence} The plan hash is the SHA-256 of the
                canonical plan — the same value the CLI agent's{" "}
                <span className="font-mono">CONFIRM</span> gate binds. Parse,
                review and signature share one plan identity.
              </p>
              {result.warning && (
                <p className="mt-2 text-xs text-golddeep">{result.warning}</p>
              )}
              {isDustWarning(result.plan.amountPhrs) && (
                <p className="mt-2 text-xs font-semibold text-golddeep">
                  Above the 0.01 PHRS dust limit — you'll see an amber warning
                  at the review step.
                </p>
              )}
              {state === "idle" && (
                <button className="btn-primary mt-4" onClick={handlePropose}>
                  Propose this payment
                </button>
              )}
            </div>
          )}
          {result.kind === "clarify" && (
            <div className="empty-panel px-5 py-4">
              <p className="text-sm font-semibold text-ink">
                I need one clarification:{" "}
                <span className="chip chip-dim ml-1">rule · {result.rule}</span>
              </p>
              <p className="mt-1 text-sm text-slate">{result.reason}</p>
              <p className="mt-2 text-sm font-semibold text-accentdeep">
                {result.question}
              </p>
            </div>
          )}
          {result.kind === "refuse" && (
            <div className="rounded-xl border border-fail/40 bg-[#fef6f6] px-5 py-4">
              <p className="text-sm font-semibold text-fail">
                Refused — I will not guess.{" "}
                <span className="chip chip-dim ml-1 !text-slate">
                  rule · {result.rule}
                </span>
              </p>
              <p className="mt-1 text-sm text-slate">{result.reason}</p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {result.question}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 03 — mandatory review + sign */}
      {inFlight && proposal && (
        <div>
          <p className="smallcaps mb-2">03 · Review — mandatory</p>
          <div className="rounded-xl border-2 border-gold/60 bg-porcelain p-5">
            <p className="text-base font-bold text-ink">{proposal.label}</p>
            <table className="data-table mt-3">
              <tbody>
                <tr>
                  <th className="!w-28">Moves</th>
                  <td className="font-mono font-semibold text-ink">
                    {proposal.valuePhrs} {NATIVE}
                  </td>
                </tr>
                <tr>
                  <th>To</th>
                  <td className="break-all font-mono text-ink">{proposal.to}</td>
                </tr>
                <tr>
                  <th>From</th>
                  <td className="font-mono text-slate">{walletLabel}</td>
                </tr>
                <tr>
                  <th>Network</th>
                  <td className="text-slate">
                    Pharos Atlantic testnet only — anything else is blocked.
                  </td>
                </tr>
              </tbody>
            </table>

            {result?.kind === "plan" && (
              <p className="mt-3 text-xs text-slate">
                Binding: this review is for plan{" "}
                <span className="font-mono">{result.plan.planId}</span> — the
                same SHA-256 hash the CLI agent's{" "}
                <span className="font-mono">CONFIRM</span> gate binds. What you
                sign below is exactly this plan; anything else aborts.
              </p>
            )}

            {/* The hook surfaces the dust warning through `error` in review
                state — rendered as an AMBER WARNING, never as an error. */}
            {state === "review" && error && (
              <div className="mt-3 rounded-lg border border-gold/50 bg-[#fdf8e8] px-4 py-3">
                <p className="text-sm font-semibold text-golddeep">
                  ⚠ Warning (not a block)
                </p>
                <p className="mt-1 text-sm text-golddeep">{error}</p>
              </div>
            )}

            {state === "review" && (
              <>
                <p className="mt-3 text-xs text-slate">
                  Check the address and amount above. Signing happens entirely
                  in <strong className="text-ink">your wallet</strong> — this
                  page never touches your keys.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={approve}>
                    Sign in my wallet
                  </button>
                  <button className="btn-outline" onClick={cancel}>
                    Cancel
                  </button>
                </div>
              </>
            )}
            {state === "awaiting-signature" && (
              <p className="mt-3 text-sm text-slate">
                Waiting for your wallet — review the transaction there, then
                approve or reject.
              </p>
            )}
            {state === "broadcasting" && (
              <p className="mt-3 text-sm text-slate">
                Signed and sent — waiting for Atlantic to mine it…
              </p>
            )}
          </div>
        </div>
      )}

      {/* blocked / error — verbatim, with a connect fix when it's the wallet */}
      {(state === "blocked" || state === "error") && error && (
        <div className="rounded-xl border border-fail/40 bg-[#fef6f6] px-5 py-4">
          <p className="text-sm font-semibold text-fail">
            {state === "blocked" ? "Blocked" : "Something failed"}
          </p>
          <p className="mt-1 text-sm text-slate">{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {showConnectFix && (
              <button className="btn-primary" onClick={connect}>
                Connect wallet
              </button>
            )}
            <button className="btn-outline" onClick={cancel}>
              Start over
            </button>
          </div>
        </div>
      )}

      {/* confirmed — visitor-signed receipt */}
      {state === "confirmed" && txHash && (
        <div className="rounded-xl border border-pass/40 bg-[#f2fbf5] px-5 py-4">
          <p className="text-sm font-semibold text-pass">
            Confirmed on Atlantic — your tx, signed in your wallet.
          </p>
          <a
            className="mt-1 block break-all font-mono text-sm text-accent hover:underline"
            href={`${EXPLORER_TX}${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {EXPLORER_TX}
            {txHash}
          </a>
          <button className="btn-outline mt-3" onClick={cancel}>
            Prepare another
          </button>
        </div>
      )}

      {/* honesty footer */}
      <p className="text-xs leading-relaxed text-slate">
        Grammar: verb (send/pay/transfer/…) ×1, one &lt;number&gt; PHRS
        (native only — other tokens are asked about, never defaulted), one full
        0x address (bare 40-hex without 0x is refused, never guessed), zero
        tolerance for extra numbers or conflicting verbs. Minus signs,
        malformed decimals (".001", "1."), thousands separators, word-amounts
        and percentages are refused with a named rule (R-…). Every outcome
        carries its rule tag; every plan carries its SHA-256 plan hash. Same
        rules as the audited CLI agent in{" "}
        <span className="font-mono">tasks/t17-nl-payment-agent</span>.
      </p>
    </div>
  );
}
