import { motion } from "framer-motion";
import { ArrowLeft, Lock } from "lucide-react";
import type { Lamp } from "../types";

/**
 * Public placeholder for lamps that are built but not yet publicly open
 * (staged launch — see src/data/launch.ts). The underlying task work is
 * untouched; this is only the outer face. Founder mode bypasses it.
 */
export default function ComingSoon({ lamp }: { lamp: Lamp }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-2xl px-5 pb-24 pt-8 text-center"
    >
      <a
        href="#/"
        className="mb-10 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate transition-colors hover:text-accent"
      >
        <ArrowLeft size={16} /> Back to the lamps
      </a>

      <div className="rounded-3xl border border-hairline bg-paper p-10 shadow-[0_20px_60px_-30px_rgba(20,20,200,0.25)] md:p-14">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-royal/10 text-royal">
          <Lock size={28} />
        </div>
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate">
          {lamp.id} · {lamp.toolkit} · {lamp.tier} · {lamp.points} pts
        </div>
        <h1 className="wordmark mt-3 text-[clamp(1.6rem,4vw,2.4rem)]">{lamp.name}</h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-slate">
          This lamp is built and being polished — it opens to the public soon.
          The keeper lights the lamps one by one.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold/15 px-4 py-2 text-sm font-semibold text-golddeep">
          <Lock size={14} /> Coming soon
        </div>
      </div>
    </motion.div>
  );
}
