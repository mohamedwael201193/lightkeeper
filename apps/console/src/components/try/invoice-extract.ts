/**
 * T19 — invoice extraction (pure, no React).
 *
 * Mirrors tasks/t19-invoice-to-payment-agent/agent/parsers.py with the same
 * no-guess rules: extraction never corrects — it only flags. Kept importable
 * so the extraction rules are unit-verifiable outside the browser.
 */


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

export function validAmount(raw: string | undefined): string | null {
  if (raw == null || !raw.trim()) return null;
  const s = raw.trim();
  // On-chain reality: wei has exactly 18 decimals — more precision can never
  // settle, so it is flagged rather than silently rounded.
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? s : null;
}

/** Exact wei conversion for a validated decimal PHRS string; null when invalid. */
export function weiOf(phrs: string): bigint | null {
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

export function extractInvoice(text: string): ExtractedInvoice {
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

export const SAMPLE_JSON = `{
  "invoice_id": "INV-2026-001",
  "payee": "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
  "amount": "0.001",
  "currency": "PHRS",
  "reference": "LK-T19-DEMO-001",
  "memo": "Testnet demo invoice — dust self-payment to operator wallet",
  "line_items": [
    {"description": "Consulting services fee", "amount": "0.0007"},
    {"description": "Testnet gas reimbursement", "amount": "0.0003"}
  ]
}`;

export const SAMPLE_TXT = `# Plaintext invoice — SAMPLE (payee is the operator testnet wallet; nothing is stranded)
INVOICE: INV-2026-003
PAYEE: 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
AMOUNT: 0.0005
CURRENCY: PHRS
REFERENCE: LK-T19-DEMO-003
MEMO: Sample plaintext invoice`;

export const SAMPLE_CSV = `invoice_id,payee,amount,currency,reference,memo,line_items
INV-2026-004,0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3,0.0005,PHRS,LK-T19-DEMO-004,CSV-format live settlement proof; dust self-payment to operator wallet,Proof service=0.0005`;

export const SAMPLE_BROKEN = `{
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

export const SETTLED: { label: string; tx: string }[] = [
  { label: "JSON invoice", tx: "0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9" },
  { label: "CSV invoice", tx: "0xc7fff61e404cb09a19f2319c26d034ae6f708ec2a98de81d229433226b8bac66" },
];


/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/** Exact wei -> trimmed decimal PHRS string (no floating-point rounding). */
export function weiToPhrs(wei: bigint): string {
  const s = wei.toString();
  if (s === "0") return "0";
  const neg = s.startsWith("-");
  const digits = neg ? s.slice(1) : s;
  const padded = digits.padStart(19, "0");
  const intPart = padded.slice(0, -18) || "0";
  const frac = padded.slice(-18).replace(/0+$/, "");
  return (neg ? "-" : "") + intPart + (frac ? "." + frac : "");
}

export const FORMAT_LABEL: Record<ExtractedInvoice["format"], string> = {
  json: "JSON",
  csv: "CSV",
  "key-value": "KEY: value",
  "free-text": "Free text",
};

/** Shorten a 0x address/hash for display (tooltip/copy keep the full value). */
export function shortHex(h: string): string {
  return h.length > 13 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}
