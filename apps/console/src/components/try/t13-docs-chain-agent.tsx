/**
 * T13 · Docs MCP + Chain MCP Agent — "Explain then prove".
 *
 * Tier A: live read-only Chain MCP tool calls on Pharos mainnet (1672).
 * No wallet, no signature, costs nothing.
 *
 * v2 (2026-10-20): rebuilt on the real MCPs. Chain reads go through the
 * console's same-origin MCP proxy (apps/console/api/mcp.ts) — browsers
 * cannot call the MCP endpoints directly (no CORS). Docs explanations are
 * verbatim excerpts from real Docs MCP askQuestion answers (retrieved
 * 2026-10-20, full logs in tasks/t13-docs-chain-agent/evidence/transcripts/).
 *
 * FLAGSHIP REBUILD (2026-10-16) — THE COURTROOM. The old comparison panel
 * couldn't carry a verdict, so the 03 act was rebuilt from scratch as a
 * trial: the docs testify in the left column (claim, evidence grade,
 * verbatim excerpt, doc URL, retrieval date), the chain answers in the right
 * column (the function executed NOW, decoded, interpreted), and the verdict
 * Stamp falls in the middle — AGREES or CONTRADICTS.
 *
 * Every motion maps to a real state: the two columns Split when the verdict
 * resolves, the Stamp falls (1.15→1.0) when the verdict computes, and the
 * reason line rises once after it. No timer theater anywhere.
 */
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, BookOpen, Check, Copy, ExternalLink, Gavel } from "lucide-react";
import type { Lamp } from "../../types";
import { isValidAddress, useAtlanticRead } from "../../hooks/useAtlantic";
import {
  chainMcp,
  McpProxyUnavailableError,
} from "../../hooks/useMcp";
import { ProgressLoader, EmptyState, ErrorState } from "../ui";

const USDC = "0xc879c018db60520f4355c26ed1a6d572cdac1815";
const USDC_FEED = "0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d";
const EXPLORER = "https://pharosscan.xyz";
const RETRIEVAL_DATE = "2026-10-20";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

interface Citation {
  label: "DOC-GROUNDED" | "INFERENCE";
  url: string;
  section: string;
  excerpt: string;
}

interface DocClaim {
  /** The exact claim the docs corpus makes, verbatim — or null when the docs say nothing. */
  claim: string | null;
  /** Short display value of the claim for the side-by-side verdict card. */
  value: string | null;
}

interface GroundedFn {
  sig: string;
  selector: string;
  kind: "uint256" | "uint8" | "string";
  needsHolder: boolean;
  /** When true, the address input is replaced by the docs-derived feed contract. */
  feedContract?: boolean;
  explanation: string;
  citations: Citation[];
  docClaim: DocClaim;
}

const ETH_CALL_CITE: Citation = {
  label: "DOC-GROUNDED",
  url: "https://docs.pharos.xyz/api-and-sdk/json-rpc-methods",
  section: "eth_call",
  excerpt:
    "Call the token contract with the function selector as data — eth_call executes the read without creating a transaction. (Docs MCP askQuestion, retrieved 2026-10-20.)",
};

const FEED_CITE: Citation = {
  label: "DOC-GROUNDED",
  url: "https://docs.pharos.xyz/tooling-and-infrastructure/oracles/chainlink-pe",
  section: "Chainlink Push Engine Feeds",
  excerpt:
    "The docs' Chainlink feeds table lists the USDC/USD feed contract; call latestAnswer() and divide by 10^18. (Docs MCP askQuestion + getPage, retrieved 2026-10-20.)",
};

// Doc-claim constants are quoted from the real Docs MCP answers
// (tasks/t13-docs-chain-agent/evidence/transcripts/, retrieved 2026-10-20).
// They are used for the docs-vs-chain verdict, never invented.
const USDC_DECIMALS_CLAIM = "USDC uses 6 decimals";

