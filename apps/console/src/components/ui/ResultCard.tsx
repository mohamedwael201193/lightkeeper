/**
 * ResultCard — the showpiece of every try module's "03 Result" section.
 *
 * The one number, word, or verdict the user came for goes BIG (display serif,
 * 40px+). Everything else — supporting rows, explorer links, copy button —
 * plays a supporting role below it. Hierarchy rule: if it all looks equally
 * important, the component is being used wrong.
 *
 * Every row and link must come from a REAL on-chain read or a REAL signature
 * flow. Never render a ResultCard for a placeholder, estimate, or guess.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, ExternalLink } from "lucide-react";

export type ResultStatus = "pass" | "fail" | "neutral";

export interface ResultRow {
  /** Row label, e.g. "Block" */
  label: string;
  /** Rendered value — text or JSX. Monospace hashes belong here. */
  value: React.ReactNode;
}

export interface ResultLink {
  /** Plain-language label, e.g. "View transaction on the explorer" */
  label: string;
  /** Real href — a pharosscan URL built from a real hash/address. */
  href: string;
}

interface ResultCardProps {
  /** One-line context, e.g. "Result — totalSupply read". Never a call to action. */
  eyebrow?: string;
  /** THE answer. Rendered huge. Keep it short — it must fit two lines at 390px. */
  headline: React.ReactNode;
  /** One supporting sentence under the headline, 14px+ ink. */
  subline?: React.ReactNode;
  /** Supporting facts. */
  rows?: ResultRow[];
  /** Real explorer links only. No placeholder hrefs, ever. */
  links?: ResultLink[];
  /** Raw string to copy when the user hits the copy button. */
  copyValue?: string;
  status?: ResultStatus;
  children?: React.ReactNode;
}

const STATUS_ACCENT: Record<ResultStatus, string> = {
  pass: "bg-pass",
  fail: "bg-fail",
  neutral: "bg-accent",
};

export default function ResultCard({
  eyebrow,
  headline,
  subline,
  rows = [],
  links = [],
  copyValue,
  status = "neutral",
  children,
}: ResultCardProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
    } catch {
      // Clipboard unavailable (old browser / permissions) — fall back to a
      // manual selection target so the value is still reachable.
      const ta = document.createElement("textarea");
      ta.value = copyValue;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-hairline bg-white p-6 sm:p-8"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_ACCENT[status]}`} aria-hidden />
        {eyebrow && <p className="text-sm font-semibold text-slate">{eyebrow}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <h3 className="font-display text-4xl leading-tight tracking-tight text-ink sm:text-5xl">
          {headline}
        </h3>
        {copyValue && (
          <button
            type="button"
            onClick={copy}
            className="btn-outline inline-flex items-center gap-2 !min-h-[40px] !px-3 !text-sm"
            aria-label="Copy result value"
          >
            {copied ? <Check size={16} className="text-pass" /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {subline && <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink">{subline}</p>}

      {rows.length > 0 && (
        <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="border-t border-hairline pt-3">
              <dt className="text-sm font-semibold text-slate">{row.label}</dt>
              <dd className="mt-1 break-words font-mono text-sm text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {links.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-hairline bg-porcelain px-3 text-sm font-medium text-accent hover:bg-tint"
            >
              {link.label}
              <ExternalLink size={14} aria-hidden />
            </a>
          ))}
        </div>
      )}

      {children && <div className="mt-6">{children}</div>}
    </motion.section>
  );
}
