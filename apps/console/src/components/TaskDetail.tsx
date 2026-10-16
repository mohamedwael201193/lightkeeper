import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Copy, ExternalLink, FileWarning, Flame } from "lucide-react";
import type { Lamp } from "../types";
import { ARENA_BOARD, EXPLORER, arenaTaskUrl } from "../types";
import OctButton from "./OctButton";

/** Task detail — README summary, evidence links, SUBMISSION.md status. Deep-linkable. */
export default function TaskDetail({ lamp }: { lamp: Lamp }) {
  const [copied, setCopied] = useState(false);
  const lit = lamp.status === "shipped";

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
    // The console is read-only: we surface what the task builder recorded.
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-4xl px-5 pb-24 pt-28"
    >
      <a
        href="#/"
        className="mb-8 inline-flex min-h-[44px] items-center gap-2 text-sm text-white/70 transition-colors hover:text-gold-soft"
      >
        <ArrowLeft size={16} /> Back to the lamps
      </a>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold-soft">
            {lamp.id} · {lamp.toolkit} · {lamp.tier}
          </div>
          <h1 className="display-section mt-2 text-[clamp(1.6rem,5vw,3rem)]">{lamp.name}</h1>
        </div>
        <span
          className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] ${
            lit ? "bg-gold text-abyss-darker" : "border border-white/30 text-white/70"
          }`}
        >
          <Flame size={14} />
          {lit ? "Lit" : "Dim"}
        </span>
      </div>

      {/* evidence receipts */}
      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-[0.25em] text-white/80">
          On-chain evidence
        </h2>
        <p className="mb-4 text-xs text-white/50">
          Source: <code>tasks/{lamp.dir ?? "—"}/evidence.json</code>
          {lamp.has_evidence_json ? "" : " (not written yet)"}
        </p>
        {lamp.txs.length > 0 ? (
          <ul className="space-y-2">
            {lamp.txs.map((t) => (
              <li key={t}>
                <a
                  href={`${EXPLORER}/tx/${t}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-abyss-deep/50 px-4 py-3 font-mono text-xs text-white/80 transition-colors hover:border-gold/50"
                >
                  <span className="truncate">
                    {t.slice(0, 12)}…{t.slice(-10)}
                  </span>
                  <ExternalLink size={14} className="shrink-0 text-white/50 group-hover:text-gold" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-panel flex items-center gap-3 px-5 py-6">
            <FileWarning size={18} className="shrink-0 text-gold-soft" />
            <p className="text-sm text-white/65">
              {lit
                ? "Marked shipped with evidence that lists no transaction hashes — inspect the task folder."
                : "No on-chain receipts yet. This lamp stays dim until the task builder lands real evidence."}
            </p>
          </div>
        )}
      </section>

      {/* README summary */}
      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-[0.25em] text-white/80">
          Builder's summary
        </h2>
        <p className="mb-4 text-xs text-white/50">
          From <code>tasks/{lamp.dir ?? "—"}/README.md</code>
        </p>
        {lamp.readme_summary ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-white/85">
            {lamp.readme_summary}
          </p>
        ) : (
          <div className="empty-panel px-5 py-6 text-sm text-white/60">
            The task builder hasn't written the README yet — the task folder
            {lamp.dir ? (
              <>
                {" "}(<code>tasks/{lamp.dir}</code>)
              </>
            ) : (
              " (not even created)"
            )}{" "}
            is still being filled.
          </div>
        )}
      </section>

      {/* submission status */}
      <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-[0.25em] text-white/80">
          Arena submission
        </h2>
        <p className="mb-4 text-xs text-white/50">
          From <code>tasks/{lamp.dir ?? "—"}/SUBMISSION.md</code>
        </p>
        <div className="mb-5 flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] ${
              lamp.has_submission ? "bg-gold/20 text-gold-soft" : "border border-white/25 text-white/60"
            }`}
          >
            {lamp.submission_status}
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          <OctButton
            variant="gold"
            onClick={() => window.open(arenaTaskUrl(lamp.slug), "_blank", "noreferrer")}
          >
            <ExternalLink size={16} /> Open Arena task board
          </OctButton>
          <OctButton variant="porcelain" onClick={copySubmissionNote}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy submission note"}
          </OctButton>
          <OctButton variant="ghost" onClick={downloadEvidence}>
            Export lamp JSON
          </OctButton>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-white/45">
          Standing rule: the assistant never submits on the founder's behalf — these packs are
          copy-paste-ready, and <span className="text-white/70">he files them himself</span>.
        </p>
      </section>

      <div className="text-center text-xs tracking-[0.25em] text-white/35">
        {ARENA_BOARD}/{lamp.slug}
      </div>
    </motion.div>
  );
}
