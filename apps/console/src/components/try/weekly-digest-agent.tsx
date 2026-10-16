/**
 * T26 · Weekly Digest Agent — live digest builder (SHOWTIME presentation).
 *
 * 01 Configure — watched address, the six real T26_SECTIONS, scan window.
 * 02 Run — a REAL end-to-end scan: chain tip, the address's transactions from
 *    the explorer indexer, then chain-direct eth_getLogs Transfer scans in
 *    <=1000-block chunks (the RPC's own limit), with live "chunk N of M"
 *    progress. Every step maps to real async calls — nothing on a timer.
 * 03 Result — the digest as an editorial document: ResultCard showpiece,
 *    StatStrip of the week's numbers, one section card per T26 section,
 *    highlights feed, scan history.
 *
 * Tier C honesty is kept: the console never sends Telegram messages and never
 * signs — delivery + scheduling stay copy-paste CLI config below the result.
 * The T26_SECTIONS picker is real: the checked sections become T26_SECTIONS
 * for the CLI agent, and the browser digest renders exactly those blocks.
 *
 * Section semantics mirror the real engine (tasks/t26-weekly-digest-agent/
 * src/digest.py) — deterministic TOP-3 ranking, whale threshold 0.05 PHRS,
 * token metadata via real eth_call (symbol/decimals) — but nothing here
 * touches the engine itself.
 */
import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  isValidAddress,
  rpcCall,
} from "../../hooks/useAtlantic";
import { shortenAddress } from "../../types";
import {
  EmptyState,
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
} from "../ui";
import type { FeedItem, Stat } from "../ui";

// ---------------------------------------------------------------- constants

const INDEXER =
  "https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // keccak("Transfer(address,address,uint256)")
const WHALE_THRESHOLD = 0.05; // PHRS — same as the shipped engine
const LOG_CHUNK = 1000; // RPC enforces: "block range ... within 1,000 blocks"
const CHUNK_CONCURRENCY = 10;
const ATLANTIC_CHAIN_ID = 688689;

// The task's REAL delivered digest (Telegram message_id 723, 2026-10-16) —
// verbatim evidence from tasks/t26-weekly-digest-agent, not a sample.
const DIGEST_MSG_ID = "723";
const DIGEST_WINDOW = "2026-10-09 → 2026-10-16 · blocks 31186577–31482619";
const DIGEST_TEXT = `📊 Weekly Digest — 0xf76e…71a3
Atlantic testnet · 2026-10-09 → 2026-10-16

Txs: 110 (+110 (prev 0))
Sent: 109 · Received: 1
Native in/out: 0.05/0.139866667 PHRS
Gas spent: 0.022912577 PHRS
Creations: 25 · Failed: 7 · Token xfers: 31

TOP 3 notable:
1. [FAILED TX] tx 0x91f7e02125… reverted/failed (receipt_status=0) in block 31482534
2. [FAILED TX] tx 0x31993dc871… reverted/failed (receipt_status=0) in block 31482265
3. [FAILED TX] tx 0x1a968603d0… reverted/failed (receipt_status=0) in block 31482202

Full digest: see LIGHTKEEPER t26 deliverable.`;

const WATCH_DEFAULT = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";

const SECTIONS = [
  { id: "top3", label: "TOP 3 notable events", note: "Deterministic ranking — failures first, no hand-picking" },
  { id: "volume", label: "Tx count + native volume", note: "Sent/received, in/out PHRS — the week's headline numbers" },
  { id: "gas", label: "Gas stats", note: "Total gas spent across the window" },
  { id: "whales", label: "Whale moves", note: "Native transfers ≥ 0.05 PHRS, ranked biggest-first" },
  { id: "tokens", label: "Token transfers", note: "ERC20 Transfer events via chain-direct eth_getLogs" },
  { id: "failed", label: "Failed txs + creations", note: "Reverts and contract creations in the window" },
] as const;

