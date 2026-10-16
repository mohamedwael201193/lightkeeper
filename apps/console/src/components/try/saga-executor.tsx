/**
 * T06 Saga Executor — Tier C (CLI-native saga orchestration).
 *
 * "The saga that really failed": an interactive timeline of the canonical
 * forced-failure run (approve → lock → execute(0x0) → refund → revoke),
 * a live-receipt verifier (Tier A reads, costs nothing), the full-success
 * run for contrast, the crash-recovery run (killed mid-step at exit 137,
 * resumed to SUCCEEDED with one broadcast tx per step), a failure-forensics
 * panel (revert reason, finality depth, compensation latency — pure reads),
 * and a copy-paste reproduce panel.
 *
 * Every hash below is a REAL mined Atlantic tx, copied character-for-character
 * from tasks/t06-saga-executor/evidence.json. Nothing is simulated.
 * LIGHTKEEPER never signs here — reproduction happens in the visitor's own
 * terminal with their own key.
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import { EXPLORER_TX, rpcCall } from "../../hooks/useAtlantic";

interface SagaStep {
  id: string;
  n: string;
  title: string;
  detail: string;
  hash: string;
  block: number;
  /** "0x1" | "0x0" — what the mined receipt actually says. */
  expected: "0x1" | "0x0";
  gas: number;
  /** How this step is rendered: normal, the failure, or a compensation. */
  kind: "step" | "failure" | "compensation";
  /** What the executor classified and decided at this point. */
  decision: string;
}

const RUN_B: SagaStep[] = [
  {
    id: "approve",
    n: "1",
    title: "approve(fixture, 4000)",
    detail:
      "Granted the fixture a 4000-wei allowance — deliberately more than the 2000-wei lock, so the later revoke step is real work, not a no-op.",
    hash: "0x452acae1ec4335ecd0842672c97383b5671e1ad950150224f307dcd17a928ba7",
    block: 31482444,
    expected: "0x1",
    gas: 46663,
    kind: "step",
    decision: "Receipt 0x1 + gate check: allowance ≥ amount — advance.",
  },
  {
    id: "lock",
    n: "2",
    title: "lock(2000)",
    detail:
      "Locked 2000 wei of LKTEST dust into the fixture. Gate check confirmed the locked balance moved 0 → 2000.",
    hash: "0x0371814a1739f58698722db4915da1b718512c9bafcb347da3def4a6576f0eea",
    block: 31482492,
    expected: "0x1",
    gas: 85106,
    kind: "step",
    decision: "Receipt 0x1 + gate check: locked delta = 2000 — advance.",
  },
  {
    id: "execute",
    n: "3",
    title: "execute(minOut = 2001) — impossible",
    detail:
      "This step was DELIBERATELY CONSTRUCTED to fail: we asked execute() for minOut=2001 against a 2000-wei lock. Nothing about this can succeed. To make sure the failure actually reached the chain (cast's client-side eth_estimateGas refuses to broadcast reverting calls), it was sent with an explicit --gas-limit. The chain decided the rest.",
    hash: "0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05",
    block: 31482534,
    expected: "0x0",
    gas: 24231,
    kind: "failure",
    decision:
      "Mined receipt status 0x0 — classified PERMANENT. No retry (exactly one attempt), RUNNING → COMPENSATING.",
  },
  {
    id: "refund",
    n: "C1",
    title: "compensate: refund()",
    detail:
      "First compensating transaction: the fixture returned the locked 2000 wei. Balance gate confirmed every wei restored.",
    hash: "0xe6cac3114397487f6d1b1efec721af968ee8868e196a9d5f6437d35b9fbb60ca",
    block: 31482558,
    expected: "0x1",
    gas: 37560,
    kind: "compensation",
    decision: "Receipt 0x1 — compensation 1 of 2 confirmed.",
  },
  {
    id: "revoke",
    n: "C2",
    title: "compensate: approve(0) — allowance revoke",
    detail:
      "Second compensating transaction: revoked the residual allowance (approve(0)). Final on-chain state: locked = 0, allowance = 0.",
    hash: "0x0e80719119b7fb8781020e5a7fa0fcec01eeec167caa7329ac6781f1cb34759b",
    block: 31482599,
    expected: "0x1",
    gas: 24739,
    kind: "compensation",
    decision: "Receipt 0x1 — saga state COMPENSATED. Final: locked=0, allowance=0, settled=false.",
  },
];

