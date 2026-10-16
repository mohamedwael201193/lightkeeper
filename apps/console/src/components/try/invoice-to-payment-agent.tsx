/**
 * T19 — Invoice-to-Payment Agent (Tier A live reads + Tier B visitor signing).
 *
 * "Invoice to money in one review": paste invoice text -> the console's
 * client-side extractor (same no-guess rules as the agent's parsers.py)
 * pulls payee / amount / token / reference from JSON, CSV, KEY:value, or
 * free-text formats -> structured preview with mismatch flags -> propose()
 * -> MANDATORY review (payee, amount, reference, wallet-balance coverage,
 * amber dust warning) -> the VISITOR signs in their own wallet -> receipt +
 * explorer link.
 *
 * Journey: 01 Configure (invoice text) -> 02 Parse (ProgressLoader: parsing,
 * then a real wallet-balance coverage read) -> 03 Result (the invoice as a
 * premium document — total as the hero number, line items as elegant rows;
 * payment review -> sign -> receipt).
 *
 * LIGHTKEEPER never holds keys; the visitor's wallet signs and sends.
 * Honesty rule kept verbatim from the agent: a native PHRS transfer has no
 * memo bytes, so the invoice reference is bound in the review and the
 * payment label — never faked on-chain.
 */
import { useRef, useState } from "react";
import type { Lamp } from "../../types";
import { useWallet } from "../WalletContext";
import {
  EXPLORER_TX,
  rpcCall,
  useAtlanticRead,
  useProposeAndSign,
} from "../../hooks/useAtlantic";
import {
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  type FeedItem,
} from "../ui";
import {
  FORMAT_LABEL,
  SETTLED,
  SAMPLE_BROKEN,
  SAMPLE_CSV,
  SAMPLE_JSON,
  SAMPLE_TXT,
  extractInvoice,
  shortHex,
  weiOf,
  weiToPhrs,
  type ExtractedInvoice,
} from "./invoice-extract";

/* ------------------------------------------------------------------ */

interface ChainContext {
  block: number;
  gasGwei: number;
}

interface Coverage {
  balancePhrs: string;
  covers: boolean;
}

const JOURNEY = ["01 · Configure", "02 · Parse", "03 · Result"];

/** Yield one frame so the ProgressLoader paints before sync work starts. */
function nextFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 40));
}