const WINDOWS = [
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

const CADENCES = [
  { id: "weekly", label: "Weekly · Monday 08:00", cron: "0 8 * * 1" },
  { id: "daily", label: "Daily · 08:00", cron: "0 8 * * *" },
  { id: "monthly", label: "Monthly · 1st, 08:00", cron: "0 8 1 * *" },
] as const;

const KIND_CHIP: Record<string, string> = {
  "FAILED TX": "chip chip-fail",
  "CONTRACT CREATION": "chip chip-info",
  "LARGE NATIVE TRANSFER": "chip chip-dim",
  "TOKEN TRANSFER": "chip chip-pass",
  "CONTRACT INTERACTION": "chip chip-dim",
  "NATIVE TRANSFER": "chip chip-dim",
};

// ---------------------------------------------------------------- types

interface IndexerTx {
  hash: string;
  from_address: string;
  to_address: string | null;
  value: string;
  transaction_fee: string;
  receipt_status: number | string;
  method?: string;
  method_id?: string;
  block_number: number;
  block_timestamp: string;
  receipt_contract_address?: string | null;
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  blockHash: string;
  logIndex: string;
}

interface TransferEvent {
  token: string;
  symbol: string;
  decimals: number;
  from: string;
  to: string;
  amount: number;
  block: number;
  tx: string;
}

interface WhaleMove {
  direction: "IN" | "OUT";
  value: number;
  counterparty: string;
  hash: string;
  block: number;
}

interface TokenFlow {
  token: string;
  symbol: string;
  inN: number;
  outN: number;
  inAmt: number;
  outAmt: number;
}

interface NotableEvent {
  score: number;
  kind: string;
  title: string;
  detail: string;
  hash: string;
  block: number;
}

interface DigestResult {
  address: string;
  days: number;
  startBlock: number;
  endBlock: number;
  startIso: string;
  endIso: string;
  chunks: number;
  secs: number;
  txTotal: number;
  txSent: number;
  txReceived: number;
  nativeIn: number;
  nativeOut: number;
  gasSpent: number;
  creations: number;
  failed: number;
  failedList: IndexerTx[];
  creationsList: IndexerTx[];
  whales: WhaleMove[];
  tokenFlows: TokenFlow[];
  transferEvents: number;
  top3: NotableEvent[];
}

interface RunRecord {
  at: string;
  days: number;
  fromBlock: number;
  toBlock: number;
  txs: number;
  chunks: number;
  secs: number;
}

// ---------------------------------------------------------------- helpers

const toHex = (n: number) => "0x" + Math.max(0, Math.floor(n)).toString(16);
const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 10)}…${h.slice(-4)}` : h);
const fmtPhrs = (v: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: 6 });
const fmtDate = (iso: string) => iso.slice(0, 10);

/** Token metadata cache — real eth_call results, shared across scans. */
const tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

function bytesToText(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/** Port of the engine's _decode_abi_string: dynamic string or bytes32. */
function decodeAbiString(h: string): string | null {
  if (!/^[0-9a-fA-F]+$/.test(h) || h.length < 64) return null;
  try {
    const offset = BigInt("0x" + h.slice(0, 64));
    if (offset === 32n && h.length >= 128) {
      const length = Number(BigInt("0x" + h.slice(64, 128)));
      if (length > 0 && length <= 64 && h.length >= 128 + length * 2) {
        return bytesToText(h.slice(128, 128 + length * 2));
      }
    }
    const word = h.slice(0, 64).replace(/(00)+$/, "");
    if (word.length > 0) return bytesToText(word);
  } catch {
    /* undecodable — fall through */
  }
  return null;
}

function cleanSymbol(s: string | null): string | null {
  if (!s) return null;
  const cleaned = [...s]
    .filter((c) => c >= " " && c !== "\u007f")
    .join("")
    .trim();
  return cleaned || null;
}

async function tokenMeta(
  token: string
): Promise<{ symbol: string; decimals: number }> {
  const cached = tokenMetaCache.get(token);
  if (cached) return cached;
  let symbol: string | null = null;
  let decimals = 18;
  try {
    const symRaw = (await rpcCall("eth_call", [
      { to: token, data: "0x95d89b41" },
      "latest",
    ])) as string;
    if (symRaw && symRaw.startsWith("0x")) {
      symbol = cleanSymbol(decodeAbiString(symRaw.slice(2)));
    }
  } catch {
    /* unreadable symbol — falls back to the contract prefix */
  }
  try {
    const decRaw = (await rpcCall("eth_call", [
      { to: token, data: "0x313ce567" },
      "latest",
    ])) as string;
    if (decRaw && decRaw !== "0x") decimals = Number(BigInt(decRaw));
  } catch {
    /* unreadable decimals — 18 is the honest default */
  }
  const meta = { symbol: symbol ?? `${token.slice(0, 10)}…`, decimals };
  tokenMetaCache.set(token, meta);
  return meta;
}

/** Bounded worker pool — N real requests in flight, results in order. */
async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
  onDone: () => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, tasks.length)) },
    async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]();
        onDone();
      }
    }
  );
  await Promise.all(workers);
  return results;
}

async function fetchAddressTxs(
  address: string,
  onPage: (page: number) => void
): Promise<IndexerTx[]> {
  const out: IndexerTx[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (out.length < total) {
    onPage(page);
    const url = `${INDEXER}/address/${address}/transactions?size=100&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new Error(
        "The address-activity API did not answer — check your connection and retry."
      );
    }
    if (!res.ok) {
      throw new Error(
        `The address-activity API returned HTTP ${res.status} — retry in a moment.`
      );
    }
    const d = (await res.json()) as {
      data?: IndexerTx[];
      total?: number;
    };
    const batch = d.data ?? [];
    out.push(...batch);
    total = typeof d.total === "number" ? d.total : out.length;
    if (batch.length === 0 || page > 60) break;
    page++;
  }
  return out;
}

