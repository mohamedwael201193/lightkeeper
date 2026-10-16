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
 * Live Atlantic context (current block + gas price) is read from the RPC
 * under the input — if the RPC is down the page says so plainly with a
 * retry, never a dead end.
 *
 * LIGHTKEEPER never holds keys; the visitor's wallet signs and sends.
 * Honesty rule kept verbatim from the agent: a native PHRS transfer has no
 * memo bytes, so the invoice reference is bound in the review and the
 * payment label — never faked on-chain.
 */
import { useMemo, useState } from "react";
import type { Lamp } from "../../types";
import { useWallet } from "../WalletContext";
import {
  EXPLORER_TX,
  rpcCall,
  useAtlanticRead,
  useProposeAndSign,
} from "../../hooks/useAtlantic";

/* ------------------------------------------------------------------ */
/* Extraction — mirrors tasks/t19-invoice-to-payment-agent/agent/parsers.py */
/* ------------------------------------------------------------------ */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ANY_ADDRESS_RE = /0x[0-9a-fA-F]{40}/g;
const CURRENCY_TOKENS_RE = /\b(PHRS|USDC|USDT|ETH|BTC|USD|EUR)\b/gi;

export interface ExtractedInvoice {
  format: "json" | "csv" | "key-value" | "free-text";
  invoice_id: string;
  payee: string;
  amount: string;
  currency: string;
  reference: string;
  memo: string;
  lineItems: { description: string; amount: string }[];
  flags: string[];
  fieldFlags: Partial<Record<"invoice_id" | "payee" | "amount" | "currency" | "reference", string>>;
}

const TXT_KEYMAP: Record<string, keyof Omit<ExtractedInvoice, "format" | "flags" | "fieldFlags" | "lineItems">> = {
  INVOICE: "invoice_id",
  INVOICE_ID: "invoice_id",
  PAYEE: "payee",
  TO: "payee",
  AMOUNT: "amount",
  CURRENCY: "currency",
  REFERENCE: "reference",
  REF: "reference",
  MEMO: "memo",
};

function validAmount(raw: string | undefined): string | null {
  if (raw == null || !raw.trim()) return null;
  const s = raw.trim();
  // On-chain reality: wei has exactly 18 decimals — more precision can never
  // settle, so it is flagged rather than silently rounded.
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? s : null;
}

/** Exact wei conversion for a validated decimal PHRS string; null when invalid. */
function weiOf(phrs: string): bigint | null {
  const s = phrs.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  return BigInt(i) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
}

function sharpenerHeuristics(text: string, flags: string[]): void {
  // Deepened extraction: ambiguity sensors. These never correct anything —
  // they only flag, so a bad invoice can never be paid by accident.
  const addrMatches = text.match(ANY_ADDRESS_RE) ?? [];
  const uniqueAddrs = [...new Set(addrMatches.map((a) => a.toLowerCase()))];
  if (uniqueAddrs.length > 1) {
    flags.push(
      `Ambiguity: ${uniqueAddrs.length} different payee addresses appear in the text — refused, never guessed.`
    );
  }
  const currencyMentions = [
    ...new Set([...text.matchAll(CURRENCY_TOKENS_RE)].map((m) => m[1].toUpperCase())),
  ].filter((c) => c !== "PHRS");
  for (const c of currencyMentions) {
    flags.push(`Currency mention '${c}' detected — this agent pays PHRS on Atlantic only; flagged, never converted.`);
  }
  if (/\d{1,3}(,\d{3})+(\.\d+)?/.test(text)) {
    flags.push(
      "Thousands separators (e.g. 1,250.00) detected — ambiguous in mixed-locale invoices; flagged, not re-parsed."
    );
  }
}

function csvRowSplit(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseLineItems(raw: string, flags: string[]): { description: string; amount: string }[] {
  const items: { description: string; amount: string }[] = [];
  for (const pair of raw.split(";")) {
    const p = pair.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq < 0) {
      flags.push(`Malformed line-items entry '${p}' (expected 'description=amount') — refused.`);
      return [];
    }
    items.push({ description: p.slice(0, eq).trim(), amount: p.slice(eq + 1).trim() });
  }
  return items;
}

