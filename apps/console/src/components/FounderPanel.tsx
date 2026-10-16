import { useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, FileCode2, ScrollText } from "lucide-react";
import Markdown from "./Markdown";
import { useFounderMode, disableFounderMode } from "../hooks/useFounderMode";
import type { Lamp } from "../types";
import { ARENA_BOARD, arenaTaskUrl } from "../types";

const GH_RAW = "https://raw.githubusercontent.com/mohamedwael201193/lightkeeper/main";
const GH_BLOB = "https://github.com/mohamedwael201193/lightkeeper/blob/main";

function ghFolder(dir: string | null): string {
  return dir ? `tasks/${dir}` : "tasks/";
}

function rawUrl(lamp: Lamp, file: string): string | null {
  return lamp.dir ? `${GH_RAW}/tasks/${lamp.dir}/${file}` : null;
}

function blobUrl(lamp: Lamp, file: string): string | null {
  return lamp.dir ? `${GH_BLOB}/tasks/${lamp.dir}/${file}` : null;
}

function useFetchedMarkdown(url: string | null): { text: string | null; failed: boolean } {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setText(null);
    setFailed(false);
    if (!url) {
      setFailed(true);
      return;
    }
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { text, failed };
}

function useCopy(): { copied: string | null; copy: (key: string, text: string) => void } {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
      } catch {
        /* clipboard unavailable — the text is still visible */
      }
    },
  };
}

function FounderSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-paper p-6 md:p-8">
      <h2 className="smallcaps mb-4 !text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Pre({ text, maxHeight = 320 }: { text: string; maxHeight?: number }) {
  return (
    <pre
      className="overflow-auto rounded-lg border border-hairline bg-cream p-4 font-mono text-[11px] leading-relaxed text-ink"
      style={{ maxHeight }}
    >
      {text}
    </pre>
  );
}

/** Reusable VIDEO-GUIDE.md ✓/✗ chip — presence is checked live against the repo. */
export function VideoGuideChip({ lamp }: { lamp: Lamp }) {
  const { text, failed } = useFetchedMarkdown(rawUrl(lamp, "VIDEO-GUIDE.md"));
  const ready = text != null && !failed;
  return (
    <span className={`chip ${ready ? "chip-pass" : failed ? "chip-dim" : ""}`}>
      VIDEO-GUIDE.md {ready ? "✓" : failed ? "✗" : "…"}
    </span>
  );
}

/** SUBMISSION.md / VIDEO-GUIDE.md cockpit block: rendered markdown + copy button, blob-link fallback. */
function MarkdownPack({
  lamp,
  file,
  title,
  copyKey,
}: {
  lamp: Lamp;
  file: string;
  title: string;
  copyKey: string;
}) {
  const url = rawUrl(lamp, file);
  const { text, failed } = useFetchedMarkdown(url);
  const { copied, copy } = useCopy();
  const blob = blobUrl(lamp, file);
  const exists = text != null && !failed;

  return (
    <FounderSection title={title}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className={`chip ${exists ? "chip-pass" : failed ? "chip-dim" : ""}`}>
          {exists ? "✓ pack ready" : failed ? "✗ missing" : "loading…"}
        </span>
        {exists && (
          <button
            className="btn-outline"
            onClick={() => copy(copyKey, text!)}
            aria-live="polite"
          >
            {copied === copyKey ? <Check size={16} /> : <Copy size={16} />}
            {copied === copyKey ? "Copied" : `Copy ${file}`}
          </button>
        )}
      </div>
      {exists ? (
        <div className="max-h-[480px] overflow-auto rounded-lg border border-hairline p-4">
          <Markdown source={text!} />
        </div>
      ) : (
        <p className="text-xs text-slate">
          Couldn't fetch the file from the repo.{" "}
          {blob ? (
            <a
              href={blob}
              target="_blank"
              rel="noreferrer"
              className="text-accentdeep underline underline-offset-2"
            >
              Open {ghFolder(lamp.dir)}/{file} on GitHub <ExternalLink size={12} className="inline" />
            </a>
          ) : (
            "No task folder is mapped for this lamp."
          )}
        </p>
      )}
    </FounderSection>
  );
}

/**
 * FOUNDER face — only ever rendered when lk_founder==='1'.
 * Placed below the public task content, behind a dashed "founder tools" divider.
 */