/** Deterministic TOP-3 ranking — the engine's rules, failures first. */
function rankNotable(
  sent: IndexerTx[],
  recv: IndexerTx[],
  failed: IndexerTx[],
  creations: IndexerTx[],
  transfers: TransferEvent[],
  addr: string
): NotableEvent[] {
  const cands: NotableEvent[] = [];
  for (const t of failed) {
    cands.push({
      score: 100,
      kind: "FAILED TX",
      title: "Transaction reverted",
      detail: `${shortHash(t.hash)} · receipt_status=${t.receipt_status} · block ${t.block_number.toLocaleString()}`,
      hash: t.hash,
      block: t.block_number,
    });
  }
  for (const t of creations) {
    const ca = t.receipt_contract_address ?? t.to_address ?? "?";
    cands.push({
      score: 50,
      kind: "CONTRACT CREATION",
      title: "Contract deployed",
      detail: `${shortenAddress(ca)} via ${shortHash(t.hash)} · block ${t.block_number.toLocaleString()}`,
      hash: t.hash,
      block: t.block_number,
    });
  }
  for (const t of sent) {
    const v = parseFloat(t.value || "0");
    const to = (t.to_address ?? "").toLowerCase();
    if (v >= WHALE_THRESHOLD && to !== addr) {
      cands.push({
        score: 40,
        kind: "LARGE NATIVE TRANSFER",
        title: `${fmtPhrs(v)} PHRS sent`,
        detail: `→ ${shortenAddress(t.to_address ?? "?")} · ${shortHash(t.hash)} · block ${t.block_number.toLocaleString()}`,
        hash: t.hash,
        block: t.block_number,
      });
    }
  }
  for (const x of transfers) {
    if (x.from === addr || x.to === addr) {
      const dir = x.to === addr ? "IN" : "OUT";
      cands.push({
        score: 25,
        kind: "TOKEN TRANSFER",
        title: `${fmtPhrs(x.amount)} ${x.symbol} ${dir}`,
        detail: `${shortHash(x.tx)} · block ${x.block.toLocaleString()}`,
        hash: x.tx,
        block: x.block,
      });
    }
  }
  for (const t of sent) {
    const v = parseFloat(t.value || "0");
    if (
      !failed.includes(t) &&
      !creations.includes(t) &&
      v < WHALE_THRESHOLD &&
      t.to_address
    ) {
      cands.push({
        score: 10,
        kind: "CONTRACT INTERACTION",
        title: `${t.method || t.method_id?.slice(0, 10) || "contract call"}`,
        detail: `on ${shortenAddress(t.to_address)} · ${shortHash(t.hash)}`,
        hash: t.hash,
        block: t.block_number,
      });
    }
  }
  for (const t of sent) {
    const v = parseFloat(t.value || "0");
    const to = (t.to_address ?? "").toLowerCase();
    if (v > 0 && v < WHALE_THRESHOLD && to !== addr) {
      cands.push({
        score: 5,
        kind: "NATIVE TRANSFER",
        title: `${fmtPhrs(v)} PHRS sent`,
        detail: `→ ${shortenAddress(t.to_address ?? "?")} · ${shortHash(t.hash)}`,
        hash: t.hash,
        block: t.block_number,
      });
    } else if (v > 0 && v < WHALE_THRESHOLD && to === addr) {
      cands.push({
        score: 5,
        kind: "NATIVE TRANSFER",
        title: `${fmtPhrs(v)} PHRS self-transfer`,
        detail: shortHash(t.hash),
        hash: t.hash,
        block: t.block_number,
      });
    }
  }
  for (const t of recv) {
    const v = parseFloat(t.value || "0");
    if (v > 0 && v < WHALE_THRESHOLD) {
      cands.push({
        score: 5,
        kind: "NATIVE TRANSFER",
        title: `${fmtPhrs(v)} PHRS received`,
        detail: `from ${shortenAddress(t.from_address)} · ${shortHash(t.hash)}`,
        hash: t.hash,
        block: t.block_number,
      });
    }
  }
  // Deterministic: score desc, block desc, hash asc — then dedupe by hash.
  cands.sort((a, b) => b.score - a.score || b.block - a.block || (a.hash < b.hash ? -1 : 1));
  const seen = new Set<string>();
  const top: NotableEvent[] = [];
  for (const c of cands) {
    if (seen.has(c.hash)) continue;
    seen.add(c.hash);
    top.push(c);
    if (top.length === 3) break;
  }
  return top;
}

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-outline"
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Clipboard unavailable (old browser / permissions) — fall back to
          // a manual selection target so the value is still reachable.
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

