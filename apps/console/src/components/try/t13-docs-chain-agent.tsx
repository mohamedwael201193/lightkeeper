/**
 * T13 · Docs MCP + Chain MCP Agent — "Explain then prove".
 *
 * Tier A: live read-only eth_call reads on Pharos Atlantic (chain 688689).
 * No wallet, no signature, costs nothing.
 *
 * The visitor types a contract address + a function signature (e.g. totalSupply()).
 * The panel shows the docs-grounded EXPLANATION (every claim labeled
 * DOC-GROUNDED / INFERENCE / UNVERIFIED with the doc URL, retrieval date and
 * verbatim excerpt — from the task's own corpus) side by side with the LIVE
 * on-chain execution of that exact function, decoded and interpreted — and
 * then closes the loop with a VERDICT: does the live chain value agree with
 * what the docs claimed? (It doesn't always — the panel says so.)
 *
 * Fail-closed: when the docs don't cover the function, the panel says
 * [UNVERIFIED] and executes NOTHING.
 *
 * SHOWTIME redesign (2026-10-16): presentation rebuilt on the shared standard —
 * 01 Configure → 02 Run (ProgressLoader with one step per REAL rpc call) →
 * 03 Result (ResultCard showpiece with the docs-vs-chain verdict as the hero).
 * All read/decode/verdict logic is unchanged.
 *
 * The prefilled function is name(): it lands the visitor on the real
 * docs-vs-chain mismatch on the very first run (docs say "Wrapped PHRS",
 * the contract answers "Wrapped Pharos" live) — the verdict is the hero,
 * so the hero gets the default.
 */
import { useEffect, useState } from "react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  isValidAddress,
  rpcCall,
  useAtlanticRead,
} from "../../hooks/useAtlantic";
import { ResultCard, ProgressLoader, EmptyState, ErrorState } from "../ui";

const WPHRS = "0x838800b758277CC111B2d48Ab01e5E164f8E9471";
const RETRIEVAL_DATE = "2026-10-16";
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
  explanation: string;
  citations: Citation[];
  docClaim: DocClaim;
}

const ETH_CALL_CITE: Citation = {
  label: "DOC-GROUNDED",
  url: "https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md",
  section: "eth_call",
  excerpt:
    "eth_call — Executes a message call without creating a transaction. Useful for reading contract state.",
};

const REGISTRY_CITE: Citation = {
  label: "DOC-GROUNDED",
  url: "https://docs.pharos.xyz/getting-started/token-registry.md",
  section: "Atlantic Testnet Token Registry",
  excerpt:
    "Atlantic Testnet Token Registry — Symbol / Name / Decimals / Address: WPHRS / Wrapped PHRS / 18 / 0x838800b758277CC111B2d48Ab01e5E164f8E9471.",
};

const FOUNDRY_CITE: Citation = {
  label: "DOC-GROUNDED",
  url: "https://docs.pharos.xyz/developer-guide/foundry/write-your-first-token.md",
  section: "read pattern",
  excerpt: "uint256 balance = token.balanceOf(msg.sender); — the guide's read pattern.",
};

// Doc-claim constants are quoted verbatim from the corpus token-registry page
// (corpus/getting-started_token-registry.md, retrieved 2026-10-16). They are
// used for the docs-vs-chain verdict, never invented from on-chain values.
const REGISTRY_ROW = "WPHRS / Wrapped PHRS / 18";