const RUN_A = [
  { n: "1", title: "approve(fixture, 1000)", hash: "0x30183882c8021b6daa017b03d5eecca595bf7faa2128e25eb59ad530e1763a75", block: 31481355, gas: 46663 },
  { n: "2", title: "lock(1000)", hash: "0xe46a8c40db9656ecb37baf933f1d6044a0e13a03bfdf7e9e03b022d250256587", block: 31481383, gas: 80306 },
  { n: "3", title: "execute(minOut = 1000)", hash: "0x9c2598384dfdbfd688bbd42e4006308decd455a1940bac95da6d2c529100cd43", block: 31481413, gas: 25688 },
  { n: "4", title: "settle()", hash: "0xa13311d24cd0aff5eb91c389f14b22e9be8f9cab7958583d00d7785b09ca5873", block: 31481460, gas: 46830 },
];

/** Run C — the executor was hard-killed (exit 137) between approve's BROADCAST
 *  and CONFIRMING, then resumed from the state log. Every hash is a REAL mined
 *  Atlantic tx. The idempotency claim: approve appears with exactly ONE
 *  broadcast tx across both invocations — the resume re-read the receipt,
 *  never re-sent it. */
const RUN_C = [
  { n: "1", title: "approve(fixture, 1000) — broadcast before the crash", hash: "0x96d304d53c427e155d157a0234297f63b494c18f6317bf616a77bf9f88d16a14", block: 31486478, gas: 46663, note: "receipt re-read at resume" },
  { n: "2", title: "lock(1000)", hash: "0x609b2b06be22646c82d7b6bcacbac8170a38edbd0e9d53ff3675832e4c8bf0b6", block: 31486635, gas: 80306, note: "" },
  { n: "3", title: "execute(minOut = 1000)", hash: "0xd9e4fb6dc7c8d998ec0c532cb73211bd2ab927f04881f55ab0273db9c4e5cc62", block: 31486759, gas: 25688, note: "" },
  { n: "4", title: "settle()", hash: "0x9a93fe34fae224cf9ca3e229b3d90a52c94eeeb8379cc09c7f8cb2918f97ea75", block: 31486778, gas: 46830, note: "" },
];

/** Failure forensics for Run B — all pure reads, zero new spend. */
const FORENSICS = [
  { k: "Revert reason", v: "TestFixture: minOut exceeds locked balance", d: "Confirmed by replaying execute(2001) against block 31482533 — the exact pre-failure chain state. A pure eth_call read; nothing was sent." },
  { k: "Finality depth", v: "3,730 blocks", d: "The 0x0 receipt (block 31482534) measured 3,730 blocks deep — no re-org can move it." },
  { k: "Compensation latency", v: "24 / 41 blocks", d: "Failure @31482534 → refund @31482558 → revoke @31482599. The executor detected the 0x0, classified it permanent, and finished both compensations within 41 blocks." },
];

const REPRODUCE_CMD = `export PATH="$HOME/.foundry/bin:$PATH"
export ATLANTIC_RPC_URL="https://atlantic.dplabs-internal.com"   # your own RPC endpoint
export DEPLOYER_PRIVATE_KEY="<your-private-key>"                  # your own key — never shared
cd ~/workspace/lightkeeper/tasks/t06-saga-executor

# unit tests: receipt classifier, retry table, state machine, gates (no chain writes)
python3 scripts/saga.py --selftest

# full-success saga (dust wei)
python3 scripts/saga.py run-a 1000

# forced-failure saga -> compensation (dust wei)
python3 scripts/saga.py run-b 2000

# crash-recovery saga: hard-kills itself mid-step (exit 137 is the real crash),
# then resume replays the state log -> SUCCEEDED with one broadcast tx per step
python3 scripts/saga.py run-c 1000 --kill-after approve
python3 scripts/saga.py resume t06-run-c-<run-id>`;

