/**
 * t24-audit-log-agent — core library.
 * Append-only, hash-chained audit log of REAL agent actions.
 *
 * Entry schema:
 *   { index, timestamp, actor, action, params, txHash, prevHash, entryHash }
 * entryHash = sha256(canonical({index,timestamp,actor,action,params,txHash,prevHash}))
 * prevHash of entry[0] = GENESIS_PREV. Tampering any field breaks the chain.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const GENESIS_PREV = "0".repeat(64);
export const EXPLORER = "https://atlantic.pharosscan.xyz";

export const txLink = (hash) => `${EXPLORER}/tx/${hash}`;
export const addressLink = (addr) => `${EXPLORER}/address/${addr}`;
export const blockLink = (n) => `${EXPLORER}/block/${n}`;

/** Deterministic canonical JSON (sorted keys, recursive). */
export function canonical(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",")}}`;
  return JSON.stringify(value);
}

export const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

export function entryHash({ index, timestamp, actor, action, params, txHash, prevHash }) {
  return sha256hex(canonical({ index, timestamp, actor, action, params: params ?? null, txHash: txHash ?? null, prevHash }));
}

export function makeEntry(index, prevHash, { actor, action, params = null, txHash = null, note = null }) {
  const timestamp = new Date().toISOString();
  const entry = { index, timestamp, actor, action, params, txHash, note, prevHash };
  entry.entryHash = entryHash(entry);
  return entry;
}

export function loadEntries(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        throw new Error(`corrupt JSONL line ${i} in ${logPath}`);
      }
    });
}

/** Append one entry. Returns the entry. */
export function appendEntry(logPath, fields) {
  const entries = loadEntries(logPath);
  const prevHash = entries.length === 0 ? GENESIS_PREV : entries[entries.length - 1].entryHash;
  const entry = makeEntry(entries.length, prevHash, fields);
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

/**
 * Replay the chain. Returns { ok, checked, failures: [{index, reason}] }.
 * Fails on: broken prevHash link, recomputed entryHash mismatch, missing fields.
 */
export function verifyLog(logPath) {
  const entries = loadEntries(logPath);
  const failures = [];
  let prev = GENESIS_PREV;
  entries.forEach((e, i) => {
    if (e.index !== i) failures.push({ index: i, reason: `index mismatch: expected ${i}, got ${e.index}` });
    if (e.prevHash !== prev) failures.push({ index: i, reason: `prevHash link broken (expected ${prev.slice(0, 12)}…, got ${String(e.prevHash).slice(0, 12)}…)` });
    const recomputed = entryHash(e);
    if (recomputed !== e.entryHash)
      failures.push({ index: i, reason: `entryHash mismatch — field content was altered after logging` });
    if (!e.timestamp || !e.actor || !e.action)
      failures.push({ index: i, reason: `missing required field (timestamp/actor/action)` });
    prev = e.entryHash;
  });
  return { ok: failures.length === 0, checked: entries.length, failures };
}

/* ---------------- chain reads (read-only, no key needed) ---------------- */

function rpcUrl() {
  const u = process.env.ATLANTIC_RPC_URL;
  if (!u) throw new Error("ATLANTIC_RPC_URL is not set — source tasks/t24-audit-log-agent's env first");
  return u;
}

export async function rpc(method, params = []) {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} on ${method}`);
  const j = await res.json();
  if (j.error) throw new Error(`RPC ${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

export const hexToNum = (h) => parseInt(h, 16);
export const toHex = (n) => "0x" + n.toString(16);

export async function getChainId() { return hexToNum(await rpc("eth_chainId")); }
export async function getBlockNumber() { return hexToNum(await rpc("eth_blockNumber")); }
export async function getBalanceWei(addr, block = "latest") { return await rpc("eth_getBalance", [addr, block]); }
export async function getGasPriceWei() { return await rpc("eth_gasPrice"); }
export async function getReceipt(hash) { return await rpc("eth_getTransactionReceipt", [hash]); }
export async function getBlock(num, fullTx = false) { return await rpc("eth_getBlockByNumber", [toHex(num), fullTx]); }
export async function getLogs({ fromBlock, toBlock, topics }) {
  return await rpc("eth_getLogs", [{ fromBlock: toHex(fromBlock), toBlock: toHex(toBlock), topics }]);
}
export async function getTx(hash) { return await rpc("eth_getTransactionByHash", [hash]); }

export function weiToPhrs(weiHexOrBig) {
  const w = typeof weiHexOrBig === "string" && weiHexOrBig.startsWith("0x") ? BigInt(weiHexOrBig) : BigInt(weiHexOrBig);
  const int = w / 10n ** 18n;
  const frac = (w % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "") || "0";
  return `${int}.${frac}`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
