import { ArrowLeft, Check, Download, ExternalLink } from "lucide-react";
import { useFounderMode, disableFounderMode } from "../hooks/useFounderMode";
import { VideoGuideChip } from "./FounderPanel";
import type { Lamp, LampsData } from "../types";
import { arenaTaskUrl, taskRoute } from "../types";

const GH_TREE = "https://github.com/mohamedwael201193/lightkeeper/tree/main/tasks";

function ghFolderUrl(lamp: Lamp): string | null {
  return lamp.dir ? `${GH_TREE}/${lamp.dir}` : null;
}

/**
 * FOUNDER cockpit — only ever rendered when lk_founder==='1'.
 * 28-row ops table + bulk JSON export. Never linked from public chrome.
 */
export default function FounderCockpit({ data }: { data: LampsData }) {
  const founder = useFounderMode();
  if (!founder) return null;

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(data.tasks, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lightkeeper-lamps.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-12" data-founder-face>
      <a href="#/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate hover:text-ink">
        <ArrowLeft size={16} /> Back to the console
      </a>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="smallcaps !text-ink">Founder cockpit</p>
          <p className="mt-2 text-xs text-slate">
            All 28 lamps, one table. Quick packs, arena links, GitHub folders. Nothing here is
            linked from the public site and this page is never indexed.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={exportAll}>
            <Download size={16} /> Export all lamp JSON
          </button>
          <button className="btn-outline" onClick={() => disableFounderMode()}>
            Leave founder mode
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-hairline bg-paper">
        <table className="w-full min-w-[940px] text-left text-xs">
          <thead>
            <tr className="border-b border-hairline text-slate">
              <th className="px-4 py-3 font-semibold">Task</th>
              <th className="px-4 py-3 font-semibold">State</th>
              <th className="px-4 py-3 font-semibold">Evidence</th>
              <th className="px-4 py-3 font-semibold">Pack</th>
              <th className="px-4 py-3 font-semibold">Video guide</th>
              <th className="px-4 py-3 font-semibold">Evidence count</th>
              <th className="px-4 py-3 font-semibold">Links</th>
            </tr>
          </thead>
          <tbody>
            {data.tasks.map((t) => (
              <tr key={t.slug} className="border-b border-hairline last:border-0 hover:bg-cream/60">
                <td className="px-4 py-3">
                  <div className="font-mono text-[11px] text-slate">{t.id}</div>
                  <div className="font-semibold text-ink">{t.name}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`chip ${t.status === "shipped" ? "chip-pass" : "chip-dim"}`}>
                    {t.status === "shipped" ? "LIT" : "DIM"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`chip ${t.has_evidence_json ? "chip-pass" : "chip-dim"}`}>
                    {t.has_evidence_json ? "✓" : "✗"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`chip ${t.has_submission ? "chip-pass" : "chip-dim"}`}>
                    {t.has_submission ? "✓" : "✗"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <VideoGuideChip lamp={t} />
                </td>
                <td className="px-4 py-3">
                  <span className={`chip ${t.txs.length ? "chip-pass" : "chip-dim"}`}>
                    {t.txs.length} tx{t.txs.length === 1 ? "" : "s"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={`${taskRoute(t)}?founder=1`}
                      className="inline-flex items-center gap-1 text-accentdeep underline underline-offset-2"
                    >
                      task page
                    </a>
                    <a
                      href={arenaTaskUrl(t.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-slate hover:text-ink"
                    >
                      arena <ExternalLink size={12} />
                    </a>
                    {ghFolderUrl(t) && (
                      <a
                        href={ghFolderUrl(t)!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-slate hover:text-ink"
                      >
                        github <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-xs text-slate">
        <Check size={12} className="mr-1 inline" />
        Standing rule: the assistant never submits on the founder's behalf — packs are
        copy-paste-ready; he files them himself on the arena board.
      </p>
    </div>
  );
}
