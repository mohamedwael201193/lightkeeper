/**
 * FeedList — animated staggered list for events, logs, and alerts
 * (Magic UI Animated List style, hand-built on framer-motion).
 *
 * New items slide/fade in at the TOP — never hard-appended. The list is
 * capped in height with internal scroll so a busy feed never blows out
 * the page. `initial={false}` means history renders instantly on first
 * paint; only NEW arrivals animate.
 *
 * Items must be REAL entries: a real event from eth_getLogs, a real run-log
 * line, a real alert. Never placeholder rows.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";

export interface FeedItem {
  key: string;
  node: React.ReactNode;
}

interface FeedListProps {
  items: FeedItem[];
  /** Tailwind max-height class, e.g. "max-h-96". Defaults to a 4–5 item viewport. */
  maxHeight?: string;
  /** Shown when the list is empty — keep it factual. */
  emptyText?: string;
}

export default function FeedList({
  items,
  maxHeight = "max-h-[24rem]",
  emptyText = "No entries yet.",
}: FeedListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(items.length);

  // Keep the newest item in view as the feed grows — only when the user is
  // already at the top, so we never yank scroll away mid-read.
  useEffect(() => {
    const el = listRef.current;
    if (el && items.length > prevCount.current && el.scrollTop < 48) {
      el.scrollTo({ top: 0, behavior: "smooth" });
    }
    prevCount.current = items.length;
  }, [items.length]);

  return (
    <div
      ref={listRef}
      className={`overflow-y-auto rounded-2xl border border-hairline bg-white ${maxHeight}`}
      aria-live="polite"
    >
      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-hairline">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.li
                key={item.key}
                layout
                initial={{ opacity: 0, y: -14, backgroundColor: "#EAF1FF" }}
                animate={{ opacity: 1, y: 0, backgroundColor: "#FFFFFF" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="px-5 py-3.5"
              >
                {item.node}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
