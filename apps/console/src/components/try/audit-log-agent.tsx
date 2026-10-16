/**
 * T24 — Audit-Log Agent "try it live" (Tier C: browser-verifiable + honest CLI).
 *
 * The visitor gets the task's REAL hash-chained audit log (15 entries, chain-id
 * reads, two mined dust transfers, receipt confirmations, mempool-drop
 * disclosure, report generation) prefilled in a textarea. Every hash recomputes
 * client-side with SHA-256 over canonical (sorted-key) JSON — the exact same
 * algorithm as the task's `audit-log` CLI — and the verifier mirrors its
 * `verify` command: broken prevHash link, entryHash mismatch, missing fields.
 *
 * The differentiator: a one-character tamper demo. Flip a single character in
 * a COPY of the chain and the verdict names the broken entry — visitors FEEL
 * tamper-evidence instead of reading about it.
 *
 * "Verify our proof" pins the chain to the two real mined anchor transactions
 * on Atlantic (explorer links + a live, free eth_getTransactionReceipt check)
 * and gives the exact offline CLI to reproduce everything. LIGHTKEEPER never
 * sees, holds, or asks for private keys. Testnet only (688689).
 */
import { useEffect, useRef, useState } from "react";
import type { Lamp } from "../../types";
import { EXPLORER_TX, rpcCall } from "../../hooks/useAtlantic";

