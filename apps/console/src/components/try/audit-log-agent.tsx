/**
 * T24 — Audit-Log Agent "try it live" (Tier C: browser-verifiable + honest CLI).
 *
 * The visitor gets the task's REAL 22-entry hash-chained audit log prefilled in
 * a textarea (chain-id reads, two mined dust transfers, receipt confirmations,
 * mempool-drop disclosures, a chain-anchor tx pinning the log head on-chain,
 * report generation). Every hash recomputes client-side with SHA-256 over
 * canonical (sorted-key) JSON — the exact algorithm as the task's `audit-log`
 * CLI — and the verifier mirrors its `verify` command: broken prevHash link,
 * entryHash mismatch, missing fields.
 *
 * The differentiator, pushed further: a RED-TEAM LAB with four attack
 * scenarios run live against copies of the real chain — flip one character,
 * flip + forge the entry's hash (the chain still catches it at the NEXT
 * entry), delete an entry, swap two entries. Visitors FEEL tamper-evidence
 * instead of reading about it. A chain-strip visualization and a per-entry
 * inspector (stored hash vs live-recomputed hash) complete the dedicated-app
 * feel.
 *
 * "Verify our proof" pins the chain to THREE real mined anchors on Atlantic
 * (explorer links + live, free RPC checks): the two dust transfers, and the
 * chain-anchor transaction whose calldata IS entry #20's entryHash — the local
 * log is verifiable against the chain itself.
 *
 * LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only (688689).
 */
