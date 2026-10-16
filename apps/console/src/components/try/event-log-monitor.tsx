/**
 * T02 — Event/Log Monitor · "Watch any contract live" (Tier A: live reads only,
 * no wallet, costs nothing).
 *
 * Configure → watch → trace: pick a contract + event signature (presets include
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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lamp } from "../../types";
import {
  ATLANTIC_RPC_URL,
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  isValidAddress,
  rpcCall,
} from "../../hooks/useAtlantic";
import { keccak256Hex } from "./keccak256";

const LOGEMITTER = "0x2C1dB0C436B72D94a4112f321DFbD13a976D8831";
const CHUNK_CAP = 1000; // node range cap: ≤1,000 blocks per getLogs call
const DEFAULT_WINDOW = 2000;
const REORG_LAG = 2; // blocks skipped behind tip — mirrors monitor.py CONFIRM_LAG
const AUTO_FAIL_LIMIT = 3; // consecutive auto-refresh failures before self-pausing

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

function shorten(h: string): string {
  return h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
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
  const timerRef = useRef<number | null>(null);
  // The watch session: blocks seen so far + the tip when watching began.
  // Any event from a block HIGHER than the watch start is flagged CAUGHT LIVE.
  const seenRef = useRef<Set<string>>(new Set());
  const watchStartRef = useRef<number | null>(null);
  const failCountRef = useRef(0);

  const topic0 = useMemo(() => keccak256Hex(signature.trim()), [signature]);
  const contractOk = isValidAddress(contract);
  const sigOk = /^\w+\([\w,\[\]]*\)$/.test(signature.trim());

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
    async (opts: { fresh?: boolean; viaAuto?: boolean } = {}) => {
      if (!contractOk || !sigOk) return;
      const viaAuto = opts.viaAuto ?? false;
      // An auto tick continues the session; a manual Watch now starts a new one.
      const fresh = viaAuto ? watchStartRef.current === null : (opts.fresh ?? false);
      if (fresh) resetWatch();
      setLoading(true);
      if (!viaAuto) {
        setError(null);
        setAutoStopped(null);
      }
      try {
        const chainTip = hexToNum((await rpcCall("eth_blockNumber", [])) as string);
        const lag = reorgLag ? REORG_LAG : 0;
        const tip = Math.max(0, chainTip - lag);
        if (watchStartRef.current === null) watchStartRef.current = tip;
        const watchStart = watchStartRef.current;
        const win = Math.max(1, Math.min(200000, parseInt(windowBlocks, 10) || DEFAULT_WINDOW));
        const from = Math.max(0, tip - win);
        const filter = {
          address: contract.trim(),
          topics: [keccak256Hex(signature.trim())],
        };
        const chunks: Array<[number, number]> = [];
        for (let s = from; s <= tip; s += CHUNK_CAP)
          chunks.push([s, Math.min(s + CHUNK_CAP - 1, tip)]);
        const all: LogEntry[] = [];
        for (const [a, b] of chunks) {
          const logs = (await rpcCall("eth_getLogs", [
            {
              ...filter,
              fromBlock: "0x" + a.toString(16),
              toBlock: "0x" + b.toString(16),
            },
          ])) as LogEntry[];
          all.push(...logs);
        }
        const sig = signature.trim();
        const decoded = all
          .map((l) => {
            const d = decodeLog(l, sig);
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
        setResults(decoded);
        setMeta({ from, to: tip, chunks: chunks.length, watchStart, lag });
        failCountRef.current = 0;
      } catch (e) {
        const msg = classifyError(e);
        if (viaAuto) {
          failCountRef.current += 1;
          if (failCountRef.current >= AUTO_FAIL_LIMIT) {
            stopAuto();
            setAuto(false);
            setAutoStopped(
              `Auto-refresh stopped after ${AUTO_FAIL_LIMIT} failed attempts: ${msg} Press Refresh to try once, or re-tick the box to resume.`
            );
          }
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [contract, contractOk, signature, sigOk, windowBlocks, reorgLag, resetWatch, stopAuto]
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

  const liveRows = results?.filter((r) => r.caughtLive) ?? [];
  const histRows = results?.filter((r) => !r.caughtLive) ?? [];

  const renderTable = (rows: DecodedLog[]) => (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Caught</th>
            <th>Block</th>
            <th>Tx hash</th>
            <th>Event</th>
            <th>Decoded fields</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={`${l.blockNumber}:${l.logIndex}`}>
              <td>
                {l.caughtLive ? (
                  <span className="chip chip-lit whitespace-nowrap">Caught live</span>
                ) : (
                  <span className="text-xs text-slate">history</span>
                )}
              </td>
              <td className="font-mono">{hexToNum(l.blockNumber).toLocaleString()}</td>
              <td className="font-mono">
                <a
                  className="text-accent hover:underline"
                  href={`${EXPLORER_TX}${l.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  title={l.transactionHash}
                >
                  {shorten(l.transactionHash)}
                </a>
              </td>
              <td className="font-mono text-xs">{signature.trim().split("(")[0]}</td>
              <td className="font-mono text-xs">
                {Object.keys(l.fields).length > 0 ? (
                  Object.entries(l.fields).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-slate">{k}=</span>
                      {k === "from" || k === "to" || k === "sender" || k === "target" ? (
                        <a
                          className="text-accent hover:underline"
                          href={`${EXPLORER_ADDRESS}${v}`}
                          target="_blank"
                          rel="noreferrer"
                          title={v}
                        >
                          {shorten(v)}
                        </a>
                      ) : (
                        v
                      )}
                    </div>
                  ))
                ) : (
                  <span className="text-slate">{l.decodeNote}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-relaxed text-slate">
        <span className="font-semibold text-ink">{lamp.name}.</span> Point LIGHTKEEPER at
        any contract, pick an event, and watch it live — filtered, decoded, traceable.
        Reads are free and need no wallet. Default target: the lamp's own on-chain
        emitter, which already has real events you can catch right now. Anything that
        lands <em>after</em> you hit Watch now is flagged{" "}
        <span className="chip chip-lit whitespace-nowrap">Caught live</span> — the rest
        is historical context.
      </p>

      {/* 01 · Configure */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <p className="smallcaps mb-3">01 · Configure the watch</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              className={i === presetIdx && !custom ? "chip chip-lit" : "chip chip-dim"}
              onClick={() => pickPreset(i)}
            >
              {p.label}
            </button>
          ))}
          <button
            className={custom ? "chip chip-lit" : "chip chip-dim"}
            onClick={() => {
              setCustom(true);
              resetWatch();
            }}
          >
            Custom event…
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Contract address</span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink"
              value={contract}
              onChange={(e) => {
                setContract(e.target.value);
                resetWatch();
              }}
              placeholder="0x…"
              spellCheck={false}
            />
            {!contractOk && contract && (
              <span className="mt-1 block text-xs text-fail">Not a valid 0x address.</span>
            )}
            {contract === "" && (
              <span className="mt-1 block text-xs text-slate">
                Paste a contract address — e.g. any ERC-20 token for the Transfer preset.
              </span>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Event signature</span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink"
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
              <span className="mt-1 block text-xs text-fail">
                Use Solidity shape, e.g. Transfer(address,address,uint256).
              </span>
            )}
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Look back (blocks)</span>
            <input
              className="w-40 rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink"
              value={windowBlocks}
              onChange={(e) => {
                setWindowBlocks(e.target.value.replace(/[^0-9]/g, ""));
                resetWatch();
              }}
            />
          </label>
          <button
            className="btn-primary"
            disabled={!contractOk || !sigOk || loading}
            onClick={() => void runScan({ fresh: true })}
          >
            {loading ? "Scanning Atlantic…" : "Watch now"}
          </button>
          <button
            className="btn-outline"
            disabled={loading}
            onClick={() => void runScan({})}
            title="Scan again without restarting the watch — new arrivals get flagged Caught live."
          >
            Refresh
          </button>
          <label
            className="flex items-center gap-2 text-xs text-slate"
            title="Same 2-block confirmation lag as the server-side monitor — cheap reorg tolerance."
          >
            <input
              type="checkbox"
              checked={reorgLag}
              onChange={(e) => {
                setReorgLag(e.target.checked);
                resetWatch();
              }}
            />
            Skip the last 2 blocks (reorg buffer)
          </label>
          <label className="flex items-center gap-2 text-xs text-slate">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => toggleAuto(e.target.checked)}
            />
            Auto-refresh every 30s
            {auto && <span className="chip chip-lit">on — untick to stop</span>}
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate">
          topic0 = <code className="font-mono">{topic0}</code> (computed from the signature,
          never hardcoded). eth_getLogs caps at {CHUNK_CAP.toLocaleString()} blocks per call —
          wider ranges are chunked automatically. RPC: {ATLANTIC_RPC_URL}.
        </p>
      </div>

      {/* 02 · Watch */}
      {error && (
        <div className="rounded-xl border border-[#FECACA] bg-[#FFF7F7] p-4">
          <p className="text-sm font-semibold text-fail">That scan didn't go through.</p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{error}</p>
          <button
            className="btn-primary mt-3"
            disabled={loading}
            onClick={() => void runScan({})}
          >
            Try again
          </button>
        </div>
      )}
      {autoStopped && (
        <div className="rounded-xl border border-[#FECACA] bg-[#FFF7F7] p-4">
          <p className="text-sm font-semibold text-fail">Auto-refresh paused itself.</p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{autoStopped}</p>
          <button
            className="btn-outline mt-3"
            disabled={loading}
            onClick={() => toggleAuto(true)}
          >
            Resume auto-refresh
          </button>
        </div>
      )}
      {meta && (
        <p className="text-xs text-slate">
          Scanned blocks <span className="font-mono">{meta.from.toLocaleString()}</span> →{" "}
          <span className="font-mono">{meta.to.toLocaleString()}</span> in {meta.chunks}{" "}
          chunk{meta.chunks === 1 ? "" : "s"} · {meta.lag}-block reorg buffer · watching
          since block <span className="font-mono">{meta.watchStart.toLocaleString()}</span> ·{" "}
          {liveRows.length} caught live · {histRows.length} historical
        </p>
      )}
      {!results && !loading && !error && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          Nothing watched yet — pick a preset (the LogEmitter presets have real on-chain
          events waiting) and hit <strong className="text-ink">Watch now</strong>. Refresh
          keeps the watch session going; new arrivals are flagged Caught live.
        </div>
      )}
      {results && results.length === 0 && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          Quiet window — no events in this range. That's an honest answer, not an error.
          Widen the look-back or try the LogEmitter presets.
        </div>
      )}
      {results && results.length > 0 && (
        <div className="space-y-5">
          {liveRows.length > 0 && (
            <div>
              <p className="smallcaps mb-2">
                02 · Caught after you started watching ({liveRows.length})
              </p>
              {renderTable(liveRows)}
            </div>
          )}
          <div>
            {liveRows.length > 0 && (
              <p className="smallcaps mb-2">Historical context ({histRows.length})</p>
            )}
            {renderTable(histRows)}
          </div>
        </div>
      )}

      <p className="text-xs text-slate">
        Tier A — plain JSON-RPC reads; no wallet, no signature, costs nothing. Click any
        tx hash to trace the full receipt on the Atlantic explorer. LIGHTKEEPER never
        sees, holds, or asks for private keys.
      </p>
    </div>
  );
}