function validateCommon(
  draft: ExtractedInvoice,
  raw: { invoice_id?: string; payee?: string; amount?: string; currency?: string; reference?: string }
): ExtractedInvoice {
  const { flags, fieldFlags } = draft;

  draft.invoice_id = (raw.invoice_id ?? "").trim();
  if (!draft.invoice_id) {
    flags.push("missing required field 'invoice_id' — flagged, not defaulted.");
    fieldFlags.invoice_id = "missing";
  }

  const payee = (raw.payee ?? "").trim();
  if (!ADDRESS_RE.test(payee)) {
    flags.push(`payee '${payee || "(empty)"}' is not a valid 0x-address (expected 0x + 40 hex chars) — refused.`);
    fieldFlags.payee = "invalid";
  } else {
    draft.payee = payee;
  }

  const amount = validAmount(raw.amount);
  if (amount == null) {
    const rawAmt = (raw.amount ?? "").trim() || "(empty)";
    flags.push(
      /^-/.test(rawAmt)
        ? `amount ${rawAmt} PHRS is not > 0 — refused. Never pays zero or negative.`
        : /\.\d{19,}/.test(rawAmt)
          ? `amount '${rawAmt}' has more than 18 decimals — a PHRS transfer cannot express it; flagged, not rounded.`
          : `amount '${rawAmt}' is not a positive number — flagged, not defaulted.`
    );
    fieldFlags.amount = "invalid";
  } else {
    draft.amount = amount;
  }

  const currency = (raw.currency ?? "").trim().toUpperCase();
  if (currency !== "PHRS") {
    flags.push(
      `currency '${(raw.currency ?? "").trim() || "(empty)"}' unsupported — this agent pays PHRS on Atlantic only. Flagged, never converted or guessed.`
    );
    fieldFlags.currency = "invalid";
  } else {
    draft.currency = currency;
  }

  draft.reference = (raw.reference ?? "").trim();
  if (!draft.reference) {
    flags.push("missing required field 'reference' — flagged, not defaulted.");
    fieldFlags.reference = "missing";
  }

  // Line-item total must equal the invoice amount (agent rule: flagged, not paid).
  if (draft.lineItems.length > 0 && draft.amount) {
    let total = 0;
    let bad = false;
    for (const it of draft.lineItems) {
      const a = validAmount(it.amount);
      if (a == null) {
        bad = true;
        break;
      }
      total += parseFloat(a);
    }
    if (!bad) {
      const invoiceAmt = parseFloat(draft.amount);
      if (Math.abs(total - invoiceAmt) > 1e-12) {
        flags.push(
          `line-item total ${total} PHRS != invoice amount ${invoiceAmt} PHRS — mismatch flagged, not paid.`
        );
        fieldFlags.amount = "mismatch";
      }
    }
  }

  return draft;
}

function blankInvoice(format: ExtractedInvoice["format"]): ExtractedInvoice {
  return {
    format,
    invoice_id: "",
    payee: "",
    amount: "",
    currency: "",
    reference: "",
    memo: "",
    lineItems: [],
    flags: [],
    fieldFlags: {},
  };
}

function extractInvoice(text: string): ExtractedInvoice {
  const trimmed = text.trim();
  if (!trimmed) {
    const inv = blankInvoice("free-text");
    inv.flags.push("No invoice text pasted yet — paste an invoice or pick a sample.");
    return inv;
  }
  if (trimmed.startsWith("{")) return extractJson(trimmed);
  const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
  if (/(^|[,\s])invoice_id\s*,/i.test(firstLine) || /invoice_id/.test(firstLine.split(",")[0])) {
    return extractCsv(trimmed);
  }
  if (/^\s*[\w\- ]+\s*:/m.test(trimmed) && /invoice|payee|amount/i.test(trimmed)) {
    return extractKeyValue(trimmed);
  }
  return extractFreeText(trimmed);
}

