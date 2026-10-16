import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, Flame } from "lucide-react";
import type { Lamp } from "../types";
import { explorerAddress, explorerTx, shortenAddress } from "../types";
import TryPanel from "./TryPanel";
import FounderPanel from "./FounderPanel";

function SectionLabel({ title }: { title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h2 className="smallcaps !text-ink">{title}</h2>
    </div>
  );
}

/** Curated per-task copy — authored per lamp by the content pass.
 *  Contract (apps/console/src/data/copy/<slug>.json):
 *  { "one_liner": "...", "what_it_does": "max 3 sentences",
 *    "config_plain": [{ "label": "…", "value": "…" }] }
 *  Missing file → safe fallbacks; the page never crashes. */
interface TaskCopy {
  one_liner: string;
  what_it_does: string;
  config_plain: { label: string; value: string }[];
}

const copyModules = import.meta.glob("../data/copy/*.json", {
  eager: true,
}) as Record<string, { default: TaskCopy }>;

function taskCopy(lamp: Lamp): TaskCopy {
  const loaded = copyModules[`../data/copy/${lamp.slug}.json`]?.default;
  const blank: TaskCopy = { one_liner: "", what_it_does: "", config_plain: [] };
  const c = loaded ?? blank;
  return {
    one_liner: c.one_liner || lamp.readme_summary || "",
    what_it_does: c.what_it_does || "",
    config_plain: Array.isArray(c.config_plain) ? c.config_plain.slice(0, 8) : [],
  };
}

interface RunRow {
  label: string;
  decision: string;
  tx_hash: string | null;
  block: string | number | null;
  explorer: string | null;
}

/** Runs table — outcomes only. No log fragments, no tails, no raw text dumps. */
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
 * PUBLIC task page (§0C two-faces restructure).
 * Hero → Try it live → On-chain proof → How it's configured → What it does.
 * Nothing founder-addressed here: no YAML dumps, no log tails, no README dump,
 * no Arena panel, no submission tooling. Outcomes + receipts only.
 */
export default function TaskDetail({ lamp }: { lamp: Lamp }) {
  const lit = lamp.status === "shipped";
  const ev = lamp.evidence;
  const runs = evidenceRuns(ev);
  const contracts = evidenceContracts(ev);
  const copy = taskCopy(lamp);
  const hasProof = contracts.length > 0 || runs.length > 0 || lamp.txs.length > 0;

  const decisionChip = (d: string) => {
    const up = d.toUpperCase();
    if (/ALLOW|PASS|SUCCESS|FIRE|OK|1\b/.test(up) && !/REFUSE|BLOCK|FAIL/.test(up))
      return <span className="chip chip-pass">{d}</span>;
    if (/BLOCK|REFUSE|FAIL|REVERT|0\b/.test(up))
      return <span className="chip chip-fail">{d}</span>;
    return <span className="chip chip-info">{d}</span>;
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-4xl px-5 pb-24 pt-8"
      >
      {/* ── back ─────────────────────────────────────────────────── */}
      <a
        href="#/"
        className="mb-8 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate transition-colors hover:text-accent"
      >
        <ArrowLeft size={16} /> Back to the lamps
      </a>

      {/* ── hero ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate">
            {lamp.id} · {lamp.toolkit} · {lamp.tier} · {lamp.points} pts
          </div>
          <h1 className="wordmark mt-2 text-[clamp(1.7rem,4.5vw,2.8rem)]">{lamp.name}</h1>
          {copy.one_liner && (
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink">
              {copy.one_liner}
            </p>
          )}
        </div>
        <span className={`chip ${lit ? "chip-lit" : "chip-dim"} !px-4 !py-2`}>
          <Flame size={14} /> {lit ? "Lit" : "Dim"}
        </span>
      </div>

      {/* ── ◈ · Try it live — with your own wallet ─────────────────── */}
      <TryPanel lamp={lamp} />

      {/* ── On-chain proof ───────────────────────────────────────── */}
      <section className="mb-2 rounded-2xl border border-hairline bg-paper p-6 md:p-8">
        <SectionLabel title="On-chain proof" />
        <p className="mb-5 text-xs text-slate">
          Everything below happened on the Atlantic testnet and is clickable on the explorer.
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

        {runs.length > 0 && (
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
                      {r.block && (
                        <div className="mt-0.5 font-mono text-xs text-slate">
                          block {r.block}
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
        )}

        {lamp.txs.length > 0 && (
          <>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-ink">
              Transaction receipts ({lamp.txs.length})
            </h3>
            <ul className={`space-y-2 ${hasProof ? "" : "mb-0"}`}>
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

        {!hasProof && (
          <div className="empty-panel px-5 py-6 text-sm text-slate">
            No runs recorded yet.{!lit ? " This lamp stays dim until real evidence lands." : ""}
          </div>
        )}
      </section>
      <hr className="flow-rule my-2" />

      {/* ── How it's configured ──────────────────────────────────── */}
      <section className="mb-2 rounded-2xl border border-hairline bg-paper p-6 md:p-8">
        <SectionLabel title="How it's configured" />
        <p className="mb-5 text-xs text-slate">
          Configured in plain words — nothing hard-coded.
        </p>
        {copy.config_plain.length > 0 ? (
          <table className="data-table">
            <tbody>
              {copy.config_plain.map((row) => (
                <tr key={row.label}>
                  <th className="normal-case tracking-normal" scope="row">
                    {row.label}
                  </th>
                  <td className="text-[13px] text-ink">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-panel px-5 py-6 text-sm text-slate">
            Parameters not recorded yet — they appear here once reviewed.
          </div>
        )}
      </section>
      <hr className="flow-rule my-2" />

      {/* ── What it does ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-hairline bg-paper p-6 md:p-8">
        <SectionLabel title="What it does" />
        {copy.what_it_does ? (
          <p className="max-w-3xl text-[15px] leading-relaxed text-ink">{copy.what_it_does}</p>
        ) : (
          <div className="empty-panel px-5 py-6 text-sm text-slate">
            A plain-language description is being written — the on-chain proof above stands on its
            own.
          </div>
        )}
      </section>
      </motion.div>
      {/* FOUNDER face — renders only when lk_founder==='1'; public template ends above */}
      <FounderPanel lamp={lamp} />
    </>
  );
}
