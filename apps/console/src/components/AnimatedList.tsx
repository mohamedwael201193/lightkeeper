import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * AnimatedList — Magic-UI-style list: items slide in with stagger,
 * newest-first. Never hard-appends.
 */
export default function AnimatedList<T>({
  items,
  renderItem,
  keyOf,
  className = "",
}: {
  items: T[];
  renderItem: (item: T, i: number) => ReactNode;
  keyOf: (item: T, i: number) => string;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
    >
      {items.map((it, i) => (
        <motion.div
          key={keyOf(it, i)}
          variants={{
            hidden: { opacity: 0, y: 18, scale: 0.98 },
            show: { opacity: 1, y: 0, scale: 1 },
          }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
        >
          {renderItem(it, i)}
        </motion.div>
      ))}
    </motion.div>
  );
}