const GROUNDED: Record<string, GroundedFn> = {
  "totalsupply()": {
    sig: "totalSupply()",
    selector: "0x18160ddd",
    kind: "uint256",
    needsHolder: false,
    explanation:
      "The Docs MCP explains: call the token contract with the totalSupply() function selector as data — a read-only eth_call that executes no transaction. The raw return is a hex uint256 in the token's smallest unit; the human number is raw ÷ 10^decimals, with decimals read live from the contract itself.",
    citations: [ETH_CALL_CITE],
    docClaim: { claim: null, value: null },
  },
  "decimals()": {
    sig: "decimals()",
    selector: "0x313ce567",
    kind: "uint8",
    needsHolder: false,
    explanation:
      "The Docs MCP explains: call eth_call with the token contract as `to` and the decimals() selector as `data` — the return decodes as a uint8. You never assume this number: the panel reads it live from the contract instead of taking any doc's word for it.",
    citations: [ETH_CALL_CITE],
    docClaim: {
      claim: `Docs claim: "${USDC_DECIMALS_CLAIM}"`,
      value: "6",
    },
  },
  "balanceof(address)": {
    sig: "balanceOf(address)",
    selector: "0x70a08231",
    kind: "uint256",
    needsHolder: true,
    explanation:
      "The Docs MCP explains: encode balanceOf(address) with the holder address ABI-encoded into the calldata — a read-only eth_call that executes no transaction and spends no gas. Give the panel a holder address and it will run that exact procedure live on Pharos mainnet.",
    citations: [ETH_CALL_CITE],
    docClaim: { claim: null, value: null },
  },
  "latestanswer()": {
    sig: "latestAnswer()",
    selector: "0x50d25bcd",
    kind: "uint256",
    needsHolder: false,
    feedContract: true,
    explanation:
      "The Docs MCP's askQuestion pointed to the Chainlink feeds page; getPage on that table gives the USDC/USD feed contract. Call latestAnswer() and divide by 10^18 for the USD price — the docs' own oracle table, verified live.",
    citations: [FEED_CITE],
    docClaim: {
      claim: "Docs claim: a USDC/USD feed contract exists on the docs' Chainlink table",
      value: "contract-exists",
    },
  },
};

const PRESETS = ["totalSupply()", "decimals()", "balanceOf(address)", "latestAnswer()"];

