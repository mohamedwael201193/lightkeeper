#!/usr/bin/env node
/*
 * T23 — Wallet Risk Checker (Pharos Atlantic testnet)
 *
 * Runs a battery of REAL on-chain checks for a given address and emits a
 * per-check PASS / FLAG / UNKNOWN report with raw values and plain-language
 * explanations, plus a DISCLOSED-HEURISTIC composite risk level (LOW/MED/HIGH).
 *
 * Hard rules honored:
 *  - Every number is a live chain read. No mocks, no invented scores.
 *  - Every heuristic is labeled HEURISTIC in the report.
 *  - The composite level is derived from the checks by a printed formula —
 *    it is NOT an authoritative score.
 *  - Read-only: this script never signs, never broadcasts.
 *
 * Usage:
 *   node src/check.mjs <address> [--config signals.yaml] [--json-out report.json]
 *
 * Env: ATLANTIC_RPC_URL (default https://atlantic.dplabs-internal.com)
 * Aborts unless the node reports chainId 688689 (Atlantic testnet).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const RPC_URL = process.env.ATLANTIC_RPC_URL || "https://atlantic.dplabs-internal.com";
const EXPECTED_CHAIN_ID = 688689;
const EXPLORER = "https://atlantic.pharosscan.xyz";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"; // Approval(address,address,uint256)
const MAX_UINT256 = (1n << 256n) - 1n;

// ---------------------------------------------------------------------------
// tiny JSON-RPC client (stdlib only)
// ---------------------------------------------------------------------------
let rpcId = 0;
async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status} on ${method}`);
  const j = await res.json();
  if (j.error) throw new Error(`RPC error on ${method}: ${j.error.message} (${j.error.code})`);
  return j.result;
}

const hexToBig = (h) => BigInt(h);
const toBlockHex = (n) => "0x" + n.toString(16);
const addrToTopic = (a) => "0x" + "0".repeat(24) + a.toLowerCase().slice(2);
const topicToAddr = (t) => "0x" + t.slice(-40);
const sameAddr = (a, b) => a.toLowerCase() === b.toLowerCase();

function fmtPhrs(wei) {
  const neg = wei < 0n;
  const v = neg ? -wei : wei;
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------
function loadConfig(path) {
  const defaults = {
    young_account_blocks: 50000,      // HEURISTIC: account first seen < this many blocks ago
    activity_window_blocks: 10000,   // HEURISTIC: lookback window for activity/diversity
    burst_outbound_txs: 500,         // HEURISTIC: > this many outbound txs in window = burst
    low_diversity_max_peers: 2,      // HEURISTIC: <= this many counterparties in window = low diversity
    max_approval_spenders: 5,        // HEURISTIC: > this many distinct approval spenders = unusual
    watchlist: [],                   // flagged addresses (lowercase 0x...); empty = check disabled
  };
  if (!path) return defaults;
  try {
    const raw = readFileSync(path, "utf8");
    const cfg = { ...defaults };
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*(#.*)?$/);
      if (!m) continue;
      const [, k, v] = m;
      if (k === "watchlist") {
        cfg.watchlist = v.replace(/[\[\]]/g, "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40}$/.test(s));
      } else if (k in cfg && typeof cfg[k] === "number") {
        cfg[k] = Number(v);
      }
    }
    return cfg;
  } catch {
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------
async function chainAssert() {
  const idHex = await rpc("eth_chainId");
  const id = Number(hexToBig(idHex));
  if (id !== EXPECTED_CHAIN_ID) {
    throw new Error(`CHAIN MISMATCH: node reports chainId ${id}, expected ${EXPECTED_CHAIN_ID} (Atlantic). Aborting.`);
  }
  const blockHex = await rpc("eth_blockNumber");
  const block = Number(hexToBig(blockHex));
  const blk = await rpc("eth_getBlockByNumber", [toBlockHex(block), false]);
  return { chainId: id, block, blockTimestamp: Number(hexToBig(blk.timestamp)) };
}

async function avgBlockTime(latest) {
  try {
    const span = 100000;
    const a = await rpc("eth_getBlockByNumber", [toBlockHex(latest), false]);
    const b = await rpc("eth_getBlockByNumber", [toBlockHex(Math.max(0, latest - span)), false]);
    const dt = Number(hexToBig(a.timestamp)) - Number(hexToBig(b.timestamp));
    return dt / (latest - Math.max(0, latest - span));
  } catch {
    return null;
  }
}

// S1 — first outbound transaction block via binary search on nonce (HEURISTIC age)
async function firstOutboundBlock(address, latest) {
  let lo = 0, hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const n = Number(hexToBig(await rpc("eth_getTransactionCount", [address, toBlockHex(mid)])));
    if (n > 0) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// chunked log scan (<=1000 blocks per call). NOTE: this RPC rejects `null`
// topic positions, so Transfer scans fetch topic0-only and filter in JS.
async function scanLogs({ topic0, extraTopics, fromBlock, toBlock, chunk = 1000 }) {
  const logs = [];
  for (let from = fromBlock; from <= toBlock; from += chunk) {
    const to = Math.min(from + chunk - 1, toBlock);
    const batch = await rpc("eth_getLogs", [{
      fromBlock: toBlockHex(from), toBlock: toBlockHex(to), topics: [topic0, ...extraTopics],
    }]);
    logs.push(...batch);
  }
  return logs;
}

async function runChecks(address, cfg, pinnedBlock = null) {
  const net = await chainAssert();
  const atBlock = pinnedBlock !== null ? pinnedBlock : net.block;
  if (pinnedBlock !== null && (pinnedBlock < 0 || pinnedBlock > net.block)) {
    throw new Error(`--block ${pinnedBlock} out of range (latest ${net.block})`);
  }
  const blockTag = pinnedBlock !== null ? toBlockHex(pinnedBlock) : "latest";
  const checks = [];
  const push = (c) => checks.push(c);

  const balance = hexToBig(await rpc("eth_getBalance", [address, blockTag]));
  const nonce = Number(hexToBig(await rpc("eth_getTransactionCount", [address, blockTag])));
  const code = await rpc("eth_getCode", [address, blockTag]);
  const isContract = code !== "0x" && code !== "0X";
  // EIP-161: a newly created contract starts at nonce 1 (creation counts),
  // so "outbound activity" for contracts is nonce minus the creation.
  const effectiveOutbound = isContract ? Math.max(0, nonce - 1) : nonce;
  const blkTime = await avgBlockTime(atBlock);

  // ---- S1: account age (first outbound tx) — HEURISTIC ----
  // Empty accounts (no txs, no balance) have no age to measure -> UNKNOWN.
  let ageBlock = "unmeasured";
  if (nonce === 0 && balance === 0n) {
    push({ id: "S1", name: "Account age (first activity)", verdict: "UNKNOWN",
      raw: { outbound_tx_count: 0, balance_wei: "0" },
      heuristic: true,
      explanation: "This address has no on-chain activity at all (no transactions, zero balance), so there is no first-activity block to measure. It may never have been used." });
  } else {
    if (nonce > 0) ageBlock = await firstOutboundBlock(address, atBlock);
    else {
      // no outbound txs: probe first block with balance > 0 (monotonicity assumed, validated below)
      let lo = 0, hi = atBlock;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const b = hexToBig(await rpc("eth_getBalance", [address, toBlockHex(mid)]));
        if (b > 0n) hi = mid; else lo = mid + 1;
      }
      const before = lo > 0 ? hexToBig(await rpc("eth_getBalance", [address, toBlockHex(lo - 1)])) : 0n;
      ageBlock = before === 0n ? lo : null; // null => cannot establish (non-monotonic)
    }
    if (ageBlock === null) {
      push({ id: "S1", name: "Account age (first activity)", verdict: "UNKNOWN",
        raw: { outbound_tx_count: nonce, balance_wei: balance.toString() },
        heuristic: true,
        explanation: "Could not establish first activity: no outbound transactions and the balance history is not monotonic, so no RPC-only age exists. Without an indexer the true first-seen block is unknown." });
    } else {
    const ageBlocks = atBlock - ageBlock;
    const young = ageBlocks < cfg.young_account_blocks;
    const days = blkTime ? (ageBlocks * blkTime) / 86400 : null;
    push({ id: "S1", name: "Account age (first activity)", verdict: young ? "FLAG" : "PASS",
      raw: { first_activity_block: ageBlock, age_blocks: ageBlocks,
             age_days_approx: days === null ? null : Math.round(days * 10) / 10,
             young_account_threshold_blocks: cfg.young_account_blocks,
             basis: isContract
               ? "contract creation block (EIP-161: new contracts start at nonce 1, so first nonce>0 block = creation)"
               : (nonce > 0 ? "first outbound transaction (nonce binary search)" : "first block with balance > 0") },
      heuristic: true,
      explanation: young
        ? `First activity was ~${ageBlocks.toLocaleString()} blocks ago (block ${ageBlock}) — under the ${cfg.young_account_blocks.toLocaleString()}-block heuristic threshold. Young accounts deserve extra scrutiny: many scam/rug contracts and mule wallets are hours or days old. (HEURISTIC)`
        : `First activity was ~${ageBlocks.toLocaleString()} blocks ago (block ${ageBlock})${days !== null ? `, roughly ${Math.round(days * 10) / 10} days` : ""} — older than the ${cfg.young_account_blocks.toLocaleString()}-block heuristic threshold. (HEURISTIC)` });
    }
  }

  // ---- S2: transaction count / freshly-funded pattern — HEURISTIC ----
  // For contracts the creation itself counts as nonce 1 (EIP-161), so the
  // "has it ever DONE anything" count is effectiveOutbound.
  const freshFunded = effectiveOutbound === 0 && balance > 0n;
  push({ id: "S2", name: "Transaction count / funding pattern", verdict: freshFunded ? "FLAG" : "PASS",
    raw: { outbound_tx_count: nonce, effective_outbound_tx_count: effectiveOutbound,
           account_type: isContract ? "contract (creation counts as nonce 1, EIP-161)" : "EOA",
           balance_wei: balance.toString(), balance_phrs: fmtPhrs(balance) },
    heuristic: true,
    explanation: freshFunded
      ? `Holds ${fmtPhrs(balance)} PHRS but has NEVER initiated a transaction${isContract ? " (nonce 1 = creation only)" : " (nonce 0)"}. Freshly-funded-and-idle accounts match the funding pattern of mule/airdrop-farming wallets and just-deployed contracts awaiting first use. (HEURISTIC)`
      : `Transaction count (nonce): ${nonce}${isContract ? " (1 = contract creation)" : ""}. Balance: ${fmtPhrs(balance)} PHRS. No freshly-funded-idle pattern. (HEURISTIC)` });

  // ---- S3: native balance — informational (not a risk signal by itself) ----
  push({ id: "S3", name: "Native balance (PHRS)", verdict: "PASS",
    raw: { balance_wei: balance.toString(), balance_phrs: fmtPhrs(balance), block: atBlock },
    heuristic: false,
    explanation: `Balance is ${fmtPhrs(balance)} PHRS at block ${atBlock}. Balance alone is not a risk signal; it is reported as raw context for the other checks.` });

  // ---- S4: contract vs EOA; source verification — verification is UNKNOWN (heuristic gate) ----
  if (!isContract) {
    push({ id: "S4", name: "Account type / code verification", verdict: "PASS",
      raw: { type: "EOA", bytecode: "0x (empty)", source_verified: "n/a (EOA has no code)" },
      heuristic: false,
      explanation: "Externally owned account (no bytecode). Nothing to verify." });
  } else {
    push({ id: "S4", name: "Account type / code verification", verdict: "UNKNOWN",
      raw: { type: "contract", bytecode_bytes: (code.length - 2) / 2, source_verified: "unknown — explorer verification API unreachable" },
      heuristic: true,
      explanation: "This is a CONTRACT (bytecode present) but its source could not be verified — the Atlantic explorer verification API is unreachable, so there is no way to confirm the deployed bytecode matches published source. Unverifiable logic is a real risk factor: treat interactions with extra caution. (UNKNOWN is not treated as safe. HEURISTIC)" });
  }

  // ---- S5: recent activity window — HEURISTIC ----
  const win = cfg.activity_window_blocks;
  const winFrom = Math.max(0, atBlock - win);
  const nonceThen = Number(hexToBig(await rpc("eth_getTransactionCount", [address, toBlockHex(winFrom)])));
  const nonceDelta = nonce - nonceThen;
  // Contract-creation nonce (EIP-161) is not "activity": exclude it so a fresh
  // contract's own deployment does not read as an outbound transaction.
  const effNow = isContract ? Math.max(0, nonce - 1) : nonce;
  const effThen = isContract ? Math.max(0, nonceThen - 1) : nonceThen;
  const outboundInWindow = Math.max(0, effNow - effThen);
  const burst = outboundInWindow > cfg.burst_outbound_txs;
  push({ id: "S5", name: "Recent activity window", verdict: burst ? "FLAG" : "PASS",
    raw: { window_blocks: win, window_from_block: winFrom, window_to_block: atBlock,
           nonce_delta_in_window: nonceDelta, effective_outbound_txs_in_window: outboundInWindow,
           burst_threshold: cfg.burst_outbound_txs,
           note: isContract ? "contract-creation nonce (EIP-161) excluded from the effective count" : "EOA: nonce delta = outbound txs" },
    heuristic: true,
    explanation: burst
      ? `${outboundInWindow} outbound transactions in the last ${win.toLocaleString()} blocks — above the ${cfg.burst_outbound_txs} heuristic burst threshold. Burst activity can indicate automated draining, spam, or bot operation. (HEURISTIC)`
      : `${outboundInWindow} outbound transaction(s) in the last ${win.toLocaleString()} blocks (blocks ${winFrom}–${atBlock}). No burst pattern. (HEURISTIC)` });

  // ---- S6: interaction diversity via Transfer logs — HEURISTIC ----
  // The Atlantic RPC rejects null topic positions, so we fetch topic0-only
  // per 1,000-block chunk and filter by party client-side.
  const meTopic = addrToTopic(address);
  const allTransfers = await scanLogs({ topic0: TRANSFER_TOPIC, extraTopics: [], fromBlock: winFrom, toBlock: atBlock });
  const peers = new Set();
  let myTransfers = 0;
  for (const l of allTransfers) {
    if (!l.topics || l.topics.length < 3) continue;
    const from = topicToAddr(l.topics[1]);
    const to = topicToAddr(l.topics[2]);
    if (!sameAddr(from, address) && !sameAddr(to, address)) continue;
    myTransfers++;
    if (!sameAddr(from, address)) peers.add(from.toLowerCase());
    if (!sameAddr(to, address)) peers.add(to.toLowerCase());
  }
  const peerCount = peers.size;
  const lowDiv = peerCount <= cfg.low_diversity_max_peers;
  const peerList = [...peers].slice(0, 10);
  push({ id: "S6", name: "Interaction diversity (Transfer counterparties)", verdict: lowDiv ? "FLAG" : "PASS",
    raw: { window_blocks: win, transfer_events_in_chain_window: allTransfers.length,
           transfer_events_involving_address: myTransfers,
           distinct_counterparties: peerCount, counterparty_sample: peerList,
           low_diversity_threshold: cfg.low_diversity_max_peers,
           note: "ERC-20/721 Transfer events only; native PHRS transfers are not in logs" },
    heuristic: true,
    explanation: lowDiv
      ? `Only ${peerCount} distinct counterpart(ies) in token Transfer events over the last ${win.toLocaleString()} blocks. Real, established wallets usually interact with many addresses; a tiny interaction graph is typical of fresh/single-purpose wallets. (HEURISTIC; native transfers not covered by logs)`
      : `${peerCount} distinct counterparties in token Transfer events over the last ${win.toLocaleString()} blocks — a normal interaction graph. (HEURISTIC; native transfers not covered by logs)` });

  // ---- S7: unusual approvals — HEURISTIC ----
  const apprLogs = await scanLogs({ topic0: APPROVAL_TOPIC, extraTopics: [meTopic], fromBlock: winFrom, toBlock: atBlock });
  const spenders = new Set();
  let unlimited = 0;
  for (const l of apprLogs) {
    spenders.add(topicToAddr(l.topics[2]).toLowerCase());
    if (hexToBig(l.data) === MAX_UINT256) unlimited++;
  }
  const manySpenders = spenders.size > cfg.max_approval_spenders;
  const s7flag = unlimited > 0 || manySpenders;
  push({ id: "S7", name: "Token approvals (allowance hygiene)", verdict: s7flag ? "FLAG" : "PASS",
    raw: { window_blocks: win, approval_events_in_window: apprLogs.length,
           distinct_spenders: spenders.size, unlimited_approvals: unlimited,
           max_spenders_threshold: cfg.max_approval_spenders,
           note: "window-limited; older approvals outside the window are NOT covered" },
    heuristic: true,
    explanation: unlimited > 0
      ? `${unlimited} UNLIMITED approval(s) granted to ${spenders.size} spender(s) in the window. An unlimited approval lets the spender move ALL of that token from this wallet at any time — revoke what you do not actively use. (HEURISTIC)`
      : manySpenders
        ? `${spenders.size} distinct approval spenders in the window — above the ${cfg.max_approval_spenders} heuristic threshold. Broad approval grants widen the attack surface. (HEURISTIC)`
        : `${apprLogs.length} approval event(s), ${spenders.size} distinct spender(s), ${unlimited} unlimited. No unusual approval pattern in the window. (HEURISTIC; older approvals outside the window are not covered)` });

  // ---- S8: flagged-address interaction — watchlist.
  // Empty watchlist = check NOT APPLICABLE on Atlantic testnet (no published
  // flagged-address set exists for this testnet). Reported as N/A and EXCLUDED
  // from the composite — an unconfigured check is neither PASS nor UNKNOWN.
  if (cfg.watchlist.length === 0) {
    push({ id: "S8", name: "Flagged-address interaction", verdict: "N/A",
      raw: { watchlist_size: 0, note: "no flagged-address set configured for Atlantic testnet; check not applicable" },
      heuristic: true,
      explanation: "No flagged-address set is configured (signals.yaml watchlist is empty — there is no published sanctions/flag list for the Atlantic testnet). The check is not applicable here and is excluded from the composite level; configure a watchlist to enable it (e.g. for mainnet use). (N/A — no heuristic judgment made.)" });
  } else {
    const hit = [...peers].some((p) => cfg.watchlist.includes(p));
    push({ id: "S8", name: "Flagged-address interaction", verdict: hit ? "FLAG" : "PASS",
      raw: { watchlist_size: cfg.watchlist.length, counterparties_checked: peerCount, hit },
      heuristic: true,
      explanation: hit
        ? "A counterparty of this wallet appears on the configured flagged-address watchlist. Interaction with flagged addresses is the strongest single risk signal in this battery. (HEURISTIC watchlist)"
        : `Checked ${peerCount} counterparties against a ${cfg.watchlist.length}-address watchlist: no matches. (HEURISTIC watchlist)` });
  }

  // ---- composite: DISCLOSED heuristic aggregation (not an authoritative score) ----
  // N/A checks (not applicable, e.g. unconfigured watchlist) are excluded.
  const flags = checks.filter((c) => c.verdict === "FLAG").length;
  const unknowns = checks.filter((c) => c.verdict === "UNKNOWN").length;
  const watchHit = checks.find((c) => c.id === "S8")?.raw.hit === true;
  let level, basis;
  if (watchHit || flags >= 3) { level = "HIGH"; basis = watchHit ? "flagged-address watchlist hit" : `${flags} checks flagged (>=3)`; }
  else if (flags >= 1 || unknowns >= 1) { level = "MED"; basis = flags >= 1 ? `${flags} check(s) flagged` : `${unknowns} check(s) unknown (unknown is not treated as safe)`; }
  else { level = "LOW"; basis = "0 checks flagged, 0 unknown"; }
  const formula = "HIGH if watchlist hit or >=3 FLAGs; MED if 1-2 FLAGs or any UNKNOWN; LOW if 0 FLAGs and 0 UNKNOWNs (N/A checks excluded)";

  return {
    tool: "t23-wallet-risk-checker",
    address,
    explorer: `${EXPLORER}/address/${address}`,
    network: { name: "atlantic-testnet", chain_id: net.chainId, rpc: RPC_URL.replace(/^https?:\/\//, "").split("/")[0] + " (host only; no secrets)" },
    block: atBlock, pinned_block: pinnedBlock !== null, block_timestamp: net.blockTimestamp, avg_block_time_s: blkTime,
    config: { young_account_blocks: cfg.young_account_blocks, activity_window_blocks: cfg.activity_window_blocks,
              burst_outbound_txs: cfg.burst_outbound_txs, low_diversity_max_peers: cfg.low_diversity_max_peers,
              max_approval_spenders: cfg.max_approval_spenders, watchlist_size: cfg.watchlist.length },
    checks,
    composite: { level, basis, formula, heuristic: true,
      disclaimer: "HEURISTIC composite derived from the checks above by the printed formula. It is NOT an authoritative risk score and must never be presented as one." },
  };
}

// ---------------------------------------------------------------------------
// text rendering
// ---------------------------------------------------------------------------
function renderText(r) {
  const L = [];
  L.push("=".repeat(72));
  L.push("T23 WALLET RISK CHECK — per-check report (all values are live chain reads)");
  L.push("=".repeat(72));
  L.push(`address   : ${r.address}`);
  L.push(`explorer  : ${r.explorer}`);
  L.push(`network   : ${r.network.name} (chainId ${r.network.chain_id}) @ block ${r.block}${r.pinned_block ? " (pinned)" : ""}`);
  L.push("");
  for (const c of r.checks) {
    L.push(`[${c.verdict}] ${c.id} ${c.name}${c.heuristic ? "  (HEURISTIC)" : ""}`);
    for (const [k, v] of Object.entries(c.raw)) L.push(`        ${k}: ${v}`);
    L.push(`        -> ${c.explanation}`);
    L.push("");
  }
  L.push("-".repeat(72));
  L.push(`COMPOSITE (HEURISTIC, disclosed formula): ${r.composite.level}`);
  L.push(`basis   : ${r.composite.basis}`);
  L.push(`formula : ${r.composite.formula}`);
  L.push(`note    : ${r.composite.disclaimer}`);
  L.push("=".repeat(72));
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const address = args.find((a) => !a.startsWith("--"));
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    console.error("usage: node src/check.mjs <0x-address> [--config signals.yaml] [--json-out report.json] [--block N]");
    console.error("  --block N pins every read to historical block N (deterministic; avoids 'latest' divergence on load-balanced RPCs)");
    process.exit(2);
  }
  const cfgArg = args[args.indexOf("--config") + 1];
  const outArg = args[args.indexOf("--json-out") + 1];
  const blockArg = args[args.indexOf("--block") + 1];
  const cfg = loadConfig(args.includes("--config") ? cfgArg : "signals.yaml");
  const pinnedBlock = args.includes("--block") ? Number(blockArg) : null;
  if (pinnedBlock !== null && (!Number.isInteger(pinnedBlock) || pinnedBlock < 0)) {
    console.error("--block must be a non-negative integer");
    process.exit(2);
  }

  const report = await runChecks(address, cfg, pinnedBlock);
  console.log(renderText(report));
  if (outArg) {
    writeFileSync(outArg, JSON.stringify(report, null, 2));
    console.error(`\nJSON report written to ${outArg}`);
  } else if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((e) => { console.error("FATAL: " + e.message); process.exit(1); });