/** The task's real 15-entry chain — verbatim from tasks/t24-audit-log-agent/state/audit-log.jsonl. */
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
{"index":14,"timestamp":"2026-10-16T05:13:57.554Z","actor":"lk-t24-agent","action":"report:generate","params":{"wallet":"0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3","range":{"from":31479699,"to":31483698,"tip":31483702,"method":"date→block via live avg block time 1.19s","coverageNote":"native-transfer block scan capped at most-recent 4000 blocks (31479699–31483698); ERC-20/approval logs scanned over full requested range. Requested range was 31474623–31483698."},"totals":{"transfersIn":1,"transfersOut":116,"inPhrs":"0.05","outPhrs":"0.174686666666666667","erc20Transfers":0,"approvals":0,"contractInteractions":90,"swapsDetected":0,"gasPaidPhrs":"0.023225127018638487","failedTx":7},"files":["audit-report-2026-10-16T05-13-57.md","audit-report-2026-10-16T05-13-57.csv","audit-report-2026-10-16T05-13-57.pdf","chain-scan-2026-10-16T05-13-57.json"]},"txHash":null,"note":"wallet activity report generated from live RPC","prevHash":"9f08a4ffaea527610be001b77266c3c1d2b48f3f92540ff8bea67387b63da22c","entryHash":"e19bba30b6044bf14f1d2a09bff004a9c400ddc75e9b47c1c5742896983bd237"}`;

const GENESIS = "0".repeat(64);
const TERMINAL_ENTRY_HASH = "e19bba30b6044bf14f1d2a09bff004a9c400ddc75e9b47c1c5742896983bd237";

const ANCHORS = [
  {
    label: "dust transfer 1 — log entry #10",
    hash: "0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1",
    block: 31483610,
  },
  {
    label: "dust transfer 2 — log entry #12",
    hash: "0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68",
    block: 31483646,
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

/**
 * Deterministic tamper: flip ONE character in a COPY of entry #12
 * ("valuePhrs":"0.0001" → "0.0002"). The original constant is never touched.
 */
function tamperCopy(): string {
  const lines = REAL_CHAIN_JSONL.split("\n");
  const idx = lines.findIndex((l) => {
    try {
      return (JSON.parse(l) as { index?: number }).index === 12;
    } catch {
      return false;
    }
  });
  if (idx === -1) return REAL_CHAIN_JSONL;
  const flipped = lines[idx].replace('"valuePhrs":"0.0001"', '"valuePhrs":"0.0002"');
  lines[idx] = flipped === lines[idx] ? lines[idx].replace("0.0001", "0.0002") : flipped;
  return lines.join("\n");
}

interface AnchorCheck {
  hash: string;
  status: string;
  block: string;
  error: string | null;
}

async function checkAnchor(hash: string): Promise<AnchorCheck> {
  try {
    const r = (await rpcCall("eth_getTransactionReceipt", [hash])) as {
      status?: string;
      blockNumber?: string;
    } | null;
    if (!r) return { hash, status: "—", block: "—", error: "no receipt returned (tx not found)" };
    return {
      hash,
      status: r.status ?? "—",
      block: r.blockNumber ? String(Number(BigInt(r.blockNumber))) : "—",
      error: null,
    };
  } catch (e) {
    return { hash, status: "—", block: "—", error: e instanceof Error ? e.message : String(e) };
  }
}

export default function TryAudit({ lamp }: { lamp: Lamp }) {
  const [text, setText] = useState(REAL_CHAIN_JSONL);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [tamper, setTamper] = useState<{ verdict: Verdict; flippedLine: string } | null>(null);
  const [anchors, setAnchors] = useState<AnchorCheck[] | null>(null);
  const [anchorsLoading, setAnchorsLoading] = useState(false);
  const runRef = useRef(0);

  // Re-verify on every keystroke — SHA-256 of 15 short lines is instant.
  useEffect(() => {
    const run = ++runRef.current;
    verifyChain(text).then((v) => {
      if (runRef.current === run) setVerdict(v);
    });
  }, [text]);

  const onTamper = async () => {
    const copy = tamperCopy();
    const v = await verifyChain(copy);
    const flippedLine = copy.split("\n").find((l) => {
      try {
        return (JSON.parse(l) as { index?: number }).index === 12;
      } catch {
        return false;
      }
    });
    setTamper({ verdict: v, flippedLine: flippedLine ?? "" });
  };

  const onCheckAnchors = async () => {
    setAnchorsLoading(true);
    const results = await Promise.all(ANCHORS.map((a) => checkAnchor(a.hash)));
    setAnchors(results);
    setAnchorsLoading(false);
  };

  const firstBroken = verdict && !verdict.ok ? verdict.failures[0] : null;

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
          Below is the task's <strong className="text-ink">real</strong> audit chain — all 15
          entries (chain-id reads, two mined dust transfers, receipt confirmations, the
          mempool-drop disclosure, report generation). Every hash recomputes{" "}
          <strong className="text-ink">entirely in your browser</strong> with SHA-256 over
          canonical (sorted-key) JSON — the exact algorithm of the task's{" "}
          <code className="font-mono">audit-log</code> CLI. Nothing is sent anywhere; type,
          paste, or delete and watch the verdict respond.
        </p>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          {verdict && verdict.ok && (
            <span className="chip chip-pass">CHAIN VALID — {verdict.checked}/15 entries</span>
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
          <button className="btn-outline" onClick={onTamper}>
            Tamper one character in a copy (entry #12)
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

        {tamper && (
          <div className="mt-2 rounded-xl border border-hairline bg-porcelain p-4">
            <p className="mb-2 text-sm font-semibold text-ink">
              Tamper demo — one character flipped in a <em>copy</em>
            </p>
            <div className="code-block mb-2 text-xs">
              {"…\"index\":12,\"action\":\"tx:dust-send-2\",\"params\":{\"valuePhrs\":\"0.0002\"…"}
              <br />
              <span className="text-slate">— "0.0001" became "0.0002". Nothing else changed.</span>
            </div>
            <p className="mb-2 text-xs text-slate">
              The original chain above is untouched. The copy verifies:
            </p>
            <span className="chip chip-fail">
              BROKEN AT ENTRY {tamper.verdict.failures[0]?.index ?? "—"}
            </span>
            <ul className="mt-2 space-y-1">
              {tamper.verdict.failures.map((f, n) => (
                <li key={n} className="font-mono text-xs text-ink">
                  entry <strong>#{f.index}</strong> — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---- 2. Verify our proof ---- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">Verify our proof</h3>
          <span className="chip chip-dim">the task's own chain</span>
        </div>
        <table className="data-table">
          <tbody>
            <tr>
              <td className="font-semibold text-ink">Entries</td>
              <td className="font-mono text-ink">15 (indices 0–14)</td>
            </tr>
            <tr>
              <td className="font-semibold text-ink">Genesis prevHash</td>
              <td className="font-mono text-ink">{GENESIS}</td>
            </tr>
            <tr>
              <td className="font-semibold text-ink">Terminal entryHash (entry #14)</td>
              <td className="break-all font-mono text-ink">{TERMINAL_ENTRY_HASH}</td>
            </tr>
            <tr>
              <td className="font-semibold text-ink">Algorithm</td>
              <td className="text-ink">SHA-256 over canonical (sorted-key, recursive) JSON — same as the CLI</td>
            </tr>
            <tr>
              <td className="font-semibold text-ink">On-chain spend</td>
              <td className="font-mono text-ink">0.000242000000042 PHRS of the 0.15 budget</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-ink">Anchor transactions on Atlantic</h4>
            <button className="btn-outline" onClick={onCheckAnchors} disabled={anchorsLoading}>
              {anchorsLoading ? "Reading receipts…" : "Confirm both mined on Atlantic"}
            </button>
          </div>
          <p className="mb-2 text-xs text-slate">
            The two dust transfers the log records (entries #10 and #12) are real, mined
            Atlantic transactions. The receipt check is a live, free read against the public
            Atlantic RPC — no wallet, no signature.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Anchor</th>
                <th>Explorer</th>
                <th className="text-right">Receipt status</th>
                <th className="text-right">Block</th>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
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
            negative: a tampered <em>copy</em> fails naming the exact entry, while the original
            stays PASS.
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