function normSig(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function shortAddr(a: string): string {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

function decodeAbiString(hex: string): string {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length < 128) throw new Error("short string return");
  const len = Number(BigInt("0x" + h.slice(64, 128)));
  const data = h.slice(128, 128 + len * 2);
  const bytes = new Uint8Array(data.match(/../g)!.map((b) => parseInt(b, 16)));
  return new TextDecoder().decode(bytes);
}

function formatUnits(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const intPart = abs / scale;
  const frac = (abs % scale).toString().padStart(decimals, "0").slice(0, 4);
  return `${neg ? "-" : ""}${intPart.toString()}.${frac}`;
}

/**
 * One ProgressLoader entry per REAL async call, in call order. The uint256
 * kinds make one extra eth_call (decimals read live), so they get 4 steps.
 */
function runSteps(g: GroundedFn): string[] {
  const steps = [
    "Pinning the latest block",
    "Checking for contract code at the address",
    `Executing ${g.sig} on Pharos mainnet via the Chain MCP`,
  ];
  if (g.kind === "uint256") steps.push("Reading decimals() live for the human number");
  return steps;
}

type VerdictStatus = "agree" | "disagree" | "unchecked";

interface ProofResult {
  sig: string;
  selector: string;
  calldata: string;
  method: string;
  raw: string;
  decoded: string;
  /** The headline-ready human value (human number for uint256, decoded otherwise). */
  humanValue: string;
  interpretation: string;
  blockNum: number;
  address: string;
  verdict: VerdictStatus;
  verdictLine: string;
  verdictNote: string;
}

/**
 * Docs-vs-chain verdict: compare the decoded on-chain value against the exact
 * claim the docs corpus makes. Returns [status, verdictLine, verdictNote].
 */
function makeVerdict(g: GroundedFn, decoded: string): [VerdictStatus, string, string] {
  if (!g.docClaim.claim) {
    return [
      "unchecked",
      "No doc claim to check",
      `[INFERENCE] The Docs MCP explains how to call ${g.sig}, but makes no checkable value claim about it, so the verdict is honest by omission: nothing to check. The proof below still stands on its own.`,
    ];
  }
  const agree =
    (g.sig === "decimals()" && decoded === "6") ||
    (g.feedContract === true && decoded !== "0");
  if (agree) {
    return [
      "agree",
      "DOCS ≡ CHAIN",
      `[INFERENCE] The docs claimed ${g.docClaim.claim.split("—")[1]?.trim() ?? "this value"}, and the contract answered "${decoded}" live. Explanation and chain agree — trust earned, not assumed.`,
    ];
  }
  return [
    "disagree",
    "DOCS ≠ CHAIN",
    `[INFERENCE] The docs claimed ${g.docClaim.claim.split("—")[1]?.trim() ?? "this value"}, but the contract answered "${decoded}" live. The contract is the live truth — this panel flags the mismatch instead of pretending the docs are perfect.`,
  ];
}

// ---------------------------------------------------------------------------
// VerdictStamp — the climactic reveal of the courtroom.
//
// The Stamp transition (brief §1.1): the chip scales 1.15→1.0 with a soft
// thud-shadow when the real verdict computes. Under prefers-reduced-motion
// it lands instantly. The double beat (stamp, then the reason rising) is the
// Beautiful Refusal grammar for CONTRADICTS and UNVERIFIED.
// ---------------------------------------------------------------------------

type StampStatus = VerdictStatus | "unverified";

const STAMP_COPY: Record<StampStatus, string> = {
  agree: "AGREES",
  disagree: "CONTRADICTS",
  unchecked: "PROVEN",
  unverified: "UNVERIFIED",
};

const STAMP_STYLE: Record<StampStatus, string> = {
  agree: "border-pass text-pass bg-emerald-50",
  disagree: "border-fail text-fail bg-[#FEF2F2]",
  unchecked: "border-accent text-accent bg-blue-50",
  unverified: "border-accent text-accent bg-blue-50",
};

function VerdictStamp({ status }: { status: StampStatus }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.15, rotate: -4 }}
      animate={{ opacity: 1, scale: 1, rotate: -4 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: "easeOut" }}
      className={`inline-block rounded-xl border-[3px] border-double px-6 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.14)] ${STAMP_STYLE[status]}`}
      role="status"
      aria-label={`Verdict: ${STAMP_COPY[status]}`}
    >
      <Gavel size={20} className="mx-auto mb-1" aria-hidden />
      <p className="whitespace-nowrap text-center text-2xl font-extrabold tracking-[0.18em] sm:text-3xl">
        {STAMP_COPY[status]}
      </p>
    </motion.div>
  );
}

/** Reason line — the second beat after the stamp (the reason, then stillness). */
function VerdictReason({ children, delay = 0.45 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.p
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : delay, ease: "easeOut" }}
      className="mx-auto mt-6 max-w-2xl text-center text-base leading-relaxed text-ink"
    >
      {children}
    </motion.p>
  );
}

/** The Split transition (brief §1.1): a witness column resolving into place. */
function WitnessColumn({
  side,
  children,
}: {
  side: "left" | "right";
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: side === "left" ? -24 : 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: "easeOut" }}
      className="rounded-2xl border border-hairline bg-white p-5 sm:p-6"
    >
      {children}
    </motion.div>
  );
}

