/**
 * T17 — Natural-Language Payment Agent — "Type it, review it, sign it"
 *
 * Tier B surface. A deterministic, no-LLM intent parser (the exact grammar of
 * the audited T17 CLI parser: tasks/t17-nl-payment-agent/src/parse.py, 20/20
 * unit tests) turns free text into a structured payment plan client-side —
 * or refuses ambiguous input instead of guessing. A valid plan is then
 * proposed and MUST pass the mandatory review step before the VISITOR signs
 * it in their own wallet, from their address, with their testnet PHRS.
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
const WORD_AMOUNT_RE = /\b(half|halve|quarter|all|everything|my whole|the rest|entire balance)\b/i;
const PERCENT_RE = /\d+(?:\.\d+)?\s*%/;

export interface ParsedPlan {
  action: string;
  amountPhrs: string;
  to: string;
}

export type ParseResult =
  | { kind: "plan"; plan: ParsedPlan; confidence: string; warning?: string }
  | { kind: "clarify"; question: string; reason: string }
  | { kind: "refuse"; reason: string; question: string };

function toWei(s: string): bigint {
  const [w, f = ""] = s.split(".");
  return BigInt(w) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
}

export function parsePayment(text: string): ParseResult {
  const raw = text.trim();
  if (!raw) {
    return {
      kind: "clarify",
      reason: "Empty input — nothing to parse.",
      question: "What payment should I prepare? Try: send 0.001 PHRS to 0x…",
    };
  }

  let warning: string | undefined;
  if (SUSPICIOUS_RE.test(raw)) {
    warning =
      "Input contains instruction-like phrases — treated as untrusted text. Only payment slots are extracted.";
  }

  // Thousands separators: "1,000 PHRS" is ambiguous notation → refuse, don't normalize.
  if (COMMA_NUM_RE.test(raw)) {
    return {
      kind: "refuse",
      reason: "Found a comma-formatted number. I don't read thousands separators — write the exact decimal amount (e.g. 1000 PHRS).",
      question: "What is the exact decimal amount in PHRS?",
    };
  }

  // Word amounts: "half", "all", "everything" → never interpreted as numbers.
  const wordAmt = WORD_AMOUNT_RE.exec(raw);
  if (wordAmt) {
    return {
      kind: "refuse",
      reason: `Found the word "${wordAmt[1]}" instead of a number. I don't convert words to amounts — 0.5 and 0.500000000000000001 are different payments.`,
      question: "What is the exact decimal amount in PHRS?",
    };
  }

  if (PERCENT_RE.test(raw)) {
    return {
      kind: "refuse",
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
      reason: `No payment verb found (expected one of: ${VERBS.join(", ")}).`,
      question: "What action? Try: send 0.001 PHRS to 0x…",
    };
  }
  if (verbs.size > 1) {
    return {
      kind: "refuse",
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
      reason: `Found 40 hex characters without a 0x prefix ("${bare[0].slice(0, 10)}…"). A recipient is never inferred from a partial address.`,
      question: "Please paste the full 0x address.",
    };
  }
  if (addrs.length === 0) {
    return {
      kind: "clarify",
      reason: "No 0x destination address found. I never guess a recipient.",
      question: "Which 0x address should receive the payment?",
    };
  }
  if (addrs.length > 1) {
    return {
      kind: "refuse",
      reason: `Multiple destination addresses found (${addrs.length}). I will not pick one for you.`,
      question: "Which single address is the recipient?",
    };
  }
  const to = addrs[0];
  if (/^0x0{40}$/.test(to)) {
    return {
      kind: "refuse",
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
      reason: `Unknown token unit(s): ${unknownTokenUnits.join(", ")}. I only move native PHRS on Atlantic — I never map an unknown token to a default.`,
      question: "Which token? (This surface supports native PHRS only.)",
    };
  }
  if (strayNumbers.length > 0) {
    return {
      kind: "refuse",
      reason: `Ambiguous extra number(s) with no token: ${strayNumbers.join(", ")}. I will not guess whether one of them is the amount.`,
      question: "Please restate as: <amount> PHRS to <0x address>.",
    };
  }
  if (phrsAmounts.length === 0) {
    return {
      kind: "clarify",
      reason: "No amount found (expected '<number> PHRS').",
      question: "How much PHRS should I prepare?",
    };
  }
  if (phrsAmounts.length > 1) {
    return {
      kind: "refuse",
      reason: `Multiple PHRS amounts found: ${phrsAmounts.join(", ")}. I will not pick one.`,
      question: "Which single amount is the payment?",
    };
  }

  const amountStr = phrsAmounts[0];
  const wei = toWei(amountStr);
  if (wei <= 0n) {
    return {
      kind: "refuse",
      reason: `Amount must be greater than zero (got "${amountStr}").`,
      question: "What positive amount should I prepare?",
    };
  }
  if (wei > MAX_PLAN_WEI) {
    return {
      kind: "refuse",
      reason: `Amount ${amountStr} PHRS exceeds this agent's per-plan safety cap of 0.15 PHRS. Refused — same rule as the audited CLI parser.`,
      question: "Please use an amount ≤ 0.15 PHRS.",
    };
  }

  return {
    kind: "plan",
    plan: { action: "send", amountPhrs: amountStr, to },
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
                <span className="chip chip-dim font-mono !normal-case !tracking-normal">
                  to · {result.plan.to}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate">{result.confidence}</p>
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
                I need one clarification:
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
                Refused — I will not guess.
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
        tolerance for extra numbers or conflicting verbs. Same rules as the
        audited CLI agent in{" "}
        <span className="font-mono">tasks/t17-nl-payment-agent</span>.
      </p>
    </div>
  );
}
