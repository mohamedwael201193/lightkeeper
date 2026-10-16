import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import AsciiGlow from "./AsciiGlow";

/**
 * Hero — giant gold DIDONE `LIGHTKEEPER`, the porcelain octopus floating
 * center, thin diagonal white lines, poetic lede.
 */
export default function Hero() {
  return (
    <header id="top" className="relative overflow-hidden">
      {/* ambient ASCII gradient, hero only, low opacity */}
      <div className="absolute inset-0">
        <AsciiGlow opacity={0.45} />
      </div>
      {/* gradient depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-abyss-deep/90" />

      {/* thin diagonal white lines */}
      <div className="diag-line left-[-15%] top-[18%] w-[60%]" />
      <div className="diag-line right-[-15%] top-[62%] w-[55%] opacity-70" />

      <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col items-center justify-center px-5 pb-24 pt-28 text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-6 text-[11px] font-medium uppercase tracking-[0.5em] text-white/70"
        >
          Pharos Agent Arena · Atlantic testnet
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1 }}
          className="display-hero text-[clamp(2.2rem,10vw,9.5rem)]"
        >
          Lightkeeper
        </motion.h1>

        {/* the porcelain octopus, floating */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.35 }}
          className="relative -my-4 w-[min(78vw,520px)] md:-my-10 md:w-[min(52vw,560px)]"
        >
          {/* soft gold glow beneath */}
          <div className="animate-glowpulse absolute inset-x-[12%] bottom-[6%] top-[55%] rounded-full bg-gold/25 blur-3xl" />
          <img
            src="/assets/octopus.png"
            alt="The porcelain octopus keeper — white ceramic with deep-blue floral patterns and gold-accented suckers"
            className="animate-floaty relative w-full drop-shadow-[0_30px_60px_rgba(8,8,100,0.55)]"
            width={1600}
            height={1600}
            loading="eager"
          />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.6 }}
          className="max-w-xl text-balance text-lg leading-relaxed text-white md:text-xl"
        >
          One lighthouse.{" "}
          <span className="font-display italic text-gold-soft">Twenty-eight lamps.</span>
          <br />
          <span className="text-white/80">One octopus to tend them.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="mt-10 flex flex-col items-center gap-2 text-white/60"
        >
          <span className="text-[11px] uppercase tracking-[0.35em]">The keeper's ledger</span>
          <ChevronDown size={18} className="animate-bounce" />
        </motion.div>
      </div>
    </header>
  );
}