/** One digest section, styled like a newsletter chapter. */
function SectionCard({
  eyebrow,
  title,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-2xl border border-hairline bg-white p-6 sm:p-8"
    >
      <p className="text-sm font-semibold text-slate">{eyebrow}</p>
      <h4 className="mt-1 font-display text-2xl tracking-tight text-ink">{title}</h4>
      {note && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate">{note}</p>}
      <div className="mt-5">{children}</div>
    </motion.section>
  );
}

const inputCls =
  "w-full rounded-lg border border-hairline bg-white px-3 py-2.5 font-mono text-sm text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none";

// ---------------------------------------------------------------- component

export default function TryWeeklyDigestAgent({ lamp }: { lamp: Lamp }) {
  const [address, setAddress] = useState(WATCH_DEFAULT);
  const [sections, setSections] = useState<string[]>([
    "top3",
    "volume",
    "gas",
    "whales",
    "tokens",
    "failed",
  ]);
  const [windowDays, setWindowDays] = useState<number>(7);
  const [cadenceId, setCadenceId] = useState<string>("weekly");

  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const scanIdRef = useRef(0);

  const addrOk = isValidAddress(address);
  const cadence = CADENCES.find((c) => c.id === cadenceId)!;
  const canRun = addrOk && sections.length > 0 && !loading;

  // Canonical digest order — the agent keeps this layout no matter the pick order.
  const orderedSections = SECTIONS.map((s) => s.id).filter((id) =>
    sections.includes(id)
  );

  const estChunks = (days: number) =>
    Math.ceil(days * 86400 / 2 / LOG_CHUNK) * 2; // ≈2s blocks, from+to scans

  const toggleSection = (id: string) =>
    setSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const runDigest = useCallback(async () => {
    const myScan = ++scanIdRef.current;
    const addr = address.trim().toLowerCase();
    if (!isValidAddress(addr) || sections.length === 0) return;
    const t0 = Date.now();
    setLoading(true);
    setError(null);
    setDigest(null);
    const alive = () => scanIdRef.current === myScan;

    // Step bookkeeping: `labels` is the source of truth; every push or label
    // change is a real state change (a call started/finished, a chunk landed).
    const labels: string[] = ["Reading the Atlantic chain tip"];
    setSteps([...labels]);
    setStepIdx(0);
    const pushStep = (label: string) => {
      labels.push(label);
      if (alive()) {
        setSteps([...labels]);
        setStepIdx(labels.length - 1);
      }
    };
    const setStepLabel = (i: number, label: string) => {
      labels[i] = label;
      if (alive()) setSteps([...labels]);
    };

    try {
      // --- step 1: tip + honest calendar window from real block timestamps
      const cidHex = (await rpcCall("eth_chainId", [])) as string;
      if (Number(BigInt(cidHex)) !== ATLANTIC_CHAIN_ID) {
        throw new Error(
          `Refusing: chain id ${Number(BigInt(cidHex))} is not Pharos Atlantic (${ATLANTIC_CHAIN_ID}) — this digest only reads Atlantic.`
        );
      }
      const tipHex = (await rpcCall("eth_blockNumber", [])) as string;
      const tip = Number(BigInt(tipHex));
      const tipBlock = (await rpcCall("eth_getBlockByNumber", [tipHex, false])) as {
        timestamp: string;
      };
      const tipTs = Number(BigInt(tipBlock.timestamp));
      const probeBlock = (await rpcCall("eth_getBlockByNumber", [
        toHex(tip - 1000),
        false,
      ])) as { timestamp: string };
      const avgBt = (tipTs - Number(BigInt(probeBlock.timestamp))) / 1000;
      if (!(avgBt > 0)) {
        throw new Error(
          "The chain returned a non-positive block time — retry in a moment."
        );
      }
      const startBlock = Math.max(0, tip - Math.floor((windowDays * 86400) / avgBt));
      const startBlockData = (await rpcCall("eth_getBlockByNumber", [
        toHex(startBlock),
        false,
      ])) as { timestamp: string };
      const startTs = Number(BigInt(startBlockData.timestamp));
      if (!alive()) return;

      // --- step 2: the address's transactions from the explorer indexer
      pushStep("Fetching the address's transactions — page 1");
      const allTxs = await fetchAddressTxs(addr, (page) =>
        setStepLabel(1, `Fetching the address's transactions — page ${page}`)
      );
      if (!alive()) return;
      const startMs = startTs * 1000;
      const endMs = tipTs * 1000;
      const txs = allTxs.filter((t) => {
        const ms = Date.parse(t.block_timestamp);
        return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
      });

      // --- step 3: chain-direct Transfer scans, chunked <=1000 blocks
      const padded = "0x" + "0".repeat(24) + addr.slice(2);
      const chunks: Array<{ from: number; to: number; pos: 1 | 2 }> = [];
      for (let b = startBlock; b <= tip; b += LOG_CHUNK) {
        const e = Math.min(b + LOG_CHUNK - 1, tip);
        chunks.push({ from: b, to: e, pos: 1 });
        chunks.push({ from: b, to: e, pos: 2 });
      }
      const totalChunks = chunks.length;
      let doneChunks = 0;
      pushStep(`Scanning Transfer events — chunk 0 of ${totalChunks}`);
      const logTasks = chunks.map((c) => async () => {
        const topics: (string | null)[] = [TRANSFER_TOPIC, null, null];
        topics[c.pos] = padded;
        return (await rpcCall("eth_getLogs", [
          {
            fromBlock: toHex(c.from),
            toBlock: toHex(c.to),
            topics,
          },
        ])) as RpcLog[];
      });
      const chunkResults = await runPool(logTasks, CHUNK_CONCURRENCY, () => {
        doneChunks++;
        setStepLabel(2, `Scanning Transfer events — chunk ${doneChunks} of ${totalChunks}`);
      });
      if (!alive()) return;

      // Dedupe by (blockHash, logIndex) — from-side and to-side overlap.
      const seen = new Set<string>();
      const uniq: RpcLog[] = [];
      for (const batch of chunkResults) {
        for (const l of batch ?? []) {
          const k = `${l.blockHash}:${l.logIndex}`;
          if (!seen.has(k)) {
            seen.add(k);
            uniq.push(l);
          }
        }
      }

      // --- step 4: token contract details (real eth_call), then decode
      const tokenAddrs = [...new Set(uniq.map((l) => l.address.toLowerCase()))];
      let transfers: TransferEvent[] = [];
      if (tokenAddrs.length > 0) {
        pushStep(
          `Reading ${tokenAddrs.length} token contract${tokenAddrs.length === 1 ? "" : "s"} (symbol, decimals)`
        );
        const metas = await runPool(
          tokenAddrs.map((t) => () => tokenMeta(t)),
          8,
          () => {}
        );
        if (!alive()) return;
        const metaByToken = new Map(tokenAddrs.map((t, i) => [t, metas[i]]));
        transfers = uniq.map((l) => {
          const topics = l.topics ?? [];
          const from = topics.length > 1 ? "0x" + topics[1].slice(-40).toLowerCase() : "";
          const to = topics.length > 2 ? "0x" + topics[2].slice(-40).toLowerCase() : "";
          const token = l.address.toLowerCase();
          const meta = metaByToken.get(token) ?? { symbol: `${token.slice(0, 10)}…`, decimals: 18 };
          const raw = l.data && l.data !== "0x" ? BigInt(l.data) : 0n;
          return {
            token,
            symbol: meta.symbol,
            decimals: meta.decimals,
            from,
            to,
            amount: Number(raw) / 10 ** meta.decimals,
            block: Number(BigInt(l.blockNumber)),
            tx: l.transactionHash,
          };
        });
      }

      // --- metrics (the engine's build_metrics, ported)
      const sent = txs.filter((t) => (t.from_address || "").toLowerCase() === addr);
      const recv = txs.filter(
        (t) =>
          (t.to_address || "").toLowerCase() === addr &&
          (t.from_address || "").toLowerCase() !== addr
      );
      const num = (v: string | undefined) => parseFloat(v || "0") || 0;
      const nativeIn = recv.reduce((a, t) => a + num(t.value), 0);
      const nativeOut = sent.reduce(
        (a, t) => a + ((t.to_address || "").toLowerCase() !== addr ? num(t.value) : 0),
        0
      );
      const gasSpent = sent.reduce((a, t) => a + num(t.transaction_fee), 0);
      const creationsList = sent.filter(
        (t) => !t.to_address || (t.method || "") === "Contract Creation"
      );
      const failedList = sent.filter(
        (t) => t.receipt_status !== 1 && t.receipt_status !== "1"
      );
      const whales: WhaleMove[] = [];
      for (const t of sent) {
        const v = num(t.value);
        if (v >= WHALE_THRESHOLD && (t.to_address || "").toLowerCase() !== addr) {
          whales.push({
            direction: "OUT",
            value: v,
            counterparty: t.to_address ?? "?",
            hash: t.hash,
            block: t.block_number,
          });
        }
      }
      for (const t of recv) {
        const v = num(t.value);
        if (v >= WHALE_THRESHOLD) {
          whales.push({
            direction: "IN",
            value: v,
            counterparty: t.from_address,
            hash: t.hash,
            block: t.block_number,
          });
        }
      }
      whales.sort((a, b) => b.value - a.value);

      const flowByToken = new Map<string, TokenFlow>();
      for (const x of transfers) {
        let f = flowByToken.get(x.token);
        if (!f) {
          f = { token: x.token, symbol: x.symbol, inN: 0, outN: 0, inAmt: 0, outAmt: 0 };
          flowByToken.set(x.token, f);
        }
        if (x.to === addr && x.from !== addr) {
          f.inN++;
          f.inAmt += x.amount;
        } else if (x.from === addr && x.to !== addr) {
          f.outN++;
          f.outAmt += x.amount;
        }
      }
      const tokenFlows = [...flowByToken.values()].sort(
        (a, b) => b.inAmt + b.outAmt - (a.inAmt + a.outAmt)
      );

      const top3 = rankNotable(sent, recv, failedList, creationsList, transfers, addr);

      const secs = Math.round((Date.now() - t0) / 1000);
      const result: DigestResult = {
        address: addr,
        days: windowDays,
        startBlock,
        endBlock: tip,
        startIso: new Date(startTs * 1000).toISOString(),
        endIso: new Date(tipTs * 1000).toISOString(),
        chunks: totalChunks,
        secs,
        txTotal: txs.length,
        txSent: sent.length,
        txReceived: recv.length,
        nativeIn,
        nativeOut,
        gasSpent,
        creations: creationsList.length,
        failed: failedList.length,
        failedList,
        creationsList,
        whales,
        tokenFlows,
        transferEvents: transfers.length,
        top3,
      };
      if (!alive()) return;
      setDigest(result);
      setHistory((h) =>
        [
          {
            at: new Date().toISOString(),
            days: windowDays,
            fromBlock: startBlock,
            toBlock: tip,
            txs: txs.length,
            chunks: totalChunks,
            secs,
          },
          ...h,
        ].slice(0, 10)
      );
      setStepIdx(labels.length); // done — the loader unmounts, 03 replaces it
    } catch (e) {
      if (!alive()) return;
      setError(e instanceof Error ? e.message : "The digest scan did not finish.");
    } finally {
      if (alive()) setLoading(false);
    }
  }, [address, sections, windowDays]);

  // --- CLI config (Tier C, unchanged behavior: copy-paste, nothing sent)
  const configCmd = `# LIGHTKEEPER T26 — digest config (run inside tasks/t26-weekly-digest-agent)
# Secrets are NEVER stored here: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
# come from your own environment (exported in your terminal), never from config or code.
# T26_SECTIONS is real: the agent renders ONLY the blocks you list here.

export WATCH_ADDRESS=${addrOk ? address.trim() : "<your-watched-address>"}
export WINDOW_DAYS=${windowDays}
export T26_SECTIONS=${orderedSections.join(",")}

python3 src/digest.py --backfill   # once: real previous-window baseline -> state.json
python3 src/digest.py --run        # weekly: current digest + deltas -> digests/
python3 src/digest.py --deliver    # weekly: ONE Telegram sendMessage -> message_id receipt`;

  const cronCmd = `# Scheduling is external — Pharos SkillEngine exposes no cron primitive,
# so the skill does not schedule itself. Two operator-run options:
bash cron/install-weekly-cron.sh   # installs a Monday-08:00 crontab entry (interactive; --remove to uninstall)
# or copy cron/weekly-digest.github.yml into .github/workflows/ (same cadence, secrets in repo settings)
#
# The installed line looks like:
# ${cadence.cron} set -a; . "$ENV_FILE"; set +a; cd <task-dir> && /usr/bin/python3 src/digest.py --run >> cron/digest-cron.log 2>&1 && /usr/bin/python3 src/digest.py --deliver >> cron/digest-cron.log 2>&1`;

  // --- result shaping
  const stats: Stat[] = [];
  if (digest && orderedSections.includes("volume")) {
    stats.push(
      { label: "Transactions", value: digest.txTotal },
      { label: "Native in", value: digest.nativeIn, format: fmtPhrs, suffix: "PHRS" },
      { label: "Native out", value: digest.nativeOut, format: fmtPhrs, suffix: "PHRS" }
    );
  }
  if (digest && orderedSections.includes("gas")) {
    stats.push({ label: "Gas spent", value: digest.gasSpent, format: fmtPhrs, suffix: "PHRS" });
  }
  if (digest && orderedSections.includes("failed") && stats.length < 4) {
    stats.push({ label: "Failed txs", value: digest.failed });
  }

  const highlightItems: FeedItem[] = digest
    ? [
        ...digest.top3.map((e) => ({
          key: `top-${e.hash}`,
          node: (
            <div>
              <p className="text-sm font-semibold text-ink">
                <span className={`${KIND_CHIP[e.kind] ?? "chip chip-dim"} mr-2`}>{e.kind}</span>
                {e.title}
              </p>
              <p className="mt-1 font-mono text-xs text-slate">
                {e.detail} ·{" "}
                <a className="text-accent hover:underline" href={`${EXPLORER_TX}${e.hash}`} target="_blank" rel="noreferrer">
                  view on explorer
                </a>
              </p>
            </div>
          ),
        })),
        ...digest.whales.slice(0, 5).map((w) => ({
          key: `whale-${w.hash}`,
          node: (
            <div>
              <p className="text-sm font-semibold text-ink">
                🐋 Whale move {w.direction} — {fmtPhrs(w.value)} PHRS
              </p>
              <p className="mt-1 font-mono text-xs text-slate">
                {shortenAddress(w.counterparty)} · block {w.block.toLocaleString()} ·{" "}
                <a className="text-accent hover:underline" href={`${EXPLORER_TX}${w.hash}`} target="_blank" rel="noreferrer">
                  view on explorer
                </a>
              </p>
            </div>
          ),
        })),
      ]
    : [];

  const historyItems: FeedItem[] = history.map((r, i) => ({
    key: `${r.at}-${i}`,
    node: (
      <div>
        <p className="text-sm font-semibold text-ink">
          Digest · {r.txs} transaction{r.txs === 1 ? "" : "s"} over {r.days} day{r.days === 1 ? "" : "s"}
        </p>
        <p className="mt-0.5 font-mono text-xs text-slate">
          blocks {r.fromBlock.toLocaleString()} → {r.toBlock.toLocaleString()} · {r.chunks} log chunks · {r.secs}s ·{" "}
          {new Date(r.at).toLocaleTimeString()}
        </p>
      </div>
    ),
  }));

  const nextWiderWindow = WINDOWS.find((w) => w.days > windowDays);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-slate">Tier C — read-only: the console never signs, never sends</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">The week's chain activity, as a digest</h3>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink">
          Pick an address and the sections you care about — LIGHTKEEPER scans the
          chain live (transactions plus chain-direct Transfer-event chunks) and
          lays the week out as a digest. Delivery to Telegram stays a CLI step
          below: this page only reads.
        </p>
      </div>

      {/* 01 · Configure */}
      <section aria-label="Configure the digest">
        <p className="text-sm font-semibold text-slate mb-3">01 · Configure</p>
        <div className="rounded-xl border border-hairline bg-porcelain p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink">
                Watched address (Atlantic testnet)
              </label>
              <input
                className={inputCls}
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value.trim());
                  setDigest(null);
                }}
                placeholder="0x…"
                spellCheck={false}
              />
              {!addrOk && address && (
                <p className="mt-1 text-sm text-fail">
                  Not a valid 0x address — fix it to build the digest.
                </p>
              )}
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold text-ink">Scan window</p>
              <div className="flex flex-wrap gap-2">
                {WINDOWS.map((w) => (
                  <button
                    key={w.days}
                    type="button"
                    className={w.days === windowDays ? "btn-primary" : "btn-outline"}
                    onClick={() => {
                      setWindowDays(w.days);
                      setDigest(null);
                    }}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm text-slate">
                A {windowDays}-day window means ≈{estChunks(windowDays).toLocaleString()}{" "}
                real log chunks — each one is a live RPC call, so a full week
                takes a minute or two.
              </p>
            </div>
          </div>

          <fieldset className="mt-4 rounded-xl border border-hairline bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-ink">
              Digest sections ({sections.length}/{SECTIONS.length}) — becomes{" "}
              <span className="font-mono text-xs">T26_SECTIONS</span>
            </legend>
            <div className="grid gap-2 md:grid-cols-2">
              {SECTIONS.map((s) => (
                <label
                  key={s.id}
                  className="flex items-start gap-3 rounded-lg p-2 hover:bg-porcelain"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#2456e6]"
                    checked={sections.includes(s.id)}
                    onChange={() => {
                      toggleSection(s.id);
                      setDigest(null);
                    }}
                  />
                  <span>
                    <span className="text-sm font-semibold text-ink">{s.label}</span>
                    <span className="block text-sm text-slate">{s.note}</span>
                  </span>
                </label>
              ))}
            </div>
            {sections.length === 0 && (
              <p className="mt-2 text-sm text-fail">
                Pick at least one section — an empty digest is not a digest.
              </p>
            )}
          </fieldset>

          <button
            type="button"
            className="btn-primary mt-4 min-h-[44px]"
            disabled={!canRun}
            onClick={() => void runDigest()}
          >
            {loading ? "Scanning Atlantic…" : "Build the digest"}
          </button>
        </div>
      </section>

      {/* 02 · Run — visible ONLY while real work is in flight */}
      {loading && (
        <section aria-label="Digest scan in progress">
          <p className="text-sm font-semibold text-slate mb-3">02 · Scanning</p>
          <ProgressLoader
            steps={steps}
            current={stepIdx}
            title={`Weekly digest — ${shortenAddress(address)} · last ${windowDays} days`}
          />
        </section>
      )}

      {/* 03 · Result — the digest as an editorial document */}
      {!loading && !error && digest && digest.txTotal > 0 && (
        <section aria-label="Digest result">
          <p className="text-sm font-semibold text-slate mb-3">03 · Result — this week's digest</p>
          <div className="space-y-6">
            <ResultCard
              eyebrow={`Weekly digest — ${shortenAddress(digest.address)} · ${fmtDate(digest.startIso)} → ${fmtDate(digest.endIso)}`}
              headline={
                <>
                  {digest.txTotal.toLocaleString()}{" "}
                  transaction{digest.txTotal === 1 ? "" : "s"}
                </>
              }
              subline={
                <>
                  Blocks {digest.startBlock.toLocaleString()} → {digest.endBlock.toLocaleString()},{" "}
                  {digest.chunks.toLocaleString()} Transfer-event chunks scanned in {digest.secs}s.
                  Every figure below was read live from Atlantic — nothing estimated,
                  nothing carried over from a previous run.
                </>
              }
              rows={[
                { label: "Sent / received", value: `${digest.txSent} / ${digest.txReceived}` },
                { label: "Token transfer events", value: digest.transferEvents.toLocaleString() },
                { label: "Sections rendered", value: orderedSections.join(", ") },
                { label: "Scanned at", value: new Date().toLocaleString() },
              ]}
              links={[
                { label: "View the address on the explorer", href: `${EXPLORER_ADDRESS}${digest.address}` },
              ]}
              copyValue={digest.address}
              status="pass"
            />

            {stats.length > 0 && <StatStrip stats={stats} />}

            {orderedSections.includes("top3") && (
              <SectionCard
                eyebrow="Section · TOP 3 notable"
                title="The three events that mattered"
                note="Deterministic rule-based ranking: failed tx › contract creation › large native transfer › token transfer › contract interaction › plain transfer. Ties break by newest block."
              >
                {digest.top3.length > 0 ? (
                  <ol className="divide-y divide-hairline">
                    {digest.top3.map((e, i) => (
                      <motion.li
                        key={e.hash}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(i * 0.06, 0.3) }}
                        className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                      >
                        <span className="w-8 shrink-0 font-display text-3xl text-slate" aria-label={`Rank ${i + 1}`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p>
                            <span className={KIND_CHIP[e.kind] ?? "chip chip-dim"}>{e.kind}</span>
                          </p>
                          <p className="mt-1.5 text-base font-semibold text-ink">{e.title}</p>
                          <p className="mt-0.5 font-mono text-xs text-slate">{e.detail}</p>
                        </div>
                        <a
                          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-porcelain px-3 text-sm font-medium text-accent hover:bg-tint"
                          href={`${EXPLORER_TX}${e.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          title={e.hash}
                        >
                          View on explorer
                          <ExternalLink size={14} aria-hidden />
                        </a>
                      </motion.li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate">No notable events in this window — an honest quiet week.</p>
                )}
              </SectionCard>
            )}

            {orderedSections.includes("whales") && (
              <SectionCard
                eyebrow="Section · Whale moves"
                title={`Whale moves — native ≥ ${WHALE_THRESHOLD} PHRS`}
                note="Large native transfers touching the watched address, ranked biggest-first."
              >
                {digest.whales.length > 0 ? (
                  <ul className="divide-y divide-hairline">
                    {digest.whales.slice(0, 10).map((w, i) => (
                      <motion.li
                        key={w.hash}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
                        className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-lg font-semibold text-ink">
                            {fmtPhrs(w.value)} <span className="text-sm font-normal text-slate">PHRS</span>
                            <span className={`chip ml-2 ${w.direction === "IN" ? "chip-pass" : "chip-info"}`}>
                              {w.direction}
                            </span>
                          </p>
                          <p className="mt-1 font-mono text-xs text-slate">
                            {shortenAddress(w.counterparty)} · block {w.block.toLocaleString()}
                          </p>
                        </div>
                        <a
                          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-porcelain px-3 text-sm font-medium text-accent hover:bg-tint"
                          href={`${EXPLORER_TX}${w.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          title={w.hash}
                        >
                          View on explorer
                          <ExternalLink size={14} aria-hidden />
                        </a>
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate">
                    No whale-sized moves this week — nothing moved ≥ {WHALE_THRESHOLD} PHRS.
                  </p>
                )}
              </SectionCard>
            )}

            {orderedSections.includes("tokens") && (
              <SectionCard
                eyebrow="Section · Token transfers"
                title="ERC20 flows"
                note="Transfer events found by chain-direct eth_getLogs; symbols and decimals read from each token contract itself."
              >
                {digest.tokenFlows.length > 0 ? (
                  <ul className="divide-y divide-hairline">
                    {digest.tokenFlows.map((f) => (
                      <li key={f.token} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-ink">
                            {f.symbol}
                            <a
                              className="ml-2 font-mono text-xs font-normal text-accent hover:underline"
                              href={`${EXPLORER_ADDRESS}${f.token}`}
                              target="_blank"
                              rel="noreferrer"
                              title={f.token}
                            >
                              {shortHash(f.token)}
                            </a>
                          </p>
                          <p className="mt-1 text-sm text-slate">
                            {f.inN > 0 && (
                              <span className="mr-3">
                                <span className="font-semibold text-ink">{f.inN}</span> in ·{" "}
                                <span className="font-mono">{fmtPhrs(f.inAmt)}</span>
                              </span>
                            )}
                            {f.outN > 0 && (
                              <span>
                                <span className="font-semibold text-ink">{f.outN}</span> out ·{" "}
                                <span className="font-mono">{fmtPhrs(f.outAmt)}</span>
                              </span>
                            )}
                            {f.inN === 0 && f.outN === 0 && "self-transfers only"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate">No token transfers in this window.</p>
                )}
              </SectionCard>
            )}

            {orderedSections.includes("failed") && (
              <SectionCard
                eyebrow="Section · Failures & creations"
                title="What broke, what was built"
                note="Every reverted transaction and every contract creation in the window — the parts of the week worth a second look."
              >
                <div className="space-y-5">
                  <div>
                    <h5 className="text-sm font-semibold text-ink">
                      Failed transactions ({digest.failedList.length})
                    </h5>
                    {digest.failedList.length > 0 ? (
                      <ul className="mt-2 divide-y divide-hairline rounded-xl border border-hairline">
                        {digest.failedList.slice(0, 10).map((t) => (
                          <li key={t.hash} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="font-mono text-sm text-ink" title={t.hash}>{shortHash(t.hash)}</p>
                              <p className="font-mono text-xs text-slate">
                                receipt_status={t.receipt_status} · block {t.block_number.toLocaleString()}
                              </p>
                            </div>
                            <span className="chip chip-fail shrink-0">reverted</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-slate">None — a clean week.</p>
                    )}
                  </div>
                  <div>
                    <h5 className="text-sm font-semibold text-ink">
                      Contract creations ({digest.creationsList.length})
                    </h5>
                    {digest.creationsList.length > 0 ? (
                      <ul className="mt-2 divide-y divide-hairline rounded-xl border border-hairline">
                        {digest.creationsList.slice(0, 10).map((t) => (
                          <li key={t.hash} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="font-mono text-sm text-ink" title={t.receipt_contract_address ?? t.hash}>
                                {shortenAddress(t.receipt_contract_address ?? t.hash)}
                              </p>
                              <p className="font-mono text-xs text-slate">
                                via {shortHash(t.hash)} · block {t.block_number.toLocaleString()}
                              </p>
                            </div>
                            <span className="chip chip-info shrink-0">created</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-slate">None this week.</p>
                    )}
                  </div>
                </div>
              </SectionCard>
            )}

            {highlightItems.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-ink">Digest highlights</h4>
                <FeedList items={highlightItems} maxHeight="max-h-80" />
              </div>
            )}

            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">This session's digests</h4>
              <FeedList
                items={historyItems}
                emptyText="No digests yet this session — every scan you run is recorded here with its block range and chunk count."
              />
            </div>
          </div>
        </section>
      )}

      {/* 03 · Result — the honest zero */}
      {!loading && !error && digest && digest.txTotal === 0 && (
        <section aria-label="Digest result — quiet week">
          <p className="text-sm font-semibold text-slate mb-3">03 · Result</p>
          <div className="space-y-6">
            <EmptyState
              title="Quiet week"
              message={`No transactions for ${shortenAddress(digest.address)} between ${fmtDate(digest.startIso)} and ${fmtDate(digest.endIso)} (blocks ${digest.startBlock.toLocaleString()} → ${digest.endBlock.toLocaleString()}). The scan checked ${digest.chunks.toLocaleString()} log chunks and the full address history — that's an honest answer, not an error.`}
              actionLabel={nextWiderWindow ? `Widen to ${nextWiderWindow.label}` : undefined}
              onAction={
                nextWiderWindow
                  ? () => {
                      setWindowDays(nextWiderWindow.days);
                      setDigest(null);
                    }
                  : undefined
              }
            />
            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">This session's digests</h4>
              <FeedList
                items={historyItems}
                emptyText="No digests yet this session — every scan you run is recorded here with its block range and chunk count."
              />
            </div>
          </div>
        </section>
      )}

      {/* Before the first run */}
      {!loading && !error && !digest && (
        <EmptyState
          title="No digest yet"
          message="Configure the address, sections, and window above, then build the digest. Every number you see will come from a live chain read — nothing is mocked, estimated, or carried over."
          actionLabel={canRun ? "Build the digest" : undefined}
          onAction={canRun ? () => void runDigest() : undefined}
        />
      )}

      {/* Error */}
      {!loading && error && (
        <ErrorState
          title="The digest didn't finish"
          message={error}
          hint="Nothing was recorded — any previous digest and your scan history are untouched."
          retryLabel="Retry the scan"
          onRetry={() => void runDigest()}
        />
      )}

      {/* Proof it delivers — the real delivered digest, verbatim */}
      <section aria-label="Delivery proof">
        <p className="text-sm font-semibold text-slate mb-3">Proof it delivers</p>
        <SectionCard
          eyebrow="Real delivery · Telegram"
          title="One message, one receipt"
          note={`The exact text the T26 agent delivered to a real Telegram channel on 2026-10-16 (message_id ${DIGEST_MSG_ID}, ${DIGEST_WINDOW}). The console never sends messages — this is what the CLI agent below produces.`}
        >
          <div className="code-block mb-4 whitespace-pre-wrap">{DIGEST_TEXT}</div>
          <table className="data-table">
            <tbody>
              <tr>
                <td className="font-semibold">Window</td>
                <td>{DIGEST_WINDOW}</td>
              </tr>
              <tr>
                <td className="font-semibold">Activity</td>
                <td>110 txs (109 sent / 1 received), 25 creations, 7 failed, 31 token-transfer events</td>
              </tr>
              <tr>
                <td className="font-semibold">Delivery</td>
                <td>
                  one Telegram <span className="font-mono text-xs">sendMessage</span>,
                  message_id <span className="font-mono text-xs">{DIGEST_MSG_ID}</span>,
                  receipt recorded in <span className="font-mono text-xs">evidence.json</span>
                </td>
              </tr>
              <tr>
                <td className="font-semibold">Spend</td>
                <td>0 PHRS — the agent broadcasts nothing; only RPC reads + one Telegram message</td>
              </tr>
            </tbody>
          </table>
          <a
            className="mt-3 inline-block font-mono text-xs text-accent hover:underline"
            href={`${EXPLORER_ADDRESS}${WATCH_DEFAULT}`}
            target="_blank"
            rel="noreferrer"
          >
            Watch the address on the explorer →
          </a>
        </SectionCard>
      </section>

      {/* Run it on your machine — Tier C config builder, unchanged behavior */}
      <section aria-label="CLI configuration">
        <p className="text-sm font-semibold text-slate mb-3">Run it on your machine</p>
        <div className="rounded-2xl border border-hairline bg-white p-6 sm:p-8">
          <p className="text-sm font-semibold text-ink">Your digest config</p>
          <p className="mt-1 text-sm text-slate">
            The sections you ticked above are already in here as{" "}
            <span className="font-mono text-xs">T26_SECTIONS</span>. Copy, paste
            into your terminal, and the real agent runs the weekly pipeline —
            including Telegram delivery, which the browser never does.
          </p>
          <div className="code-block mb-3 mt-4 whitespace-pre-wrap">{configCmd}</div>
          <div className="mb-6">
            <CopyButton text={configCmd} disabled={!addrOk || sections.length === 0} />
          </div>

          <p className="text-sm font-semibold text-ink">Schedule it</p>
          <div className="mb-3 mt-2 flex flex-wrap gap-2">
            {CADENCES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={c.id === cadenceId ? "btn-primary" : "btn-outline"}
                onClick={() => setCadenceId(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="code-block mb-3 whitespace-pre-wrap">{cronCmd}</div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={cronCmd} />
            <span className="chip chip-pass self-center">{lamp.points} pts · Tier C</span>
          </div>
          <p className="mt-3 text-sm text-slate">
            Read-only agent: zero transactions broadcast, 0 PHRS spent. The first
            digest has no previous period —{" "}
            <span className="font-mono text-xs">--backfill</span> exists precisely
            so the comparison is real history, and until it runs the digest
            labels deltas "baseline".
          </p>
        </div>
      </section>

      <p className="text-sm text-slate">
        Tier C — the console only reads the chain and generates your CLI config;
        nothing is signed, nothing is sent, and LIGHTKEEPER never sees, holds,
        or asks for private keys.
      </p>
    </div>
  );
}
