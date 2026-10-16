import NumberTicker from "./NumberTicker";
import type { LampsData } from "../types";

/** Stats strip — 3,200 pts · 28 tasks · lamps lit · points secured. Number Ticker for all numbers. */
export default function StatsStrip({ data }: { data: LampsData }) {
  const stats = [
    { label: "Points available", value: data.total_points, gold: true },
    { label: "Lamps lit", value: data.lamps_lit, suffix: ` / ${data.tasks.length}`, gold: false },
    { label: "Points secured", value: data.points_secured, gold: true },
    { label: "Submissions filed", value: 0, note: "you file them", gold: false },
  ];
  return (
    <section className="mx-auto max-w-7xl px-5">
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-abyss-deep/60 p-6 backdrop-blur-sm md:grid-cols-4 md:p-8">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 text-center">
            <NumberTicker
              value={s.value}
              suffix={s.suffix ?? ""}
              className={`text-4xl font-bold md:text-5xl ${s.gold ? "text-gold" : "text-white"}`}
            />
            <div className="text-[11px] font-medium uppercase tracking-[0.25em] text-white/55">
              {s.label}
            </div>
            {s.note && <div className="text-[11px] text-white/40">({s.note})</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
