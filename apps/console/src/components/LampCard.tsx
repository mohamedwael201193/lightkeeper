import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import type { Lamp } from "../types";
import { taskRoute } from "../types";

/** Porcelain lamp card. LIT (gold accents) = shipped with evidence; DIM = in progress. */
export default function LampCard({ lamp, index }: { lamp: Lamp; index: number }) {
  const lit = lamp.status === "shipped";
  return (
    <motion.a
      href={taskRoute(lamp)}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, delay: (index % 8) * 0.04 }}
      className={`lamp-card group relative flex min-h-[185px] flex-col p-5 ${lit ? "lit" : ""}`}
      aria-label={`${lamp.id} ${lamp.name} — ${lit ? "shipped" : "in progress"}`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            lit
              ? "bg-gold text-ink shadow-[0_0_16px_rgba(201,162,39,0.6)]"
              : "bg-tint text-slate"
          }`}
        >
          <Flame size={19} strokeWidth={lit ? 2.4 : 1.8} />
        </div>
        <span className={`chip ${lit ? "chip-lit" : "chip-dim"}`}>{lit ? "Lit" : "Dim"}</span>
      </div>

      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate">
        {lamp.id} · {lamp.toolkit}
      </div>
      <h3 className="mt-1 font-display text-xl font-semibold leading-snug text-ink">
        {lamp.name}
      </h3>

      <div className="mt-auto flex items-end justify-between pt-4">
        <div className="tabular text-2xl font-bold text-golddeep">
          {lamp.points}
          <span className="ml-1 text-xs font-semibold uppercase tracking-widest text-slate">
            pts
          </span>
        </div>
        <div className="text-[11px] font-medium text-slate">
          {lamp.txs.length > 0
            ? `${lamp.txs.length} receipt${lamp.txs.length > 1 ? "s" : ""}`
            : lit
              ? "shipped"
              : "evidence pending"}
        </div>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-5 bottom-0 h-[2px] origin-left bg-gold transition-transform duration-300 group-hover:scale-x-100 ${
          lit ? "scale-x-100" : "scale-x-0"
        }`}
      />
    </motion.a>
  );
}
