import { motion } from "framer-motion";
import { Flame, Trophy } from "lucide-react";
import type { LampsData } from "../types";

/**
 * Hero — the OCTOPUS spectacle (brief §0A amendment).
 * Blue = the stage: full-bleed deep royal field, giant porcelain octopus
 * centerpiece, gold serif display. Light = everything below the hero.
 * Title stays restrained: clamp() capped inside a constrained container,
 * word-wrap safe — it can never clip at 1440px.
 */
export default function Hero({ data }: { data: LampsData }) {
  const dim = data.tasks.length - data.lamps_lit;
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "radial-gradient(1200px 620px at 50% -8%, #3d3df0 0%, #1414c8 46%, #0b0b6e 100%)",
      }}
    >
      {/* faint porcelain-grain vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 420px at 50% 108%, rgba(201,162,39,0.16) 0%, rgba(201,162,39,0) 70%)",
        }}
      />
      <div className="relative mx-auto max-w-4xl px-5 pb-14 pt-12 text-center lg:pt-16">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 text-[11px] font-bold uppercase tracking-[0.45em] text-white/70"
        >
          Lightkeeper · 28 autonomous agent skills
        </motion.p>

        <motion.img
          src="/assets/octopus.png"
          alt="Porcelain octopus — the Lightkeeper"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="mx-auto mb-6 h-auto w-[min(58vw,380px)] select-none"
          style={{ filter: "drop-shadow(0 28px 60px rgba(4,4,40,0.55))" }}
          draggable={false}
        />

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="wordmark mx-auto max-w-3xl break-words text-[clamp(2.4rem,6vw,4.5rem)]"
          style={{ color: "#f4e3ac" }}
        >
          LIGHTKEEPER
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mx-auto mt-3 max-w-xl text-[clamp(1.05rem,2.4vw,1.5rem)] italic leading-snug text-white/90"
          style={{ fontFamily: '"Playfair Display", Didot, Georgia, serif' }}
        >
          One lighthouse. Twenty-eight lamps.
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-white/65"
        >
          One octopus to tend them. Every lamp below is a real Arena task; it burns gold
          only when the task lands real on-chain evidence. Anything else stays dim —
          honestly in progress, never mocked.
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.34 }}
          className="mt-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/45"
        >
          Built for the Pharos Agent Arena · live on Atlantic testnet
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.38 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <span className="chip chip-lit tabular">
            <Flame size={12} /> {data.lamps_lit}/28 lamps lit
          </span>
          <span
            className="chip tabular"
            style={{
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.35)",
            }}
          >
            <Trophy size={12} /> {data.points_secured.toLocaleString()}/
            {data.total_points.toLocaleString()} pts
          </span>
          {dim > 0 && (
            <span
              className="chip tabular"
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(255,255,255,0.35)",
              }}
            >
              {dim} in progress
            </span>
          )}
        </motion.div>
      </div>
    </section>
  );
}