const GROUNDED: Record<string, GroundedFn> = {
  "totalsupply()": {
    sig: "totalSupply()",
    selector: "0x18160ddd",
    kind: "uint256",
    needsHolder: false,
    explanation:
      "totalSupply() returns the total number of tokens currently in existence — everything ever minted, minus anything burned. On Atlantic you read it with a read-only eth_call: the JSON-RPC reference documents eth_call as 'Executes a message call without creating a transaction. Useful for reading contract state.' The raw return is in the token's smallest unit; the Atlantic token registry gives the canonical decimals per token (WPHRS: 18) — so the human number is raw ÷ 10^decimals.",
    citations: [ETH_CALL_CITE, REGISTRY_CITE],
    docClaim: { claim: null, value: null },
  },
  "decimals()": {
    sig: "decimals()",
    selector: "0x313ce567",
    kind: "uint8",
    needsHolder: false,
    explanation:
      "decimals() tells you how many decimal places the token uses — the scaling factor between raw on-chain units and the human-readable number. You never assume it: you read it from the contract itself with the same read-only eth_call. The token registry confirms WPHRS uses 18 decimals — and the panel will now verify that number live instead of taking the docs' word for it.",
    citations: [ETH_CALL_CITE, REGISTRY_CITE],
    docClaim: {
      claim: `Token registry row "${REGISTRY_ROW}" — decimals column: 18`,
      value: "18",
    },
  },
  "name()": {
    sig: "name()",
    selector: "0x06fdde03",
    kind: "string",
    needsHolder: false,
    explanation:
      "name() is the token's full human-readable name. The Atlantic token registry lists every token's name and symbol — that identity claim is docs-grounded. [INFERENCE] The on-chain return is an ABI-encoded dynamic string; decoding it is standard ABI mechanics, not doc content — which is exactly what the live execution below will demonstrate.",
    citations: [
      REGISTRY_CITE,
      {
        label: "INFERENCE",
        url: "https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md",
        section: "eth_call output",
        excerpt: "Output: String — Return data as hexadecimal. Interpreting the bytes is left to the caller.",
      },
    ],
    docClaim: {
      claim: `Token registry row "${REGISTRY_ROW}" — name column: "Wrapped PHRS"`,
      value: "Wrapped PHRS",
    },
  },
  "symbol()": {
    sig: "symbol()",
    selector: "0x95d89b41",
    kind: "string",
    needsHolder: false,
    explanation:
      "symbol() is the token's ticker. The Atlantic token registry lists every token's symbol — that identity claim is docs-grounded. [INFERENCE] The on-chain return is an ABI-encoded dynamic string; the live execution decodes it in front of you.",
    citations: [REGISTRY_CITE],
    docClaim: {
      claim: `Token registry row "${REGISTRY_ROW}" — symbol column: "WPHRS"`,
      value: "WPHRS",
    },
  },
  "balanceof(address)": {
    sig: "balanceOf(address)",
    selector: "0x70a08231",
    kind: "uint256",
    needsHolder: true,
    explanation:
      "To read an ERC-20 balance on Pharos Atlantic, call the token's balanceOf(address) view function — a read-only eth_call that executes no transaction and spends no gas. The official JSON-RPC reference documents eth_call as 'Executes a message call without creating a transaction. Useful for reading contract state.' The Foundry first-token guide shows the pattern directly: uint256 balance = token.balanceOf(msg.sender);. Give the panel a holder address and it will run that exact procedure live.",
    citations: [ETH_CALL_CITE, FOUNDRY_CITE, REGISTRY_CITE],
    docClaim: { claim: null, value: null },
  },
};

const PRESETS = ["totalSupply()", "decimals()", "name()", "symbol()", "balanceOf(address)"];

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
    `Executing ${g.sig} on Atlantic`,
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
      `[INFERENCE] The docs corpus lists this token's registry row (${REGISTRY_ROW}) but makes no claim about ${g.sig}, so the verdict is honest by omission: nothing to check. The proof below still stands on its own.`,
    ];
  }
  const agree =
    (g.sig === "decimals()" && decoded === "18") ||
    (g.sig === "symbol()" && decoded === "WPHRS") ||
    (g.sig === "name()" && decoded === "Wrapped PHRS");
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

