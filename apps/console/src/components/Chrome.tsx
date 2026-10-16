import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";

/** Circular lighthouse mark — lighthouse beam + octopus ring, top-left. */
export function CircularMark({ size = 44 }: { size?: number }) {
  return (
    <a href="#/" aria-label="Lightkeeper home" className="block shrink-0">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        className="drop-shadow-[0_0_12px_rgba(217,168,33,0.5)]"
      >
        <circle cx="24" cy="24" r="22" stroke="#d9a821" strokeWidth="1.6" />
        <circle cx="24" cy="24" r="17.5" stroke="#d9a821" strokeWidth="0.8" opacity="0.5" />
        {/* beam */}
        <path d="M24 6 L14 24 L24 24 Z" fill="#d9a821" opacity="0.9" />
        <path d="M24 6 L34 24 L24 24 Z" fill="#e8c766" opacity="0.45" />
        {/* keeper dot */}
        <circle cx="24" cy="30" r="3.4" fill="#f4f6ff" />
        <path d="M24 33.5 L20 41 M24 33.5 L28 41" stroke="#f4f6ff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </a>
  );
}

/** Menu pill — top-right outline pill, the console's nav trigger. */
export function MenuPill({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? "Close menu" : "Open menu"}
      className="flex min-h-[44px] items-center gap-2 rounded-full border border-white/70 px-5 text-sm tracking-wide text-white transition-colors hover:border-gold hover:text-gold-soft"
    >
      {open ? <X size={16} /> : <Menu size={16} />}
      <span className="font-medium">{open ? "Close" : "Menu"}</span>
    </motion.button>
  );
}
