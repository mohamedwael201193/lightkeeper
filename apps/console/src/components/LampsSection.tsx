import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Lamp } from "../types";
import LampCard from "./LampCard";

type Filter = "all" | "lit" | "dim";

/** Twenty-eight lamps — filterable, searchable, honestly lit/dim. */
export default function LampsSection({ lamps }: { lamps: Lamp[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lamps.filter((l) => {
      if (filter === "lit" && l.status !== "shipped") return false;
      if (filter === "dim" && l.status === "shipped") return false;
      if (q && !`${l.id} ${l.name} ${l.toolkit} ${l.tier}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lamps, filter, query]);

  const counts = useMemo(
    () => ({
      all: lamps.length,
      lit: lamps.filter((l) => l.status === "shipped").length,
      dim: lamps.filter((l) => l.status !== "shipped").length,
    }),
    [lamps]
  );

  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: `All ${counts.all}` },
    { id: "lit", label: `Lit ${counts.lit}` },
    { id: "dim", label: `Dim ${counts.dim}` },
  ];

  return (
    <section id="lamps" className="mx-auto max-w-[1440px] scroll-mt-32 px-5 py-16 lg:px-10">
      <div className="mb-8 max-w-2xl">
        <h2 className="smallcaps mb-3">The lamps</h2>
        <p className="wordmark text-[clamp(1.5rem,3vw,2.2rem)]">Twenty-eight lamps</p>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">
          Each lamp is an Arena task. A lamp burns <span className="font-semibold text-golddeep">gold</span> only
          when its task lands real on-chain evidence — anything else stays dim, honestly in progress.
        </p>
      </div>

      <div className="mb-8 flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2" role="tablist" aria-label="Filter lamps by status">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={`min-h-[44px] rounded-full px-5 text-sm font-semibold transition-colors ${
                filter === t.id
                  ? "bg-ink text-white"
                  : "border border-tintdeep bg-paper text-slate hover:border-accent hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="relative w-full max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lamps…"
            className="min-h-[44px] w-full rounded-full border border-tintdeep bg-paper pl-11 pr-4 text-sm text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      {shown.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
          {shown.map((l, i) => (
            <LampCard key={l.id} lamp={l} index={i} />
          ))}
        </div>
      ) : (
        <div className="empty-panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <p className="font-display text-xl italic text-ink">No lamps match.</p>
          <p className="text-sm text-slate">Adjust the search or the filter — every lamp is still here.</p>
        </div>
      )}
    </section>
  );
}