export default function TryInvoice({ lamp }: { lamp: Lamp }) {
  const { state: wallet, connect } = useWallet();
  const { state, proposal, txHash, error, propose, approve, cancel } =
    useProposeAndSign();

  const [invoiceText, setInvoiceText] = useState("");
  const [invoice, setInvoice] = useState<ExtractedInvoice | null>(null);
  const [runPhase, setRunPhase] = useState<{ step: number; steps: string[] } | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageNote, setCoverageNote] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Tier A live read: current Atlantic block + gas price. Plain-language
  // error with retry if the RPC is unreachable — never a silent dead end.
  const chain = useAtlanticRead<ChainContext>(async () => {
    const [blockHex, gasHex] = await Promise.all([
      rpcCall("eth_blockNumber", []),
      rpcCall("eth_gasPrice", []),
    ]);
    if (typeof blockHex !== "string" || typeof gasHex !== "string") {
      throw new Error("The Atlantic RPC answered in an unexpected shape.");
    }
    const block = parseInt(blockHex, 16);
    if (!Number.isFinite(block) || block <= 0) {
      throw new Error("The Atlantic RPC answered in an unexpected shape.");
    }
    return { block, gasGwei: Number(BigInt(gasHex)) / 1e9 };
  }, []);

  const walletConnected =
    wallet.status === "connected" && wallet.networkOk;
  const walletAddress =
    wallet.status === "connected" ? wallet.address : null;

  /* Act 02 — parse: each loader step maps to REAL work. Step 1 is the
     client-side extraction; step 2 is a fresh eth_getBalance read so the
     coverage figure is measured, not assumed. */
  const analyzeText = async (text: string) => {
    cancel();
    setCoverage(null);
    setCoverageNote(null);
    const steps = ["Parsing invoice — extracting payee, amount, reference"];
    const withCoverage = walletConnected && walletAddress != null;
    if (withCoverage) {
      steps.push("Checking wallet coverage — reading your balance");
    }
    setRunPhase({ step: 0, steps });
    await nextFrame();
    const inv = extractInvoice(text);
    setInvoice(inv);
    setRunPhase({ step: 1, steps });
    if (withCoverage && walletAddress) {
      try {
        const balHex = await rpcCall("eth_getBalance", [walletAddress, "latest"]);
        if (typeof balHex !== "string") throw new Error("bad shape");
        const balWei = BigInt(balHex);
        const invWei = inv.amount ? weiOf(inv.amount) : null;
        setCoverage({
          balancePhrs: weiToPhrs(balWei),
          covers: invWei == null ? true : balWei >= invWei,
        });
      } catch {
        setCoverageNote(
          "Could not read the wallet balance just now — your wallet will show it when you sign."
        );
      }
    }
    setRunPhase(null);
  };

  const analyze = () => analyzeText(invoiceText);

  const pickSample = (sample: string) => {
    setInvoiceText(sample);
    chain.refetch();
    void analyzeText(sample);
  };

  const editText = (text: string) => {
    cancel();
    setInvoice(null);
    setCoverage(null);
    setCoverageNote(null);
    setInvoiceText(text);
  };

  const clean = invoice != null && invoice.flags.length === 0;

  const handlePropose = () => {
    if (!invoice || !clean) return;
    propose({
      to: invoice.payee,
      valuePhrs: invoice.amount,
      label: `Pay ${invoice.amount} PHRS to ${invoice.payee} — invoice ${invoice.invoice_id} (ref ${invoice.reference})`,
    });
  };

  const stepIdx = runPhase != null ? 1 : invoice != null ? 2 : 0;
  const inSignFlow =
    state === "review" ||
    state === "awaiting-signature" ||
    state === "broadcasting" ||
    state === "blocked" ||
    state === "error" ||
    state === "confirmed";

  const signStep =
    state === "awaiting-signature" ? 0 : state === "broadcasting" ? 1 : 0;

  const settledItems: FeedItem[] = SETTLED.map((s) => ({
    key: s.tx,
    node: (
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">{s.label}</p>
        <a
          className="font-mono text-sm text-accent hover:underline"
          href={`${EXPLORER_TX}${s.tx}`}
          target="_blank"
          rel="noreferrer"
          title={s.tx}
        >
          {shortHex(s.tx)} ↗
        </a>
      </div>
    ),
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-slate">
          Tier B — paste, review, sign it yourself
        </p>
        <h3 className="mt-1 text-xl font-semibold text-ink">
          Invoice to money in one review
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink">
          Paste an invoice in any of 4 formats — <strong>JSON</strong>,{" "}
          <strong>CSV</strong>, <strong>KEY: value</strong>, or{" "}
          <strong>free text</strong>. LIGHTKEEPER extracts payee, amount, token,
          and reference with the same no-guess rules as the invoice agent:
          mismatches and missing fields are flagged, never guessed. Then it
          hands you one review — and your wallet settles it on Atlantic.
        </p>
      </div>

      {/* Journey */}
      <ol className="flex flex-wrap gap-2" aria-label="Progress">
        {JOURNEY.map((s, i) => (
          <li
            key={s}
            aria-current={i === stepIdx ? "step" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              i === stepIdx
                ? "border-accent bg-tint font-semibold text-ink"
                : i < stepIdx
                  ? "border-hairline bg-porcelain text-slate"
                  : "border-hairline text-slate"
            }`}
          >
            {s}
          </li>
        ))}
      </ol>

      {/* 01 · Configure */}
      <section
        aria-label="Configure"
        className="rounded-2xl border border-hairline bg-white p-6"
      >
        <p className="text-sm font-semibold text-slate">Invoice text</p>

        {/* Tier A live read: Atlantic now */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate">
          <span className="text-sm font-semibold">Atlantic now</span>
          {chain.loading && !chain.data && <span>Reading the chain…</span>}
          {chain.data && (
            <span className="font-mono text-ink">
              block {chain.data.block.toLocaleString("en-US")} · gas{" "}
              {chain.data.gasGwei.toFixed(2)} gwei
            </span>
          )}
          {chain.data && !chain.loading && (
            <button className="text-accent underline" onClick={chain.refetch}>
              Refresh
            </button>
          )}
          {chain.error && !chain.loading && (
            <span className="text-fail">
              RPC unreachable: {chain.error}{" "}
              <button className="text-accent underline" onClick={chain.refetch}>
                Retry
              </button>
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => pickSample(SAMPLE_JSON)}>
            Sample: JSON invoice
          </button>
          <button className="btn-outline" onClick={() => pickSample(SAMPLE_CSV)}>
            Sample: CSV invoice
          </button>
          <button className="btn-outline" onClick={() => pickSample(SAMPLE_TXT)}>
            Sample: plaintext invoice
          </button>
          <button className="btn-outline" onClick={() => pickSample(SAMPLE_BROKEN)}>
            Sample: broken invoice
          </button>
        </div>

        <textarea
          ref={textareaRef}
          className="code-block mt-4 h-44 w-full resize-y font-mono text-sm"
          placeholder={`Paste invoice text here…

JSON {"invoice_id":"INV-…","payee":"0x…","amount":"0.001","currency":"PHRS","reference":"…"}
CSV  invoice_id,payee,amount,currency,reference  (one row)
KEY: value lines — INVOICE / PAYEE / AMOUNT / CURRENCY / REFERENCE / MEMO
Free text — "Invoice INV-9 for 0.003 PHRS to 0x… ref LK-…"`}
          value={invoiceText}
          onChange={(e) => editText(e.target.value)}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="btn-primary min-h-[44px]"
            disabled={!invoiceText.trim() || runPhase != null}
            onClick={analyze}
          >
            Extract &amp; validate
          </button>
          {invoice && runPhase == null && (
            <span className="chip chip-info">
              Detected format: {FORMAT_LABEL[invoice.format]}
            </span>
          )}
        </div>
      </section>

      {/* 02 · Parse — live progress, one step per real unit of work */}
      {runPhase != null && (
        <ProgressLoader steps={runPhase.steps} current={runPhase.step} />
      )}

      {/* 03 · Result */}
      {runPhase == null && invoice != null && (
        <div className="space-y-6">
          {!clean ? (
            /* Invalid invoice — honest refusal, every flag on the record. */
            <div className="space-y-4">
              <ErrorState
                title={`Invoice refused — ${invoice.flags.length} flag${invoice.flags.length === 1 ? "" : "s"}`}
                message="The extractor found problems it will not guess around. Nothing can be paid from this text."
                hint="Fix the invoice text (or the invoice itself) and extract again — LIGHTKEEPER never fills the gaps."
              />
              <FeedList
                items={invoice.flags.map((f, i) => ({
                  key: `flag-${i}`,
                  node: <p className="text-sm text-ink">{f}</p>,
                }))}
                emptyText="No flags."
                maxHeight="max-h-64"
              />
              <button
                className="btn-primary min-h-[44px]"
                onClick={() => textareaRef.current?.focus()}
              >
                Edit the invoice text
              </button>
            </div>
          ) : (
            /* The invoice as a document — total is the hero number. */
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className="chip chip-pass">Clean — no flags</span>
                <span className="chip chip-info">
                  Format: {FORMAT_LABEL[invoice.format]}
                </span>
              </div>
              <ResultCard
                eyebrow={`Invoice ${invoice.invoice_id} — verified clean`}
                headline={`${invoice.amount} PHRS`}
                subline="Ready to settle on Atlantic. You review the payment and sign in your own wallet — LIGHTKEEPER never touches keys."
                status="pass"
                copyValue={invoice.payee}
                rows={[
                  {
                    label: "Invoice id",
                    value: <span title={invoice.invoice_id}>{invoice.invoice_id}</span>,
                  },
                  {
                    label: "Payee",
                    value: <span title={invoice.payee}>{shortHex(invoice.payee)}</span>,
                  },
                  {
                    label: "Reference",
                    value: <span title={invoice.reference}>{invoice.reference}</span>,
                  },
                  { label: "Token", value: invoice.currency },
                  ...(invoice.memo
                    ? [{ label: "Memo", value: invoice.memo }]
                    : []),
                ]}
              >
                {invoice.lineItems.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate">Line items</p>
                    <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
                      {invoice.lineItems.map((li, i) => (
                        <li
                          key={i}
                          className="flex items-baseline justify-between gap-4 py-3"
                        >
                          <span className="text-sm text-ink">
                            {li.description || "—"}
                          </span>
                          <span className="shrink-0 font-mono text-sm text-ink">
                            {li.amount ? `${li.amount} PHRS` : "—"}
                          </span>
                        </li>
                      ))}
                      <li className="flex items-baseline justify-between gap-4 bg-porcelain px-3 py-3">
                        <span className="text-sm font-semibold text-ink">Total</span>
                        <span className="font-mono text-sm font-semibold text-ink">
                          {invoice.amount} PHRS
                        </span>
                      </li>
                    </ul>
                    <p className="mt-2 text-sm text-slate">
                      Line items add up to the invoice total — checked by the
                      extractor, not by hand.
                    </p>
                  </div>
                )}
                <p className="text-sm text-slate">
                  Honesty rule: a native PHRS transfer has no memo bytes, so the
                  invoice reference is bound in the review below and the payment
                  label — never faked on-chain.
                </p>
              </ResultCard>

              {/* Settle — the Tier B gate */}
              {!inSignFlow && !walletConnected && (
                <div className="rounded-2xl border border-hairline bg-white p-6">
                  <p className="text-sm text-ink">
                    The invoice is clean. To settle it, connect your wallet —
                    you will review and sign the payment yourself, with your
                    testnet PHRS.
                  </p>
                  <button
                    className="btn-primary mt-4 min-h-[44px]"
                    onClick={connect}
                  >
                    Connect wallet to settle
                  </button>
                </div>
              )}

              {!inSignFlow && walletConnected && state === "idle" && (
                <button
                  className="btn-primary min-h-[44px]"
                  onClick={handlePropose}
                >
                  Review this payment
                </button>
              )}

              {/* Mandatory review — sign nothing yet */}
              {state === "review" && proposal && (
                <div className="space-y-4">
                  <ResultCard
                    eyebrow="Payment review — sign nothing yet"
                    headline={`${proposal.valuePhrs} PHRS`}
                    subline={proposal.label}
                    rows={[
                      {
                        label: "To",
                        value: <span title={proposal.to}>{shortHex(proposal.to)}</span>,
                      },
                      {
                        label: "Invoice",
                        value: invoice.invoice_id,
                      },
                      {
                        label: "Reference",
                        value: invoice.reference,
                      },
                      {
                        label: "Wallet balance",
                        value: coverage
                          ? `${coverage.balancePhrs} PHRS`
                          : "Shown in your wallet",
                      },
                    ]}
                  >
                    {/* Dust warning — amber, from the hook's own propose() gate */}
                    {error && (
                      <p className="rounded-xl border border-golddeep/50 bg-golddeep/10 px-4 py-3 text-sm font-semibold text-golddeep">
                        {error}
                      </p>
                    )}
                    {coverage &&
                      (coverage.covers ? (
                        <p className="text-sm text-ink">
                          <span className="chip chip-pass mr-2">Balance covers it</span>
                          {coverage.balancePhrs} PHRS available in your wallet.
                        </p>
                      ) : (
                        <p className="rounded-xl border border-golddeep/50 bg-golddeep/10 px-4 py-3 text-sm font-semibold text-golddeep">
                          Your wallet shows {coverage.balancePhrs} PHRS — this
                          invoice is {proposal.valuePhrs} PHRS. Nothing is
                          blocked: your wallet will simply refuse to sign what
                          you don't have.
                        </p>
                      ))}
                    {coverageNote && (
                      <p className="text-sm text-slate">{coverageNote}</p>
                    )}
                    <p className="text-sm text-slate">
                      Signing happens 100% in YOUR wallet — LIGHTKEEPER never
                      sees or asks for private keys. Testnet only (Pharos
                      Atlantic, chain 688689).
                    </p>
                  </ResultCard>
                  <div className="sticky bottom-3 z-10 flex gap-2 rounded-2xl border border-hairline bg-white/95 p-3 shadow-lg backdrop-blur">
                    <button
                      className="btn-primary min-h-[44px] flex-1"
                      onClick={approve}
                    >
                      Sign in my wallet
                    </button>
                    <button
                      className="btn-outline min-h-[44px]"
                      onClick={cancel}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* In-flight signing — steps follow the real wallet/RPC events */}
              {(state === "awaiting-signature" || state === "broadcasting") && (
                <ProgressLoader
                  title="Settling on Atlantic"
                  steps={[
                    "Waiting for your signature",
                    "Broadcasting to Atlantic",
                    "Waiting for the mining receipt",
                  ]}
                  current={signStep}
                />
              )}

              {state === "blocked" && (
                <ErrorState
                  title="Payment blocked"
                  message={error ?? "The payment was blocked before anything was signed."}
                  hint="Fix the destination or amount, or switch your wallet to Pharos Atlantic Testnet (chain 688689)."
                  retryLabel="Dismiss"
                  onRetry={cancel}
                />
              )}

              {state === "error" && (
                <div className="space-y-3">
                  <ErrorState
                    title="The signing step failed"
                    message={error ?? "Your wallet did not complete the signature."}
                    hint="Nothing was broadcast. You can try again or start over."
                    retryLabel="Try signing again"
                    onRetry={() => void approve()}
                  />
                  <button className="btn-outline" onClick={cancel}>
                    Start over
                  </button>
                </div>
              )}

              {/* Receipt */}
              {state === "confirmed" && txHash && (
                <ResultCard
                  eyebrow="Paid — confirmed on Atlantic"
                  headline="Payment settled"
                  subline="Signed in your wallet — mined on Pharos Atlantic. The invoice reference lives in the review above and the payment label."
                  status="pass"
                  copyValue={txHash}
                  rows={[
                    {
                      label: "Transaction",
                      value: <span title={txHash}>{shortHex(txHash)}</span>,
                    },
                    {
                      label: "Amount",
                      value: `${proposal?.valuePhrs ?? invoice.amount} PHRS`,
                    },
                    {
                      label: "Payee",
                      value: (
                        <span title={proposal?.to ?? invoice.payee}>
                          {shortHex(proposal?.to ?? invoice.payee)}
                        </span>
                      ),
                    },
                    { label: "Invoice", value: invoice.invoice_id },
                  ]}
                  links={[
                    {
                      label: "View transaction on the explorer",
                      href: `${EXPLORER_TX}${txHash}`,
                    },
                  ]}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Evidence — settled by the agent, real Atlantic receipts */}
      <section aria-label="Settled by the agent" className="space-y-3">
        <p className="text-sm font-semibold text-slate">
          Settled by the agent on Atlantic
        </p>
        <FeedList
          items={settledItems}
          emptyText="No agent settlements recorded yet."
          maxHeight="max-h-48"
        />
      </section>

      <p className="text-sm text-slate">
        {lamp.name} · live Atlantic reads (Tier A) + visitor-signed settlement
        (Tier B) — every live control proposes a real Atlantic transaction for
        your wallet, or is absent with a stated reason.
      </p>
    </div>
  );
}
