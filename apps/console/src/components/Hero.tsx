import { motion } from "framer-motion";
import { Flame, Trophy } from "lucide-react";
import type { LampsData } from "../types";

/**
 * Hero — compact. Restrained serif title that never clips at 1440px
 * (clamp caps at 3rem inside a constrained container — the old 9.5rem bleed is gone).
 */
export default function Hero({ data }: { data: LampsData }) {
  const dim = data.tasks.length - data.lamps_lit;
  return (
    <section className="border-b border-hairline bg-paper">
      <div className="mx-auto max-w-3xl px-5 pb-12 pt-10 text-center lg:pt-14">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5 text-[11px] font-bold uppercase tracking-[0.45em] text-slate"
        >
          Pharos Agent Arena · Atlantic testnet
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="wordmark text-[clamp(1.9rem,4.2vw,3rem)]"
        >
          One lighthouse. <span className="italic text-golddeep">Twenty-eight lamps.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate"
        >
          One octopus to tend them. Every lamp below is a real Arena task; it burns gold only
          when the task lands real on-chain evidence. Anything else stays dim — honestly in
          progress, never mocked.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-7 flex flex-wrap items-center justify-center gap-3"
        >
          <span className="chip chip-lit tabular">
            <Flame size={12} /> {data.lamps_lit}/28 lamps lit
          </span>
          <span className="chip chip-info tabular">
            <Trophy size={12} /> {data.points_secured.toLocaleString()}/
            {data.total_points.toLocaleString()} pts
          </span>
          {dim > 0 && <span className="chip chip-dim tabular">{dim} in progress</span>}
        </motion.div>
      </div>
    </section>
  );
}