import { useEffect, useRef, useState } from "react";
import {
  Anchor,
  FlaskConical,
  Fingerprint,
  Link2,
  ScrollText,
  ShieldCheck,
  ShieldX,
  Swords,
  Terminal,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { Lamp } from "../../types";
import { EXPLORER_TX, rpcCall } from "../../hooks/useAtlantic";
import {
  EmptyState,
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
} from "../ui";
import type { FeedItem } from "../ui";

/** AUTO-GENERATED from tasks/t24-audit-log-agent/state/audit-log.jsonl — do not hand-edit. */
const ENTRY_COUNT = 22;
const TERMINAL_ENTRY_HASH =
  "6eb5e439f1f79b23813abb4ee0999db908b4c2f91d359cad462fccfba47bfc4a";
const ANCHOR_SOURCE = {
  index: 20,
  hash: "adcf050b125a1459cc06551e724f1772d7afeb28c7e2c9475b1f913f27e3ed7e",
};
const ANCHOR_TX = {
  hash: "0xcb79d4a218dece0c55868efd0240089343a5ee8c4887b5f6888517eab70ee76e",
  block: 31486961,
};

const REAL_CHAIN_JSONL = `{"index":0,"timestamp":"2026-10-16T04:13:14.782Z","actor":"lk-t24-agent","action":"read:chain-id","params":{"chainId":688689,"rpc":"https://atlantic.dplabs-internal.com","network":"atlantic-testnet"},"txHash":null,"note":null,"prevHash":"0000000000000000000000000000000000000000000000000000000000000000","entryHash":"aef77dc8cfd39ef851294f1b5eaf416da13e7926442bf3201c906f035c175297"}
{"index":1,"timestamp":"2026-10-16T04:13:18.070Z","actor":"lk-t24-agent","action":"read:balance","params":{"wallet":"0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3","balancePhrs":"6.004912958989312956","block":31481612},"txHash":null,"note":null,"prevHash":"aef77dc8cfd39ef851294f1b5eaf416da13e7926442bf3201c906f035c175297","entryHash":"421652f13b19c6cd702c8df6e84de7c2e6708e192676050f14465d7a9356859a"}
{"index":2,"timestamp":"2026-10-16T04:13:49.536Z","actor":"lk-t24-agent","action":"tx:dust-send-1","params":{"to":"0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3","valuePhrs":"0.0001","purpose":"t24 audit-log live demo entry"},"txHash":"0x3327baea59b0851af7e8edea7deccc9ea9a5804eb5330589ca0f8970add9d9e7","note":null,"prevHash":"421652f13b19c6cd702c8df6e84de7c2e6708e192676050f14465d7a9356859a","entryHash":"c830b62f4f61e084923f86020ba1c4f52f0487b5f076145a674b844f9322ec15"}
{"index":3,"timestamp":"2026-10-16T04:14:19.283Z","actor":"lk-t24-agent","action":"tx:dust-send-2","params":{"to":"0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3","valuePhrs":"0.0001","purpose":"t24 audit-log live demo entry"},"txHash":"0x80a5506d8c77c36d7fe665a4c8e5842e88bcb489707e32081a24289eb1806061","note":null,"prevHash":"c830b62f4f61e084923f86020ba1c4f52f0487b5f076145a674b844f9322ec15","entryHash":"503389f84aca658fc2b532380e6ba99a981fcee6fca7d39f65564c7fee86064f"}
{"index":4,"timestamp":"2026-10-16T04:27:24.373Z","actor":"lk-t24-agent","action":"tx:dust-send-1-attempt-dropped","params":{"hash":"0x3209751b648ec9c5d6650c152c610bc2a13ac4d095a7dc9f40d4102a9c1ea105","cause":"dropped from mempool under shared-key nonce contention, not mined"},"txHash":"0x3209751b648ec9c5d6650c152c610bc2a13ac4d095a7dc9f40d4102a9c1ea105","note":null,"prevHash":"503389f84aca658fc2b532380e6ba99a981fcee6fca7d39f65564c7fee86064f","entryHash":"95d9526481b56508d4de564020a67b0cdd02091f7eadbb5b905e520ece1d4d24"}
{"index":5,"timestamp":"2026-10-16T04:29:09.955Z","actor":"lk-t24-agent","action":"tx:dust-send-1-attempt-dropped","params":{"hash":"0xf7e529d802f576b918d964a581704c04724278b6d1dfb7fc500588eaef8c6f8c","cause":"dropped from mempool under shared-key nonce contention, not mined"},"txHash":"0xf7e529d802f576b918d964a581704c04724278b6d1dfb7fc500588eaef8c6f8c","note":null,"prevHash":"95d9526481b56508d4de564020a67b0cdd02091f7eadbb5b905e520ece1d4d24","entryHash":"7e219890d181f1f034615cf446243732d2e1f09ecc0c7de4ffd76988b2f12ef8"}
{"index":6,"timestamp":"2026-10-16T04:31:13.671Z","actor":"lk-t24-agent","action":"tx:dust-send-1-attempt-dropped","params":{"hash":"0x7cdb8b3828b132888426b1fd507e658de414dde4881a0f6b113ffbb60451984b","cause":"dropped from mempool under shared-key nonce contention, not mined"},"txHash":"0x7cdb8b3828b132888426b1fd507e658de414dde4881a0f6b113ffbb60451984b","note":null,"prevHash":"7e219890d181f1f034615cf446243732d2e1f09ecc0c7de4ffd76988b2f12ef8","entryHash":"124edcb90b845ab1b3baf5b2d2dc2a43c98fa9f66d1140354543b534b6919959"}
{"index":7,"timestamp":"2026-10-16T04:32:36.161Z","actor":"lk-t24-agent","action":"tx:dust-send-1-attempt-dropped","params":{"hash":"0x7b564bbfd81066f2534ea62cd2b50a61b516e8e31af796ee413ce26e039d635b","cause":"dropped from mempool under shared-key nonce contention, not mined"},"txHash":"0x7b564bbfd81066f2534ea62cd2b50a61b516e8e31af796ee413ce26e039d635b","note":null,"prevHash":"124edcb90b845ab1b3baf5b2d2dc2a43c98fa9f66d1140354543b534b6919959","entryHash":"1f83564e28d5f4b8d719ef64c71deb6abbb28856abad02fba018d9871c2ebb31"}
{"index":8,"timestamp":"2026-10-16T04:33:52.821Z","actor":"lk-t24-agent","action":"tx:dust-send-1-attempt-dropped","params":{"hash":"0xdda27a002fdce4833ccafeef1ab6fac75d29659a3c0c8f237b2934c54d3d53ac","cause":"dropped from mempool under shared-key nonce contention, not mined"},"txHash":"0xdda27a002fdce4833ccafeef1ab6fac75d29659a3c0c8f237b2934c54d3d53ac","note":null,"prevHash":"1f83564e28d5f4b8d719ef64c71deb6abbb28856abad02fba018d9871c2ebb31","entryHash":"f72f202357977867c8175e2653d631d1629be9543b8463ae57de28a29fa42eaf"}
{"index":9,"timestamp":"2026-10-16T05:05:07.619Z","actor":"lk-t24-agent","action":"note:mempool-drop-disclosure","params":{"summary":"first broadcast attempts (entries 2-3) were accepted by the RPC but never mined under shared-key nonce contention; retried with --async and both mined","mined":["0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1","0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68"]},"txHash":null,"note":null,"prevHash":"f72f202357977867c8175e2653d631d1629be9543b8463ae57de28a29fa42eaf","entryHash":"902510e9eef35fa6b84d738e4e955fe11c640e78d329e016df4f6f75e983fd54"}
{"index":10,"timestamp":"2026-10-16T05:05:09.954Z","actor":"lk-t24-agent","action":"tx:dust-send-1","params":{"to":"0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3","valuePhrs":"0.0001","mode":"--async broadcast, mined","attempt":"final"},"txHash":"0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1","note":null,"prevHash":"902510e9eef35fa6b84d738e4e955fe11c640e78d329e016df4f6f75e983fd54","entryHash":"60bdfd8f2bbbe98b035a34635ae23aef800c20c1d7291900c3ead61fa2606c95"}
{"index":11,"timestamp":"2026-10-16T05:05:10.080Z","actor":"lk-t24-agent","action":"read:receipt-1","params":{"status":"0x1","gasUsed":"0x5208","gasUsedDec":21000,"blockHex":"0x1e066da","blockDec":31483610,"effectiveGasPriceWei":"0x3b9aca01","txFeeWeiHex":"0x1319718aa208","txFeeWeiDec":"21000000021000"},"txHash":"0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1","note":null,"prevHash":"60bdfd8f2bbbe98b035a34635ae23aef800c20c1d7291900c3ead61fa2606c95","entryHash":"3083d757c6cd35285b847c26a13c95a483e42e27cb4559f200779017b747ffe5"}
{"index":12,"timestamp":"2026-10-16T05:05:12.154Z","actor":"lk-t24-agent","action":"tx:dust-send-2","params":{"to":"0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3","valuePhrs":"0.0001","mode":"--async broadcast, mined","attempt":"final"},"txHash":"0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68","note":null,"prevHash":"3083d757c6cd35285b847c26a13c95a483e42e27cb4559f200779017b747ffe5","entryHash":"7029f8ccfed1ce4e925a54fced8eb951b99cf43f0692bf3a0e75b1d4ef2376e4"}
{"index":13,"timestamp":"2026-10-16T05:05:12.254Z","actor":"lk-t24-agent","action":"read:receipt-2","params":{"status":"0x1","gasUsed":"0x5208","gasUsedDec":21000,"blockHex":"0x1e066fe","blockDec":31483646,"effectiveGasPriceWei":"0x3b9aca01","txFeeWeiHex":"0x1319718aa208","txFeeWeiDec":"21000000021000"},"txHash":"0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68","note":null,"prevHash":"7029f8ccfed1ce4e925a54fced8eb951b99cf43f0692bf3a0e75b1d4ef2376e4","entryHash":"9f08a4ffaea527610be001b77266c3c1d2b48f3f92540ff8bea67387b63da22c"}
{"index":14,"timestamp":"2026-10-16T05:13:57.554Z","actor":"lk-t24-agent","action":"report:generate","params":{"wallet":"0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3","range":{"from":31479699,"to":31483698,"tip":31483702,"method":"date→block via live avg block time 1.19s","coverageNote":"native-transfer block scan capped at most-recent 4000 blocks (31479699–31483698); ERC-20/approval logs scanned over full requested range. Requested range was 31474623–31483698."},"totals":{"transfersIn":1,"transfersOut":116,"inPhrs":"0.05","outPhrs":"0.174686666666666667","erc20Transfers":0,"approvals":0,"contractInteractions":90,"swapsDetected":0,"gasPaidPhrs":"0.023225127018638487","failedTx":7},"files":["audit-report-2026-10-16T05-13-57.md","audit-report-2026-10-16T05-13-57.csv","audit-report-2026-10-16T05-13-57.pdf","chain-scan-2026-10-16T05-13-57.json"]},"txHash":null,"note":"wallet activity report generated from live RPC","prevHash":"9f08a4ffaea527610be001b77266c3c1d2b48f3f92540ff8bea67387b63da22c","entryHash":"e19bba30b6044bf14f1d2a09bff004a9c400ddc75e9b47c1c5742896983bd237"}
{"index":15,"timestamp":"2026-10-16T06:40:49.807Z","actor":"lk-t24-agent","action":"tx:chain-anchor-attempt-dropped","params":{"hash":"0xe3e6769aeb35a56f65ee904ab68c598cb96656c3e0e77ff437c5378043bf220f","cause":"dropped from mempool under shared-key nonce contention, not mined","headAtBroadcast":{"index":14,"entryHash":"e19bba30b6044bf14f1d2a09bff004a9c400ddc75e9b47c1c5742896983bd237"}},"txHash":"0xe3e6769aeb35a56f65ee904ab68c598cb96656c3e0e77ff437c5378043bf220f","note":null,"prevHash":"e19bba30b6044bf14f1d2a09bff004a9c400ddc75e9b47c1c5742896983bd237","entryHash":"8790053c9c7166902d1576a1e6496a635eafaeed4b70f3108e692e38ffd3e82f"}
{"index":16,"timestamp":"2026-10-16T06:44:36.355Z","actor":"lk-t24-agent","action":"tx:chain-anchor-attempt-dropped","params":{"hash":"0xf6f9e37b46466976119f92f666aaddab874bb80f0f6559024fbd8b4dceddbb17","cause":"dropped from mempool under shared-key nonce contention, not mined","headAtBroadcast":{"index":15,"entryHash":"8790053c9c7166902d1576a1e6496a635eafaeed4b70f3108e692e38ffd3e82f"}},"txHash":"0xf6f9e37b46466976119f92f666aaddab874bb80f0f6559024fbd8b4dceddbb17","note":null,"prevHash":"8790053c9c7166902d1576a1e6496a635eafaeed4b70f3108e692e38ffd3e82f","entryHash":"441cfdcdca04b330e1e1019d665d52466d3e15f10a0ab9dd96cf165befc3a395"}
{"index":17,"timestamp":"2026-10-16T06:46:35.290Z","actor":"lk-t24-agent","action":"tx:chain-anchor-attempt-dropped","params":{"hash":"0xeb26e68ab62bf8e19597b5f5866673cde8c286cd5ededaca4e953245e994d151","cause":"dropped from mempool under shared-key nonce contention, not mined","headAtBroadcast":{"index":16,"entryHash":"441cfdcdca04b330e1e1019d665d52466d3e15f10a0ab9dd96cf165befc3a395"}},"txHash":"0xeb26e68ab62bf8e19597b5f5866673cde8c286cd5ededaca4e953245e994d151","note":null,"prevHash":"441cfdcdca04b330e1e1019d665d52466d3e15f10a0ab9dd96cf165befc3a395","entryHash":"3347c66dcfa92c78fe6bc5e06ccb5449bbcc4119b2e7d92a6f7a9cbb0d94de2b"}
{"index":18,"timestamp":"2026-10-16T06:47:34.005Z","actor":"lk-t24-agent","action":"tx:chain-anchor-attempt-dropped","params":{"hash":"0xb3cd3970bfbab4a297c3843360d875798be83ea8f19b41576e94779d7a0afd8f","cause":"dropped from mempool under shared-key nonce contention, not mined","headAtBroadcast":{"index":17,"entryHash":"3347c66dcfa92c78fe6bc5e06ccb5449bbcc4119b2e7d92a6f7a9cbb0d94de2b"}},"txHash":"0xb3cd3970bfbab4a297c3843360d875798be83ea8f19b41576e94779d7a0afd8f","note":null,"prevHash":"3347c66dcfa92c78fe6bc5e06ccb5449bbcc4119b2e7d92a6f7a9cbb0d94de2b","entryHash":"047b3d4d2c74d492986b99d673f7fd7311a20fac911587571512fee8bcf9b569"}
{"index":19,"timestamp":"2026-10-16T06:48:39.303Z","actor":"lk-t24-agent","action":"tx:chain-anchor-attempt-dropped","params":{"hash":"0xd5b35d8b9c4055e09b8d16d651f78050e7eb220595cec2c40684b4fb49f2857a","cause":"dropped from mempool under shared-key nonce contention, not mined","headAtBroadcast":{"index":18,"entryHash":"047b3d4d2c74d492986b99d673f7fd7311a20fac911587571512fee8bcf9b569"}},"txHash":"0xd5b35d8b9c4055e09b8d16d651f78050e7eb220595cec2c40684b4fb49f2857a","note":null,"prevHash":"047b3d4d2c74d492986b99d673f7fd7311a20fac911587571512fee8bcf9b569","entryHash":"f60015f5c24eb57d14d3b18b5e92bc4e624051f39ba18a08b1e8ca67013b0f0d"}
{"index":20,"timestamp":"2026-10-16T06:49:39.810Z","actor":"lk-t24-agent","action":"tx:chain-anchor-attempt-dropped","params":{"hash":"0xda37de0f8cb50521f9cf4018a20c87cb82d0076f7e4d47c02d395ea6897953bc","cause":"dropped from mempool under shared-key nonce contention, not mined","headAtBroadcast":{"index":19,"entryHash":"f60015f5c24eb57d14d3b18b5e92bc4e624051f39ba18a08b1e8ca67013b0f0d"}},"txHash":"0xda37de0f8cb50521f9cf4018a20c87cb82d0076f7e4d47c02d395ea6897953bc","note":null,"prevHash":"f60015f5c24eb57d14d3b18b5e92bc4e624051f39ba18a08b1e8ca67013b0f0d","entryHash":"adcf050b125a1459cc06551e724f1772d7afeb28c7e2c9475b1f913f27e3ed7e"}
{"index":21,"timestamp":"2026-10-16T06:51:00.795Z","actor":"lk-t24-agent","action":"tx:chain-anchor","params":{"anchorsEntryIndex":20,"anchorsEntryHash":"adcf050b125a1459cc06551e724f1772d7afeb28c7e2c9475b1f913f27e3ed7e","purpose":"pins the chain head on-chain: this mined tx's calldata IS entry #20's entryHash — anyone can verify the local chain against Atlantic","blockHex":"0x1e073f1","gasUsed":"0x5408","gasUsedDec":21512,"effectiveGasPriceWei":"0x3b9aca01","txFeeWeiHex":"0x1390a71ea408"},"txHash":"0xcb79d4a218dece0c55868efd0240089343a5ee8c4887b5f6888517eab70ee76e","note":null,"prevHash":"adcf050b125a1459cc06551e724f1772d7afeb28c7e2c9475b1f913f27e3ed7e","entryHash":"6eb5e439f1f79b23813abb4ee0999db908b4c2f91d359cad462fccfba47bfc4a"}`;

const GENESIS = "0".repeat(64);

const ANCHORS = [
  {
    label: "dust transfer 1 — log entry #10",
    hash: "0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1",
    block: 31483610,
    kind: "receipt" as const,
  },
  {
    label: "dust transfer 2 — log entry #12",
    hash: "0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68",
    block: 31483646,
    kind: "receipt" as const,
  },
  {
    label: "chain anchor — log entry #21",
    hash: ANCHOR_TX.hash,
    block: ANCHOR_TX.block,
    kind: "calldata" as const,
  },
];

/** Canonical JSON (sorted keys, recursive) — byte-identical to tasks/t24-audit-log-agent/src/lib.mjs. */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** entryHash input is {index,timestamp,actor,action,params,txHash,prevHash} — note excluded, same as the CLI. */
async function entryHashOf(e: {
  index: unknown;
  timestamp: unknown;
  actor: unknown;
  action: unknown;
  params?: unknown;
  txHash?: unknown;
  prevHash: unknown;
}): Promise<string> {
  const input = {
    index: e.index,
    timestamp: e.timestamp,
    actor: e.actor,
    action: e.action,
    params: e.params ?? null,
    txHash: e.txHash ?? null,
    prevHash: e.prevHash,
  };
  return sha256hex(canonical(input));
}

interface Failure {
  index: number;
  reason: string;
}

interface Verdict {
  ok: boolean;
  checked: number;
  failures: Failure[];
}

interface HashedEntry {
  /** line number among non-blank lines */
  line: number;
  e: Record<string, unknown>;
  recomputed: string;
}

interface PassA {
  failures: Failure[];
  hashed: HashedEntry[];
  checked: number;
}

/**
 * Pass A — hash every entry. Each entry's SHA-256 is a real async digest;
 * `onHashed` fires per entry so the run UI can name the live entry.
 * Same checks and failure wording as the CLI's `verify`.
 */
async function hashAllEntries(
  text: string,
  onHashed?: (done: number, total: number, index: number) => void
): Promise<PassA> {
  const failures: Failure[] = [];
  const hashed: HashedEntry[] = [];
  const raws: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.trim()) raws.push(raw);
  }
  let i = 0;
  for (const raw of raws) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(raw);
    } catch {
      failures.push({ index: i, reason: "corrupt JSONL line — not valid JSON" });
      i += 1;
      continue;
    }
    const recomputed = await entryHashOf(e as never);
    hashed.push({ line: i, e, recomputed });
    i += 1;
    onHashed?.(hashed.length, raws.length, typeof e.index === "number" ? e.index : i - 1);
  }
  return { failures, hashed, checked: i };
}

