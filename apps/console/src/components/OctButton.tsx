import { motion } from "framer-motion";
import type { ReactNode, ButtonHTMLAttributes } from "react";

type Variant = "gold" | "porcelain" | "ghost";

const styles: Record<Variant, string> = {
  // Premium gold primary: layered brand shadow + inner highlight + sheen sweep
  gold:
    "btn-sheen bg-gradient-to-b from-gold-soft via-gold to-gold-deep text-abyss-darker font-semibold " +
    "shadow-[0_10px_30px_rgba(217,168,33,0.4),inset_0_1px_0_rgba(255,255,255,0.45)] " +
    "border border-gold-deep/60",
  porcelain:
    "bg-porcelain text-abyss-deep font-semibold border border-porcelain-blue " +
    "shadow-[0_6px_20px_rgba(8,8,100,0.25),inset_0_1px_0_rgba(255,255,255,0.7)] " +
    "hover:shadow-[0_8px_26px_rgba(8,8,100,0.35)]",
  ghost:
    "text-white border border-white/40 hover:border-white hover:bg-white/10 font-medium",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

/** Premium button recipe — every button executes a real action or is hidden/disabled with a reason. */
export default function OctButton({ variant = "gold", children, className = "", ...rest }: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-6 text-sm transition-colors ${styles[variant]} ${className}`}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  );
}
