/**
 * T27 pure logic — NO React imports. Kept separate so the ports can be
 * verified 1:1 against the Python agent (src/agent.py) in node.
 *
 * DO NOT "improve" these functions: they mirror the agent byte-for-byte.
 * - classify() mirrors REQUEST_PATTERNS (order: deploy -> balance -> transfer,
 *   None otherwise). A request like "deploy confidential token" classifies as
 *   deploy_token in BOTH implementations — the gap scan is a separate step.
 * - STOP / splitPassages / corpusTermHits / uncoveredTerms mirror the agent's
 *   refusal path exactly (same regexes, same 40/900 passage constants).
 * - coverageGate() mirrors coverage_check(): PASS iff zero UNVERIFIED steps.
 */
import { CORPUS_DOCS } from "./doc-builder-corpus";

export type GoalKind = "deploy_token" | "read_balance" | "transfer" | null;

export function classify(input: string): GoalKind {
  const q = input.trim();
  if (!q) return null;
  if (/deploy\b.*\b(erc-?20|token)\b|\b(erc-?20|token)\b.*\bdeploy\b/i.test(q))
    return "deploy_token";
  if (/\b(balance|balanceof)\b.*\b(erc-?20|token)\b|\b(erc-?20|token)\b.*\bbalance\b/i.test(q))
    return "read_balance";
  if (/\b(transfer|send)\b.*\b(erc-?20|token|tokens)\b|\b(erc-?20|token)\b.*\btransfer\b/i.test(q))
    return "transfer";
  return null;
}

// ---------------------------------------------------------------- gap scan
// Ported 1:1 from src/agent.py. STOP is the agent's exact word list.

const STOP = new Set(
  "the a an and or of to in on for with is are be by as at from that this it its you your we our they their will can use using used how do i my me an into via per over all any not no if when what which who where why there here get set new add create make run than then so such".split(
    " "
  )
);

export function splitPassages(text: string): string[] {
  // Python: re.split(r"\n(?=#{1,3} |\n)", text)
  const chunks = text.split(/\n(?=#{1,3} |\n)/);
  const passages: string[] = [];
  for (const raw of chunks) {
    const ch = raw.trim();
    if (ch.length < 40) continue;
    if (ch.length > 900) {
      for (const pRaw of ch.split("\n\n")) {
        const p = pRaw.trim();
        if (p.length >= 40) passages.push(p);
      }
    } else {
      passages.push(ch);
    }
  }
  return passages;
}

export function corpusTermHits(term: string, texts: string[]): number {
  const tl = term.toLowerCase();
  let n = 0;
  for (const text of texts) {
    for (const p of splitPassages(text)) {
      if (p.toLowerCase().includes(tl)) n++;
    }
  }
  return n;
}

/** Content terms of the request that appear NOWHERE in the corpus. */
export function uncoveredTerms(request: string): string[] {
  const texts = CORPUS_DOCS.map((d) => d.text);
  const terms = (request.match(/[a-zA-Z0-9\-]+/g) ?? [])
    .map((t) => t.toLowerCase())
    .filter((t) => !STOP.has(t) && t.length > 3);
  const out = new Set<string>();
  for (const t of terms) {
    if (corpusTermHits(t, texts) === 0) out.add(t);
  }
  return [...out].sort();
}

export interface GapDocScan {
  file: string;
  url: string;
  passages: number;
  hits: Record<string, number>;
}

export interface GapScan {
  uncovered: string[];
  totalPassages: number;
  docs: GapDocScan[];
}

/** The real refusal evidence: per-doc passage counts and per-term hit counts. */
export function buildGapScan(uncovered: string[]): GapScan {
  const docs = CORPUS_DOCS.map((d) => {
    const passages = splitPassages(d.text);
    const hits: Record<string, number> = {};
    for (const t of uncovered) {
      const tl = t.toLowerCase();
      hits[t] = passages.filter((p) => p.toLowerCase().includes(tl)).length;
    }
    return { file: d.file, url: d.url, passages: passages.length, hits };
  });
  return {
    uncovered,
    totalPassages: docs.reduce((a, d) => a + d.passages, 0),
    docs,
  };
}

// ---------------------------------------------------------------- coverage gate

export type StepStatus = "COVERED" | "INFERENCE" | "UNVERIFIED" | "POLICY_BLOCKED";

export interface GateVerdict {
  total: number;
  covered: number;
  inference: number;
  policyBlocked: number;
  unverified: number;
  gate: "PASS" | "FAIL";
}

/** Mirrors agent.py coverage_check(): PASS iff no UNVERIFIED step exists. */
export function coverageGate(statuses: StepStatus[]): GateVerdict {
  const n = (s: StepStatus) => statuses.filter((x) => x === s).length;
  const unverified = n("UNVERIFIED");
  return {
    total: statuses.length,
    covered: n("COVERED"),
    inference: n("INFERENCE"),
    policyBlocked: n("POLICY_BLOCKED"),
    unverified,
    gate: unverified === 0 ? "PASS" : "FAIL",
  };
}

// ---------------------------------------------------------------- ABI decoding

/** Decode an ABI-encoded string return value (offset/length/data). */
export function decodeAbiString(hex: string): string {
  const b = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (b.length < 128) return "";
  const len = parseInt(b.slice(64, 128), 16);
  const data = b.slice(128, 128 + len * 2);
  let out = "";
  for (let i = 0; i < data.length; i += 2) {
    out += String.fromCharCode(parseInt(data.slice(i, i + 2), 16));
  }
  return out;
}

/** Big-int base units -> human string with the given decimals. */
export function formatUnits(raw: string, decimals: number): string {
  const v = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const int = v / base;
  const frac = v % base;
  const intStr = int.toLocaleString("en-US");
  if (frac === 0n) return intStr;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${intStr}.${fracStr}`;
}
