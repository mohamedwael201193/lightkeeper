import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  FileWarning,
  Flame,
  ScrollText,
} from "lucide-react";
import type { Lamp } from "../types";
import { ARENA_BOARD, arenaTaskUrl, explorerAddress, explorerTx, shortenAddress } from "../types";
import Markdown from "./Markdown";
import TryPanel from "./TryPanel";

function SectionLabel({ n, title }: { n: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span className="font-display text-2xl font-bold text-accent">{n}</span>
      <h2 className="smallcaps !text-ink">{title}</h2>
    </div>
  );
}

/** Pull a readable scalar list of top-level config-ish keys from evidence. */
function evidenceConfig(ev: Record<string, unknown> | null): [string, string][] {
  if (!ev) return [];
  const skip = new Set([
    "runs",
    "transactions",
    "txs",
    "emitter_txs",
    "link_checks",
    "links_verified_http200",
    "honesty_notes",
    "contracts",
    "final_balances_wei",
    "gas_report",
    "watcher_runs",
    "artifacts",
    "links",
    "portal_share_link",
  ]);
  const rows: [string, string][] = [];
  for (const [k, v] of Object.entries(ev)) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      let s = String(v);
      if (s.length > 120) s = s.slice(0, 117) + "…";
      rows.push([k, s]);
    } else if (typeof v === "object" && !Array.isArray(v)) {
      const keys = Object.keys(v);
      if (keys.length <= 8 && keys.every((kk) => typeof (v as Record<string, unknown>)[kk] !== "object"))
        rows.push([k, keys.map((kk) => `${kk}=${String((v as Record<string, unknown>)[kk])}`).join(" · ")]);
    }
  }
  return rows.slice(0, 24);
}

interface RunRow {
  label: string;
  decision: string;
  tx_hash: string | null;
  block: string | number | null;
  log: string | null;
  explorer: string | null;
}

function evidenceRuns(ev: Record<string, unknown> | null): RunRow[] {
  if (!ev) return [];
  const raw = (ev.runs ?? ev.transactions ?? ev.watcher_runs ?? []) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const tx =
      (typeof o.tx_hash === "string" && o.tx_hash) ||
      (typeof o.explorer === "string" && o.explorer.match(/0x[0-9a-fA-F]{64}/)?.[0]) ||
      null;
    return {
      label: String(o.label ?? o.name ?? o.call ?? "run"),
      decision: String(o.decision ?? o.status ?? o.mode ?? "—"),
      tx_hash: tx,
      block: (o.block as string | number | null) ?? null,
      log: (o.log as string | null) ?? null,
      explorer: (typeof o.explorer === "string" && o.explorer) || null,
    };
  });
}

function evidenceContracts(ev: Record<string, unknown> | null): [string, string][] {
  if (!ev) return [];
  const c = ev.contracts as Record<string, { address?: string }> | undefined;
  if (!c || typeof c !== "object") return [];
  return Object.entries(c)
    .filter(([, v]) => v && typeof v.address === "string")
    .map(([k, v]) => [k, v.address as string]);
}

/**
 * Per-task flow view — 01 Configuration → 02 Execution trace → 03 History,
 * all fed by the task's real task.yaml / policy.yaml / evidence.json / run-logs.
 */
