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
 * topic0 is computed at runtime via keccak256(eventSignature) — never hardcoded,
 * mirroring the Python monitor (tasks/t02-event-log-monitor/monitor.py).
 */
import { useCallback, useMemo, useRef, useState } from "react";
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
  return { ...log, fields, decodeNote };
}

function hexToNum(hex: string): number {
  return Number(BigInt(hex));
}

function shorten(h: string): string {
  return h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}

export default function TryEventLogMonitor({ lamp }: { lamp: Lamp }) {
  const [presetIdx, setPresetIdx] = useState(0);
  const [custom, setCustom] = useState(false);
  const [signature, setSignature] = useState(PRESETS[0].signature);
  const [contract, setContract] = useState(PRESETS[0].contract);
  const [windowBlocks, setWindowBlocks] = useState(String(DEFAULT_WINDOW));
  const [results, setResults] = useState<DecodedLog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ from: number; to: number; chunks: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const timerRef = useRef<number | null>(null);

  const topic0 = useMemo(() => keccak256Hex(signature.trim()), [signature]);
  const contractOk = isValidAddress(contract);
  const sigOk = /^\w+\([\w,\[\]]*\)$/.test(signature.trim());

  const runScan = useCallback(
    async (fromBlock?: number, toBlock?: number) => {
      if (!contractOk || !sigOk) return;
      setLoading(true);
      setError(null);
      try {
        const tip =
          toBlock ?? hexToNum((await rpcCall("eth_blockNumber", [])) as string);
        const win = Math.max(1, Math.min(200000, parseInt(windowBlocks, 10) || DEFAULT_WINDOW));
        const from = fromBlock ?? Math.max(0, tip - win);
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
          .map((l) => decodeLog(l, sig))
          .sort(
            (x, y) =>
              hexToNum(y.blockNumber) - hexToNum(x.blockNumber) ||
              hexToNum(y.logIndex) - hexToNum(x.logIndex)
          );
        setResults(decoded);
        setMeta({ from, to: tip, chunks: chunks.length });
      } catch (e) {
        setError(e instanceof Error ? e.message : "The Atlantic RPC did not answer.");
      } finally {
        setLoading(false);
      }
    },
    [contract, contractOk, signature, sigOk, windowBlocks]
  );

  const stopAuto = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const toggleAuto = useCallback(
    (on: boolean) => {
      setAuto(on);
      stopAuto();
      if (on) {
        void runScan();
        timerRef.current = window.setInterval(() => void runScan(), 30000);
      }
    },
    [runScan, stopAuto]
  );

  const pickPreset = (i: number) => {
    setPresetIdx(i);
    setCustom(false);
    setSignature(PRESETS[i].signature);
    setContract(PRESETS[i].contract || contract);
    setResults(null);
  };

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm leading-relaxed text-slate">
        <span className="font-semibold text-ink">{lamp.name}.</span> Point LIGHTKEEPER at
        any contract, pick an event, and watch it live — filtered, decoded, traceable.
        Reads are free and need no wallet. Default target: the lamp's own on-chain
        emitter, which already has real events you can catch right now.
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
              setResults(null);
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
                setResults(null);
              }}
              placeholder="0x…"
              spellCheck={false}
            />
            {!contractOk && contract && (
              <span className="mt-1 block text-xs text-fail">Not a valid 0x address.</span>
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
                setResults(null);
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
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Look back (blocks)</span>
            <input
              className="w-40 rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink"
              value={windowBlocks}
              onChange={(e) => setWindowBlocks(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </label>
          <button
            className="btn-primary"
            disabled={!contractOk || !sigOk || loading}
            onClick={() => void runScan()}
          >
            {loading ? "Scanning Atlantic…" : "Watch now"}
          </button>
          <button className="btn-outline" disabled={loading} onClick={() => void runScan()}>
            Refresh
          </button>
          <label className="flex items-center gap-2 text-xs text-slate">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => toggleAuto(e.target.checked)}
            />
            Auto-refresh every 30s{" "}
            <span className="text-fail">(on — untick to stop)</span>
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate">
          topic0 = <code className="font-mono">{topic0}</code> (computed from the signature,
          never hardcoded). eth_getLogs caps at {CHUNK_CAP.toLocaleString()} blocks per call —
          wider ranges are chunked automatically. RPC: {ATLANTIC_RPC_URL}.
        </p>
      </div>

      {/* 02 · Watch */}
      {error && <p className="text-sm text-fail">{error}</p>}
      {meta && (
        <p className="text-xs text-slate">
          Scanned blocks <span className="font-mono">{meta.from.toLocaleString()}</span> →{" "}
          <span className="font-mono">{meta.to.toLocaleString()}</span> in {meta.chunks}{" "}
          chunk{meta.chunks === 1 ? "" : "s"} · {results?.length ?? 0} event
          {(results?.length ?? 0) === 1 ? "" : "s"}
        </p>
      )}
      {!results && !loading && !error && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          Nothing watched yet — pick a preset (the LogEmitter presets have real on-chain
          events waiting) and hit <strong className="text-ink">Watch now</strong>.
        </div>
      )}
      {results && results.length === 0 && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          Quiet window — no events in this range. That's an honest answer, not an error.
          Widen the look-back or try the LogEmitter presets.
        </div>
      )}
      {results && results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Block</th>
                <th>Tx hash</th>
                <th>Event</th>
                <th>Decoded fields</th>
              </tr>
            </thead>
            <tbody>
              {results.map((l) => (
                <tr key={`${l.blockNumber}:${l.logIndex}`}>
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
      )}

      <p className="text-xs text-slate">
        Tier A — plain JSON-RPC reads; no wallet, no signature, costs nothing. Click any
        tx hash to trace the full receipt on the Atlantic explorer. LIGHTKEEPER never
        sees, holds, or asks for private keys.
      </p>
    </div>
  );
}
