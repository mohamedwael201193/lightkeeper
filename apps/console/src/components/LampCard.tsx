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
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: (index % 7) * 0.05 }}
      className={`lamp-card group relative flex min-h-[190px] flex-col p-5 ${lit ? "lit" : ""}`}
      aria-label={`${lamp.id} ${lamp.name} — ${lit ? "shipped" : "in progress"}`}
    >
      {/* lamp flame */}
      <div className="mb-3 flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            lit ? "bg-gold text-abyss-darker shadow-[0_0_18px_rgba(217,168,33,0.7)]" : "bg-abyss/10 text-abyss/50"
          }`}
        >
          <Flame size={19} strokeWidth={lit ? 2.4 : 1.8} />
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
            lit ? "bg-gold text-abyss-darker" : "border border-abyss/25 text-abyss/60"
          }`}
        >
          {lit ? "Lit" : "Dim"}
        </span>
      </div>

      <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-abyss/55">
        {lamp.id} · {lamp.toolkit}
      </div>
      <h3 className="mt-1 font-display text-xl font-semibold leading-snug text-abyss-darker">
        {lamp.name}
      </h3>

      <div className="mt-auto flex items-end justify-between pt-4">
        <div className="tabular text-2xl font-bold text-gold-deep">
          {lamp.points}
          <span className="ml-1 text-xs font-semibold uppercase tracking-widest text-abyss/50">pts</span>
        </div>
        <div className="text-[11px] font-medium text-abyss/60">
          {lamp.txs.length > 0
            ? `${lamp.txs.length} receipt${lamp.txs.length > 1 ? "s" : ""}`
            : lit
              ? "shipped"
              : "evidence pending"}
        </div>
      </div>

      {/* gold underline sweep on hover */}
      <div
        className={`pointer-events-none absolute inset-x-5 bottom-0 h-[2px] origin-left scale-x-0 bg-gold transition-transform duration-300 group-hover:scale-x-100 ${
          lit ? "scale-x-100" : ""
        }`}
      />
    </motion.a>
  );
}
