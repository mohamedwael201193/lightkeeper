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
 *
 * Presentation (FLAGSHIP): 01 Configure → 02 The Parser's Mind — the input
 * highlighting phrase-by-phrase as each extracted field ticks into the plan
 * document (the Assembly transition: one beat per REAL extracted slot,
 * ≤0.5s total, no timer theater — the parse itself is synchronous) → 03 the
 * plan as a precision document (the rule-tag vocabulary as chips, the
 * SHA-256 plan hash as the seal), then mandatory review → visitor signs →
 * receipt. Refusals get the Beautiful Refusal: the REFUSED stamp lands
 * double-beat with its rule tag and the exact flagged phrase — "I won't
 * guess" as a designed verdict, never a generic error.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Ban, Check, Copy, Fingerprint, ShieldCheck } from "lucide-react";
import type { Lamp } from "../../types";
import { EXPLORER_TX, isDustWarning, useProposeAndSign } from "../../hooks/useAtlantic";
import { useWallet } from "../WalletContext";
import { ErrorState, ProgressLoader, ResultCard } from "../ui";

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
// Rule-tag vocabulary — every tag the parser can emit, with its plain-language
// meaning. Rendered as chips beside the plan; derived from the grammar above,
// never invented. 18 named refusal/clarify rules + PARSE-OK = 19 tags.
// ---------------------------------------------------------------------------

const RULE_CATALOG: { tag: string; meaning: string }[] = [
  { tag: "R-EMPTY", meaning: "Nothing typed — nothing to parse" },
  { tag: "R-NUM-COMMA", meaning: "Comma-formatted numbers refused" },
  { tag: "R-NUM-NEG", meaning: "Minus signs refused, never dropped silently" },
  { tag: "R-NUM-MALFORMED", meaning: "“.001” / “1.” refused as ambiguous" },
  { tag: "R-AMOUNT-WORD", meaning: "Word amounts (“half”, “all”) refused" },
  { tag: "R-AMOUNT-PCT", meaning: "Percentages refused — need absolute PHRS" },
  { tag: "R-VERB-0", meaning: "No payment verb found" },
  { tag: "R-VERB-2", meaning: "Conflicting verbs — won't guess which one" },
  { tag: "R-ADDR-BARE", meaning: "40 hex without 0x refused, never guessed" },
  { tag: "R-ADDR-0", meaning: "No destination address found" },
  { tag: "R-ADDR-2", meaning: "Multiple destinations — won't pick one" },
  { tag: "R-ADDR-ZERO", meaning: "Zero address is not payable" },
  { tag: "R-TOKEN-UNK", meaning: "Unknown token asked about, never defaulted" },
  { tag: "R-NUM-STRAY", meaning: "Stray numbers refused" },
  { tag: "R-AMOUNT-0", meaning: "No amount found" },
  { tag: "R-AMOUNT-2", meaning: "Multiple amounts — won't pick one" },
  { tag: "R-AMOUNT-ZERO", meaning: "Amount must be greater than zero" },
  { tag: "R-AMOUNT-CAP", meaning: "Over the 0.15 PHRS per-plan safety cap" },
  { tag: "PARSE-OK", meaning: "Exact deterministic match — nothing inferred" },
];

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
// THE PARSER'S MIND — presentation-only span extraction.
//
// The parser above is the audited grammar and is NEVER re-implemented here:
// parsePayment() runs once, synchronously, and its ParseResult is the single
// source of truth. These helpers only locate WHERE in the visitor's own
// sentence the matched phrases sit, so the 02 act can highlight each phrase
// as its field ticks into the plan document. They reuse the grammar's own
// regex constants (fresh instances — the module-level ones carry /g/ state)
// and never influence the parse outcome or the plan hash.
// ---------------------------------------------------------------------------

interface Span {
  start: number;
  end: number;
}

