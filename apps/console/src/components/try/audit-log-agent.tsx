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
import type { Lamp } from "../../types";
import { EXPLORER_TX, rpcCall } from "../../hooks/useAtlantic";

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

/** Mirrors `node bin/audit-log.mjs verify` from tasks/t24-audit-log-agent. */
async function verifyChain(text: string): Promise<Verdict> {
  const failures: Failure[] = [];
  let prev: string | undefined = GENESIS;
  let i = 0;
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(raw);
    } catch {
      failures.push({ index: i, reason: "corrupt JSONL line — not valid JSON" });
      i += 1;
      continue;
    }
    if (e.index !== i)
      failures.push({ index: i, reason: `index mismatch: expected ${i}, got ${e.index}` });
    if (e.prevHash !== prev)
      failures.push({
        index: i,
        reason: `prevHash link broken (expected ${String(prev).slice(0, 12)}…, got ${String(
          e.prevHash ?? ""
        ).slice(0, 12)}…)`,
      });
    const recomputed = await entryHashOf(e as never);
    if (recomputed !== e.entryHash)
      failures.push({ index: i, reason: "entryHash mismatch — field content was altered after logging" });
    if (!e.timestamp || !e.actor || !e.action)
      failures.push({ index: i, reason: "missing required field (timestamp/actor/action)" });
    prev = typeof e.entryHash === "string" ? e.entryHash : undefined;
    i += 1;
  }
  return { ok: failures.length === 0, checked: i, failures };
}

interface ParsedEntry {
  index: number;
  action: string;
  raw: string;
}

function parseEntries(text: string): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const e = JSON.parse(raw) as { index?: unknown; action?: unknown };
      if (typeof e.index === "number")
        out.push({ index: e.index, action: String(e.action ?? "?"), raw });
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

