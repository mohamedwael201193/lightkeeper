/**
 * StateCards — the two honest non-result states.
 *
 * EmptyState: an honest zero. "Quiet window — no events in this range. That's
 * an honest answer, not an error." Dashed border, one clear CTA, never a
 * blank screen and never a skeleton pretending data is coming.
 *
 * ErrorState: loud but pretty. Plain-language explanation + what to do next
 * + a Retry button. Raw RPC errors NEVER reach the user — translate them
 * before rendering.
 */
import { motion } from "framer-motion";
import { AlertTriangle, Ghost } from "lucide-react";

interface EmptyStateProps {
  /** Factual headline, e.g. "No events in this range". */
  title: string;
  /** Plain sentence explaining what the empty result MEANS. */
  message: string;
  /** Label for the single CTA, e.g. "Widen the block range". */
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-2xl border-2 border-dashed border-hairline bg-porcelain px-6 py-10 text-center"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-tint">
        <Ghost size={22} className="text-slate" aria-hidden />
      </div>
      <h4 className="mt-4 text-lg font-semibold text-ink">{title}</h4>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate">{message}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn-outline mt-5">
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}

interface ErrorStateProps {
  /** What happened, in plain language: "The read failed — loudly, not silently." */
  title: string;
  /** The translated reason + what the user can do about it. Never a raw RPC string. */
  message: string;
  /** Optional extra guidance line. */
  hint?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title,
  message,
  hint,
  retryLabel = "Retry",
  onRetry,
}: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-2xl border border-[#F3C1C1] bg-[#FEF2F2] px-6 py-6"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fail/10">
          <AlertTriangle size={20} className="text-fail" aria-hidden />
        </div>
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-ink">{title}</h4>
          <p className="mt-1 text-sm leading-relaxed text-ink">{message}</p>
          {hint && <p className="mt-2 text-sm text-slate">{hint}</p>}
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn-primary mt-4">
              {retryLabel}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