function short(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-7)}`;
}

type VerifyState = Record<string, "checking" | "match" | "mismatch" | "error">;

export default function TrySagaExecutor({ lamp }: { lamp: Lamp }) {
  const [open, setOpen] = useState<string>("execute");
  const [verify, setVerify] = useState<VerifyState>({});
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  const verifyReceipts = async () => {
    setVerifying(true);
    const next: VerifyState = {};
    for (const s of RUN_B) {
      setVerify((v) => ({ ...v, [s.id]: "checking" }));
      try {
        const r = (await rpcCall("eth_getTransactionReceipt", [s.hash])) as {
          status?: string;
        } | null;
        next[s.id] =
          r && typeof r.status === "string" && r.status.toLowerCase() === s.expected.toLowerCase()
            ? "match"
            : "mismatch";
      } catch {
        next[s.id] = "error";
      }
      setVerify({ ...next });
    }
    setVerifying(false);
  };

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(REPRODUCE_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the text is still visible in the code block */
    }
  };

  return (
    <div className="space-y-6">
      {/* Tier C honesty header */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <p className="smallcaps mb-2">Tier C — CLI-native, read-only here</p>
        <p className="text-sm text-ink">
          <strong>{lamp.name}</strong>: the saga that really failed. Below is an
          interactive walkthrough of the canonical forced-failure run — a{" "}
          <strong>real mined 0x0 revert</strong>, detected by the executor and
          answered by <strong>real on-chain compensation transactions</strong>.
        </p>
        <p className="mt-2 text-xs text-slate">
          Saga orchestration runs in a terminal, not in this page — so the
          browser signs nothing here. LIGHTKEEPER never sees, holds, or asks
          for private keys. Reproduce it in your own terminal with your own key
          (panel below).
        </p>
      </div>

      {/* Honesty banner: constructed vs chain-decided */}
      <div className="rounded-xl border border-hairline bg-white p-4">
        <p className="smallcaps mb-2">What was constructed vs what the chain decided</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-porcelain p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-golddeep">We constructed</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-slate">
              <li>The impossible input: execute(minOut=2001) against a 2000-wei lock</li>
              <li>The explicit --gas-limit so cast's estimateGas couldn't swallow the failure client-side</li>
              <li>The compensation order (refund first, revoke second)</li>
            </ul>
          </div>
          <div className="rounded-lg bg-porcelain p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-pass">The chain decided</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-slate">
              <li>The receipt: <span className="font-mono">status 0x0</span> at block 31482534</li>
              <li>The gas burned: 24,231 — unrecoverable, reported honestly</li>
              <li>Both compensations mining with status 0x1 and restoring the balance</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Failure forensics — pure reads, zero new spend */}
      <div className="rounded-xl border border-hairline bg-white p-4">
        <p className="smallcaps mb-2">Failure forensics — read from the chain, never sent</p>
        <div className="grid gap-3 md:grid-cols-3">
          {FORENSICS.map((f) => (
            <div key={f.k} className="rounded-lg bg-porcelain p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-golddeep">{f.k}</p>
              <p className="mt-1 font-mono text-xs font-semibold text-ink">{f.v}</p>
              <p className="mt-1 text-xs text-slate">{f.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive timeline — the forced-failure run */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">
            Run B — forced failure → compensated{" "}
            <span className="chip chip-pass ml-1">COMPENSATED</span>
          </h3>
          <button
            className="btn-outline !min-h-0 !py-2 !px-3 text-xs"
            onClick={verifyReceipts}
            disabled={verifying}
          >
            {verifying ? "Checking Atlantic…" : "Verify receipts live"}
          </button>
        </div>
        <p className="mb-3 text-xs text-slate">
          Dust 2000 wei LKTEST · run id <span className="font-mono">t06-run-b-20261016-042903</span> ·
          the live check re-reads each receipt from Atlantic (free RPC read).
        </p>

        <div className="space-y-3">
          {RUN_B.map((s) => {
            const isOpen = open === s.id;
            const v = verify[s.id];
            return (
              <div
                key={s.id}
                className={`rounded-xl border bg-white ${
                  s.kind === "failure" ? "border-fail" : "border-hairline"
                }`}
              >
                <button
                  className="flex w-full items-center gap-3 p-4 text-left"
                  onClick={() => setOpen(isOpen ? "" : s.id)}
                  aria-expanded={isOpen}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      s.kind === "failure"
                        ? "bg-[#fdecec] text-fail"
                        : s.kind === "compensation"
                          ? "bg-[#e7f7ee] text-pass"
                          : "bg-tint text-accentdeep"
                    }`}
                  >
                    {s.kind === "failure" ? "✗" : s.kind === "compensation" ? "↩" : s.n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm font-semibold text-ink">
                      {s.title}
                    </span>
                    <span className="block font-mono text-xs text-slate">
                      block {s.block} · {short(s.hash)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {v === "checking" && <span className="text-xs text-slate">reading…</span>}
                    {v === "match" && <span className="chip chip-pass">live ✓</span>}
                    {v === "mismatch" && <span className="chip chip-fail">differs</span>}
                    {v === "error" && <span className="chip chip-info">unreachable</span>}
                    <span className={`chip ${s.expected === "0x0" ? "chip-fail" : "chip-pass"}`}>
                      {s.expected === "0x0" ? "0x0 reverted" : "0x1 confirmed"}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-hairline px-4 py-3">
                    <p className="text-sm text-slate">{s.detail}</p>
                    <p className="mt-2 text-xs text-slate">
                      <span className="font-bold text-ink">Executor decision: </span>
                      {s.decision}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <a
                        className="btn-outline !min-h-0 !py-1.5 !px-3 text-xs"
                        href={`${EXPLORER_TX}${s.hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Receipt on explorer ↗
                      </a>
                      <span className="font-mono text-xs text-slate">gas {s.gas.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Restoration verdict */}
        <div className="empty-panel mt-3 px-5 py-4">
          <p className="text-sm text-ink">
            <strong>Balance after compensation:</strong>{" "}
            <span className="font-mono">1,000,000 LKTEST → 1,000,000 LKTEST</span> — every wei of
            dust restored. <span className="chip chip-pass ml-1">locked = 0</span>{" "}
            <span className="chip chip-pass">allowance = 0</span>
          </p>
          <p className="mt-1 text-xs text-slate">
            What compensation can never recover: gas. The 0x0 burned 24,231 gas and both
            compensation txs cost gas too — accounted in evidence.json, spend 0.00238 of 0.15 PHRS.
          </p>
        </div>
      </div>

      {/* Run A — the full-success run, compact */}
      <div>
        <h3 className="mb-2 text-base font-bold text-ink">
          Run A — full success <span className="chip chip-pass ml-1">SUCCEEDED</span>
        </h3>
        <div className="overflow-x-auto rounded-xl border border-hairline bg-white">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Step</th>
                <th>Tx</th>
                <th>Block</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {RUN_A.map((s) => (
                <tr key={s.hash}>
                  <td className="font-mono">{s.n}</td>
                  <td className="font-mono">{s.title}</td>
                  <td>
                    <a
                      className="font-mono text-accent hover:underline"
                      href={`${EXPLORER_TX}${s.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(s.hash)}
                    </a>
                  </td>
                  <td className="font-mono">{s.block}</td>
                  <td>
                    <span className="chip chip-pass">0x1</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Run C — mid-step crash → resume */}
      <div>
        <h3 className="mb-2 text-base font-bold text-ink">
          Run C — killed mid-step, resumed to success{" "}
          <span className="chip chip-pass ml-1">SUCCEEDED</span>
        </h3>
        <p className="mb-3 text-xs text-slate">
          Dust 1000 wei LKTEST · run id{" "}
          <span className="font-mono">t06-run-c-20261016-063734</span> · the executor hard-killed
          itself (<span className="font-mono">os._exit(137)</span> — no cleanup, SIGKILL-like) between
          approve's <span className="font-mono">BROADCAST</span> and{" "}
          <span className="font-mono">CONFIRMING</span>. The resume replayed the state log, re-read
          the in-flight receipt, and finished the saga.{" "}
          <strong className="text-ink">
            One broadcast tx per step, even across death — the log proves it: approve carries exactly
            one BROADCAST line with a tx hash across both invocations.
          </strong>
        </p>
        <div className="overflow-x-auto rounded-xl border border-hairline bg-white">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Step</th>
                <th>Tx</th>
                <th>Block</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {RUN_C.map((s) => (
                <tr key={s.hash}>
                  <td className="font-mono">{s.n}</td>
                  <td className="font-mono">
                    {s.title}
                    {s.note && <span className="block text-[10px] text-pass">↩ {s.note}</span>}
                  </td>
                  <td>
                    <a
                      className="font-mono text-accent hover:underline"
                      href={`${EXPLORER_TX}${s.hash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(s.hash)}
                    </a>
                  </td>
                  <td className="font-mono">{s.block}</td>
                  <td>
                    <span className="chip chip-pass">0x1</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reproduce it — Tier C */}
      <div>
        <h3 className="mb-2 text-base font-bold text-ink">Reproduce it — your terminal, your key</h3>
        <div className="code-block whitespace-pre">{REPRODUCE_CMD}</div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button className="btn-outline" onClick={copyCmd}>
            {copied ? "Copied ✓" : "Copy commands"}
          </button>
          <p className="text-xs text-slate">
            The failure step is intentionally constructed (impossible minOut); the compensation is
            automatic. Every broadcast goes through flock and costs dust wei only.
          </p>
        </div>
      </div>

      <p className="text-xs text-slate">
        Full evidence: state logs, all 13 transactions, receipt-based spend accounting, and the
        manual runbook live in the repo at{" "}
        <span className="font-mono">tasks/t06-saga-executor/</span>.
      </p>
    </div>
  );
}
