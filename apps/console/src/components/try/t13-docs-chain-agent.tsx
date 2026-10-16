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
 * on-chain execution of that exact function, decoded and interpreted.
 *
 * Fail-closed: when the docs don't cover the function, the panel says
 * [UNVERIFIED] and executes NOTHING.
 */
import { useEffect, useState } from "react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  isValidAddress,
  rpcCall,
  useAtlanticRead,
} from "../../hooks/useAtlantic";

const WPHRS = "0x838800b758277CC111B2d48Ab01e5E164f8E9471";
const RETRIEVAL_DATE = "2026-10-16";

interface Citation {
  label: "DOC-GROUNDED" | "INFERENCE";
  url: string;
  section: string;
  excerpt: string;
}

interface GroundedFn {
  sig: string;
  selector: string;
  kind: "uint256" | "uint8" | "string";
  needsHolder: boolean;
  explanation: string;
  citations: Citation[];
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

const GROUNDED: Record<string, GroundedFn> = {
  "totalsupply()": {
    sig: "totalSupply()",
    selector: "0x18160ddd",
    kind: "uint256",
    needsHolder: false,
    explanation:
      "totalSupply() returns the total number of tokens currently in existence — everything ever minted, minus anything burned. On Atlantic you read it with a read-only eth_call: the JSON-RPC reference documents eth_call as 'Executes a message call without creating a transaction. Useful for reading contract state.' The raw return is in the token's smallest unit; the Atlantic token registry gives the canonical decimals per token (WPHRS: 18) — so the human number is raw ÷ 10^decimals.",
    citations: [ETH_CALL_CITE, REGISTRY_CITE],
  },
  "decimals()": {
    sig: "decimals()",
    selector: "0x313ce567",
    kind: "uint8",
    needsHolder: false,
    explanation:
      "decimals() tells you how many decimal places the token uses — the scaling factor between raw on-chain units and the human-readable number. You never assume it: you read it from the contract itself with the same read-only eth_call. The token registry confirms WPHRS uses 18 decimals — and the panel will now verify that number live instead of taking the docs' word for it.",
    citations: [ETH_CALL_CITE, REGISTRY_CITE],
  },
  "name()": {
    sig: "name()",
    selector: "0x06fdde03",
    kind: "string",
    needsHolder: false,
    explanation:
      "name() is the token's full human-readable name (WPHRS = 'Wrapped PHRS'). The Atlantic token registry lists every token's name and symbol — that identity claim is docs-grounded. [INFERENCE] The on-chain return is an ABI-encoded dynamic string; decoding it is standard ABI mechanics, not doc content — which is exactly what the live execution below will demonstrate.",
    citations: [
      REGISTRY_CITE,
      {
        label: "INFERENCE",
        url: "https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md",
        section: "eth_call output",
        excerpt: "Output: String — Return data as hexadecimal. Interpreting the bytes is left to the caller.",
      },
    ],
  },
  "symbol()": {
    sig: "symbol()",
    selector: "0x95d89b41",
    kind: "string",
    needsHolder: false,
    explanation:
      "symbol() is the token's ticker (WPHRS). The Atlantic token registry lists every token's symbol — that identity claim is docs-grounded. [INFERENCE] The on-chain return is an ABI-encoded dynamic string; the live execution decodes it in front of you.",
    citations: [REGISTRY_CITE],
  },
  "balanceof(address)": {
    sig: "balanceOf(address)",
    selector: "0x70a08231",
    kind: "uint256",
    needsHolder: true,
    explanation:
      "To read an ERC-20 balance on Pharos Atlantic, call the token's balanceOf(address) view function — a read-only eth_call that executes no transaction and spends no gas. The official JSON-RPC reference documents eth_call as 'Executes a message call without creating a transaction. Useful for reading contract state.' The Foundry first-token guide shows the pattern directly: uint256 balance = token.balanceOf(msg.sender);. Give the panel a holder address and it will run that exact procedure live.",
    citations: [ETH_CALL_CITE, FOUNDRY_CITE, REGISTRY_CITE],
  },
};

const PRESETS = ["totalSupply()", "decimals()", "name()", "symbol()", "balanceOf(address)"];

function normSig(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
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

interface ProofResult {
  sig: string;
  selector: string;
  raw: string;
  decoded: string;
  interpretation: string;
  blockNum: number;
  blockHex: string;
  address: string;
}

export default function TryDocsChainAgent({ lamp }: { lamp: Lamp }) {
  const [address, setAddress] = useState(WPHRS);
  const [sigInput, setSigInput] = useState("totalSupply()");
  const [holder, setHolder] = useState("");
  const [ask, setAsk] = useState<{ address: string; sig: string; holder: string } | null>(null);
  const [touched, setTouched] = useState(false);

  const grounded = ask ? GROUNDED[normSig(ask.sig)] : null;
  const addrValid = isValidAddress(address);
  const holderTrimmed = holder.trim();
  const holderValid = holderTrimmed === "" || isValidAddress(holderTrimmed);
  const needsHolder = grounded?.needsHolder ?? normSig(sigInput).startsWith("balanceof(");

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

      // Bytecode check — explain-then-prove only makes sense against a real contract.
      const blockHex = (await rpcCall("eth_getBlockNumber", [])) as string;
      const code = (await rpcCall("eth_getCode", [to, blockHex])) as string;
      if (!code || code === "0x") {
        throw new Error("No contract code at this address — it is a wallet, not a contract.");
      }

      let calldata = g.selector;
      if (g.needsHolder) {
        calldata += ask.holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      }
      const raw = (await rpcCall("eth_call", [{ to, data: calldata }, blockHex])) as string;
      if (!raw || raw === "0x") {
        throw new Error(
          `The call reverted or returned empty — this contract does not implement ${g.sig}.`
        );
      }

      const blockNum = Number(BigInt(blockHex));
      let decoded: string;
      let interpretation: string;

      if (g.kind === "string") {
        decoded = decodeAbiString(raw);
        interpretation = `[INFERENCE] ${g.sig} returned the ABI-encoded string "${decoded}" at block ${blockNum}. Read-only eth_call — no transaction, no gas spent.`;
      } else if (g.kind === "uint8") {
        decoded = Number(BigInt(raw)).toString();
        interpretation = `[INFERENCE] ${g.sig} returned ${decoded} at block ${blockNum}. This is the scaling factor the docs say never to assume — now verified live. Read-only, zero gas.`;
      } else {
        const big = BigInt(raw);
        decoded = big.toString();
        // For the human number, read decimals() live — never assume.
        let human = `${decoded} raw units`;
        try {
          const decRaw = (await rpcCall("eth_call", [{ to, data: "0x313ce567" }, blockHex])) as string;
          if (decRaw && decRaw !== "0x") {
            const dec = Number(BigInt(decRaw));
            human = `${formatUnits(big, dec)} (raw ÷ 10^${dec}, decimals read live)`;
          }
        } catch {
          human = `${decoded} raw units (decimals() reverted — shown raw, not guessed)`;
        }
        interpretation = `[INFERENCE] ${g.sig} returned ${human} at block ${blockNum}. Read-only eth_call — no transaction, no gas spent.`;
      }

      return { sig: g.sig, selector: g.selector, raw, decoded, interpretation, blockNum, blockHex, address: to };
    },
    [ask],
    { auto: false }
  );