export default function FounderPanel({ lamp }: { lamp: Lamp }) {
  const founder = useFounderMode();
  const { copied, copy } = useCopy();
  const [showEvidence, setShowEvidence] = useState(false);

  if (!founder) return null;

  const lampJson = JSON.stringify(lamp, null, 2);
  const downloadLamp = () => {
    const blob = new Blob([lampJson], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lamp-${lamp.slug}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const submissionNote =
    `LIGHTKEEPER · ${lamp.id} ${lamp.name}\n` +
    `Status: ${lamp.status === "shipped" ? "LIT" : "DIM"} · ${lamp.tier} · ${lamp.points} pts\n` +
    `Evidence: ${lamp.txs.length} tx(s), ${lamp.activity.length} activity item(s)\n` +
    `Submission pack: ${lamp.has_submission ? "ready" : "missing"} · Video guide: filming required\n` +
    `Route: https://lightkeeper-console.vercel.app/#/task/${lamp.slug}`;

  return (
    <div className="mx-auto mt-16 max-w-4xl px-5" data-founder-face>
      <hr className="border-t-2 border-dashed border-hairline" />
      <div className="flex flex-wrap items-center justify-between gap-3 py-6">
        <div>
          <p className="smallcaps !text-ink">Founder tools</p>
          <p className="mt-1 text-xs text-slate">
            Internal cockpit for {lamp.id} {lamp.name} — never indexed, never visible to visitors.
          </p>
        </div>
        <button className="btn-outline" onClick={() => disableFounderMode()}>
          Leave founder mode
        </button>
      </div>

      <div className="flex flex-col gap-6 pb-16">
        {/* ── content inventory ─────────────────────────────────────── */}
        <FounderSection title="Content inventory">
          <div className="flex flex-wrap gap-2">
            <span className={`chip ${lamp.has_submission ? "chip-pass" : "chip-dim"}`}>
              SUBMISSION.md {lamp.has_submission ? "✓" : "✗"}
            </span>
            <VideoGuideChip lamp={lamp} />
            <span className={`chip ${lamp.has_evidence_json ? "chip-pass" : "chip-dim"}`}>
              evidence.json {lamp.has_evidence_json ? "✓" : "✗"}
            </span>
            <span className={`chip ${lamp.run_log_files.length ? "chip-pass" : "chip-dim"}`}>
              run-logs: {lamp.run_log_files.length}
            </span>
            <span className={`chip ${lamp.txs.length ? "chip-pass" : "chip-dim"}`}>
              receipts: {lamp.txs.length}
            </span>
            <span className={`chip ${lamp.has_task_yaml ? "chip-pass" : "chip-dim"}`}>
              task.yaml {lamp.has_task_yaml ? "✓" : "✗"}
            </span>
          </div>
        </FounderSection>

        {/* ── submission pack ───────────────────────────────────────── */}
        <MarkdownPack lamp={lamp} file="SUBMISSION.md" title="Submission pack — SUBMISSION.md" copyKey="sub" />

        {/* ── video guide ───────────────────────────────────────────── */}
        <MarkdownPack lamp={lamp} file="VIDEO-GUIDE.md" title="Video guide — VIDEO-GUIDE.md" copyKey="vid" />

        {/* ── arena + export ────────────────────────────────────────── */}
        <FounderSection title="Arena board & export">
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary"
              onClick={() => window.open(arenaTaskUrl(lamp.slug), "_blank", "noreferrer")}
            >
              <ExternalLink size={16} /> Open Arena task board
            </button>
            <button className="btn-outline" onClick={() => copy("note", submissionNote)}>
              {copied === "note" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "note" ? "Copied" : "Copy submission note"}
            </button>
            <button className="btn-outline" onClick={downloadLamp}>
              <Download size={16} /> Export lamp JSON
            </button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate">
            Standing rule: the assistant never submits on the founder's behalf — these packs are
            copy-paste-ready, and he files them himself. Board root:{" "}
            <a href={ARENA_BOARD} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {ARENA_BOARD}
            </a>
          </p>
        </FounderSection>

        {/* ── internal notes ────────────────────────────────────────── */}
        <FounderSection title="Internal notes — raw config">
          <div className="flex flex-col gap-4">
            {lamp.task_config_text ? (
              <details>
                <summary className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                  <FileCode2 size={15} /> task.yaml (raw)
                </summary>
                <Pre text={lamp.task_config_text} />
              </details>
            ) : (
              <p className="text-xs text-slate">No task.yaml committed for this task.</p>
            )}
            {lamp.policy_yaml_text ? (
              <details>
                <summary className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                  <FileCode2 size={15} /> policy.yaml (raw)
                </summary>
                <Pre text={lamp.policy_yaml_text} />
              </details>
            ) : null}
          </div>
        </FounderSection>

        <FounderSection title="Internal notes — full README">
          <div className="max-h-[560px] overflow-auto rounded-lg border border-hairline p-4">
            <Markdown source={lamp.readme_markdown || lamp.readme_summary || "No README recorded."} />
          </div>
        </FounderSection>

        <FounderSection title="Internal notes — run-log tails">
          {lamp.run_log_files.length === 0 ? (
            <p className="text-xs text-slate">No run-log files recorded.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {lamp.run_log_files.map((f) => (
                <details key={f.name}>
                  <summary className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                    <ScrollText size={15} /> <span className="font-mono text-xs">{f.name}</span>
                  </summary>
                  <Pre text={f.tail} />
                </details>
              ))}
            </div>
          )}
        </FounderSection>

        <FounderSection title="Internal notes — raw evidence params">
          <button className="btn-outline mb-4" onClick={() => setShowEvidence((v) => !v)}>
            {showEvidence ? "Hide" : "Show"} raw evidence.json
          </button>
          {showEvidence && (
            <Pre text={lamp.evidence ? JSON.stringify(lamp.evidence, null, 2) : "No evidence.json recorded."} maxHeight={480} />
          )}
        </FounderSection>
      </div>
    </div>
  );
}
