import { ExternalLink, FileText } from "lucide-react";
import AnimatedList from "./AnimatedList";
import type { Lamp, LampActivity } from "../types";

/** Keeper's log — activity feed fed ONLY by real evidence.json events. */
export default function ActivityFeed({ lamps }: { lamps: Lamp[] }) {
  const events: (LampActivity & { lampId: string })[] = lamps
    .flatMap((l) => l.activity.map((a) => ({ ...a, lampId: l.id })))
    .slice(0, 20);

  return (
    <section id="activity" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-20">
      <div className="mb-8 text-center">
        <h2 className="display-section text-[clamp(1.3rem,4vw,2.2rem)]">Keeper's log</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/65">
          Every entry is a real event from a task's{" "}
          <code className="text-gold-soft/90">evidence.json</code>. Nothing is simulated.
        </p>
      </div>

      {events.length > 0 ? (
        <AnimatedList
          items={events}
          keyOf={(e, i) => `${e.lampId}-${i}-${e.title}`}
          renderItem={(e) => (
            <div className="mb-3 flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
                <FileText size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-soft">
                    {e.lampId}
                  </span>
                  {e.at && <span className="text-[11px] text-white/40">{e.at}</span>}
                </div>
                <div className="truncate text-sm font-medium text-white">{e.title}</div>
                {e.detail && (
                  <div className="truncate font-mono text-xs text-white/55">{e.detail}</div>
                )}
              </div>
              {e.link && (
                <a
                  href={e.link}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open receipt on the Atlantic explorer"
                  className="shrink-0 rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-gold-soft"
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
          )}
          className="flex flex-col"
        />
      ) : (
        <div className="empty-panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="font-display text-xl italic text-gold-soft">The log is still blank.</p>
          <p className="max-w-md text-sm leading-relaxed text-white/60">
            No task has landed on-chain evidence yet. As the 28 builders ship, their receipts —
            transaction hashes, run traces, reviewed submissions — will appear here, each one
            verifiable on the Atlantic explorer.
          </p>
        </div>
      )}
    </section>
  );
}
