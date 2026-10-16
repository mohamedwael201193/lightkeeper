import { ExternalLink, FileText } from "lucide-react";
import type { Lamp, LampActivity } from "../types";

/** Keeper's log — activity feed fed ONLY by real evidence.json events. */
export default function ActivityFeed({ lamps }: { lamps: Lamp[] }) {
  const events: (LampActivity & { lampId: string })[] = lamps
    .flatMap((l) => l.activity.map((a) => ({ ...a, lampId: l.id })))
    .slice(0, 24);

  return (
    <section id="activity" className="scroll-mt-32 border-t border-hairline bg-porcelain">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <div className="mb-8">
          <h2 className="smallcaps mb-3">Keeper's log</h2>
          <p className="wordmark text-[clamp(1.5rem,3vw,2.2rem)]">Activity</p>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate">
            Every entry is a real event from a task's{" "}
            <code className="font-mono text-accentdeep">evidence.json</code>. Nothing is simulated.
          </p>
        </div>

        {events.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {events.map((e, i) => (
              <li
                key={`${e.lampId}-${i}-${e.title}`}
                className="flex items-start gap-4 rounded-2xl border border-hairline bg-paper p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint text-accent">
                  <FileText size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
                      {e.lampId}
                    </span>
                    {e.at && <span className="font-mono text-[11px] text-slate">{e.at}</span>}
                  </div>
                  <div className="truncate text-sm font-semibold text-ink">{e.title}</div>
                  {e.detail && (
                    <div className="truncate font-mono text-xs text-slate">{e.detail}</div>
                  )}
                </div>
                {e.link && (
                  <a
                    href={e.link}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open receipt on the Atlantic explorer"
                    className="shrink-0 rounded-full p-2 text-slate transition-colors hover:bg-tint hover:text-accent"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-panel flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="font-display text-xl italic text-ink">The log is still blank.</p>
            <p className="max-w-md text-sm leading-relaxed text-slate">
              No task has landed on-chain evidence yet. As the 28 builders ship, their receipts —
              transaction hashes, run traces, reviewed submissions — will appear here, each one
              verifiable on the Atlantic explorer.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