function extractJson(text: string): ExtractedInvoice {
  const inv = blankInvoice("json");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    inv.flags.push(`Malformed JSON (${e instanceof Error ? e.message : "parse error"}) — refused.`);
    return inv;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    inv.flags.push("JSON invoice: top-level value must be an object — refused.");
    return inv;
  }
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  if (Array.isArray(r.line_items)) {
    for (const li of r.line_items) {
      if (typeof li === "object" && li !== null) {
        const o = li as Record<string, unknown>;
        inv.lineItems.push({ description: str(o.description), amount: str(o.amount) });
      } else {
        inv.flags.push(`Unstructured line-item '${str(li)}' — line items need description=amount; flagged.`);
        inv.lineItems.push({ description: str(li), amount: "" });
      }
    }
  } else if (r.line_items != null) {
    inv.flags.push("JSON line_items must be an array of {description, amount} — flagged.");
  }
  inv.memo = str(r.memo);
  sharpenerHeuristics(text, inv.flags);
  return validateCommon(inv, {
    invoice_id: str(r.invoice_id),
    payee: str(r.payee),
    amount: str(r.amount),
    currency: str(r.currency),
    reference: str(r.reference),
  });
}

function extractCsv(text: string): ExtractedInvoice {
  const inv = blankInvoice("csv");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    inv.flags.push("CSV invoice: no data rows — refused.");
    return inv;
  }
  if (lines.length > 2) {
    inv.flags.push(`CSV invoice: expected exactly 1 invoice row, found ${lines.length - 1} — refused (one invoice per file).`);
    return inv;
  }
  const header = csvRowSplit(lines[0]).map((h) => h.trim().toLowerCase());
  const row = csvRowSplit(lines[1]);
  if (!header.includes("invoice_id")) {
    inv.flags.push("CSV invoice: header must start with invoice_id — refused.");
    return inv;
  }
  const raw: Record<string, string> = {};
  header.forEach((h, i) => {
    raw[h] = row[i] ?? "";
  });
  const itemsRaw = (raw["line_items"] ?? "").trim();
  if (itemsRaw) inv.lineItems = parseLineItems(itemsRaw, inv.flags);
  inv.memo = raw["memo"] ?? "";
  sharpenerHeuristics(text, inv.flags);
  return validateCommon(inv, {
    invoice_id: raw["invoice_id"],
    payee: raw["payee"],
    amount: raw["amount"],
    currency: raw["currency"],
    reference: raw["reference"],
  });
}

function extractKeyValue(text: string): ExtractedInvoice {
  const inv = blankInvoice("key-value");
  const raw: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) {
      inv.flags.push(`Line ${i + 1}: '${line}' has no 'KEY: value' separator — refused.`);
      return inv;
    }
    const key = line.slice(0, colon).trim().toUpperCase();
    const value = line.slice(colon + 1).trim();
    const mapped = TXT_KEYMAP[key];
    if (!mapped) {
      inv.flags.push(
        `Line ${i + 1}: unknown key '${line.slice(0, colon).trim()}' — flagged (known: INVOICE, PAYEE, AMOUNT, CURRENCY, REFERENCE, MEMO).`
      );
      return inv;
    }
    raw[mapped] = value;
  }
  inv.memo = raw["memo"] ?? "";
  sharpenerHeuristics(text, inv.flags);
  return validateCommon(inv, {
    invoice_id: raw["invoice_id"],
    payee: raw["payee"],
    amount: raw["amount"],
    currency: raw["currency"],
    reference: raw["reference"],
  });
}