/**
 * Pass B — link verification over Pass A's hashes: index sequence, prevHash
 * links, stored-vs-recomputed entryHash, required fields.
 */
function verifyLinks(pass: PassA): Verdict {
  const failures: Failure[] = [...pass.failures];
  let prev: string | undefined = GENESIS;
  for (const h of pass.hashed) {
    const e = h.e;
    const i = h.line;
    if (e.index !== i)
      failures.push({ index: i, reason: `index mismatch: expected ${i}, got ${e.index}` });
    if (e.prevHash !== prev)
      failures.push({
        index: i,
        reason: `prevHash link broken (expected ${String(prev).slice(0, 12)}…, got ${String(
          e.prevHash ?? ""
        ).slice(0, 12)}…)`,
      });
    if (h.recomputed !== e.entryHash)
      failures.push({ index: i, reason: "entryHash mismatch — field content was altered after logging" });
    if (!e.timestamp || !e.actor || !e.action)
      failures.push({ index: i, reason: "missing required field (timestamp/actor/action)" });
    prev = typeof e.entryHash === "string" ? e.entryHash : undefined;
  }
  return { ok: failures.length === 0, checked: pass.checked, failures };
}

/** Mirrors `node bin/audit-log.mjs verify` from tasks/t24-audit-log-agent. */
async function verifyChain(text: string): Promise<Verdict> {
  return verifyLinks(await hashAllEntries(text));
}

