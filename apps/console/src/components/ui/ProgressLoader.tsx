/**
 * ProgressLoader — honest multi-step progress for try-module execution.
 *
 * Each entry in `steps` maps to EXACTLY ONE real async call (an RPC method, a
 * wallet signature, a contract write). The loader advances when the call
 * actually starts/finishes — never on a timer, never decorative.
 *
 * Usage:
 *   const [step, setStep] = useState(0);
 *   const STEPS = ["Resolving latest block", "Reading name()", "Reading symbol()"];
 *   // call 1 done -> setStep(1); call 2 done -> setStep(2); ...
 *   <ProgressLoader steps={STEPS} current={step} />
 *
 * `current` is the index of the step currently in flight.
 * Set `current` to steps.length when everything finished.
 * Never a bare spinner — the user must always know what is happening RIGHT NOW.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

interface ProgressLoaderProps {
  /** One real async call per entry. Keep labels short and factual. */
  steps: string[];
  /** Index of the step currently in flight; steps.length = all done. */
  current: number;
  /** Optional line above the steps, e.g. the address being read. */
  title?: string;
}

export default function ProgressLoader({ steps, current, title }: ProgressLoaderProps) {
  const done = current >= steps.length;
  const clamped = Math.max(0, Math.min(current, steps.length - 1));

  return (
    <div className="rounded-2xl border border-hairline bg-white p-5 sm:p-6" aria-live="polite">
      {title && <p className="text-sm font-semibold text-ink">{title}</p>}

      <div className="mt-2 flex items-baseline justify-between gap-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={done ? "done" : clamped}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="text-base font-medium text-ink"
          >
            {done
              ? `Complete — all ${steps.length} steps finished`
              : `Step ${clamped + 1} of ${steps.length} — ${steps[clamped]}`}
          </motion.p>
        </AnimatePresence>
        <p className="shrink-0 font-mono text-sm text-slate">
          {Math.min(current, steps.length)}/{steps.length}
        </p>
      </div>

      {/* Determinate bar — progress reflects completed REAL steps only. */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-tint" role="progressbar"
        aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={Math.min(current, steps.length)}>
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${(Math.min(current, steps.length) / steps.length) * 100}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      <ol className="mt-4 space-y-2.5">
        {steps.map((label, i) => {
          const isDone = i < current;
          const isCurrent = !done && i === current;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                  isDone
                    ? "border-pass bg-pass text-white"
                    : isCurrent
                      ? "border-accent bg-tint text-accent"
                      : "border-hairline bg-porcelain text-slate"
                }`}
                aria-hidden
              >
                {isDone ? (
                  <Check size={14} strokeWidth={3} />
                ) : isCurrent ? (
                  <motion.span
                    animate={{ scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    className="h-2.5 w-2.5 rounded-full bg-accent"
                  />
                ) : (
                  <span className="text-xs">{i + 1}</span>
                )}
              </span>
              <span
                className={`text-sm sm:text-base ${
                  isDone ? "text-slate line-through decoration-slate/40" : isCurrent ? "font-semibold text-ink" : "text-slate"
                }`}
              >
                {label}
              </span>
              {isCurrent && (
                <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-xs text-slate">
        Each step is a real network call — nothing here advances on a timer.
      </p>
    </div>
  );
}