export default function TryAudit({ lamp }: { lamp: Lamp }) {
  const [text, setText] = useState(REAL_CHAIN_JSONL);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [attack, setAttack] = useState<{ attack: Attack; verdict: Verdict } | null>(null);
  const [attackRunning, setAttackRunning] = useState<string | null>(null);
  const [anchors, setAnchors] = useState<AnchorResult[] | null>(null);
  const [anchorsLoading, setAnchorsLoading] = useState(false);
  const [inspectIdx, setInspectIdx] = useState<number>(ENTRY_COUNT - 1);
  const [inspectHash, setInspectHash] = useState<{ stored: string; live: string } | null>(null);
  const runRef = useRef(0);

  // Re-verify on every keystroke — SHA-256 of 22 short lines is instant.
  useEffect(() => {
    const run = ++runRef.current;
    verifyChain(text).then((v) => {
      if (runRef.current === run) setVerdict(v);
    });
  }, [text]);

  const entries = parseEntries(text);
  const brokenSet = new Set((verdict?.failures ?? []).map((f) => f.index));
  const firstBroken = verdict && !verdict.ok ? verdict.failures[0] : null;

  const onAttack = async (a: Attack) => {
    setAttackRunning(a.id);
    try {
      const copy = await a.make(REAL_CHAIN_JSONL.split("\n"));
      const v = await verifyChain(copy);
      setAttack({ attack: a, verdict: v });
    } finally {
      setAttackRunning(null);
    }
  };

  const onCheckAnchors = async () => {
    setAnchorsLoading(true);
    try {
      const results = await Promise.all(ANCHORS.map(checkAnchor));
      setAnchors(results);
    } finally {
      setAnchorsLoading(false);
    }
  };

  const onInspect = async (idx: number) => {
    setInspectIdx(idx);
    setInspectHash(null);
    const line = text.split("\n").find((l) => {
      try {
        return (JSON.parse(l) as { index?: number }).index === idx;
      } catch {
        return false;
      }
    });
    if (!line) return;
    const e = JSON.parse(line) as Record<string, unknown>;
    const live = await entryHashOf(e as never);
    setInspectHash({ stored: String(e.entryHash ?? "—"), live });
  };

  useEffect(() => {
    onInspect(ENTRY_COUNT - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inspected = entries.find((e) => e.index === inspectIdx);

  return (
    <div className="space-y-8">
      {/* ---- 1. Interactive chain verifier ---- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">
            Tamper-evident, verifiable in your browser
          </h3>
          <span className="chip chip-lit">client-side</span>
        </div>
        <p className="mb-3 max-w-3xl text-xs leading-relaxed text-slate">
          Below is the task's <strong className="text-ink">real</strong> audit chain — all{" "}
          {ENTRY_COUNT} entries (chain-id reads, two mined dust transfers, receipt
          confirmations, the mempool-drop disclosures, the chain-anchor tx pinning the log
          head on-chain, report generation). Every hash recomputes{" "}
          <strong className="text-ink">entirely in your browser</strong> with SHA-256 over
          canonical (sorted-key) JSON — the exact algorithm of the task's{" "}
          <code className="font-mono">audit-log</code> CLI. Nothing is sent anywhere; type,
          paste, or delete and watch the verdict respond.
        </p>

        {/* chain strip */}
        <div className="mb-3 rounded-xl border border-hairline bg-porcelain p-3">
          <p className="smallcaps mb-2">chain strip — {entries.length} parsed entries</p>
          <div className="flex flex-wrap items-center gap-1">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: "#2456E6" }}
              title="genesis prevHash (64 zeros)"
            >
              G
            </span>
            {entries.map((e) => {
              const broken = brokenSet.has(e.index);
              return (
                <span key={e.index} className="flex items-center gap-1">
                  <span className="h-px w-2 bg-slate/40" aria-hidden />
                  <button
                    className="flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                    style={{ background: broken ? "#DC2626" : "#16A34A" }}
                    title={`entry #${e.index} — ${e.action}${broken ? " — BROKEN" : ""}`}
                    onClick={() => onInspect(e.index)}
                  >
                    {e.index}
                  </button>
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate">
            Click any node to inspect the entry. Green = hash recomputes and link holds;
            red = the verifier flagged it.
          </p>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          {verdict && verdict.ok && (
            <span className="chip chip-pass">
              CHAIN VALID — {verdict.checked}/{ENTRY_COUNT} entries
            </span>
          )}
          {verdict && !verdict.ok && (
            <span className="chip chip-fail">
              BROKEN AT ENTRY {firstBroken ? firstBroken.index : "—"}
            </span>
          )}
          {!verdict && <span className="chip chip-dim">verifying…</span>}
          <button className="btn-outline" onClick={() => setText(REAL_CHAIN_JSONL)}>
            Restore the real chain
          </button>
        </div>

        <textarea
          className="h-72 w-full rounded-lg border border-hairline bg-porcelain px-3 py-2 font-mono text-xs text-ink"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Audit chain (JSONL) to verify"
          spellCheck={false}
        />

        {verdict && !verdict.ok && (
          <div className="mt-2 rounded-xl border border-fail/40 bg-porcelain p-4">
            <p className="mb-2 text-sm font-semibold text-fail">
              {verdict.failures.length} failure{verdict.failures.length === 1 ? "" : "s"} in{" "}
              {verdict.checked} checked entries:
            </p>
            <ul className="space-y-1">
              {verdict.failures.map((f, n) => (
                <li key={n} className="font-mono text-xs text-ink">
                  entry <strong>#{f.index}</strong> — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* entry inspector */}
        <div className="mt-4 rounded-xl border border-hairline bg-porcelain p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-ink">Entry inspector</h4>
            <select
              className="rounded-lg border border-hairline bg-white px-2 py-1 font-mono text-xs text-ink"
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
              <span
                className={`chip ${inspectHash.stored === inspectHash.live ? "chip-pass" : "chip-fail"}`}
              >
                {inspectHash.stored === inspectHash.live ? "hash recomputes ✓" : "hash mismatch ✗"}
              </span>
            )}
          </div>
          {inspected && inspectHash && (
            <table className="data-table">
              <tbody>
                <tr>
                  <td className="font-semibold text-ink">stored entryHash</td>
                  <td className="break-all font-mono text-xs text-ink">{inspectHash.stored}</td>
                </tr>
                <tr>
                  <td className="font-semibold text-ink">recomputed live</td>
                  <td className="break-all font-mono text-xs text-ink">{inspectHash.live}</td>
                </tr>
                <tr>
                  <td className="font-semibold text-ink">action</td>
                  <td className="font-mono text-xs text-ink">
                    {(() => {
                      try {
                        return (JSON.parse(inspected.raw) as { action?: string }).action;
                      } catch {
                        return "—";
                      }
                    })()}
                  </td>
                </tr>
                <tr>
                  <td className="font-semibold text-ink">txHash</td>
                  <td className="break-all font-mono text-xs text-ink">
                    {(() => {
                      try {
                        const t = (JSON.parse(inspected.raw) as { txHash?: string | null }).txHash;
                        return t ? (
                          <a
                            className="text-accent hover:underline"
                            href={`${EXPLORER_TX}${t}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t}
                          </a>
                        ) : (
                          "—"
                        );
                      } catch {
                        return "—";
                      }
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          {!inspected && <p className="text-xs text-slate">No parseable entries in the textarea.</p>}
        </div>
      </section>

      {/* ---- 2. Red-team lab ---- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">Red-team the chain</h3>
          <span className="chip chip-lit">four attacks, live copies</span>
        </div>
        <p className="mb-3 max-w-3xl text-xs leading-relaxed text-slate">
          Each attack runs against a <strong className="text-ink">copy</strong> of the real
          chain — the original above is never touched. The verdict recomputes in your
          browser with the same verifier.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ATTACKS.map((a) => (
            <div key={a.id} className="rounded-xl border border-hairline bg-porcelain p-4">
              <p className="mb-1 text-sm font-semibold text-ink">{a.name}</p>
              <p className="mb-3 font-mono text-xs text-slate">{a.desc}</p>
              <button
                className="btn-outline"
                onClick={() => onAttack(a)}
                disabled={attackRunning !== null}
              >
                {attackRunning === a.id ? "Attacking…" : "Run attack on a copy"}
              </button>
            </div>
          ))}
        </div>

        {attack && (
          <div className="mt-3 rounded-xl border border-hairline bg-porcelain p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink">
                {attack.attack.name} — <span className="font-mono text-xs text-slate">{attack.attack.desc}</span>
              </p>
              <span className="chip chip-fail">
                BROKEN AT ENTRY {attack.verdict.failures[0]?.index ?? "—"}
              </span>
            </div>
            <ul className="mb-3 space-y-1">
              {attack.verdict.failures.slice(0, 6).map((f, n) => (
                <li key={n} className="font-mono text-xs text-ink">
                  entry <strong>#{f.index}</strong> — {f.reason}
                </li>
              ))}
              {attack.verdict.failures.length > 6 && (
                <li className="font-mono text-xs text-slate">
                  …and {attack.verdict.failures.length - 6} more
                </li>
              )}
            </ul>
            <p className="text-xs leading-relaxed text-slate">
              <strong className="text-ink">Why the chain catches it:</strong> {attack.attack.why}
            </p>
          </div>
        )}
      </section>

      {/* ---- 3. Verify our proof ---- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">Verify our proof</h3>
          <span className="chip chip-dim">the task's own chain</span>
        </div>
        <table className="data-table">
          <tbody>
            <tr>
              <td className="font-semibold text-ink">Entries</td>
              <td className="font-mono text-ink">{ENTRY_COUNT} (indices 0–{ENTRY_COUNT - 1})</td>
            </tr>
            <tr>
              <td className="font-semibold text-ink">Genesis prevHash</td>
              <td className="font-mono text-ink">{GENESIS}</td>
            </tr>
            <tr>
              <td className="font-semibold text-ink">Terminal entryHash (entry #{ENTRY_COUNT - 1})</td>
              <td className="break-all font-mono text-ink">{TERMINAL_ENTRY_HASH}</td>
            </tr>
            <tr>
              <td className="font-semibold text-ink">Algorithm</td>
              <td className="text-ink">SHA-256 over canonical (sorted-key, recursive) JSON — same as the CLI</td>
            </tr>
            <tr>
              <td className="font-semibold text-ink">On-chain spend</td>
              <td className="font-mono text-ink">0.000363512000063512 PHRS of the 0.15 budget</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-ink">Anchor transactions on Atlantic</h4>
            <button className="btn-outline" onClick={onCheckAnchors} disabled={anchorsLoading}>
              {anchorsLoading ? "Reading from Atlantic…" : "Confirm all three on Atlantic"}
            </button>
          </div>
          <p className="mb-2 text-xs text-slate">
            The two dust transfers (entries #10 and #12) and the chain-anchor tx (entry #21)
            are real, mined Atlantic transactions. The anchor tx's{" "}
            <strong className="text-ink">calldata is entry #20's entryHash</strong> — the live
            check below fetches the mined transaction and compares its input data to that
            hash. All checks are live, free reads against the public Atlantic RPC — no
            wallet, no signature.
          </p>
          <div className="overflow-x-auto">
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
                              <span className="chip chip-pass">input == entry #{ANCHOR_SOURCE.index} hash ✓</span>
                            ) : (
                              <span className="text-fail">{check.calldata ?? check.error ?? "—"}</span>
                            )
                          ) : (
                            <span className="text-slate">press “Confirm…”</span>
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
          <p className="mt-2 font-mono text-[11px] text-slate">
            anchored hash (entry #{ANCHOR_SOURCE.index}): {ANCHOR_SOURCE.hash}
          </p>
        </div>

        <div className="mt-4">
          <h4 className="mb-2 text-sm font-semibold text-ink">Reproduce everything offline</h4>
          <div className="code-block">
            cd tasks/t24-audit-log-agent
            <br />
            node bin/audit-log.mjs verify
            <br />
            node --test "test/*.test.mjs"
          </div>
          <p className="mt-2 text-xs text-slate">
            Run this in your own terminal — LIGHTKEEPER never executes it for you.{" "}
            <code className="font-mono">verify</code> replays the chain and also proves the
            negative: tampered <em>copies</em> fail naming the exact entry, while the
            original stays PASS.
          </p>
        </div>
      </section>

      <p className="text-xs text-slate">
        Tier C surface: computation happens in your browser; commands run in your terminal; the
        console never signs. {lamp.name} has no key, no signer, no broadcast path.
        LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only (688689).
      </p>
    </div>
  );
}