interface ParsedEntry {
  index: number;
  action: string;
  raw: string;
  entryHash: string;
  prevHash: string;
  txHash: string | null;
}

function parseEntries(text: string): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const e = JSON.parse(raw) as {
        index?: unknown;
        action?: unknown;
        entryHash?: unknown;
        prevHash?: unknown;
        txHash?: unknown;
      };
      if (typeof e.index === "number")
        out.push({
          index: e.index,
          action: String(e.action ?? "?"),
          raw,
          entryHash: typeof e.entryHash === "string" ? e.entryHash : "",
          prevHash: typeof e.prevHash === "string" ? e.prevHash : "",
          txHash: typeof e.txHash === "string" ? e.txHash : null,
        });
    } catch {
      /* unparseable lines are the verifier's job to flag */
    }
  }
  return out;
}

/* ---------------- Red-team lab: four attacks, all run live on copies ---------------- */

interface Attack {
  id: string;
  name: string;
  desc: string;
  why: string;
  make: (lines: string[]) => Promise<string>;
}

function findLine(lines: string[], index: number): number {
  return lines.findIndex((l) => {
    try {
      return (JSON.parse(l) as { index?: number }).index === index;
    } catch {
      return false;
    }
  });
}

const ATTACKS: Attack[] = [
  {
    id: "flip",
    name: "Flip one character",
    desc: 'Entry #12: "0.0001" → "0.0002"',
    why: "SHA-256 avalanches: one changed character produces a completely different hash, so the stored entryHash no longer matches the content. The verifier names entry #12.",
    make: async (lines) => {
      const next = [...lines];
      const k = findLine(next, 12);
      next[k] = next[k].replace('"valuePhrs":"0.0001"', '"valuePhrs":"0.0002"');
      return next.join("\n");
    },
  },
  {
    id: "forge",
    name: "Flip + forge the hash",
    desc: "Entry #12 edited, then its entryHash recomputed to match",
    why: "The attacker was clever and reforged entry #12's own hash — but entry #13's prevHash still points at the ORIGINAL #12 hash. You cannot forge one link without breaking the next. The verifier names entry #13.",
    make: async (lines) => {
      const next = [...lines];
      const k = findLine(next, 12);
      const e = JSON.parse(next[k]) as Record<string, unknown>;
      e.params = { ...(e.params as object), valuePhrs: "0.0002" };
      e.entryHash = await entryHashOf(e as never);
      next[k] = JSON.stringify(e);
      return next.join("\n");
    },
  },
  {
    id: "delete",
    name: "Delete an entry",
    desc: "Entry #5 removed from the log",
    why: "Deletion shifts every later entry out of position (index mismatch) and severs the prevHash link at the splice point. An append-only log cannot silently lose a line — the verifier names entry #5 first.",
    make: async (lines) => {
      const k = findLine(lines, 5);
      return [...lines.slice(0, k), ...lines.slice(k + 1)].join("\n");
    },
  },
  {
    id: "swap",
    name: "Swap two entries",
    desc: "Entries #6 and #7 exchange places",
    why: "Reordering breaks the index sequence and the prevHash links around the swap — the chain records not just what happened, but the order it happened in. The verifier names entry #6 first.",
    make: async (lines) => {
      const next = [...lines];
      const a = findLine(next, 6);
      const b = findLine(next, 7);
      [next[a], next[b]] = [next[b], next[a]];
      return next.join("\n");
    },
  },
];

/* ---------------- presentation pieces (display-only — verify logic above untouched) ---------------- */

/**
 * The chain strip: all 22 entries as a linked ledger, oldest → newest.
 * Each node seals the one before it — the whole tamper-evident structure in
 * one glance. Click a node to inspect it; broken links turn red.
 */