  useEffect(() => {
    if (ask) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const askAgent = () => {
    setTouched(true);
    if (!addrValid || !holderValid) return;
    setAsk({ address: address.trim(), sig: sigInput, holder: holderTrimmed });
  };

  const unverified = touched && ask && !grounded;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-ink">Explain then prove</h3>
        <p className="text-sm text-slate">
          The T13 agent loop, live in your browser: the panel <strong>explains</strong> what a
          contract function does — every claim labeled DOC-GROUNDED, INFERENCE, or UNVERIFIED with
          the doc URL, retrieval date, and verbatim excerpt — then <strong>proves</strong> it by
          calling that exact function on Pharos Atlantic (chain 688689) and interpreting the result.
          Free reads, no wallet. ({lamp.name})
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
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
            <p className="mt-1 text-sm text-fail">That isn't a valid 0x address (40 hex characters).</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
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
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate">
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
            <p className="mt-1 text-sm text-fail">That isn't a valid 0x address (40 hex characters).</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            className={`chip cursor-pointer font-mono ${normSig(sigInput) === normSig(p) ? "ring-2 ring-accent" : ""}`}
            onClick={() => setSigInput(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <button className="btn-primary" onClick={askAgent} disabled={loading}>
        {loading ? "Proving on Atlantic…" : "Explain then prove"}
      </button>

      {/* EXPLANATION PANEL */}
      {ask && grounded && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-hairline bg-porcelain p-4">
            <p className="smallcaps mb-2 text-xs font-semibold text-slate">① Explanation — from the docs</p>
            <p className="mb-1 font-mono text-sm font-semibold text-ink">{grounded.sig}</p>
            <p className="text-sm text-ink">{grounded.explanation}</p>
            <div className="mt-3 space-y-2">
              {grounded.citations.map((c, i) => (
                <div key={i} className="rounded-lg bg-white p-2 text-xs">
                  <span
                    className={`mr-2 inline-block rounded px-1.5 py-0.5 font-mono font-semibold ${
                      c.label === "DOC-GROUNDED" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
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
                  <p className="mt-1 italic text-slate">“{c.excerpt}”</p>
                </div>
              ))}
            </div>
          </div>

          {/* PROOF PANEL */}
          <div className="rounded-xl border border-hairline bg-porcelain p-4">
            <p className="smallcaps mb-2 text-xs font-semibold text-slate">② Proof — live on Atlantic</p>
            {loading && <p className="text-sm text-slate">Executing the exact function on-chain…</p>}
            {error && (
              <div>
                <p className="text-sm font-semibold text-ink">The proof failed — loudly, not silently.</p>
                <p className="mt-1 text-sm text-slate">{error}</p>
              </div>
            )}
            {data && !loading && (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-mono font-semibold text-ink">{data.sig}</span>{" "}
                  <span className="font-mono text-xs text-slate">{data.selector}</span>
                </p>
                <div className="code-block break-all font-mono text-xs">raw: {data.raw}</div>
                <p>
                  <span className="text-slate">decoded: </span>
                  <span className="font-mono font-semibold text-ink">{data.decoded}</span>
                </p>
                <p className="text-ink">{data.interpretation}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="chip">block {data.blockNum.toLocaleString()}</span>
                  <a
                    className="font-mono text-xs text-accent hover:underline"
                    href={`${EXPLORER_ADDRESS}${data.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    view contract on explorer
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAIL-CLOSED */}
      {unverified && (
        <div className="empty-panel px-5 py-5">
          <p className="text-sm font-semibold text-ink">
            <span className="mr-2 inline-block rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink">
              UNVERIFIED
            </span>
            The docs corpus does not cover <span className="font-mono">“{ask.sig}”</span>.
          </p>
          <p className="mt-2 text-sm text-slate">
            This panel fails closed, exactly like the T13 agent: no docs-grounded explanation, no
            execution. The corpus covers {PRESETS.join("  ·  ")} — pick one of those, or extend the
            corpus in <span className="font-mono">tasks/t13-docs-chain-agent/corpus/</span> and the
            explanation will follow. Nothing was executed on-chain.
          </p>
        </div>
      )}

      {!ask && (
        <div className="empty-panel px-5 py-6">
          <p className="text-sm font-semibold text-ink">No question asked yet.</p>
          <p className="mt-1 text-sm text-slate">
            Enter a contract address and a function signature — try{" "}
            <button className="font-mono text-accent hover:underline" onClick={() => setSigInput("totalSupply()")}>
              totalSupply()
            </button>{" "}
            on WPHRS — then press <strong>Explain then prove</strong>. The explanation appears on the
            left, the live on-chain proof on the right.
          </p>
        </div>
      )}

      <p className="text-xs text-slate">
        Method: read-only <span className="font-mono">eth_call</span> via the Atlantic public RPC —
        the same primitive as Chain MCP's <span className="font-mono">eth_call</span> tool. No private
        keys, no wallet, no gas spent. LIGHTKEEPER never sees or asks for keys.
      </p>
    </div>
  );
}
