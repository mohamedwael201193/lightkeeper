/**
 * T02 — Event/Log Monitor · "Watch any contract live" (Tier A: live reads only,
 * no wallet, costs nothing).
 *
 * Configure → run → result: pick a contract + event signature (presets include
 * the T02 LogEmitter itself), scan chunked eth_getLogs (≤1,000 blocks/call —
 * the node range cap is respected, larger ranges are chunked automatically),
 * decode indexed topics + ABI data into readable fields, click through to the
 * explorer for the full receipt.
 *
 * The sharp bit: the watch session splits every result into "Caught after you
 * started watching" vs "Historical context". Any event whose block is higher
 * than the tip at the moment you hit Watch now is flagged CAUGHT LIVE —
 * the same live-catch proof the Python monitor (tasks/t02-event-log-monitor/
 * monitor.py) demonstrates server-side with its persistent cursor.
 *
 * topic0 is computed at runtime via keccak256(eventSignature) — never hardcoded,
 * mirroring the Python monitor.
 *
 * SHOWTIME presentation: 01 Configure → 02 Run (ProgressLoader with real
 * chunk progress) → 03 Result (ResultCard → StatStrip → FeedList). Every
 * animation maps to a real state; every number came from a real RPC call.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Blocks, History, Layers, Radio } from "lucide-react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  isValidAddress,
  rpcCall,
} from "../../hooks/useAtlantic";
import {
  ResultCard,
  ProgressLoader,
  EmptyState,
  ErrorState,
  StatStrip,
  FeedList,
} from "../ui";
import type { FeedItem } from "../ui";
import { keccak256Hex } from "./keccak256";

const LOGEMITTER = "0x2C1dB0C436B72D94a4112f321DFbD13a976D8831";
const CHUNK_CAP = 1000; // node range cap: ≤1,000 blocks per getLogs call
// Default window covers the emitter's real keepalive/live-catch events
// (newest ~8k blocks behind the tip; verified against the live RPC).
const DEFAULT_WINDOW = 20000;
const REORG_LAG = 2; // blocks skipped behind tip — mirrors monitor.py CONFIRM_LAG
const AUTO_FAIL_LIMIT = 3; // consecutive auto-refresh failures before self-pausing
const SIG_RE = /^\w+\([\w,\[\]]*\)$/;
const ADDRESS_FIELDS = new Set(["from", "to", "sender", "target", "owner", "spender"]);

interface Preset {
  label: string;
  signature: string;
  contract: string;
  fields: string[];
}

const PRESETS: Preset[] = [
  {
    label: "LogEmitter · Ping",
    signature: "Ping(address,uint256,string)",
    contract: LOGEMITTER,
    fields: ["from", "value", "note"],
  },
  {
    label: "LogEmitter · Zap",
    signature: "Zap(address,address,uint256)",
    contract: LOGEMITTER,
    fields: ["sender", "target", "amount"],
  },
  {
    label: "LogEmitter · Marker",
    signature: "Marker(uint256,bytes32,bytes)",
    contract: LOGEMITTER,
    fields: ["id", "tag", "payload"],
  },
  {
    label: "ERC-20 · Transfer",
    signature: "Transfer(address,address,uint256)",
    contract: "",
    fields: ["from", "to", "value"],
  },
  {
    label: "ERC-20 · Approval",
    signature: "Approval(address,address,uint256)",
    contract: "",
    fields: ["owner", "spender", "value"],
  },
];

interface LogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

interface DecodedLog extends LogEntry {
  fields: Record<string, string>;
  decodeNote: string | null;
  caughtLive: boolean;
}

function topicToAddress(topic: string): string {
  return "0x" + topic.slice(-40);
}

function topicToUint(topic: string): string {
  return BigInt(topic).toString();
}

function readUint(data: string, offset: number): bigint {
  // offset in bytes; data is 0x-prefixed hex
  return BigInt("0x" + data.slice(2 + offset * 2, 2 + offset * 2 + 64));
}

function readDynamicBytes(data: string): { bytes: string; len: number } | null {
  // ABI: offset(0) -> length -> bytes. Assumes offset word points at 0x40.
  try {
    const len = Number(readUint(data, 64));
    if (len > 4096) return null;
    const hex = data.slice(2 + 96 * 2, 2 + 96 * 2 + len * 2);
    if (hex.length < len * 2) return null;
    return { bytes: "0x" + hex, len };
  } catch {
    return null;
  }
}

function decodeUtf8(hexBytes: string): string | null {
  try {
    const raw = hexBytes.startsWith("0x") ? hexBytes.slice(2) : hexBytes;
    const bytes = new Uint8Array(raw.match(/../g)!.map((b) => parseInt(b, 16)));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.stringify(text);
  } catch {
    return null;
  }
}

/** Decode one log for a known signature shape. Unknown signatures -> raw. */
function decodeLog(log: LogEntry, signature: string): DecodedLog {
  const fields: Record<string, string> = {};
  let decodeNote: string | null = null;
  const topics = log.topics;
  try {
    if (signature === "Transfer(address,address,uint256)") {
      fields["from"] = topicToAddress(topics[1]);
      fields["to"] = topicToAddress(topics[2]);
      fields["value"] = BigInt(log.data).toString();
    } else if (signature === "Approval(address,address,uint256)") {
      fields["owner"] = topicToAddress(topics[1]);
      fields["spender"] = topicToAddress(topics[2]);
      fields["value"] = BigInt(log.data).toString();
    } else if (signature === "Ping(address,uint256,string)") {
      fields["from"] = topicToAddress(topics[1]);
      fields["value"] = readUint(log.data, 0).toString();
      const dyn = readDynamicBytes(log.data);
      fields["note"] = dyn ? (decodeUtf8(dyn.bytes) ?? dyn.bytes) : "—";
    } else if (signature === "Zap(address,address,uint256)") {
      fields["sender"] = topicToAddress(topics[1]);
      fields["target"] = topicToAddress(topics[2]);
      fields["amount"] = readUint(log.data, 0).toString();
    } else if (signature === "Marker(uint256,bytes32,bytes)") {
      fields["id"] = topicToUint(topics[1]);
      fields["tag"] = "0x" + log.data.slice(2, 66);
      const dyn = readDynamicBytes(log.data);
      fields["payload"] = dyn ? dyn.bytes : "—";
    } else {
      decodeNote = `No decoder for "${signature}" — raw topics + data shown.`;
    }
  } catch {
    decodeNote = "This log didn't match the expected shape — raw topics + data shown.";
  }
  return { ...log, fields, decodeNote, caughtLive: false };
}