function ChainStrip({
  entries,
  brokenSet,
  selected,
  onSelect,
}: {
  entries: ParsedEntry[];
  brokenSet: Set<number>;
  selected: number;
  onSelect: (idx: number) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-center" role="list" aria-label="Chain of entries, oldest to newest">
          {entries.map((e, i) => {
            const broken = brokenSet.has(e.index);
            return (
              <div key={e.index} className="flex items-center" role="listitem">
                {i > 0 && (
                  <span
                    className={`h-0.5 w-3 ${broken ? "bg-fail/60" : "bg-hairline"}`}
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(e.index)}
                  title={`Entry #${e.index} — ${e.action}`}
                  aria-label={`Inspect entry ${e.index}${broken ? ", flagged as broken" : ""}`}
                  className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border font-mono text-[11px] ${
                    broken
                      ? "border-fail/60 bg-[#FEF2F2] text-fail"
                      : selected === e.index
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-hairline bg-white text-ink hover:border-accent/60"
                  }`}
                >
                  <span className="font-semibold">#{e.index}</span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${broken ? "bg-fail" : "bg-pass"}`}
                    aria-hidden
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate">
        Oldest → newest — each entry's hash seals the one before it. Click any link to inspect it.
      </p>
    </div>
  );
}

/**
 * The Draw: the seal's check mark draws itself when the stored hash matches
 * the live-recomputed one — the verdict sealing, mapped to the real match state.
 */
function SealMark({ matched }: { matched: boolean }) {
  const reduce = useReducedMotion();
  if (!matched) return <ShieldX size={13} aria-hidden />;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <motion.path
        d="M2.5 7.5l3.5 3.5 5.5-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.45, ease: "easeOut" }}
      />
    </svg>
  );
}

/** Display-only: how many characters differ between two hex strings, and where first. */
function hashDiff(a: string, b: string): { count: number; first: number; len: number } {
  const len = Math.max(a.length, b.length);
  let count = 0;
  let first = -1;
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      count += 1;
      if (first === -1) first = i;
    }
  }
  return { count, first, len };
}

/* ---------------- anchor checks (live, free RPC reads) ---------------- */

interface AnchorResult {
  hash: string;
  status: string;
  block: string;
  calldata: string | null;
  error: string | null;
}

async function checkAnchor(a: (typeof ANCHORS)[number]): Promise<AnchorResult> {
  try {
    if (a.kind === "calldata") {
      const tx = (await rpcCall("eth_getTransactionByHash", [a.hash])) as {
        input?: string;
        blockNumber?: string;
      } | null;
      if (!tx || !tx.input)
        return { hash: a.hash, status: "—", block: "—", calldata: null, error: "tx not found" };
      const want = `0x${ANCHOR_SOURCE.hash}`.toLowerCase();
      const got = tx.input.toLowerCase();
      return {
        hash: a.hash,
        status: "mined",
        block: tx.blockNumber ? String(Number(BigInt(tx.blockNumber))) : "—",
        calldata: got === want ? "MATCH" : `MISMATCH`,
        error: null,
      };
    }
    const r = (await rpcCall("eth_getTransactionReceipt", [a.hash])) as {
      status?: string;
      blockNumber?: string;
    } | null;
    if (!r) return { hash: a.hash, status: "—", block: "—", calldata: null, error: "no receipt returned (tx not found)" };
    return {
      hash: a.hash,
      status: r.status ?? "—",
      block: r.blockNumber ? String(Number(BigInt(r.blockNumber))) : "—",
      calldata: null,
      error: null,
    };
  } catch (e) {
    return { hash: a.hash, status: "—", block: "—", calldata: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------------- component ---------------- */

const RUN_STEPS_BASE = ["Verifying links & indexes", "Anchoring on Atlantic — 3 live reads"];
const ATTACK_STEPS = ["Crafting the tampered copy", "Re-verifying the tampered chain"];

const short = (h: string) => (h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);

export default function TryAudit({ lamp }: { lamp: Lamp }) {
  const [text, setText] = useState(REAL_CHAIN_JSONL);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  // 02 Run — every step maps to real work, never a timer.
  const [running, setRunning] = useState(false);
  const [runStep, setRunStep] = useState(0);
  const [hashedCount, setHashedCount] = useState(0);
  const [hashTotal, setHashTotal] = useState(ENTRY_COUNT);
  const [anchorLabel, setAnchorLabel] = useState("");

  // Anchors on Atlantic (Tier C: live, free RPC reads)
  const [anchors, setAnchors] = useState<AnchorResult[] | null>(null);
  const [anchorError, setAnchorError] = useState<string | null>(null);
  const [anchorsBusy, setAnchorsBusy] = useState(false);

  // Red-team lab
  const [attackResult, setAttackResult] = useState<{ attack: Attack; verdict: Verdict } | null>(null);
  const [attackRunning, setAttackRunning] = useState<string | null>(null);
  const [attackStep, setAttackStep] = useState(0);
  const [attacksRun, setAttacksRun] = useState(0);

  // Entry inspector
  const [inspectIdx, setInspectIdx] = useState<number>(ENTRY_COUNT - 1);
  const [inspectHash, setInspectHash] = useState<{ stored: string; live: string } | null>(null);

  const runRef = useRef(0);
  const reduce = useReducedMotion();

  // Live re-verify on every keystroke — 22 SHA-256 digests, fully client-side.
  useEffect(() => {
    if (running) return;
    const run = ++runRef.current;
    verifyChain(text).then((v) => {
      if (runRef.current === run) setVerdict(v);
    });
  }, [text, running]);

  const entries = parseEntries(text);
  const brokenSet = new Set((verdict?.failures ?? []).map((f) => f.index));
  const firstBroken = verdict && !verdict.ok ? verdict.failures[0] : null;
  const anchorsConfirmed =
    anchors?.filter((a) => !a.error && (a.calldata === "MATCH" || a.status === "0x1"))
      .length ?? 0;
  const terminalHash =
    entries.length > 0 && entries[entries.length - 1].entryHash
      ? entries[entries.length - 1].entryHash
      : TERMINAL_ENTRY_HASH;

  /* ----- 02 Run: the staged audit pipeline ----- */
  const checkAnchorsLive = async (onStep?: (msg: string) => void): Promise<boolean> => {
    const results: AnchorResult[] = [];
    let hadError = false;
    for (let k = 0; k < ANCHORS.length; k++) {
      onStep?.(`Reading ${k + 1} of ${ANCHORS.length} — ${ANCHORS[k].label}`);
      const r = await checkAnchor(ANCHORS[k]);
      results.push(r);
      if (r.error) hadError = true;
    }
    setAnchors(results);
    return !hadError;
  };

  const runPipeline = async (source: string, withAnchor: boolean) => {
    if (running) return;
    const myRun = ++runRef.current;
    setRunning(true);
    setAnchorError(null);
    setAttackResult(null);
    try {
      // Step 0 — hash every entry: real SHA-256 digests, progress per entry.
      setRunStep(0);
      setHashedCount(0);
      const total = source.split("\n").filter((l) => l.trim()).length;
      setHashTotal(total);
      const passA = await hashAllEntries(source, (done) => {
        if (runRef.current === myRun) setHashedCount(done);
      });
      if (runRef.current !== myRun) return;
      // Step 1 — link verification: index, prevHash, stored-vs-recomputed, fields.
      setRunStep(1);
      const v = verifyLinks(passA);
      setVerdict(v);
      // Step 2 — anchor: confirm the 3 proof transactions on Atlantic (live reads).
      if (withAnchor) {
        setRunStep(2);
        const clean = await checkAnchorsLive((msg) => {
          if (runRef.current === myRun) setAnchorLabel(msg);
        });
        if (runRef.current !== myRun) return;
        if (!clean)
          setAnchorError(
            "Atlantic didn't answer for every anchor check. The chain verdict above is unaffected — it was computed locally in your browser. Retry the live check below."
          );
      }
      setRunStep(RUN_STEPS_BASE.length + 1);
    } finally {
      if (runRef.current === myRun) setRunning(false);
    }
  };

  const onVerify = () => runPipeline(text, true);

  const onCheckAnchors = async () => {
    if (anchorsBusy) return;
    setAnchorsBusy(true);
    setAnchorError(null);
    try {
      const clean = await checkAnchorsLive();
      if (!clean)
        setAnchorError(
          "Atlantic didn't answer for every anchor check. Retry below — the local chain verdict is unaffected."
        );
    } finally {
      setAnchorsBusy(false);
    }
  };

  /* ----- Red-team lab: four attacks, all run live on copies ----- */
  const onAttack = async (a: Attack) => {
    if (attackRunning) return;
    setAttackRunning(a.id);
    setAttackStep(0);
    setAttackResult(null);
    try {
      const copy = await a.make(REAL_CHAIN_JSONL.split("\n"));
      setAttackStep(1);
      const v = await verifyChain(copy);
      setAttackResult({ attack: a, verdict: v });
      setAttacksRun((n) => n + 1);
    } finally {
      setAttackRunning(null);
    }
  };

  /* ----- Entry inspector: stored hash vs live-recomputed hash ----- */
  const onInspect = async (idx: number) => {
    setInspectIdx(idx);
    setInspectHash(null);
    const entry = entries.find((e) => e.index === idx);
    if (!entry || !entry.raw) return;
    const e = JSON.parse(entry.raw) as Record<string, unknown>;
    const live = await entryHashOf(e as never);
    setInspectHash({ stored: entry.entryHash || "—", live });
  };

  useEffect(() => {
    onInspect(ENTRY_COUNT - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First paint: run the full pipeline (hash → verify → anchor) on the real chain.
  useEffect(() => {
    runPipeline(REAL_CHAIN_JSONL, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inspected = entries.find((e) => e.index === inspectIdx);
  const inspectMatch = inspectHash !== null && inspectHash.stored === inspectHash.live;
  const inspectDiff =
    inspectHash !== null && !inspectMatch
      ? hashDiff(inspectHash.stored, inspectHash.live)
      : null;

  const feedItems: FeedItem[] = [...entries].reverse().map((e) => ({
    key: String(e.index),
    node: (
      <button type="button" onClick={() => onInspect(e.index)} className="flex w-full items-start gap-3 text-left">
        <span
          className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${brokenSet.has(e.index) ? "bg-fail" : "bg-pass"}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink">Entry #{e.index}</span>
            <span className="font-mono text-xs text-slate">{e.action}</span>
            {brokenSet.has(e.index) && <span className="chip chip-fail">flagged</span>}
          </span>
          <span
            className="mt-1 block truncate font-mono text-xs text-slate"
            title={`entryHash ${e.entryHash} · prevHash ${e.prevHash}`}
          >
            {short(e.entryHash)} <Link2 size={10} className="inline text-slate" aria-hidden /> {short(e.prevHash)}
          </span>
        </span>
      </button>
    ),
  }));

  const runSteps = [
    `Hashing entry ${Math.min(hashedCount, hashTotal)} of ${hashTotal} — SHA-256`,
    ...RUN_STEPS_BASE,
  ];

  return (
    <div className="space-y-8">
      {/* ================= 01 — Configure ================= */}
      <section>
        <p className="mb-1 text-sm font-semibold text-slate">01 · Configure</p>
        <h3 className="text-xl font-semibold text-ink">Choose the chain to audit</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink">
          Below is the task's <strong>real</strong> audit chain — all {ENTRY_COUNT} entries:
          chain-id reads, two mined dust transfers, receipt confirmations, the mempool-drop
          disclosures, the chain-anchor transaction pinning the log head on-chain, and report
          generation. Edit anything — flip a character, delete a line — and the verdict
          re-computes in your browser with the exact algorithm of the task's{" "}
          <code className="font-mono">audit-log</code> CLI. Nothing leaves your machine.
        </p>
        <div className="mt-4">
          <label htmlFor="t24-chain" className="mb-2 block text-sm font-semibold text-slate">
            Chain under audit (JSONL)
          </label>
          <textarea
            id="t24-chain"
            className="h-64 w-full rounded-xl border border-hairline bg-porcelain px-3 py-2 font-mono text-xs text-ink disabled:opacity-60"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={running}
            spellCheck={false}
            aria-label="Audit chain (JSONL) to verify"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary min-h-[44px]"
            onClick={onVerify}
            disabled={running}
          >
            {running ? "Auditing…" : "Verify chain"}
          </button>
          <button
            type="button"
            className="btn-outline min-h-[44px]"
            onClick={() => setText(REAL_CHAIN_JSONL)}
            disabled={running}
          >
            Restore the real chain
          </button>
        </div>
      </section>

      {/* ================= 02 — Run ================= */}
      {running && (
        <section aria-live="polite">
          <ProgressLoader
            steps={runSteps}
            current={runStep}
            title={
              runStep === 2 && anchorLabel
                ? anchorLabel
                : `Auditing the ${hashTotal}-entry chain`
            }
          />
        </section>
      )}

      {/* ================= 03 — Result ================= */}
      {!running && verdict && (
        <>
          <section>
            <p className="mb-3 text-sm font-semibold text-slate">03 · Result</p>
            <ResultCard
              eyebrow="Result — chain verification"
              headline={verdict.ok ? "Intact" : "Broken"}
              status={verdict.ok ? "pass" : "fail"}
              subline={
                verdict.ok ? (
                  <>
                    All {verdict.checked} entries re-hashed in your browser and every prevHash
                    link holds. This is the task's own log — and its head is pinned on Atlantic
                    by a mined anchor transaction you can check below.
                  </>
                ) : (
                  <>
                    The chain is broken — {verdict.failures.length} failure
                    {verdict.failures.length === 1 ? "" : "s"} across {verdict.checked} checked
                    entries, first at entry #{firstBroken ? firstBroken.index : "—"}. The
                    red-team lab below shows exactly how tampering gets caught.
                  </>
                )
              }
              rows={[
                { label: "Entries checked", value: `${verdict.checked} of ${ENTRY_COUNT}` },
                { label: "Failures found", value: String(verdict.failures.length) },
                {
                  label: "Terminal entryHash",
                  value: <span title={terminalHash}>{short(terminalHash)}</span>,
                },
                {
                  label: "Anchored hash (entry #20)",
                  value: <span title={ANCHOR_SOURCE.hash}>{short(ANCHOR_SOURCE.hash)}</span>,
                },
                { label: "Genesis prevHash", value: <span title={GENESIS}>{short(GENESIS)}</span> },
                {
                  label: "Algorithm",
                  value: "SHA-256 over canonical sorted-key JSON — same as the CLI",
                },
                { label: "On-chain spend", value: "0.000363512000063512 PHRS of the 0.15 budget" },
              ]}
              links={[
                { label: "View the anchor transaction", href: `${EXPLORER_TX}${ANCHORS[2].hash}` },
                { label: "View dust transfer 1", href: `${EXPLORER_TX}${ANCHORS[0].hash}` },
                { label: "View dust transfer 2", href: `${EXPLORER_TX}${ANCHORS[1].hash}` },
              ]}
              copyValue={terminalHash}
            >
              {verdict.failures.length > 0 && (
                <div className="rounded-xl border border-fail/40 bg-[#FEF2F2] p-4" role="alert">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-fail">
                    <ShieldX size={16} aria-hidden />
                    {verdict.failures.length} failure{verdict.failures.length === 1 ? "" : "s"} —
                    the chain names every broken entry
                  </p>
                  <ul className="space-y-1">
                    {verdict.failures.slice(0, 8).map((f, n) => (
                      <li key={n} className="font-mono text-xs text-ink">
                        entry <strong>#{f.index}</strong> — {f.reason}
                      </li>
                    ))}
                    {verdict.failures.length > 8 && (
                      <li className="font-mono text-xs text-slate">
                        …and {verdict.failures.length - 8} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </ResultCard>
          </section>

          <section>
            <StatStrip
              stats={[
                { label: "Entries checked", value: verdict.checked, icon: <ScrollText size={16} aria-hidden /> },
                { label: "Failures found", value: verdict.failures.length, icon: <ShieldX size={16} aria-hidden /> },
                { label: "Attacks run", value: attacksRun, icon: <Swords size={16} aria-hidden /> },
                { label: "Anchors confirmed", value: anchorsConfirmed, icon: <Anchor size={16} aria-hidden /> },
              ]}
            />
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ScrollText size={18} className="text-accent" aria-hidden />
              <h3 className="text-xl font-semibold text-ink">The chain — a linked ledger</h3>
            </div>
            <p className="mb-3 max-w-3xl text-sm leading-relaxed text-ink">
              Every entry's hash covers the previous entry's hash — a ledger where each line
              seals the one before it. Newest first; click any entry to inspect it below.
            </p>
            {entries.length === 0 ? (
              <EmptyState
                title="No entries to audit"
                message="The textarea is empty — there is nothing to verify. That's an honest answer, not an error."
                actionLabel="Restore the real chain"
                onAction={() => setText(REAL_CHAIN_JSONL)}
              />
            ) : (
              <>
                <ChainStrip
                  entries={entries}
                  brokenSet={brokenSet}
                  selected={inspectIdx}
                  onSelect={onInspect}
                />
                <FeedList items={feedItems} maxHeight="max-h-[28rem]" emptyText="No entries yet." />
              </>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Fingerprint size={18} className="text-accent" aria-hidden />
              <h3 className="text-xl font-semibold text-ink">Entry inspector</h3>
            </div>
            <div className="rounded-2xl border border-hairline bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="min-h-[44px] rounded-lg border border-hairline bg-porcelain px-2 py-1 font-mono text-sm text-ink"
                  value={inspectIdx}
                  onChange={(e) => onInspect(Number(e.target.value))}
                  aria-label="Choose an entry to inspect"
                >
                  {entries.map((e) => (
                    <option key={e.index} value={e.index}>
                      #{e.index} — {e.action}
                    </option>
                  ))}
                </select>
                {inspectHash && (
                  <span className={`chip ${inspectMatch ? "chip-pass" : "chip-fail"}`}>
                    <SealMark matched={inspectMatch} />
                    {inspectMatch ? "hash recomputes — seal intact" : "hash mismatch — seal broken"}
                  </span>
                )}
              </div>
              {inspected && inspectHash && (
                <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  <div className="border-t border-hairline pt-3">
                    <dt className="text-sm font-semibold text-slate">Stored entryHash</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-ink" title={inspectHash.stored}>
                      {inspectHash.stored}
                    </dd>
                  </div>
                  <div className="border-t border-hairline pt-3">
                    <dt className="text-sm font-semibold text-slate">Recomputed live</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-ink" title={inspectHash.live}>
                      {inspectHash.live}
                    </dd>
                  </div>
                  <div className="border-t border-hairline pt-3">
                    <dt className="text-sm font-semibold text-slate">Action</dt>
                    <dd className="mt-1 font-mono text-xs text-ink">{inspected.action}</dd>
                  </div>
                  <div className="border-t border-hairline pt-3">
                    <dt className="text-sm font-semibold text-slate">Transaction</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-ink">
                      {inspected.txHash ? (
                        <a
                          className="text-accent hover:underline"
                          href={`${EXPLORER_TX}${inspected.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          title={inspected.txHash}
                        >
                          {short(inspected.txHash)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </dl>
              )}
              {!inspected && (
                <p className="mt-2 text-sm text-slate">No parseable entries in the textarea.</p>
              )}
              {inspected && inspectDiff && (
                <p className="mt-3 text-xs text-slate">
                  <strong className="text-ink">Damage report:</strong> {inspectDiff.count} of{" "}
                  {inspectDiff.len} characters differ — first difference at position{" "}
                  {inspectDiff.first}. One character was enough to break the seal.
                </p>
              )}
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <FlaskConical size={18} className="text-accent" aria-hidden />
              <h3 className="text-xl font-semibold text-ink">Red-team the chain</h3>
              <span className="chip chip-lit">four attacks, live copies</span>
            </div>
            <p className="mb-4 max-w-3xl text-sm leading-relaxed text-slate">
              Each attack runs against a <strong className="text-ink">copy</strong> of the real
              chain — the original is never touched. The verdict recomputes in your browser
              with the same verifier. Every attack should fail: that's the point.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ATTACKS.map((a) => (
                <div key={a.id} className="rounded-2xl border border-hairline bg-white p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fail/10">
                      <Swords size={18} className="text-fail" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{a.name}</p>
                      <p className="truncate font-mono text-xs text-slate" title={a.desc}>{a.desc}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-outline mt-4 min-h-[44px]"
                    onClick={() => onAttack(a)}
                    disabled={attackRunning !== null}
                  >
                    {attackRunning === a.id ? "Attacking…" : "Run attack on a copy"}
                  </button>
                  {attackRunning === a.id && (
                    <div className="mt-4">
                      <ProgressLoader steps={ATTACK_STEPS} current={attackStep} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {attackResult && !attackRunning && (
              <motion.div
                key={`${attackResult.attack.id}-${attackResult.verdict.failures.length}`}
                initial={{ y: reduce ? 0 : 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-white"
              >
                <div className="flex items-center gap-3 border-b border-hairline bg-[#FEF2F2] px-5 py-4">
                  <Swords size={20} className="shrink-0 text-fail" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {attackResult.attack.name} — attack executed on a copy
                    </p>
                    <p className="truncate font-mono text-xs text-slate" title={attackResult.attack.desc}>
                      {attackResult.attack.desc}
                    </p>
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldCheck size={18} className="text-pass" aria-hidden />
                    <p className="text-base font-semibold text-ink">
                      The chain fought back — detected at entry #
                      {attackResult.verdict.failures[0]?.index ?? "—"}
                    </p>
                    <span className="chip chip-pass">attack foiled</span>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {attackResult.verdict.failures.slice(0, 4).map((f, n) => (
                      <li key={n} className="font-mono text-xs text-ink">
                        entry <strong>#{f.index}</strong> — {f.reason}
                      </li>
                    ))}
                    {attackResult.verdict.failures.length > 4 && (
                      <li className="font-mono text-xs text-slate">
                        …and {attackResult.verdict.failures.length - 4} more
                      </li>
                    )}
                  </ul>
                  <div className="mt-3 max-w-3xl border-l-2 border-accent/60 pl-4">
                    <p className="text-sm font-semibold text-slate">The defender's note</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink">
                      {attackResult.attack.why}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold text-ink">Verify our proof</h3>
              <span className="chip chip-dim">live reads on Atlantic</span>
            </div>
            <p className="mb-3 max-w-3xl text-sm leading-relaxed text-slate">
              The two dust transfers (entries #10 and #12) and the chain-anchor transaction
              (entry #21) are real, mined Atlantic transactions. The anchor transaction's{" "}
              <strong className="text-ink">calldata is entry #20's entryHash</strong> — the live
              check fetches the mined transaction and compares its input data to that hash. All
              checks are free reads against the public Atlantic RPC — no wallet, no signature.
            </p>
            <div className="mb-3">
              <button
                type="button"
                className="btn-primary min-h-[44px]"
                onClick={onCheckAnchors}
                disabled={anchorsBusy}
              >
                {anchorsBusy ? "Reading from Atlantic…" : "Confirm all three on Atlantic"}
              </button>
            </div>
            {anchors && anchorsConfirmed === ANCHORS.length && !anchorError && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-pass/40 bg-pass/10 px-4 py-3">
                <ShieldCheck size={16} className="shrink-0 text-pass" aria-hidden />
                <p className="text-sm text-ink">
                  <strong>Sealed.</strong> All three anchors confirmed live on Atlantic — the
                  log head is pinned on-chain.{" "}
                  <span className="text-slate">
                    The anchor transaction's calldata is entry #20's entryHash.
                  </span>
                </p>
              </div>
            )}
            {anchorError && (
              <div className="mb-3">
                <ErrorState
                  title="The live check didn't complete"
                  message={anchorError}
                  hint="This is usually a temporary RPC hiccup — the local chain verdict above is unaffected."
                  retryLabel="Retry the live check"
                  onRetry={onCheckAnchors}
                />
              </div>
            )}
            <div className="overflow-x-auto rounded-2xl border border-hairline bg-white">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Anchor</th>
                    <th>Explorer</th>
                    <th className="text-right">Receipt</th>
                    <th className="text-right">Block</th>
                    <th className="text-right">Calldata check</th>
                  </tr>
                </thead>
                <tbody>
                  {ANCHORS.map((a) => {
                    const check = anchors?.find((c) => c.hash === a.hash);
                    return (
                      <tr key={a.hash}>
                        <td className="text-ink">{a.label}</td>
                        <td>
                          <a
                            className="font-mono text-xs text-accent hover:underline"
                            href={`${EXPLORER_TX}${a.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            title={a.hash}
                          >
                            {a.hash.slice(0, 12)}…{a.hash.slice(-8)}
                          </a>
                        </td>
                        <td className="text-right font-mono text-ink">
                          {check ? (
                            check.error ? (
                              <span className="text-fail">{check.error}</span>
                            ) : (
                              check.status
                            )
                          ) : (
                            <span className="text-slate">—</span>
                          )}
                        </td>
                        <td className="text-right font-mono text-ink">
                          {check ? check.block : <span className="text-slate">—</span>}
                        </td>
                        <td className="text-right font-mono text-ink">
                          {a.kind === "calldata" ? (
                            check ? (
                              check.calldata === "MATCH" ? (
                                <span className="chip chip-pass">
                                  input == entry #{ANCHOR_SOURCE.index} hash ✓
                                </span>
                              ) : (
                                <span className="text-fail">{check.calldata ?? check.error ?? "—"}</span>
                              )
                            ) : (
                              <span className="text-slate">press "Confirm…"</span>
                            )
                          ) : (
                            <span className="text-slate">n/a</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 break-all font-mono text-xs text-slate">
              anchored hash (entry #{ANCHOR_SOURCE.index}): {ANCHOR_SOURCE.hash}
            </p>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Terminal size={18} className="text-accent" aria-hidden />
              <h3 className="text-xl font-semibold text-ink">Reproduce everything offline</h3>
            </div>
            <div className="code-block">
              cd tasks/t24-audit-log-agent
              <br />
              node bin/audit-log.mjs verify
              <br />
              node --test "test/*.test.mjs"
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate">
              Run this in your own terminal — LIGHTKEEPER never executes it for you.{" "}
              <code className="font-mono">verify</code> replays the chain and also proves the
              negative: tampered <em>copies</em> fail naming the exact entry, while the
              original stays PASS.
            </p>
          </section>
        </>
      )}

      <p className="text-sm text-slate">
        Tier C surface: computation happens in your browser; commands run in your terminal; the
        console never signs. {lamp.name} has no key, no signer, no broadcast path.
        LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only (688689).
      </p>
    </div>
  );
}