export default function TryDocsChainAgent({ lamp }: { lamp: Lamp }) {
  void lamp; // page shell renders the name — the module doesn't need it
  const [address, setAddress] = useState(WPHRS);
  const [sigInput, setSigInput] = useState("name()");
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
          `[UNVERIFIED] The docs corpus does not cover "${ask.sig}". Nothing was executed.`
        );
      }
      if (g.needsHolder && !isValidAddress(ask.holder)) {
        throw new Error(
          `balanceOf(address) needs a holder address — enter one above and ask again.`
        );
      }
      const to = ask.address;
      const totalSteps = g.kind === "uint256" ? 4 : 3;

      // Step 0 → 1: pin the latest block.
      setStepIdx(0);
      // NOTE: this RPC names the method "eth_blockNumber" (eth_getBlockNumber 400s here).
      const blockHex = (await rpcCall("eth_blockNumber", [])) as string;

      // Step 1 → 2: bytecode check — explain-then-prove only makes sense against a real contract.
      setStepIdx(1);
      const code = (await rpcCall("eth_getCode", [to, blockHex])) as string;
      if (!code || code === "0x") {
        throw new Error("No contract code at this address — it is a wallet, not a contract.");
      }

      // Step 2 → 3: the actual proof call.
      setStepIdx(2);
      let calldata = g.selector;
      if (g.needsHolder) {
        calldata += ask.holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      }
      const method = "eth_call";
      const raw = (await rpcCall(method, [{ to, data: calldata }, blockHex])) as string;
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
          const decRaw = (await rpcCall(method, [{ to, data: "0x313ce567" }, blockHex])) as string;
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
    setAddress(WPHRS);
    setHolder("");
  };

  const tryEoa = () => {
    setAddress(BURN_ADDRESS);
    setSigInput("totalSupply()");
    setHolder("");
  };

  const backToCovered = () => {
    setSigInput("name()");
    setAddress(WPHRS);
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
        <h3 className="text-base font-semibold text-ink">Explain then prove</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink">
          The T13 agent loop, live in your browser: the panel <strong>explains</strong> what a
          contract function does — every claim labeled DOC-GROUNDED, INFERENCE, or UNVERIFIED —
          then <strong>proves</strong> it by calling that exact function on Pharos Atlantic
          (chain 688689), and finally <strong>verdicts</strong>: does the live chain value agree
          with what the docs claimed? Free reads, no wallet.
        </p>
      </div>

      {/* 01 · CONFIGURE — pick the claim to verify */}
      <section>
        <p className="mb-2 text-sm font-semibold text-slate">
          01 · Configure — pick the claim to verify
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
            {loading ? "Proving on Atlantic…" : "Explain then prove"}
          </button>
        </div>

        {!ask && (
          <div className="mt-4 rounded-2xl border border-hairline bg-porcelain p-5">
            <p className="text-sm font-semibold text-ink">No question asked yet.</p>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              Enter a contract address and a function signature — try{" "}
              <button
                className="font-mono text-accent hover:underline"
                onClick={() => setSigInput("name()")}
              >
                name()
              </button>{" "}
              on WPHRS — then press <strong>Explain then prove</strong>. First you get the
              docs-grounded explanation, then the live on-chain proof, then a docs-vs-chain
              verdict.
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

      {/* 02 · RUN — read the claim, prove it on-chain */}
      {ask && grounded && (
        <section>
          <p className="mb-2 text-sm font-semibold text-slate">
            02 · Run — read the claim, prove it on-chain
          </p>
          <div className="space-y-4">
            <div className="rounded-2xl border border-hairline bg-white p-5 sm:p-6">
              <p className="text-sm font-semibold text-slate">Reading the claim — from the docs</p>
              <p className="mt-2 font-mono text-base font-semibold text-ink">{grounded.sig}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">{grounded.explanation}</p>
              <div className="mt-4 space-y-2">
                {grounded.citations.map((c, i) => (
                  <div key={i} className="rounded-xl border border-hairline bg-porcelain p-3 text-sm">
                    <span
                      className={`mr-2 inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
                        c.label === "DOC-GROUNDED"
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {c.label}
                    </span>
                    <a
                      className="font-mono text-accent hover:underline"
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.url.replace("https://", "")}
                    </a>
                    <span className="text-slate"> · retrieved {RETRIEVAL_DATE}</span>
                    <p className="mt-1 text-sm italic leading-relaxed text-slate">“{c.excerpt}”</p>
                  </div>
                ))}
              </div>
            </div>

            {loading && (
              <ProgressLoader
                steps={steps}
                current={stepIdx}
                title={`Proving ${grounded.sig} — contract ${shortAddr(ask.address)}`}
              />
            )}

            {error && !loading && (
              <ErrorState
                title="The proof failed."
                message={error}
                hint={`It stopped during “${steps[Math.min(stepIdx, steps.length - 1)]}”. The failing call never completed — and every call here is read-only, so nothing was written anywhere.`}
                retryLabel="Retry the proof"
                onRetry={retry}
              />
            )}
          </div>
        </section>
      )}

      {/* 03 · RESULT — the verdict showpiece */}
      {fresh && (
        <section>
          <p className="mb-2 text-sm font-semibold text-slate">03 · Result</p>
          <ResultCard
            eyebrow={hasClaim ? "Verdict — docs vs chain" : `Result — ${data.sig} proven on-chain`}
            headline={
              hasClaim
                ? data.verdict === "agree"
                  ? "Docs ≡ chain"
                  : "Docs ≠ chain"
                : data.humanValue
            }
            status={data.verdict === "agree" ? "pass" : data.verdict === "disagree" ? "fail" : "neutral"}
            subline={hasClaim ? data.verdictNote : data.interpretation}
            rows={
              hasClaim
                ? [
                    { label: "On-chain answer", value: data.decoded },
                    { label: "Function selector", value: data.selector },
                    { label: "Block", value: data.blockNum.toLocaleString("en-US") },
                    {
                      label: "Contract",
                      value: (
                        <span title={data.address} className="break-all">
                          {data.address}
                        </span>
                      ),
                    },
                  ]
                : [
                    { label: "Function", value: data.sig },
                    { label: "Function selector", value: data.selector },
                    { label: "Block", value: data.blockNum.toLocaleString("en-US") },
                    {
                      label: "Contract",
                      value: (
                        <span title={data.address} className="break-all">
                          {data.address}
                        </span>
                      ),
                    },
                  ]
            }
            links={[
              { label: "View contract on the explorer", href: `${EXPLORER_ADDRESS}${data.address}` },
            ]}
            copyValue={data.raw}
          >
            {hasClaim && grounded?.docClaim.value && (
              <div>
                <p className="mb-3 text-sm font-semibold text-slate">Docs vs chain — side by side</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-hairline bg-porcelain p-4">
                    <p className="text-sm font-semibold text-slate">What the docs claim</p>
                    <p className="mt-2 break-words font-mono text-xl font-semibold text-ink">
                      {grounded.docClaim.value}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate">
                      {grounded.docClaim.claim}
                    </p>
                  </div>
                  <div className="rounded-xl border border-hairline bg-porcelain p-4">
                    <p className="text-sm font-semibold text-slate">What the chain answered</p>
                    <p className="mt-2 break-words font-mono text-xl font-semibold text-ink">
                      {data.decoded}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate">
                      Live eth_call at block {data.blockNum.toLocaleString("en-US")} — read-only,
                      zero gas.
                    </p>
                  </div>
                </div>
                {data.verdict === "disagree" && (
                  <p className="mt-3 text-sm font-medium leading-relaxed text-ink">
                    The contract is the live truth — the docs are wrong here, and this panel says
                    so instead of smoothing it over.
                  </p>
                )}
              </div>
            )}
          </ResultCard>
        </section>
      )}

      {/* FAIL-CLOSED */}
      {unverified && ask && (
        <EmptyState
          title={`No docs coverage for “${ask.sig}”`}
          message={`This panel fails closed, exactly like the T13 agent: no docs-grounded explanation, no execution. The corpus covers ${PRESETS.join(", ")} — pick one of those. Nothing was executed on-chain.`}
          actionLabel="Back to a covered function"
          onAction={backToCovered}
        />
      )}

      <p className="text-sm text-slate">
        Method: read-only <span className="font-mono">eth_call</span> via the Atlantic public RPC —
        the same primitive as Chain MCP&apos;s <span className="font-mono">eth_call</span> tool. No
        private keys, no wallet, no gas spent. LIGHTKEEPER never sees or asks for keys.
      </p>
    </div>
  );
}