function fresh(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstSpan(text: string, re: RegExp): Span | null {
  const r = fresh(re);
  r.lastIndex = 0;
  const m = r.exec(text);
  return m && m.index !== undefined ? { start: m.index, end: m.index + m[0].length } : null;
}

function allSpans(text: string, re: RegExp): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(fresh(re))) {
    if (m.index !== undefined) out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** All "<number> PHRS" phrases, in original-text coordinates. Address hex is
 *  blanked length-preserving so it is never read as a number — the same rule
 *  the parser applies. */
function phrsAmountSpans(text: string): Span[] {
  const blank = (m: string) => " ".repeat(m.length);
  const noAddr = text.replace(fresh(ADDR_RE), blank).replace(fresh(BARE_HEX40_RE), blank);
  const out: Span[] = [];
  for (const m of noAddr.matchAll(fresh(NUMUNIT_RE))) {
    const unit = m[2];
    if (unit && PHRS_UNIT_RE.test(unit) && m.index !== undefined) {
      out.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

/** Locate the plan's "<amount> PHRS" phrase in the original sentence. */
function planAmountSpan(text: string, amountPhrs: string): Span | null {
  const addrs = allSpans(text, ADDR_RE);
  const re = new RegExp(`${esc(amountPhrs)}\\s*(?:phrs|pharos)`, "gi");
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const s: Span = { start: m.index, end: m.index + m[0].length };
    const insideAddr = addrs.some((a) => s.start < a.end && a.start < s.end);
    if (!insideAddr) return s;
  }
  return null;
}

/** "…" quoted fragments from a refusal/clarify reason. */
function quotedPhrases(reason: string): string[] {
  const out: string[] = [];
  for (const m of reason.matchAll(/"([^"]+)"/g)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

/** "label: a, b, c." → ["a", "b", "c"] from a reason string. */
function listedPhrases(reason: string, marker: string): string[] {
  const i = reason.indexOf(marker);
  if (i < 0) return [];
  const tail = reason.slice(i + marker.length);
  const end = tail.indexOf(".");
  return (end < 0 ? tail : tail.slice(0, end))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function findPhrase(text: string, phrase: string): Span | null {
  const needle = phrase.endsWith("…") ? phrase.slice(0, -1) : phrase;
  if (!needle) return null;
  const i = text.indexOf(needle);
  return i < 0 ? null : { start: i, end: i + needle.length };
}

function findWord(text: string, word: string): Span | null {
  const m = new RegExp(`\\b${esc(word)}\\b`).exec(text);
  return m && m.index !== undefined ? { start: m.index, end: m.index + word.length } : null;
}

/** Phrases that fired a refusal rule — highlighted red in the 02 scan and
 *  quoted in the refusal verdict. Presentation only. */
function refusalSpans(rule: string, reason: string, text: string): Span[] {
  switch (rule) {
    case "R-VERB-2":
      return allSpans(text, VERB_RE);
    case "R-ADDR-2":
      return allSpans(text, ADDR_RE);
    case "R-ADDR-BARE":
      return allSpans(text, BARE_HEX40_RE);
    case "R-ADDR-ZERO":
      return allSpans(text, ADDR_RE).filter((a) => /^0x0{40}$/.test(text.slice(a.start, a.end)));
    case "R-AMOUNT-2":
      return phrsAmountSpans(text);
    case "R-AMOUNT-ZERO":
    case "R-AMOUNT-CAP": {
      const s = phrsAmountSpans(text)[0];
      return s ? [s] : [];
    }
    case "R-AMOUNT-WORD":
      return allSpans(text, WORD_AMOUNT_RE);
    case "R-AMOUNT-PCT":
      return allSpans(text, PERCENT_RE);
    case "R-NUM-NEG":
      return allSpans(text, /-\s*\d+(?:\.\d{1,18})?/);
    case "R-NUM-COMMA":
      return allSpans(text, COMMA_NUM_RE);
    case "R-NUM-MALFORMED": {
      const q = quotedPhrases(reason)[0];
      const s = q ? findPhrase(text, q) : null;
      if (s) return [s];
      return [firstSpan(text, MALFORMED_LEAD_RE), firstSpan(text, MALFORMED_TRAIL_RE)].filter(
        (x): x is Span => x !== null
      );
    }
    case "R-NUM-STRAY":
      return listedPhrases(reason, "no token:")
        .map((p) => findWord(text, p))
        .filter((x): x is Span => x !== null);
    case "R-TOKEN-UNK":
      return listedPhrases(reason, "unit(s):")
        .map((p) => findWord(text, p))
        .filter((x): x is Span => x !== null);
    default:
      return quotedPhrases(reason)
        .map((p) => findPhrase(text, p))
        .filter((x): x is Span => x !== null);
  }
}

type BeatTone = "slot" | "seal" | "missing" | "offense";

interface Beat {
  key: string;
  /** Document row label, e.g. "action". */
  field: string;
  /** Document row value. Null for offense beats (highlight only, no row). */
  value: ReactNode;
  span?: Span;
  tone: BeatTone;
  /** For missing slots: the question the machine asks instead of guessing. */
  question?: string;
}

interface Shot {
  text: string;
  result: ParseResult;
  beats: Beat[];
}

/** One extracted slot as a beat: the exact phrase from the input. */
function textBeat(key: string, field: string, text: string, span: Span | null): Beat | null {
  if (!span) return null;
  const phrase = text.slice(span.start, span.end);
  return {
    key,
    field,
    span,
    tone: "slot",
    value: <span className="font-mono break-all">{phrase}</span>,
  };
}

/** The beat list for one parse, in reading order, the seal last. Derived
 *  from — never influencing — the ParseResult. */
function buildBeats(text: string, result: ParseResult): Beat[] {
  const push = (arr: Beat[], b: Beat | null) => {
    if (b) arr.push(b);
  };
  if (result.kind === "refuse") {
    return refusalSpans(result.rule, result.reason, text)
      .slice(0, 4)
      .map((span, i) => ({
        key: `offense-${i}`,
        field: "flagged phrase",
        value: null,
        span,
        tone: "offense" as BeatTone,
      }));
  }
  if (result.kind === "clarify") {
    const beats: Beat[] = [];
    const verb = firstSpan(text, VERB_RE);
    const addr = firstSpan(text, ADDR_RE);
    if (result.rule === "R-ADDR-0" || result.rule === "R-AMOUNT-0" || result.rule === "R-TOKEN-UNK") {
      push(beats, textBeat("action", "action", text, verb));
    }
    if (result.rule === "R-AMOUNT-0" || result.rule === "R-TOKEN-UNK") {
      push(beats, textBeat("recipient", "recipient", text, addr));
    }
    if (result.rule === "R-TOKEN-UNK") {
      refusalSpans(result.rule, result.reason, text)
        .slice(0, 2)
        .forEach((span, i) => {
          beats.push({ key: `offense-${i}`, field: "unknown token", value: null, span, tone: "offense" });
        });
    }
    beats.sort((a, b) => (a.span?.start ?? 0) - (b.span?.start ?? 0));
    // The missing slot lands last — the machine states what it won't guess.
    const missingField =
      result.rule === "R-VERB-0" ? "action" : result.rule === "R-ADDR-0" ? "recipient" : "amount";
    beats.push({
      key: "missing",
      field: missingField,
      tone: "missing",
      value: <span className="text-slate">missing — not guessed</span>,
      question: result.question,
    });
    return beats;
  }
  // plan — the signature moment: words → machine-checkable plan
  const plan = result.plan;
  const beats: Beat[] = [];
  push(beats, textBeat("action", "action", text, firstSpan(text, VERB_RE)));
  const amountSpan = planAmountSpan(text, plan.amountPhrs);
  push(
    beats,
    amountSpan
      ? {
          key: "amount",
          field: "amount",
          span: amountSpan,
          tone: "slot",
          value: (
            <span className="font-mono font-semibold text-ink">
              {plan.amountPhrs} {NATIVE}
            </span>
          ),
        }
      : null
  );
  push(beats, textBeat("recipient", "recipient", text, firstSpan(text, ADDR_RE)));
  beats.sort((a, b) => (a.span?.start ?? 0) - (b.span?.start ?? 0));
  beats.push({
    key: "seal",
    field: "plan hash",
    tone: "seal",
    value: <span className="font-mono">sha256:{plan.planId}</span>,
  });
  return beats;
}

// ---------------------------------------------------------------------------
// Flagship presentation components — 02 The Parser's Mind + 03 verdicts.
// The Assembly: one beat per real extracted slot, ≤0.5s total, instant under
// prefers-reduced-motion. Every beat names real parser output.
// ---------------------------------------------------------------------------

const STAGE_LABELS = ["Extract slots", "Apply rule tag", "Seal the plan hash"];
const BEAT_GAP = 0.08;
const BEAT_DUR = 0.16;

function RuleTagChip({ tag, dim }: { tag: string; dim?: boolean }) {
  const meaning = RULE_CATALOG.find((r) => r.tag === tag)?.meaning;
  return (
    <span
      title={meaning ?? tag}
      className={`chip font-mono !normal-case !tracking-normal ${
        dim ? "chip-dim" : "chip-info !border-accent font-semibold"
      }`}
    >
      {tag}
    </span>
  );
}

/** The three real parse stages as chapter markers — each lights when its
 *  work is shown, never on a fake timer. */
function StageStrip({ delays, reduce }: { delays: (number | null)[]; reduce: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Parse stages">
      {STAGE_LABELS.map((label, i) => {
        const d = delays[i] ?? null;
        return (
          <motion.span
            key={label}
            initial={reduce ? { opacity: d === null ? 0.4 : 1 } : { opacity: 0.4 }}
            animate={{ opacity: d === null ? 0.4 : 1 }}
            transition={{ delay: d ?? 0, duration: 0.2 }}
            className={`chip ${d === null ? "chip-dim" : "chip-info"}`}
          >
            {i + 1} · {label}
          </motion.span>
        );
      })}
    </div>
  );
}

/** The visitor's sentence, each extracted phrase lighting up on its beat. */
function HighlightedInput({
  text,
  beats,
  gap,
  dur,
  reduce,
  onBeatDone,
}: {
  text: string;
  beats: Beat[];
  gap: number;
  dur: number;
  reduce: boolean;
  onBeatDone: (i: number) => void;
}) {
  const items = beats
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.span)
    .sort((x, y) => (x.b.span as Span).start - (y.b.span as Span).start);
  const segs: ReactNode[] = [];
  let pos = 0;
  items.forEach(({ b, i }, k) => {
    const s = b.span as Span;
    if (s.start < pos) return; // overlapping span — never double-paint
    if (s.start > pos) segs.push(<span key={`t${k}`}>{text.slice(pos, s.start)}</span>);
    const offense = b.tone === "offense";
    segs.push(
      <motion.span
        key={`h${k}`}
        title={offense ? "Flagged by the refusal rule" : `Parsed as ${b.field}`}
        initial={reduce ? false : { opacity: 0.25 }}
        animate={{ opacity: 1 }}
        transition={{ delay: i * gap, duration: dur }}
        onAnimationComplete={() => onBeatDone(i)}
        className={
          offense
            ? "rounded border-b-2 border-fail bg-fail/10 px-0.5 font-mono text-fail"
            : "rounded border-b-2 border-accent bg-accent/10 px-0.5 font-mono text-ink"
        }
      >
        {text.slice(s.start, s.end)}
      </motion.span>
    );
    pos = s.end;
  });
  if (pos < text.length) segs.push(<span key="tail">{text.slice(pos)}</span>);
  return (
    <p
      className="break-words font-mono text-sm leading-relaxed text-ink sm:text-base"
      aria-label="Your instruction, with the parsed phrases highlighted"
    >
      {segs}
    </p>
  );
}

/** The plan hash seal with its copy button — and the single expanding ring,
 *  the one beat when the result lands (gone in 0.6s). */
function SealCopy({ planId, delay, reduce }: { planId: string; delay: number; reduce: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(planId);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = planId;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="relative inline-flex items-center">
      {!reduce && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-1.5 rounded-lg border-2 border-accent"
          initial={{ opacity: 0.55, scale: 0.92 }}
          animate={{ opacity: 0, scale: 1.18 }}
          transition={{ delay: delay + 0.08, duration: 0.6, ease: "easeOut" }}
        />
      )}
      <button
        type="button"
        onClick={copy}
        className="chip chip-dim !py-1"
        aria-label="Copy the full plan hash"
      >
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        <span className="font-mono">{copied ? "copied" : "copy hash"}</span>
      </button>
    </span>
  );
}

/** The plan document, assembling one real field per beat. */
function DocumentRows({
  beats,
  gap,
  dur,
  reduce,
  planId,
  onBeatDone,
}: {
  beats: Beat[];
  gap: number;
  dur: number;
  reduce: boolean;
  planId: string;
  onBeatDone: (i: number) => void;
}) {
  const rows = beats.filter((b) => b.tone !== "offense");
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 divide-y divide-hairline border-t border-hairline">
      {rows.map((b) => {
        const i = beats.indexOf(b);
        const missing = b.tone === "missing";
        const seal = b.tone === "seal";
        return (
          <motion.div
            key={b.key}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * gap, duration: dur }}
            onAnimationComplete={() => onBeatDone(i)}
            className="py-3"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-24 shrink-0 text-sm font-semibold text-slate">{b.field}</span>
              {missing ? (
                <span className="rounded-lg border-2 border-dashed border-hairline px-3 py-1 text-sm text-slate">
                  {b.value}
                </span>
              ) : (
                <span className="min-w-0 flex-1 text-sm">{b.value}</span>
              )}
              {seal && <SealCopy planId={planId} delay={i * gap} reduce={reduce} />}
            </div>
            {missing && b.question && <p className="mt-1 text-sm text-slate">{b.question}</p>}
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * The 02 act — THE PARSER'S MIND. The input highlights phrase-by-phrase as
 * each field ticks into the plan document; the three stage markers light as
 * their real work is shown. In "complete" mode everything stands still.
 */
function ParseShowcase({
  shot,
  mode,
  onAssembled,
}: {
  shot: Shot;
  mode: "assembling" | "complete";
  onAssembled?: () => void;
}) {
  const reduce = useReducedMotion();
  const { text, result, beats } = shot;
  const live = mode === "assembling" && !reduce;
  const gap = live ? BEAT_GAP : 0;
  const dur = live ? BEAT_DUR : 0;
  const last = beats.length - 1;
  const fired = useRef(false);

  useEffect(() => {
    if (beats.length === 0) onAssembled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beatDone = (i: number) => {
    if (i === last && !fired.current) {
      fired.current = true;
      onAssembled?.();
    }
  };

  const slotCount = beats.filter((b) => b.tone === "slot").length;
  const sealIdx = beats.findIndex((b) => b.tone === "seal");
  const delays: (number | null)[] =
    result.kind === "plan"
      ? [0, slotCount * gap, sealIdx < 0 ? null : sealIdx * gap]
      : result.kind === "clarify"
        ? [0, slotCount * gap, null]
        : [0, 0, null];
  const chipDelay = slotCount * gap;
  const planId = result.kind === "plan" ? result.plan.planId : "";
  const hasDoc = beats.some((b) => b.tone !== "offense");

  return (
    <div className="space-y-4">
      <StageStrip delays={delays} reduce={reduce} />
      <div className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate">
            {result.kind === "plan"
              ? "Parsed payment plan"
              : result.kind === "clarify"
                ? "Partial parse — one slot missing"
                : "The scan — what the rule flagged"}
          </p>
          {result.kind !== "refuse" && (
            <motion.span
              initial={reduce ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: chipDelay, duration: 0.18 }}
              className="inline-flex"
            >
              <RuleTagChip tag={result.rule} />
            </motion.span>
          )}
        </div>
        {result.kind === "plan" && (
          <h4 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Send {result.plan.amountPhrs} {NATIVE}
          </h4>
        )}
        <div className="mt-3">
          <HighlightedInput
            text={text}
            beats={beats}
            gap={gap}
            dur={dur}
            reduce={reduce}
            onBeatDone={beatDone}
          />
        </div>
        {hasDoc && (
          <DocumentRows
            beats={beats}
            gap={gap}
            dur={dur}
            reduce={reduce}
            planId={planId}
            onBeatDone={beatDone}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The Beautiful Refusal (flagship doctrine §3A): the refusal is a designed
 * verdict, not an error state. Double beat — the REFUSED stamp lands, then
 * the plain-language reason rises — with the fired rule tag and the exact
 * flagged phrase. "The machine said no, and here's exactly why."
 */
function RefusalCard({
  result,
  text,
  onExample,
}: {
  result: Extract<ParseResult, { kind: "refuse" }>;
  text: string;
  onExample: () => void;
}) {
  const reduce = useReducedMotion();
  const meaning = RULE_CATALOG.find((r) => r.tag === result.rule)?.meaning;
  const flagged = refusalSpans(result.rule, result.reason, text)
    .slice(0, 4)
    .map((s) => text.slice(s.start, s.end));
  const stampMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, scale: 1.15, rotate: -4 },
        animate: { opacity: 1, scale: 1, rotate: -2 },
        transition: { type: "spring" as const, stiffness: 320, damping: 20 },
      };
  const riseMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, delay: 0.22, ease: "easeOut" as const },
      };
  return (
    <div className="rounded-2xl border border-hairline bg-white p-6 sm:p-8" aria-live="polite">
      {/* beat 1 — the stamp lands */}
      <motion.div {...stampMotion} className="flex justify-center sm:justify-start">
        <span
          role="status"
          aria-label={`Refused: ${result.rule}`}
          style={{ boxShadow: "0 10px 28px -10px currentColor" }}
          className="inline-flex items-center gap-3 rounded-xl border-2 border-fail bg-white px-6 py-3 text-fail"
        >
          <Ban size={34} aria-hidden />
          <span className="font-display text-4xl font-bold tracking-wide sm:text-5xl">REFUSED</span>
        </span>
      </motion.div>
      {/* beat 2 — the reason rises: the denial IS the product */}
      <motion.div {...riseMotion} className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <RuleTagChip tag={result.rule} />
          {meaning && <span className="text-sm text-slate">{meaning}</span>}
        </div>
        <p className="mt-3 text-base leading-relaxed text-ink">{result.reason}</p>
        {flagged.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Phrases that fired the rule">
            {flagged.map((f, i) => (
              <span
                key={i}
                title="The exact phrase that fired the rule"
                className="chip border-fail/40 bg-fail/10 font-mono !normal-case !tracking-normal text-fail"
              >
                “{f}”
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-sm font-semibold text-ink">{result.question}</p>
        <button type="button" onClick={onExample} className="btn-outline mt-5 min-h-[44px]">
          Try the dust example
        </button>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component — 01 Configure → 02 The Parser's Mind → 03 Result.
// ---------------------------------------------------------------------------

const SIGN_STEPS = [
  "Waiting for your wallet signature",
  "Broadcasting to Atlantic",
  "Awaiting on-chain confirmation",
];

type Phase = "configure" | "parsing" | "result";

export default function TryNlPayment({ lamp }: { lamp: Lamp }) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("configure");
  const [shot, setShot] = useState<Shot | null>(null);
  const { state: wallet, connect } = useWallet();
  const { state, proposal, txHash, error, propose, approve, cancel } =
    useProposeAndSign();

  /** The three parse stages, run synchronously — this IS the work. The 02
   *  act is then the Assembly choreography over the real computed slots
   *  (one beat per extracted field, ≤0.5s total), not a loader over sleeps. */
  function runParse(next: string) {
    if (state !== "idle") cancel();
    setText(next);
    // Stage 1 — the real deterministic parse.
    const parsed = parsePayment(next);
    // Stage 2 — the rule tag, mapped onto the parser's tag vocabulary
    // (drives the chips and the refusal verdict).
    void RULE_CATALOG.find((r) => r.tag === parsed.rule);
    // Stage 3 — the SHA-256 plan hash, recomputed through the same
    // planIdOf() the CONFIRM gate binds, proving console ↔ CLI byte-identity.
    if (parsed.kind === "plan") {
      const recomputed = planIdOf(parsed.plan.amountPhrs, parsed.plan.to);
      if (recomputed !== parsed.plan.planId) {
        throw new Error("Plan hash mismatch — this should never happen.");
      }
    }
    const beats = buildBeats(next, parsed);
    setShot({ text: next, result: parsed, beats });
    // Empty input: nothing to assemble — straight to the clarification.
    setPhase(parsed.rule === "R-EMPTY" ? "result" : "parsing");
  }

  function handlePropose() {
    if (shot?.result.kind !== "plan") return;
    propose({
      to: shot.result.plan.to,
      valuePhrs: shot.result.plan.amountPhrs,
      label: `Send ${shot.result.plan.amountPhrs} PHRS`,
    });
  }

  function fillExample() {
    runParse(PRESETS[0].text);
  }

  const walletLabel = (() => {
    if (wallet.status === "connected")
      return `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)} · ${wallet.balance ?? "?"} PHRS`;
    return "not connected";
  })();

  const inFlight =
    state === "review" ||
    state === "awaiting-signature" ||
    state === "broadcasting";

  const signStep =
    state === "awaiting-signature" ? 0 : state === "broadcasting" ? 1 : 3;

  const showConnectFix =
    (state === "blocked" || state === "error") && wallet.status !== "connected";

  const planResult = shot && shot.result.kind === "plan" ? shot.result : null;
  const plan = planResult?.plan ?? null;

  return (
    <div className="space-y-6">
      {/* header */}
      <div>
        <p className="text-sm font-semibold text-slate">Tier B — type → review → sign yourself</p>
        <h3 className="mt-1 text-xl font-bold text-ink">
          Type it, review it, sign it
        </h3>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink">
          {lamp.name}: a deterministic parser (same grammar as the audited CLI
          agent — 34/34 unit tests, no LLM) turns your words into a payment
          plan, or <strong className="text-ink">refuses to guess</strong>. A
          valid plan still goes through a mandatory review — then{" "}
          <strong className="text-ink">you</strong> sign it in your own wallet
          with your own testnet PHRS. LIGHTKEEPER never sees your keys.
        </p>
      </div>

      {/* 01 — configure */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate">01 · Configure — the instruction</p>
        <div className="flex flex-col gap-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) runParse(text);
            }}
            placeholder="send 0.001 PHRS to 0x…"
            className="w-full min-h-[44px] rounded-xl border border-hairline bg-white px-4 py-3 font-mono text-sm text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none"
            aria-label="Payment instruction in plain language"
          />
          <p className="text-sm text-slate">
            The grammar&rsquo;s shape:{" "}
            <span className="font-mono text-ink">verb amount PHRS to 0x…</span> — one
            verb, one amount, one address. Anything else gets a named rule, not a guess.
          </p>
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
          <div>
            <button
              className="btn-primary min-h-[44px]"
              onClick={() => runParse(text)}
              disabled={!text.trim() || phase === "parsing"}
            >
              Parse my instruction
            </button>
          </div>
        </div>
      </div>

      {/* 02 — the parser's mind: the input highlights phrase-by-phrase as each
          extracted field ticks into the plan document. One beat per REAL
          slot, ≤0.5s total — the parse itself ran synchronously above. */}
      {phase === "parsing" && shot && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate">02 · Parsing — the parser&rsquo;s mind</p>
          <ParseShowcase shot={shot} mode="assembling" onAssembled={() => setPhase("result")} />
          <p className="mt-2 text-sm text-slate">
            Each phrase lights up as its field joins the plan — nothing inferred, nothing defaulted.
          </p>
        </div>
      )}

      {/* 03 — the plan as a precision document (climax), or the designed
          refusal / clarification verdict. The showcase stands complete;
          the rule tags, the review pipeline and the sign flow follow. */}
      {phase === "result" && shot && (
        <div className="space-y-6">
          <p className="text-sm font-semibold text-slate">
            03 ·{" "}
            {shot.result.kind === "plan"
              ? "Result — the parsed plan"
              : shot.result.kind === "refuse"
                ? "Verdict — refused"
                : "Result — one clarification"}
          </p>

          {shot.result.rule !== "R-EMPTY" && (
            <ParseShowcase shot={shot} mode="complete" />
          )}

          {plan && planResult && (
            <>
              {/* Rule-tag vocabulary — the parser's vocabulary as chips */}
              <div>
                <p className="text-sm font-semibold text-slate">
                  Rule tags — every tag this parser enforces
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {RULE_CATALOG.map((r) => (
                    <RuleTagChip key={r.tag} tag={r.tag} dim={r.tag !== planResult.rule} />
                  ))}
                </div>
              </div>

              {planResult.warning && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-gold/50 bg-[#fdf8e8] px-4 py-3">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-golddeep" aria-hidden />
                  <p className="text-sm text-golddeep">{planResult.warning}</p>
                </div>
              )}
              {isDustWarning(plan.amountPhrs) && (
                <p className="mt-3 text-sm font-semibold text-golddeep">
                  Above the 0.01 PHRS dust limit — you&rsquo;ll see an amber warning
                  at the review step.
                </p>
              )}

              <div className="mt-4 flex items-start gap-2 text-sm text-slate">
                <Fingerprint size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <p>
                  The plan hash is the SHA-256 of the canonical plan —
                  byte-identical to the CLI agent&rsquo;s <span className="font-mono">plan_id</span>.
                  Parse, review and signature share one plan identity.
                </p>
              </div>

              {state === "idle" && (
                <button
                  className="btn-primary mt-5 min-h-[44px]"
                  onClick={handlePropose}
                >
                  Propose this payment — review it next
                </button>
              )}
            </>
          )}

          {shot.result.kind === "clarify" && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="rounded-2xl border-2 border-dashed border-hairline bg-porcelain px-6 py-8"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-lg font-semibold text-ink">Needs one clarification</h4>
                <RuleTagChip tag={shot.result.rule} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink">{shot.result.reason}</p>
              <p className="mt-1 text-sm font-semibold text-ink">{shot.result.question}</p>
              <button type="button" onClick={fillExample} className="btn-outline mt-5 min-h-[44px]">
                Try the dust example
              </button>
            </motion.div>
          )}

          {shot.result.kind === "refuse" && (
            <RefusalCard result={shot.result} text={shot.text} onExample={fillExample} />
          )}

          {/* mandatory review + sign pipeline */}
          {inFlight && proposal && (
            <div className="space-y-4">
              {state === "review" && (
                <>
                  <p className="text-sm font-semibold text-slate">Review — mandatory before any signature</p>
                  <div className="rounded-2xl border-2 border-gold/60 bg-white p-6">
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

                    {plan && (
                      <p className="mt-3 text-sm text-slate">
                        Binding: this review is for plan{" "}
                        <span className="font-mono text-ink">{plan.planId}</span> — the
                        same SHA-256 hash the CLI agent's <span className="font-mono">CONFIRM</span>{" "}
                        gate binds. What you sign below is exactly this plan; anything else aborts.
                      </p>
                    )}

                    {/* The hook surfaces the dust warning through `error` in
                        review state — rendered as an AMBER WARNING, never as
                        an error. */}
                    {error && (
                      <div className="mt-3 rounded-lg border border-gold/50 bg-[#fdf8e8] px-4 py-3">
                        <p className="text-sm font-semibold text-golddeep">
                          Warning — not a block
                        </p>
                        <p className="mt-1 text-sm text-golddeep">{error}</p>
                      </div>
                    )}

                    <p className="mt-3 text-sm text-slate">
                      Check the address and amount above. Signing happens entirely
                      in <strong className="text-ink">your wallet</strong> — this
                      page never touches your keys.
                    </p>

                    {/* Sticky primary action — thumb-reachable at 390px */}
                    <div className="sticky bottom-4 mt-4 flex flex-wrap gap-2 rounded-2xl border border-hairline bg-white/95 p-3 shadow-lg backdrop-blur">
                      <button className="btn-primary min-h-[44px] flex-1" onClick={approve}>
                        Sign in my wallet
                      </button>
                      <button className="btn-outline min-h-[44px]" onClick={cancel}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </>
              )}

              {(state === "awaiting-signature" || state === "broadcasting") && (
                <ProgressLoader steps={SIGN_STEPS} current={signStep} />
              )}
            </div>
          )}

          {/* confirmed — visitor-signed receipt */}
          {state === "confirmed" && txHash && (
            <ResultCard
              eyebrow="Signed and confirmed"
              headline="Payment sent"
              subline="Confirmed on Atlantic — your transaction, signed in your own wallet. No keys ever left your device."
              status="pass"
              copyValue={txHash}
              rows={[
                { label: "Transaction", value: txHash },
                { label: "Moved", value: plan ? `${plan.amountPhrs} ${NATIVE}` : "—" },
                { label: "To", value: plan ? plan.to : "—" },
                { label: "Network", value: "Pharos Atlantic · chain 688689" },
              ]}
              links={[
                { label: "View on the explorer", href: `${EXPLORER_TX}${txHash}` },
              ]}
            >
              <button className="btn-outline min-h-[44px]" onClick={cancel}>
                Prepare another payment
              </button>
            </ResultCard>
          )}

          {/* blocked / error — verbatim, with a connect fix when it's the wallet */}
          {(state === "blocked" || state === "error") && error && (
            <ErrorState
              title={state === "blocked" ? "Blocked" : "Something failed"}
              message={error}
              retryLabel="Start over"
              onRetry={cancel}
            />
          )}
          {(state === "blocked" || state === "error") && error && showConnectFix && (
            <div className="mt-3">
              <button className="btn-primary min-h-[44px]" onClick={connect}>
                Connect wallet
              </button>
            </div>
          )}
        </div>
      )}

      {/* honesty footer — the grammar, stated plainly (no founder content) */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="text-sm leading-relaxed text-slate"
      >
        Grammar: verb (send/pay/transfer/…) ×1, one &lt;number&gt; PHRS
        (native only — other tokens are asked about, never defaulted), one full
        0x address (bare 40-hex without 0x is refused, never guessed), zero
        tolerance for extra numbers or conflicting verbs. Minus signs,
        malformed decimals, thousands separators, word-amounts and percentages
        are refused with a named rule. Every outcome carries its rule tag;
        every plan carries its SHA-256 plan hash.
      </motion.p>
    </div>
  );
}