function hexToNum(hex: string): number {
  return Number(BigInt(hex));
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function shorten(h: string): string {
  return h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}

/** Drop the JSON quotes around decoded string fields so they read naturally. */
function readableValue(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

/** Turn an RPC/transport failure into a plain-language message + keep the session. */
function classifyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const low = raw.toLowerCase();
  if (/429|rate.?limit|too many requests/.test(low))
    return "The Atlantic RPC is rate-limiting reads right now. Wait a few seconds, then try again — your watch session is kept.";
  if (/exceed|range|block range|too large/.test(low))
    return "The node rejected that block range. Narrow the look-back and try again — your watch session is kept.";
  if (/did not answer|failed to fetch|network|timeout|http 5\d\d|econnrefused/.test(low))
    return "The Atlantic RPC did not answer. Check your connection and try again — your watch session is kept.";
  return raw.length > 220 ? raw.slice(0, 220) + "…" : raw;
}

interface ScanMeta {
  from: number;
  to: number;
  chunks: number;
  watchStart: number;
  lag: number;
  contract: string;
  signature: string;
}

interface ScanOpts {
  fresh?: boolean;
  viaAuto?: boolean;
  /** Override the state values (used by the EmptyState CTA so it can scan atomically). */
  contract?: string;
  signature?: string;
}

function FieldRow({ field, value }: { field: string; value: string }) {
  const isAddr = ADDRESS_FIELDS.has(field) && isValidAddress(value);
  return (
    <div className="flex items-baseline gap-3 border-t border-hairline py-1.5 first:border-t-0 first:pt-0">
      <span className="w-20 shrink-0 text-sm font-semibold text-slate">{field}</span>
      {isAddr ? (
        <a
          href={`${EXPLORER_ADDRESS}${value}`}
          target="_blank"
          rel="noreferrer"
          title={value}
          className="min-w-0 truncate font-mono text-sm text-accent hover:underline"
        >
          {shorten(value)}
        </a>
      ) : (
        <span
          className={`min-w-0 break-all text-sm text-ink ${value.startsWith("0x") ? "font-mono" : ""}`}
          title={value.length > 64 ? value : undefined}
        >
          {readableValue(value)}
        </span>
      )}
    </div>
  );
}

function eventCardNode(l: DecodedLog, eventName: string): React.ReactNode {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-ink">{eventName}</p>
        {l.caughtLive ? (
          <span className="chip chip-lit inline-flex items-center gap-1.5 whitespace-nowrap">
            <motion.span
              animate={{ scale: [1, 1.35, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              className="h-2 w-2 rounded-full bg-pass"
              aria-hidden
            />
            Caught live
          </span>
        ) : (
          <span className="chip chip-dim whitespace-nowrap">Historical</span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate">
        Block <span className="font-mono text-ink">{fmt(hexToNum(l.blockNumber))}</span>
        {" · "}
        <a
          className="font-mono text-accent hover:underline"
          href={`${EXPLORER_TX}${l.transactionHash}`}
          target="_blank"
          rel="noreferrer"
          title={l.transactionHash}
        >
          {shorten(l.transactionHash)}
        </a>
      </p>
      <div className="mt-2.5">
        {Object.entries(l.fields).map(([k, v]) => (
          <FieldRow key={k} field={k} value={v} />
        ))}
        {l.decodeNote && <p className="text-sm leading-relaxed text-slate">{l.decodeNote}</p>}
      </div>
    </div>
  );
}

export default function TryEventLogMonitor({ lamp }: { lamp: Lamp }) {
  const [presetIdx, setPresetIdx] = useState(0);
  const [custom, setCustom] = useState(false);
  const [signature, setSignature] = useState(PRESETS[0].signature);
  const [contract, setContract] = useState(PRESETS[0].contract);
  const [windowBlocks, setWindowBlocks] = useState(String(DEFAULT_WINDOW));
  const [reorgLag, setReorgLag] = useState(true);
  const [results, setResults] = useState<DecodedLog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoStopped, setAutoStopped] = useState<string | null>(null);
  const [meta, setMeta] = useState<ScanMeta | null>(null);
  const [auto, setAuto] = useState(false);
  // 02 · Run state: ProgressLoader steps map 1:1 onto real RPC calls.
  const [steps, setSteps] = useState<string[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [scanLabel, setScanLabel] = useState("");
  // Background auto-refresh tick: a one-line honest status, not a full loader.
  const [autoTick, setAutoTick] = useState(false);
  const [autoProgress, setAutoProgress] = useState<{ current: number; total: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  // The watch session: blocks seen so far + the tip when watching began.
  // Any event from a block HIGHER than the watch start is flagged CAUGHT LIVE.
  const seenRef = useRef<Set<string>>(new Set());
  const watchStartRef = useRef<number | null>(null);
  const failCountRef = useRef(0);
  // Guards overlapping scans: only the newest run may commit state.
  const scanSeqRef = useRef(0);

  const topic0 = useMemo(() => keccak256Hex(signature.trim()), [signature]);
  const contractOk = isValidAddress(contract);
  const sigOk = SIG_RE.test(signature.trim());

  const resetWatch = useCallback(() => {
    seenRef.current = new Set();
    watchStartRef.current = null;
    failCountRef.current = 0;
    setResults(null);
    setMeta(null);
    setError(null);
    setAutoStopped(null);
  }, []);

  const stopAuto = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Never leave a ticking interval behind when the panel unmounts.
  useEffect(() => () => stopAuto(), [stopAuto]);

  const runScan = useCallback(
    async (opts: ScanOpts = {}) => {
      const effContract = (opts.contract ?? contract).trim();
      const effSig = (opts.signature ?? signature).trim();
      if (!isValidAddress(effContract) || !SIG_RE.test(effSig)) return;
      const viaAuto = opts.viaAuto ?? false;
      // An auto tick continues the session; a manual Watch now starts a new one.
      const fresh = viaAuto ? watchStartRef.current === null : (opts.fresh ?? false);
      if (fresh) resetWatch();
      const myId = ++scanSeqRef.current;
      const alive = () => scanSeqRef.current === myId;
      const manual = !viaAuto;
      const eventName = effSig.split("(")[0];
      if (manual) {
        setLoading(true);
        setError(null);
        setAutoStopped(null);
        setScanLabel(`${eventName} on ${shorten(effContract)}`);
        setSteps(["Reading the latest block"]);
        setStepIdx(0);
      } else {
        setAutoTick(true);
        setAutoProgress(null);
      }
      try {
        // Step 1 of the run: the real eth_blockNumber call.
        const chainTip = hexToNum((await rpcCall("eth_blockNumber", [])) as string);
        if (!alive()) return;
        const lag = reorgLag ? REORG_LAG : 0;
        const tip = Math.max(0, chainTip - lag);
        if (watchStartRef.current === null) watchStartRef.current = tip;
        const watchStart = watchStartRef.current;
        const win = Math.max(1, Math.min(200000, parseInt(windowBlocks, 10) || DEFAULT_WINDOW));
        const from = Math.max(0, tip - win);
        const filter = {
          address: effContract,
          topics: [keccak256Hex(effSig)],
        };
        const chunks: Array<[number, number]> = [];
        for (let s = from; s <= tip; s += CHUNK_CAP)
          chunks.push([s, Math.min(s + CHUNK_CAP - 1, tip)]);
        const labels = chunks.map(
          ([a, b], i) =>
            `Scanning blocks ${a.toLocaleString("en-US")} → ${b.toLocaleString("en-US")} — chunk ${i + 1} of ${chunks.length}`
        );
        if (manual) setSteps(["Reading the latest block", ...labels]);
        // One real eth_getLogs call per chunk — the loader advances per call.
        const all: LogEntry[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const [a, b] = chunks[i];
          if (manual) setStepIdx(1 + i);
          else setAutoProgress({ current: i + 1, total: chunks.length });
          const logs = (await rpcCall("eth_getLogs", [
            {
              ...filter,
              fromBlock: "0x" + a.toString(16),
              toBlock: "0x" + b.toString(16),
            },
          ])) as LogEntry[];
          if (!alive()) return; // a newer scan owns the state now
          all.push(...logs);
        }
        if (manual) setStepIdx(labels.length + 1);
        const decoded = all
          .map((l) => {
            const d = decodeLog(l, effSig);
            const key = `${l.blockNumber}:${l.logIndex}`;
            const seen = seenRef.current.has(key);
            seenRef.current.add(key);
            return {
              ...d,
              caughtLive: !seen && hexToNum(l.blockNumber) > watchStart,
            };
          })
          .sort(
            (x, y) =>
              hexToNum(y.blockNumber) - hexToNum(x.blockNumber) ||
              hexToNum(y.logIndex) - hexToNum(x.logIndex)
          );
        if (!alive()) return;
        setResults(decoded);
        setMeta({
          from,
          to: tip,
          chunks: chunks.length,
          watchStart,
          lag,
          contract: effContract,
          signature: effSig,
        });
        failCountRef.current = 0;
      } catch (e) {
        if (!alive()) return;
        const msg = classifyError(e);
        if (viaAuto) {
          failCountRef.current += 1;
          if (failCountRef.current >= AUTO_FAIL_LIMIT) {
            stopAuto();
            setAuto(false);
            setAutoStopped(
              `Auto-refresh stopped after ${AUTO_FAIL_LIMIT} failed attempts: ${msg} Press Refresh to try once, or resume below to keep watching.`
            );
          }
        } else {
          setError(msg);
        }
      } finally {
        if (manual) setLoading(false);
        else setAutoTick(false);
      }
    },
    [contract, signature, windowBlocks, reorgLag, resetWatch, stopAuto]
  );

  const toggleAuto = useCallback(
    (on: boolean) => {
      setAuto(on);
      stopAuto();
      setAutoStopped(null);
      if (on) {
        void runScan({ viaAuto: true });
        timerRef.current = window.setInterval(() => void runScan({ viaAuto: true }), 30000);
      }
    },
    [runScan, stopAuto]
  );

  const pickPreset = (i: number) => {
    setPresetIdx(i);
    setCustom(false);
    setSignature(PRESETS[i].signature);
    // ERC-20 presets carry no contract — clear the field so a token address
    // must be pasted (scanning the emitter for Transfer would just be quiet).
    setContract(PRESETS[i].contract);
    resetWatch();
  };

  /** EmptyState CTA: select the Ping preset AND run the scan atomically. */
  const scanPresetNow = (i: number) => {
    const p = PRESETS[i];
    setPresetIdx(i);
    setCustom(false);
    setSignature(p.signature);
    setContract(p.contract);
    resetWatch();
    void runScan({ fresh: true, contract: p.contract, signature: p.signature });
  };

  const liveRows = results?.filter((r) => r.caughtLive) ?? [];
  const histRows = results?.filter((r) => !r.caughtLive) ?? [];
  const metaSig = meta?.signature ?? signature;
  const metaEventName = metaSig.trim().split("(")[0];
  const scannedBlocks = meta ? meta.to - meta.from + 1 : 0;

  const feedItems: FeedItem[] = useMemo(
    () =>
      [...liveRows, ...histRows].map((l) => ({
        key: `${l.blockNumber}:${l.logIndex}`,
        node: eventCardNode(l, metaEventName),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, metaEventName]
  );

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-ink">
        <span className="font-semibold text-ink">{lamp.name}.</span> Point LIGHTKEEPER at
        any contract, pick an event, and watch it live — filtered, decoded, traceable.
        Reads are free and need no wallet. The lamp's own on-chain emitter already has
        real events you can catch right now. Anything that lands <em>after</em> you hit
        Watch now is flagged{" "}
        <span className="chip chip-lit whitespace-nowrap">Caught live</span> — the rest
        is historical context.
      </p>

      {/* 01 · Configure */}
      <section className="rounded-2xl border border-hairline bg-white p-5 sm:p-6">
        <p className="mb-4 text-sm font-semibold text-slate">01 · Configure the watch</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              className={i === presetIdx && !custom ? "chip chip-lit" : "chip chip-dim"}
              onClick={() => pickPreset(i)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={custom ? "chip chip-lit" : "chip chip-dim"}
            onClick={() => {
              setCustom(true);
              resetWatch();
            }}
          >
            Custom event…
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate">
              Contract address
            </span>
            <input
              className="min-h-[44px] w-full rounded-lg border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink"
              value={contract}
              onChange={(e) => {
                setContract(e.target.value);
                resetWatch();
              }}
              placeholder="0x…"
              spellCheck={false}
            />
            {!contractOk && contract && (
              <span className="mt-1.5 block text-sm text-fail">
                Not a valid 0x address.
              </span>
            )}
            {contract === "" && (
              <span className="mt-1.5 block text-sm text-slate">
                Paste a contract address — e.g. any ERC-20 token for the Transfer preset.
              </span>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate">
              Event signature
            </span>
            <input
              className="min-h-[44px] w-full rounded-lg border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink"
              value={signature}
              onChange={(e) => {
                setSignature(e.target.value);
                setCustom(true);
                resetWatch();
              }}
              placeholder="Transfer(address,address,uint256)"
              spellCheck={false}
            />
            {!sigOk && signature && (
              <span className="mt-1.5 block text-sm text-fail">
                Use Solidity shape, e.g. Transfer(address,address,uint256).
              </span>
            )}
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate">
              Look back (blocks)
            </span>
            <input
              className="min-h-[44px] w-40 rounded-lg border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink"
              value={windowBlocks}
              onChange={(e) => {
                setWindowBlocks(e.target.value.replace(/[^0-9]/g, ""));
                resetWatch();
              }}
            />
          </label>
          <button
            type="button"
            className="btn-primary min-h-[44px] self-end"
            disabled={!contractOk || !sigOk || loading}
            onClick={() => void runScan({ fresh: true })}
          >
            {loading ? "Scanning Atlantic…" : "Watch now"}
          </button>
          <button
            type="button"
            className="btn-outline min-h-[44px] self-end"
            disabled={loading}
            onClick={() => void runScan({})}
            title="Scan again without restarting the watch — new arrivals get flagged Caught live."
          >
            Refresh
          </button>
          <label
            className="flex items-center gap-2 self-end pb-2.5 text-sm text-slate"
            title="Same 2-block confirmation lag as the server-side monitor — cheap reorg tolerance."
          >
            <input
              type="checkbox"
              checked={reorgLag}
              onChange={(e) => {
                setReorgLag(e.target.checked);
                resetWatch();
              }}
              className="h-4 w-4"
            />
            Skip the last 2 blocks (reorg buffer)
          </label>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-slate">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => toggleAuto(e.target.checked)}
              className="h-4 w-4"
            />
            Auto-refresh every 30s
            {auto && <span className="chip chip-lit">on — untick to stop</span>}
          </label>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate">
          topic0 <code className="font-mono">{topic0}</code> is computed from the
          signature, never hardcoded. The node caps eth_getLogs at{" "}
          {CHUNK_CAP.toLocaleString()} blocks per call — wider ranges scan in chunks,
          and each chunk is one real step of the run below.
        </p>
      </section>

      {/* 02 · Run — one ProgressLoader step per real RPC call */}
      {loading && (
        <ProgressLoader steps={steps} current={stepIdx} title={`Watching ${scanLabel}`} />
      )}
      {autoTick && !loading && (
        <div className="flex items-center gap-2.5" aria-live="polite">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" aria-hidden />
          <p className="text-sm text-slate">
            Auto-refresh scanning
            {autoProgress ? ` — chunk ${autoProgress.current} of ${autoProgress.total}` : "…"}
          </p>
        </div>
      )}

      {/* Errors */}
      {error && (
        <ErrorState
          title="That scan didn't go through."
          message={error}
          onRetry={() => void runScan({})}
        />
      )}
      {autoStopped && (
        <ErrorState
          title="Auto-refresh paused itself."
          message={autoStopped}
          hint="Press Refresh for a one-off scan, or resume to keep watching."
          retryLabel="Resume auto-refresh"
          onRetry={() => toggleAuto(true)}
        />
      )}

      {/* 03 · Result */}
      {!loading && results && results.length > 0 && meta && (
        <section className="space-y-6">
          <p className="text-sm font-semibold text-slate">03 · Result</p>

          {liveRows.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="rounded-2xl border border-pass/50 bg-[#F0FBF4] p-5 sm:p-6"
              aria-live="polite"
            >
              <div className="flex items-center gap-3">
                <motion.span
                  animate={{ scale: [1, 1.35, 1], opacity: [1, 0.7, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  className="h-3 w-3 shrink-0 rounded-full bg-pass"
                  aria-hidden
                />
                <p className="text-lg font-semibold text-ink">
                  {liveRows.length} {liveRows.length === 1 ? "event" : "events"} caught
                  live
                </p>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate">
                These landed on-chain after you started watching (your watch began at
                block {fmt(meta.watchStart)}). Anything below the feed marked Historical
                was already there — context, not new.
              </p>
            </motion.div>
          )}

          <ResultCard
            eyebrow="Result — event watch"
            headline={
              <>
                {fmt(results.length)}{" "}
                {results.length === 1 ? "event" : "events"} found
              </>
            }
            subline={
              liveRows.length > 0
                ? `${liveRows.length} caught live after you started watching · ${histRows.length} historical. Scanned blocks ${fmt(meta.from)} → ${fmt(meta.to)} on the Atlantic testnet.`
                : `${histRows.length} historical ${histRows.length === 1 ? "event" : "events"} in blocks ${fmt(meta.from)} → ${fmt(meta.to)} on the Atlantic testnet. Nothing new landed while you watched.`
            }
            rows={[
              {
                label: "Contract",
                value: (
                  <a
                    href={`${EXPLORER_ADDRESS}${meta.contract}`}
                    target="_blank"
                    rel="noreferrer"
                    title={meta.contract}
                    className="text-accent hover:underline"
                  >
                    {shorten(meta.contract)}
                  </a>
                ),
              },
              { label: "Event signature", value: meta.signature },
              {
                label: "Scanned range",
                value: `${fmt(meta.from)} → ${fmt(meta.to)} (${meta.chunks} ${meta.chunks === 1 ? "chunk" : "chunks"})`,
              },
              {
                label: "Watch started",
                value: `block ${fmt(meta.watchStart)} · ${meta.lag}-block reorg buffer`,
              },
            ]}
            links={[
              {
                label: "View contract on the explorer",
                href: `${EXPLORER_ADDRESS}${meta.contract}`,
              },
            ]}
          />

          <StatStrip
            stats={[
              {
                label: "Blocks scanned",
                value: scannedBlocks,
                icon: <Blocks size={15} aria-hidden />,
              },
              {
                label: "Caught live",
                value: liveRows.length,
                icon: <Radio size={15} aria-hidden />,
              },
              {
                label: "Historical",
                value: histRows.length,
                icon: <History size={15} aria-hidden />,
              },
              {
                label: "RPC calls",
                value: meta.chunks + 1,
                icon: <Layers size={15} aria-hidden />,
              },
            ]}
          />

          <div>
            <p className="mb-3 text-sm font-semibold text-slate">
              Event feed — newest first
            </p>
            <FeedList items={feedItems} maxHeight="max-h-[32rem]" />
          </div>
        </section>
      )}

      {/* Quiet window — honest, not an error */}
      {!loading && !error && results && results.length === 0 && (
        <EmptyState
          title="Quiet window"
          message="No events matched in this range. That's an honest answer, not an error — the contract simply emitted nothing with this signature in these blocks."
          actionLabel="Scan the LogEmitter's real events"
          onAction={() => scanPresetNow(0)}
        />
      )}

      {/* Not started yet */}
      {!loading && !error && !results && (
        <div className="empty-panel px-5 py-6 text-sm leading-relaxed text-slate">
          Nothing watched yet — pick a preset (the LogEmitter presets have real on-chain
          events waiting) and hit <strong className="text-ink">Watch now</strong>.
          Refresh keeps the same watch session going; new arrivals are flagged Caught
          live.
        </div>
      )}

      <p className="text-sm text-slate">
        Tier A — plain JSON-RPC reads on the Atlantic testnet. No wallet, no signature,
        costs nothing. Click any tx hash or address to trace it on the explorer.
        LIGHTKEEPER never sees, holds, or asks for private keys.
      </p>
    </div>
  );
}