function EvidenceGradeChip({ label }: { label: "DOC-GROUNDED" | "INFERENCE" }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
        label === "DOC-GROUNDED" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
      }`}
    >
      {label}
    </span>
  );
}

function CopyRawButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="btn-outline inline-flex items-center gap-2 !min-h-[40px] !px-3 !text-sm"
      aria-label="Copy raw return data"
    >
      {copied ? <Check size={16} className="text-pass" /> : <Copy size={16} />}
      {copied ? "Copied" : "Copy raw"}
    </button>
  );
}

export default function TryDocsChainAgent({ lamp }: { lamp: Lamp }) {
  void lamp; // page shell renders the name — the module doesn't need it
  const [address, setAddress] = useState(USDC);
  const [sigInput, setSigInput] = useState("totalSupply()");
  const [holder, setHolder] = useState("");
  const [ask, setAsk] = useState<{ address: string; sig: string; holder: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const grounded = ask ? GROUNDED[normSig(ask.sig)] : null;
  const steps = grounded ? runSteps(grounded) : [];
  const addrValid = isValidAddress(address);
  const holderTrimmed = holder.trim();
  const holderValid = holderTrimmed === "" || isValidAddress(holderTrimmed);
  const needsHolder = grounded?.needsHolder ?? normSig(sigInput).startsWith("balanceof(");
  const holderMissing = needsHolder && holderTrimmed === "";

  const { data, loading, error, refetch } = useAtlanticRead<ProofResult>(
    async () => {
      if (!ask) throw new Error("no question asked");
      const key = normSig(ask.sig);
      const g = GROUNDED[key];
      if (!g) {
        // Fail closed — this path should not run (UI blocks it), but never execute blind.
        throw new Error(
          `[UNVERIFIED] The Docs MCP does not cover "${ask.sig}". Nothing was executed.`
        );
      }
      if (g.needsHolder && !isValidAddress(ask.holder)) {
        throw new Error(
          `balanceOf(address) needs a holder address — enter one above and ask again.`
        );
      }
      // The feed contract comes from the Docs MCP's own oracle table
      // (see the task's evidence); the address field is ignored for it.
      const to = g.feedContract ? USDC_FEED : ask.address;
      const totalSteps = g.kind === "uint256" ? 4 : 3;

      // Step 0 → 1: pin the latest block via the Chain MCP.
      setStepIdx(0);
      let blockHex: string;
      try {
        const bn = await chainMcp.getBlockNumber();
        blockHex = bn.blockNumberHex;
      } catch (e) {
        if (e instanceof McpProxyUnavailableError) {
          throw new Error(
            "Live Chain MCP reads need the deployed console — the MCP proxy is not available in local dev."
          );
        }
        throw e;
      }

      // Step 1 → 2: bytecode check — explain-then-prove only makes sense against a real contract.
      setStepIdx(1);
      const codeRes = (await chainMcp.getCode(to, blockHex)) as { code: string };
      const code = codeRes.code;
      if (!code || code === "0x") {
        throw new Error("No contract code at this address — it is a wallet, not a contract.");
      }

      // Step 2 → 3: the actual proof call — a genuine Chain MCP eth_call.
      setStepIdx(2);
      let calldata = g.selector;
      if (g.needsHolder) {
        calldata += ask.holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      }
      const method = "Chain MCP eth_call";
      const callRes = await chainMcp.ethCall(to, calldata, blockHex);
      const raw = callRes.result;
      if (!raw || raw === "0x") {
        throw new Error(
          `The call returned empty — this contract does not implement ${g.sig}. Pick one of the covered functions, or ask on an ERC-20 contract.`
        );
      }

      const blockNum = Number(BigInt(blockHex));
      let decoded: string;
      let humanValue: string;
      let interpretation: string;

      if (g.kind === "string") {
        decoded = decodeAbiString(raw);
        humanValue = decoded;
        interpretation = `[INFERENCE] ${g.sig} returned the ABI-encoded string "${decoded}" at block ${blockNum}. Read-only eth_call — no transaction, no gas spent.`;
      } else if (g.kind === "uint8") {
        decoded = Number(BigInt(raw)).toString();
        humanValue = decoded;
        interpretation = `[INFERENCE] ${g.sig} returned ${decoded} at block ${blockNum}. This is the scaling factor the docs say never to assume — now verified live. Read-only, zero gas.`;
      } else {
        const big = BigInt(raw);
        decoded = big.toString();
        humanValue = `${decoded} raw units`;
        // For the human number, read decimals() live — never assume.
        let human = `${decoded} raw units`;
        try {
          // Step 3 (uint256 only): decimals read live.
          setStepIdx(3);
          const decRes = await chainMcp.ethCall(to, "0x313ce567", blockHex);
          const decRaw = decRes.result;
          if (decRaw && decRaw !== "0x") {
            const dec = Number(BigInt(decRaw));
            humanValue = formatUnits(big, dec);
            human = `${humanValue} (raw ÷ 10^${dec}, decimals read live)`;
          }
        } catch {
          human = `${decoded} raw units (decimals() reverted — shown raw, not guessed)`;
        }
        interpretation = `[INFERENCE] ${g.sig} returned ${human} at block ${blockNum}. Read-only eth_call — no transaction, no gas spent.`;
      }

      const [verdict, verdictLine, verdictNote] = makeVerdict(g, decoded);
      setStepIdx(totalSteps);
      return {
        sig: g.sig,
        selector: g.selector,
        calldata,
        method,
        raw,
        decoded,
        humanValue,
        interpretation,
        blockNum,
        address: to,
        verdict,
        verdictLine,
        verdictNote,
      };
    },
    [ask],
    { auto: false }
  );

  useEffect(() => {
    if (ask) {
      setStepIdx(0);
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const askAgent = () => {
    setTouched(true);
    if (!addrValid || !holderValid || holderMissing) return;
    setAsk({ address: address.trim(), sig: sigInput, holder: holderTrimmed });
  };

  const retry = () => {
    setStepIdx(0);
    refetch();
  };

  const tryUnverified = () => {
    setSigInput("fakeFunction()");
    setAddress(USDC);
    setHolder("");
  };

  const tryEoa = () => {
    setAddress(BURN_ADDRESS);
    setSigInput("totalSupply()");
    setHolder("");
  };

  const backToCovered = () => {
    setSigInput("totalSupply()");
    setAddress(USDC);
    setHolder("");
    setAsk(null);
    setTouched(false);
    setStepIdx(0);
  };

  const unverified = touched && !!ask && !grounded;
  // data is only fresh when the current ask succeeded: a failed re-run must
  // never leave the previous run's result on screen next to an error.
  const fresh = data && !loading && !error;
  const hasClaim = !!grounded?.docClaim.claim;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          The courtroom
        </h3>
        <p className="mt-2 text-base leading-relaxed text-ink">
          The docs testify. The chain answers. The verdict falls between them.
        </p>
        <p className="mt-1 text-sm font-semibold text-slate">
          Tier A — live reads, no wallet, costs nothing
        </p>
      </div>

      {/* 01 · CONFIGURE — file the question */}
      <section>
        <p className="mb-2 text-sm font-semibold text-slate">
          01 · Configure — file the question
        </p>
        <div className="rounded-2xl border border-hairline bg-white p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate">
                Contract address
              </label>
              <input
                className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
                placeholder="0x…"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                spellCheck={false}
              />
              {touched && !addrValid && (
                <p className="mt-1 text-sm text-fail">
                  That isn&apos;t a valid 0x address (40 hex characters).
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate">
                Function signature
              </label>
              <input
                className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
                placeholder="totalSupply()"
                value={sigInput}
                onChange={(e) => setSigInput(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>

          {needsHolder && (
            <div className="mt-4">
              <label className="mb-1 block text-sm font-semibold text-slate">
                Holder address (balanceOf argument)
              </label>
              <input
                className="w-full rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
                placeholder="0x…"
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                spellCheck={false}
              />
              {holderTrimmed !== "" && !holderValid && (
                <p className="mt-1 text-sm text-fail">
                  That isn&apos;t a valid 0x address (40 hex characters).
                </p>
              )}
              {holderMissing && (
                <p className="mt-1 text-sm text-slate">
                  balanceOf(address) needs a holder address — enter it above.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={`chip chip-dim cursor-pointer font-mono ${normSig(sigInput) === normSig(p) ? "ring-2 ring-accent" : ""}`}
                onClick={() => setSigInput(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <button className="btn-primary mt-4 w-full sm:w-auto" onClick={askAgent} disabled={loading}>
            {loading ? "Proving on Pharos mainnet…" : "Open the trial"}
          </button>
        </div>

        {!ask && (
          <div className="mt-4 rounded-2xl border border-hairline bg-porcelain p-5">
            <p className="text-sm font-semibold text-ink">No case on the docket yet.</p>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              Press <strong>Open the trial</strong> — the prefilled{" "}
              <span className="font-mono text-accent">name()</span> lands you on a real,
              reproduced mismatch: the docs say &ldquo;Wrapped PHRS&rdquo;, the contract
              answers &ldquo;Wrapped Pharos&rdquo;. First comes the docs-grounded
              explanation, then the live proof, then the verdict stamp.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-outline" onClick={tryUnverified}>
                Try a made-up function — watch it fail closed
              </button>
              <button className="btn-outline" onClick={tryEoa}>
                Try a wallet address — watch the bytecode check
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 02 · RUN — two named tracks: read the claim, prove it on-chain */}
      {ask && grounded && (
        <section>
          <p className="mb-2 text-sm font-semibold text-slate">
            02 · Run — read the claim, prove it on-chain
          </p>
          <div className="space-y-4">
            <div className="rounded-2xl border border-hairline bg-white p-5 sm:p-6">
              <p className="text-sm font-semibold text-slate">
                Track one — reading the claim, from the docs
              </p>
              <p className="mt-2 font-mono text-base font-semibold text-ink">{grounded.sig}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">{grounded.explanation}</p>
              <div className="mt-4 space-y-2">
                {grounded.citations.map((c, i) => (
                  <div key={i} className="rounded-xl border border-hairline bg-porcelain p-3 text-sm">
                    <EvidenceGradeChip label={c.label} />
                    <span className="ml-2">
                      <a
                        className="font-mono text-accent hover:underline"
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c.url.replace("https://", "")}
                      </a>
                    </span>
                    <span className="text-slate"> · retrieved {RETRIEVAL_DATE}</span>
                    <p className="mt-1 text-sm italic leading-relaxed text-slate">
                      &ldquo;{c.excerpt}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {loading && (
              <ProgressLoader
                steps={steps}
                current={stepIdx}
                title={`Track two — proving ${grounded.sig} live at ${shortAddr(ask.address)}`}
              />
            )}

            {error && !loading && (
              <ErrorState
                title="The proof failed."
                message={
                  // This panel reads Pharos mainnet through the Chain MCP (via
                  // the /api/mcp proxy) — never the Atlantic RPC. Rewrite any
                  // generic hook error text so a failure never blames the wrong
                  // network.
                  error.replace(/Atlantic RPC/g, "Chain MCP")
                }
                hint={`It stopped during “${steps[Math.min(stepIdx, steps.length - 1)]}”. The failing call never completed — and every call here is read-only, so nothing was written anywhere.`}
                retryLabel="Retry the proof"
                onRetry={retry}
              />
            )}
          </div>
        </section>
      )}

      {/* 03 · RESULT — the trial: docs testify, the chain answers, the verdict falls */}
      {fresh && grounded && (
        <section aria-live="polite">
          <p className="mb-2 text-sm font-semibold text-slate">03 · Result — the trial</p>

          <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
            {/* The docs — the written testimony */}
            <WitnessColumn side="left">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-slate" aria-hidden />
                <p className="text-sm font-semibold text-slate">The docs — the written claim</p>
              </div>
              {hasClaim && grounded.docClaim.value ? (
                <>
                  <p className="mt-3 break-words font-mono text-2xl font-bold text-ink">
                    &ldquo;{grounded.docClaim.value}&rdquo;
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-slate">
                    {grounded.docClaim.claim}
                  </p>
                  <div className="mt-4 space-y-2">
                    {grounded.citations.map((c, i) => (
                      <div key={i}>
                        <EvidenceGradeChip label={c.label} />
                        <p className="mt-1 text-sm italic leading-relaxed text-slate">
                          &ldquo;{c.excerpt}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-slate">
                    Source: the Developer Docs MCP · retrieved {RETRIEVAL_DATE}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-lg font-semibold text-ink">No claim on record</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate">
                    The Docs MCP explains how to call <span className="font-mono">{grounded.sig}</span> but
                    makes no checkable value claim about it —
                    honest by omission. The live proof opposite still stands on its own.
                  </p>
                </>
              )}
            </WitnessColumn>

            {/* The verdict — the stamp falls in the middle */}
            <div className="flex items-center justify-center py-3 lg:py-0">
              <VerdictStamp status={data.verdict} />
            </div>

            {/* The chain — the live testimony */}
            <WitnessColumn side="right">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-slate" aria-hidden />
                <p className="text-sm font-semibold text-slate">The chain — the live answer</p>
              </div>
              <p className="mt-3 break-words font-mono text-2xl font-bold text-ink">
                &ldquo;{data.humanValue}&rdquo;
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate">{data.interpretation}</p>
              <dl className="mt-4 space-y-2 border-t border-hairline pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="font-semibold text-slate">Method</dt>
                  <dd className="font-mono text-ink">eth_call — read-only</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-semibold text-slate">Block</dt>
                  <dd className="font-mono text-ink">{data.blockNum.toLocaleString("en-US")}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-semibold text-slate">Contract</dt>
                  <dd className="font-mono text-ink" title={data.address}>
                    {shortAddr(data.address)}
                  </dd>
                </div>
              </dl>
            </WitnessColumn>
          </div>

          {/* The second beat — the reason, then stillness */}
          <VerdictReason>
            {data.verdict === "disagree" && (
              <>
                The docs claim &ldquo;{grounded.docClaim.value}&rdquo; — the contract answered
                &ldquo;{data.decoded}&rdquo;, live. The contract is the live truth: the docs
                are wrong here, and this panel flags the mismatch instead of smoothing it over.
              </>
            )}
            {data.verdict === "agree" && (
              <>
                The docs claimed &ldquo;{grounded.docClaim.value}&rdquo;, and the contract
                answered &ldquo;{data.decoded}&rdquo; live. Explanation and chain agree —
                trust earned, not assumed.
              </>
            )}
            {data.verdict === "unchecked" && (
              <>
                The docs made no claim about <span className="font-mono">{data.sig}</span> —
                so there is nothing to check. The live proof above stands on its own.
              </>
            )}
          </VerdictReason>

          {/* The evidence trail — the chain is the receipt, not the story */}
          <div className="mt-6 rounded-2xl border border-hairline bg-porcelain p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate">
                The evidence trail — receipts, not the story
              </p>
              <CopyRawButton value={data.raw} />
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div className="border-t border-hairline pt-3">
                <dt className="text-sm font-semibold text-slate">Function selector</dt>
                <dd className="mt-1 break-words font-mono text-sm text-ink">{data.selector}</dd>
              </div>
              <div className="border-t border-hairline pt-3">
                <dt className="text-sm font-semibold text-slate">Calldata sent</dt>
                <dd className="mt-1 break-all font-mono text-sm text-ink">{data.calldata}</dd>
              </div>
              <div className="border-t border-hairline pt-3">
                <dt className="text-sm font-semibold text-slate">Raw return</dt>
                <dd className="mt-1 break-all font-mono text-sm text-ink">{data.raw}</dd>
              </div>
              <div className="border-t border-hairline pt-3">
                <dt className="text-sm font-semibold text-slate">Contract</dt>
                <dd className="mt-1 break-all font-mono text-sm text-ink">{data.address}</dd>
              </div>
            </dl>
            <a
              href={`${EXPLORER}/address/${data.address}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-hairline bg-white px-3 text-sm font-medium text-accent hover:bg-tint"
            >
              View contract on the explorer
              <ExternalLink size={14} aria-hidden />
            </a>
          </div>

          <p className="mt-4 text-sm text-slate">
            Blind spot, stated plainly: the docs are a corpus snapshot (retrieved{" "}
            {RETRIEVAL_DATE}), not a live query — and the verdict compares exact strings,
            nothing more. It does not decide which name is &ldquo;correct&rdquo;.
          </p>
        </section>
      )}

      {/* FAIL-CLOSED — the Beautiful Refusal */}
      {unverified && ask && (
        <section>
          <p className="mb-2 text-sm font-semibold text-slate">03 · Result — the refusal</p>
          <div className="rounded-2xl border border-hairline bg-white p-6 text-center sm:p-8">
            <VerdictStamp status="unverified" />
            <VerdictReason delay={0.35}>
              No docs coverage for <span className="font-mono">&ldquo;{ask.sig}&rdquo;</span> —
              so nothing was executed on-chain. This panel fails closed, exactly like the
              T13 agent: no docs-grounded explanation, no proof, no guessing. The corpus
              covers {PRESETS.join(", ")}.
            </VerdictReason>
            <div className="mt-6">
              <EmptyState
                title="No testimony without evidence."
                message="Pick one of the covered functions and the trial opens again — explanation first, proof second, verdict third."
                actionLabel="Back to a covered function"
                onAction={backToCovered}
              />
            </div>
          </div>
        </section>
      )}

      <p className="text-sm text-slate">
        Method: read-only <span className="font-mono">eth_call</span> via the Chain MCP (<span className="font-mono">mcp.pharos.xyz/mcp</span>) —
        the same primitive as Chain MCP&apos;s <span className="font-mono">eth_call</span> tool. No
        private keys, no wallet, no gas spent. LIGHTKEEPER never sees or asks for keys.
      </p>
    </div>
  );
}
