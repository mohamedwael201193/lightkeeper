import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Lamp } from "../types";
import LampCard from "./LampCard";

type Filter = "all" | "lit" | "dim";

/** TWENTY-EIGHT LAMPS — the tentacle grid with working filters + search. */
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
    <section id="lamps" className="relative mx-auto max-w-7xl scroll-mt-20 px-5 py-20">
      <div className="diag-line left-[-10%] top-8 w-[45%] opacity-60" />
      <div className="mb-10 text-center">
        <h2 className="display-section text-[clamp(1.4rem,4.5vw,2.6rem)]">Twenty-eight lamps</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
          Each lamp is an Arena task. A lamp burns <span className="text-gold-soft">gold</span> only
          when its task lands real on-chain evidence — anything else stays dim, honestly in progress.
        </p>
      </div>

      {/* working filter controls */}
      <div className="mb-8 flex flex-col items-center gap-4 md:flex-row md:justify-between">
        <div className="flex gap-2" role="tablist" aria-label="Filter lamps by status">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={`min-h-[44px] rounded-full px-5 text-sm font-medium transition-colors ${
                filter === t.id
                  ? "bg-gold text-abyss-darker shadow-[0_6px_20px_rgba(217,168,33,0.4)]"
                  : "border border-white/30 text-white/80 hover:border-gold-soft hover:text-gold-soft"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lamps…"
            className="min-h-[44px] w-full rounded-full border border-white/30 bg-white/5 pl-11 pr-4 text-sm text-white placeholder:text-white/40 focus:border-gold focus:outline-none"
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
          <p className="font-display text-xl italic text-gold-soft">No lamps match.</p>
          <p className="text-sm text-white/60">Adjust the search or the filter — every lamp is still here.</p>
        </div>
      )}
    </section>
  );
}
