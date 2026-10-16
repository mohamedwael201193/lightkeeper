/**
 * StatStrip — animated numbers, Magic UI Number Ticker style, built on
 * framer-motion (already installed; no new deps).
 *
 * Every number that changes ticks up or down with a spring — balance, count,
 * volume. Static numbers feel dead; ticking on a timer feels fake. The
 * animation triggers ONLY when the real value changes.
 *
 * Respects prefers-reduced-motion: the value swaps instantly, content intact.
 */
import { useEffect, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

export interface Stat {
  /** Label under the number, e.g. "Total supply". */
  label: string;
  /** The REAL value. Animation follows this prop. */
  value: number;
  /** How to render the number. Default: thousands-separated, no decimals. */
  format?: (n: number) => string;
  /** Unit shown after the number, e.g. "PHRS". */
  suffix?: string;
  /** Optional small icon rendered beside the label. */
  icon?: React.ReactNode;
}

function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const spring = useSpring(mv, { stiffness: 90, damping: 22 });
  const [display, setDisplay] = useState(() => format(value));

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  useEffect(() => {
    if (reduce) {
      setDisplay(format(value));
      return;
    }
    const unsub = spring.on("change", (v) => setDisplay(format(v)));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spring, reduce, value]);

  return <span className="tabular-nums">{display}</span>;
}

export default function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.07, ease: "easeOut" }}
          className="rounded-2xl border border-hairline bg-white px-4 py-5"
        >
          <div className="flex items-center gap-1.5">
            {stat.icon && <span className="text-slate">{stat.icon}</span>}
            <p className="text-sm font-semibold text-slate">{stat.label}</p>
          </div>
          <p className="mt-2 font-display text-3xl tracking-tight text-ink">
            <AnimatedNumber
              value={stat.value}
              format={stat.format ?? ((n) => Math.round(n).toLocaleString("en-US"))}
            />
            {stat.suffix && (
              <span className="ml-1.5 text-base font-normal text-slate">{stat.suffix}</span>
            )}
          </p>
        </motion.div>
      ))}
    </div>
  );
}