export default function TaskDetail({ lamp }: { lamp: Lamp }) {
  const [copied, setCopied] = useState(false);
  const lit = lamp.status === "shipped";
  const ev = lamp.evidence;
  const runs = evidenceRuns(ev);
  const configRows = evidenceConfig(ev);
  const contracts = evidenceContracts(ev);

  const downloadEvidence = () => {
    const blob = new Blob([JSON.stringify(lamp, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lamp.id.toLowerCase()}-${lamp.slug}-lamp.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySubmissionNote = async () => {
    const note = [
      `LIGHTKEEPER ${lamp.id} — ${lamp.name}`,
      `Status: ${lamp.submission_status}`,
      lamp.has_submission
        ? `SUBMISSION.md is written in tasks/${lamp.dir ?? lamp.id.toLowerCase()}/ — the founder files it on the Arena board.`
        : "SUBMISSION.md is not written yet by the task builder.",
      `Arena task: ${arenaTaskUrl(lamp.slug)}`,
    ].join("\n");
    await navigator.clipboard.writeText(note);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const decisionChip = (d: string) => {
    const up = d.toUpperCase();
    if (/ALLOW|PASS|SUCCESS|FIRE|OK|1\b/.test(up) && !/REFUSE|BLOCK|FAIL/.test(up))
      return <span className="chip chip-pass">{d}</span>;
    if (/BLOCK|REFUSE|FAIL|REVERT|0\b/.test(up))
      return <span className="chip chip-fail">{d}</span>;
    return <span className="chip chip-info">{d}</span>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-4xl px-5 pb-24 pt-8"
    >
      <a
        href="#/"
        className="mb-8 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate transition-colors hover:text-accent"
      >
        <ArrowLeft size={16} /> Back to the lamps
      </a>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate">
            {lamp.id} · {lamp.toolkit} · {lamp.tier} · {lamp.points} pts
          </div>
          <h1 className="wordmark mt-2 text-[clamp(1.7rem,4.5vw,2.8rem)]">{lamp.name}</h1>
        </div>
        <span className={`chip ${lit ? "chip-lit" : "chip-dim"} !px-4 !py-2`}>
          <Flame size={14} /> {lit ? "Lit" : "Dim"}
        </span>
      </div>

      {/* ── 01 · Configuration ─────────────────────────────────────── */}
      <section className="mb-2 rounded-2xl border border-hairline bg-paper p-6 md:p-8">
        <SectionLabel n="01" title="Configuration — real inputs & policy" />
        <p className="mb-5 text-xs text-slate">
          Source: <code className="font-mono">tasks/{lamp.dir ?? "—"}/task.yaml</code>
          {lamp.policy_yaml_text ? (
            <>
              {" "}· <code className="font-mono">policy.yaml</code>
            </>
          ) : null}
        </p>
        {lamp.task_config_text ? (
          <div className="code-block mb-5">{lamp.task_config_text}</div>
        ) : (
          <div className="empty-panel px-5 py-6 text-sm text-slate">
            The task builder hasn't written <code className="font-mono">task.yaml</code> yet.
          </div>
        )}
        {lamp.policy_yaml_text && (
          <>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-ink">
              Policy values
            </h3>
            <div className="code-block mb-5">{lamp.policy_yaml_text}</div>
          </>
        )}
        {configRows.length > 0 && (
          <>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-ink">
              Evidence-declared parameters
            </h3>
            <table className="data-table">
              <tbody>
                {configRows.map(([k, v]) => (
                  <tr key={k}>
                    <th className="font-mono normal-case tracking-normal" scope="row">
                      {k}
                    </th>
                    <td className="font-mono text-[13px] text-ink">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      <hr className="flow-rule my-2" />

      {/* ── 02 · Execution trace ───────────────────────────────────── */}
      <section className="mb-2 rounded-2xl border border-hairline bg-paper p-6 md:p-8">
        <SectionLabel n="02" title="Execution trace — real runs & receipts" />
        <p className="mb-5 text-xs text-slate">
          Source: <code className="font-mono">tasks/{lamp.dir ?? "—"}/evidence.json</code>
          {lamp.has_evidence_json ? "" : " (not written yet)"}
        </p>

        {contracts.length > 0 && (
          <>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-ink">
              Deployed contracts
            </h3>
            <table className="data-table mb-6">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map(([name, addr]) => (
                  <tr key={addr}>
                    <td className="font-semibold text-ink">{name}</td>
                    <td>
                      <a
                        href={explorerAddress(addr)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-mono text-[13px] text-accent hover:underline"
                      >
                        {shortenAddress(addr)} <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {runs.length > 0 ? (
          <>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-ink">
              Runs ({runs.length})
            </h3>
            <table className="data-table mb-6">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Decision</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <div className="font-semibold text-ink">{r.label}</div>
                      {(r.block || r.log) && (
                        <div className="mt-0.5 font-mono text-xs text-slate">
                          {r.block ? `block ${r.block}` : ""}
                          {r.block && r.log ? " · " : ""}
                          {r.log ? r.log : ""}
                        </div>
                      )}
                    </td>
                    <td>{decisionChip(r.decision)}</td>
                    <td>
                      {r.tx_hash ? (
                        <a
                          href={explorerTx(r.tx_hash)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-mono text-[13px] text-accent hover:underline"
                        >
                          {shortenAddress(r.tx_hash)} <ExternalLink size={12} />
                        </a>
                      ) : r.explorer ? (
                        <a
                          href={r.explorer}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
                        >
                          view <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-xs text-slate">no broadcast</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          lamp.txs.length === 0 && (
            <div className="empty-panel mb-6 flex items-center gap-3 px-5 py-6">
              <FileWarning size={18} className="shrink-0 text-golddeep" />
              <p className="text-sm text-slate">
                {lit
                  ? "Marked shipped with evidence that lists no run records — inspect the task folder."
                  : "No runs recorded yet. This lamp stays dim until the task builder lands real evidence."}
              </p>
            </div>
          )
        )}

        {lamp.txs.length > 0 && (
          <>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-ink">
              Transaction receipts ({lamp.txs.length})
            </h3>
            <ul className="space-y-2">
              {lamp.txs.map((t) => (
                <li key={t}>
                  <a
                    href={explorerTx(t)}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-3 rounded-xl border border-hairline bg-porcelain px-4 py-3 font-mono text-xs text-ink transition-colors hover:border-accent"
                  >
                    <span className="truncate">{t}</span>
                    <ExternalLink
                      size={14}
                      className="shrink-0 text-slate group-hover:text-accent"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <hr className="flow-rule my-2" />

      {/* ── ◈ · Try it live — rendered only when tasks/<slug> has a try/ module ── */}
      <TryPanel lamp={lamp} />

      {/* ── 03 · History ───────────────────────────────────────────── */}
      <section className="mb-2 rounded-2xl border border-hairline bg-paper p-6 md:p-8">
        <SectionLabel n="03" title="History — run logs" />
        <p className="mb-5 text-xs text-slate">
          Real tails of <code className="font-mono">run-logs/*</code> written by the task builder —
          never simulated.
        </p>
        {lamp.activity.length > 0 && (
          <ul className="mb-6 space-y-2.5">
            {lamp.activity.map((a, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-xl border border-hairline bg-porcelain p-4"
              >
                <ScrollText size={16} className="mt-0.5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-bold text-ink">{a.title}</span>
                    {a.at && <span className="font-mono text-[11px] text-slate">{a.at}</span>}
                  </div>
                  {a.detail && (
                    <div className="truncate font-mono text-xs text-slate">{a.detail}</div>
                  )}
                </div>
                {a.link && (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open on the Atlantic explorer"
                    className="shrink-0 rounded-full p-2 text-slate transition-colors hover:bg-tint hover:text-accent"
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {lamp.run_log_files.length > 0 ? (
          <div className="space-y-4">
            {lamp.run_log_files.map((f) => (
              <details key={f.name} className="rounded-xl border border-hairline bg-porcelain">
                <summary className="cursor-pointer px-4 py-3 font-mono text-[13px] font-semibold text-ink hover:text-accent">
                  {f.name}
                </summary>
                <div className="border-t border-hairline px-4 py-3">
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink">
                    {f.tail}
                  </pre>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="empty-panel px-5 py-6 text-sm text-slate">
            No run-log files yet — the task builder hasn't committed any.
          </div>
        )}
      </section>
      <hr className="flow-rule my-2" />

      {/* ── Builder's summary (markdown, rendered properly) ────────── */}
      <section className="mb-2 rounded-2xl border border-hairline bg-paper p-6 md:p-8">
        <SectionLabel n="✎" title="Builder's summary" />
        <p className="mb-5 text-xs text-slate">
          From <code className="font-mono">tasks/{lamp.dir ?? "—"}/README.md</code> — rendered as
          markdown, not raw text.
        </p>
        {lamp.readme_markdown ? (
          <Markdown source={lamp.readme_markdown} />
        ) : (
          <div className="empty-panel px-5 py-6 text-sm text-slate">
            The task builder hasn't written the README yet.
          </div>
        )}
      </section>
      <hr className="flow-rule my-2" />

      {/* ── Arena submission ───────────────────────────────────────── */}
      <section className="rounded-2xl border border-hairline bg-paper p-6 md:p-8">
        <SectionLabel n="▣" title="Arena submission" />
        <p className="mb-5 text-xs text-slate">
          From <code className="font-mono">tasks/{lamp.dir ?? "—"}/SUBMISSION.md</code>
        </p>
        <div className="mb-5">
          <span className={`chip ${lamp.has_submission ? "chip-pass" : "chip-dim"}`}>
            {lamp.submission_status}
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            onClick={() => window.open(arenaTaskUrl(lamp.slug), "_blank", "noreferrer")}
          >
            <ExternalLink size={16} /> Open Arena task board
          </button>
          <button className="btn-outline" onClick={copySubmissionNote}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy submission note"}
          </button>
          <button className="btn-outline" onClick={downloadEvidence}>
            Export lamp JSON
          </button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate">
          Standing rule: the assistant never submits on the founder's behalf — these packs are
          copy-paste-ready, and <span className="font-semibold text-ink">he files them himself</span>.
        </p>
      </section>

      <div className="mt-8 text-center font-mono text-xs text-slate">
        {ARENA_BOARD}/{lamp.slug}
      </div>
    </motion.div>
  );
}