function extractFreeText(text: string): ExtractedInvoice {
  const inv = blankInvoice("free-text");
  inv.flags.push(
    "Free-text format: fields were located by pattern, not by structure — every hit below is marked, and any ambiguity is flagged rather than guessed."
  );

  const idMatch = text.match(/invoic(?:e|e_id)?\s*[#: ]\s*([A-Za-z0-9][A-Za-z0-9\-_]*)/i);
  const amtMatch = text.match(/(\d[\d,]*\.?\d*)\s*(PHRS|USDC|USDT|ETH|BTC|USD|EUR)\b/i);
  const addrs = text.match(ANY_ADDRESS_RE) ?? [];
  const refMatch = text.match(/ref(?:erence)?\s*[:# ]\s*([A-Za-z0-9][A-Za-z0-9\-_]*)/i);

  const currency = amtMatch ? amtMatch[2].toUpperCase() : "";

  sharpenerHeuristics(text, inv.flags);

  const draft = validateCommon(inv, {
    invoice_id: idMatch ? idMatch[1] : "",
    payee: addrs.length === 1 ? addrs[0] : addrs.length > 1 ? "__AMBIGUOUS__" : "",
    amount: amtMatch ? amtMatch[1].replace(/,/g, "") : "",
    currency,
    reference: refMatch ? refMatch[1] : "",
  });

  if (addrs.length > 1) {
    draft.flags.push(
      `Ambiguity: ${addrs.length} candidate payee addresses found — refused, never guessed.`
    );
    draft.fieldFlags.payee = "invalid";
  }
  if (amtMatch && /,/.test(amtMatch[1])) {
    draft.flags.push("Amount contains thousands separators — normalized once; flagged for your eyes, not re-parsed.");
  }
  if (!idMatch) draft.flags.push("No invoice id pattern found in the text — flagged.");
  if (!refMatch) draft.flags.push("No reference pattern found in the text — flagged.");
  return draft;
}

/* ------------------------------------------------------------------ */
/* Sample invoices — taken verbatim from the task's real evidence       */
/* ------------------------------------------------------------------ */

const SAMPLE_JSON = `{
  "invoice_id": "INV-2026-001",
  "payee": "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
  "amount": "0.001",
  "currency": "PHRS",
  "reference": "LK-T19-DEMO-001",
  "memo": "Testnet demo invoice — dust self-payment to operator wallet",
  "line_items": [
    {"description": "Arena demo service fee", "amount": "0.0007"},
    {"description": "Testnet gas reimbursement", "amount": "0.0003"}
  ]
}`;

const SAMPLE_TXT = `# Plaintext invoice — SAMPLE (payee is the operator testnet wallet; nothing is stranded)
INVOICE: INV-2026-003
PAYEE: 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
AMOUNT: 0.0005
CURRENCY: PHRS
REFERENCE: LK-T19-DEMO-003
MEMO: Sample plaintext invoice`;

const SAMPLE_CSV = `invoice_id,payee,amount,currency,reference,memo,line_items
INV-2026-004,0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3,0.0005,PHRS,LK-T19-DEMO-004,CSV-format live settlement proof; dust self-payment to operator wallet,Proof service=0.0005`;

const SAMPLE_BROKEN = `{
  "invoice_id": "INV-BAD-MISMATCH",
  "payee": "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
  "amount": "0.001",
  "currency": "PHRS",
  "reference": "LK-T19-MALFORMED-05",
  "line_items": [
    {"description": "Part A", "amount": "0.0007"},
    {"description": "Part B", "amount": "0.0007"}
  ]
}`;

/* ------------------------------------------------------------------ */
/* Settled on-chain by the agent (paid-stamps.jsonl) — real Atlantic receipts */
/* ------------------------------------------------------------------ */

const SETTLED: { label: string; tx: string }[] = [
  { label: "JSON invoice", tx: "0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9" },
  { label: "CSV invoice", tx: "0xc7fff61e404cb09a19f2319c26d034ae6f708ec2a98de81d229433226b8bac66" },
];

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

interface ChainContext {
  block: number;
  gasGwei: number;
}

const FORMAT_LABEL: Record<ExtractedInvoice["format"], string> = {
  json: "JSON",
  csv: "CSV",
  "key-value": "KEY: value",
  "free-text": "Free text",
};

function FieldRow({ name, value, flag }: { name: string; value: string; flag?: string }) {
  const flagged = flag != null;
  return (
    <tr>
      <td className="font-semibold text-ink">{name}</td>
      <td className={`font-mono break-all ${flagged ? "text-fail" : "text-ink"}`}>
        {value || <span className="text-slate">—</span>}
      </td>
      <td>
        {flagged ? (
          <span className="chip chip-fail">flagged: {flag}</span>
        ) : (
          <span className="chip chip-pass">ok</span>
        )}
      </td>
    </tr>
  );
}

export default function TryInvoice({ lamp }: { lamp: Lamp }) {
  const { state: wallet, connect } = useWallet();
  const { state, proposal, txHash, error, propose, approve, cancel } = useProposeAndSign();
  const [invoiceText, setInvoiceText] = useState("");
  const [analyzed, setAnalyzed] = useState(false);

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

  const invoice = useMemo(
    () => (analyzed ? extractInvoice(invoiceText) : null),
    [invoiceText, analyzed]
  );

  const walletConnected = wallet.status === "connected" && wallet.networkOk;

  const pickSample = (sample: string) => {
    cancel();
    setInvoiceText(sample);
    setAnalyzed(true);
    chain.refetch();
  };

  const analyze = () => {
    setAnalyzed(true);
    chain.refetch();
  };

  const clean = invoice != null && invoice.flags.length === 0;

  // Wallet-balance coverage check for the review card (exact wei math).
  const balancePhrs = wallet.status === "connected" ? wallet.balance : null;
  const balanceWei = balancePhrs != null ? weiOf(balancePhrs) : null;
  const proposalWei = proposal != null ? weiOf(proposal.valuePhrs) : null;

  const handlePropose = () => {
    if (!invoice || !clean) return;
    propose({
      to: invoice.payee,
      valuePhrs: invoice.amount,
      label: `Pay ${invoice.amount} PHRS to ${invoice.payee} — invoice ${invoice.invoice_id} (ref ${invoice.reference})`,
    });
  };

  const steps = ["01 · Paste invoice", "02 · Review payment", "03 · Sign & settle"];
  const stepIdx = state === "idle" ? 0 : state === "review" ? 1 : 2;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate">
        Paste an invoice in any of 4 formats — <strong className="text-ink">JSON</strong>,{" "}
        <strong className="text-ink">CSV</strong>, <strong className="text-ink">KEY: value</strong>, or{" "}
        <strong className="text-ink">free text</strong>. LIGHTKEEPER extracts payee, amount, token, and
        reference with the same no-guess rules as the invoice agent: mismatches and missing fields are
        flagged, never guessed. Then it hands you one review — and your wallet settles it on Atlantic.
      </p>

      {/* step indicator */}
      <ol className="flex gap-2 text-xs">
        {steps.map((s, i) => (
          <li
            key={s}
            className={`rounded-full border px-3 py-1 ${
              i === stepIdx
                ? "border-golddeep bg-golddeep/10 font-semibold text-ink"
                : i < stepIdx
                  ? "border-hairline bg-porcelain text-slate"
                  : "border-hairline text-slate"
            }`}
          >
            {s}
          </li>
        ))}
      </ol>

      {/* step 1 — input */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <p className="smallcaps mb-2">Invoice text</p>

        {/* Tier A live read: Atlantic now */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
          <span className="smallcaps">Atlantic now</span>
          {chain.loading && !chain.data && <span>reading the chain…</span>}
          {chain.data && (
            <span className="font-mono text-ink">
              block {chain.data.block.toLocaleString("en-US")} · gas {chain.data.gasGwei.toFixed(2)} gwei
            </span>
          )}
          {chain.data && !chain.loading && (
            <button className="underline" onClick={chain.refetch}>
              refresh
            </button>
          )}
          {chain.error && !chain.loading && (
            <span className="text-fail">
              RPC unreachable: {chain.error}{" "}
              <button className="underline" onClick={chain.refetch}>
                Retry
              </button>
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
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
        <p className="mb-3 text-xs text-slate">
          The agent already settled these on Atlantic — real receipts:{" "}
          {SETTLED.map((s, i) => (
            <span key={s.tx}>
              {i > 0 && " · "}
              {s.label}{" "}
              <a
                className="font-mono text-accent hover:underline"
                href={`${EXPLORER_TX}${s.tx}`}
                target="_blank"
                rel="noreferrer"
              >
                {s.tx.slice(0, 6)}…{s.tx.slice(-4)} ↗
              </a>
            </span>
          ))}
        </p>
        <textarea
          className="code-block h-44 w-full resize-y font-mono text-xs"
          placeholder={`Paste invoice text here…

JSON {"invoice_id":"INV-…","payee":"0x…","amount":"0.001","currency":"PHRS","reference":"…"}
CSV  invoice_id,payee,amount,currency,reference  (one row)
KEY: value lines — INVOICE / PAYEE / AMOUNT / CURRENCY / REFERENCE / MEMO
Free text — "Invoice INV-9 for 0.003 PHRS to 0x… ref LK-…"`}
          value={invoiceText}
          onChange={(e) => {
            cancel();
            setAnalyzed(false);
            setInvoiceText(e.target.value);
          }}
        />
        <div className="mt-3 flex gap-2">
          <button
            className="btn-primary"
            disabled={!invoiceText.trim()}
            onClick={analyze}
          >
            Extract &amp; validate
          </button>
          {analyzed && invoice && (
            <span className="chip chip-info self-center">
              Detected format: {FORMAT_LABEL[invoice.format]}
            </span>
          )}
        </div>
      </div>

      {/* step 2 — structured preview */}
      {analyzed && invoice && (
        <div className="rounded-xl border border-hairline bg-porcelain p-4">
          <p className="smallcaps mb-2">Extracted invoice</p>

          {invoice.flags.length > 0 ? (
            <div className="mb-3 space-y-2">
              {invoice.flags.map((f, i) => (
                <p key={i} className="rounded-lg border border-fail/30 bg-fail/5 px-3 py-2 text-sm text-ink">
                  <span className="chip chip-fail mr-2">flagged</span>
                  {f}
                </p>
              ))}
              <p className="text-sm text-slate">
                Nothing is paid from a flagged invoice. Fix the text or the invoice itself — LIGHTKEEPER
                will not fill the gaps.
              </p>
            </div>
          ) : (
            <p className="mb-3">
              <span className="chip chip-pass">clean — no flags</span>
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="data-table">
              <tbody>
                <FieldRow name="invoice id" value={invoice.invoice_id} flag={invoice.fieldFlags.invoice_id} />
                <FieldRow name="payee" value={invoice.payee} flag={invoice.fieldFlags.payee} />
                <FieldRow name="amount" value={invoice.amount ? `${invoice.amount} PHRS` : ""} flag={invoice.fieldFlags.amount} />
                <FieldRow name="token" value={invoice.currency} flag={invoice.fieldFlags.currency} />
                <FieldRow name="reference" value={invoice.reference} flag={invoice.fieldFlags.reference} />
                {invoice.memo && (
                  <FieldRow name="memo" value={invoice.memo} />
                )}
              </tbody>
            </table>
          </div>

          {invoice.lineItems.length > 0 && (
            <div className="mt-3">
              <p className="smallcaps mb-1">Line items</p>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <tbody>
                    {invoice.lineItems.map((li, i) => (
                      <tr key={i}>
                        <td className="text-ink">{li.description || <span className="text-slate">—</span>}</td>
                        <td className="font-mono text-ink">{li.amount ? `${li.amount} PHRS` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="mt-3 text-xs text-slate">
            Honesty rule: a native PHRS transfer has no memo bytes, so the invoice reference is bound
            in the review below and the payment label — never faked on-chain.
          </p>

          {!clean ? null : !walletConnected ? (
            <div className="mt-3">
              <p className="mb-2 text-sm text-slate">
                The invoice is clean. To settle it, connect your wallet — you will review and sign the
                payment yourself, with your testnet PHRS.
              </p>
              <button className="btn-primary" onClick={connect}>
                Connect wallet to continue
              </button>
            </div>
          ) : (
            state === "idle" && (
              <button className="btn-primary mt-3" onClick={handlePropose}>
                Review this payment
              </button>
            )
          )}
        </div>
      )}

      {/* step 2b — mandatory review (amber warning, not error) */}
      {state === "review" && proposal && (
        <div className="rounded-xl border border-golddeep/50 bg-porcelain p-4">
          <p className="smallcaps mb-2">02 · Review — sign nothing yet</p>
          <p className="text-sm font-semibold text-ink">{proposal.label}</p>
          <table className="data-table mt-2">
            <tbody>
              <tr>
                <td className="font-semibold text-ink">payee</td>
                <td className="font-mono break-all text-ink">{proposal.to}</td>
              </tr>
              <tr>
                <td className="font-semibold text-ink">amount</td>
                <td className="font-mono text-ink">{proposal.valuePhrs} PHRS</td>
              </tr>
            </tbody>
          </table>
          {error && (
            <p className="mt-2 rounded-lg border border-golddeep/60 bg-golddeep/10 px-3 py-2 text-sm font-semibold text-golddeep">
              {error}
            </p>
          )}
          {walletConnected && proposalWei != null && (
            balanceWei != null ? (
              balanceWei < proposalWei ? (
                <p className="mt-2 rounded-lg border border-golddeep/60 bg-golddeep/10 px-3 py-2 text-sm font-semibold text-golddeep">
                  Your wallet shows {balancePhrs} PHRS — this invoice is {proposal.valuePhrs} PHRS.
                  Nothing is blocked: your wallet will simply refuse to sign what you don't have.
                </p>
              ) : (
                <p className="mt-2 text-sm text-ink">
                  <span className="chip chip-pass mr-2">balance covers it</span>
                  {balancePhrs} PHRS available in your wallet.
                </p>
              )
            ) : (
              <p className="mt-2 text-xs text-slate">
                Wallet balance unavailable right now — your wallet will show it when you sign.
              </p>
            )
          )}
          <p className="mt-2 text-xs text-slate">
            Signing happens 100% in YOUR wallet — LIGHTKEEPER never sees or asks for private keys. Testnet only
            (Pharos Atlantic, chain 688689).
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={approve}>
              Sign in my wallet
            </button>
            <button className="btn-outline" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* signing / broadcasting states */}
      {state === "awaiting-signature" && (
        <p className="text-sm text-slate">Waiting for your wallet — review the payment there and confirm.</p>
      )}
      {state === "broadcasting" && (
        <p className="text-sm text-slate">Sent — waiting for Atlantic to mine it…</p>
      )}
      {state === "blocked" && (
        <div className="rounded-xl border border-fail/30 bg-fail/5 p-4">
          <p className="text-sm text-fail">{error}</p>
          <button className="btn-outline mt-2" onClick={connect}>
            Fix in wallet
          </button>
        </div>
      )}
      {state === "error" && (
        <div className="rounded-xl border border-fail/30 bg-fail/5 p-4">
          <p className="text-sm text-fail">{error}</p>
          {proposal && (
            <button className="btn-outline mt-2" onClick={approve}>
              Try signing again
            </button>
          )}
          <button className="btn-outline mt-2 ml-2" onClick={cancel}>
            Start over
          </button>
        </div>
      )}

      {/* confirmed receipt */}
      {state === "confirmed" && txHash && (
        <div className="rounded-xl border border-hairline bg-porcelain p-4">
          <p className="mb-1">
            <span className="chip chip-pass">paid — confirmed on Atlantic</span>
          </p>
          <p className="text-sm text-slate">Your tx — signed in your wallet.</p>
          <a
            className="font-mono text-sm text-accent hover:underline break-all"
            href={`${EXPLORER_TX}${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {txHash} ↗
          </a>
        </div>
      )}

      <p className="text-xs text-slate">
        {lamp.name} · live Atlantic reads (Tier A) + visitor-signed settlement (Tier B) —
        every live control proposes a real Atlantic transaction for your wallet, or is absent
        with a stated reason.
      </p>
    </div>
  );
}
