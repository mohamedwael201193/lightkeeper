import { AnimatePresence, motion } from "framer-motion";
import { Compass, ExternalLink, Flame, Home, ScrollText } from "lucide-react";
import { ARENA_PORTAL, EXPLORER } from "../types";

const INTERNAL = [
  { icon: Home, label: "Overview", anchor: "top" },
  { icon: Flame, label: "Twenty-eight lamps", anchor: "lamps" },
  { icon: ScrollText, label: "Keeper's log", anchor: "activity" },
];

const EXTERNAL = [
  { icon: Compass, label: "Agent Arena board", href: "https://pharos-agent-arena.vercel.app/" },
  { icon: ExternalLink, label: "ai.pharos.xyz portal", href: ARENA_PORTAL },
  { icon: ExternalLink, label: "Atlantic explorer", href: EXPLORER },
];

/** Sidebar (desktop) + full-screen menu overlay (all sizes). */
export default function NavChrome({
  menuOpen,
  onClose,
  children,
}: {
  menuOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  /** Route to the overview, then scroll to the given anchor. */
  const go = (anchor: string) => {
    onClose();
    const doScroll = () => {
      const el = document.getElementById(anchor);
      (el ?? document.body).scrollIntoView({ behavior: "smooth" });
    };
    if (window.location.hash.startsWith("#/task")) {
      window.location.hash = "#/";
      setTimeout(doScroll, 120);
    } else {
      if (window.location.hash !== "#/") window.location.hash = "#/";
      setTimeout(doScroll, 60);
    }
  };

  return (
    <>
      {/* Sidebar — desktop only */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-white/10 bg-abyss-deep/70 backdrop-blur-md lg:flex">
        <nav className="flex flex-1 flex-col gap-1 px-4 pt-28">
          {INTERNAL.map((n) => (
            <button
              key={n.label}
              onClick={() => go(n.anchor)}
              className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-gold-soft"
            >
              <n.icon size={17} className="shrink-0" />
              {n.label}
            </button>
          ))}
          <div className="my-3 h-px bg-white/10" />
          {EXTERNAL.map((n) => (
            <a
              key={n.label}
              href={n.href}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-gold-soft"
            >
              <n.icon size={17} className="shrink-0" />
              {n.label}
            </a>
          ))}
        </nav>
        <div className="px-5 pb-6 text-[11px] leading-relaxed text-white/45">
          Read-only console. Lamp statuses come only from{" "}
          <code className="text-gold-soft/80">tasks/*/evidence.json</code> — missing means
          in progress, never shipped.
        </div>
      </aside>

      {/* Menu overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-abyss-deep/95 backdrop-blur-lg"
          >
            <div className="diag-line left-[-10%] top-[30%] w-[120%]" />
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6">
              {[...INTERNAL.map((n) => ({ ...n, kind: "internal" as const })), ...EXTERNAL.map((n) => ({ ...n, kind: "external" as const }))].map((n, i) => (
                <motion.div
                  key={n.label}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i }}
                >
                  {n.kind === "external" && "href" in n ? (
                    <a
                      href={n.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={onClose}
                      className="display-section block py-3 text-center text-2xl text-gold transition-colors hover:text-gold-soft md:text-3xl"
                    >
                      {n.label}
                    </a>
                  ) : (
                    <button
                      onClick={() => go(("anchor" in n ? n.anchor : "top") as string)}
                      className="display-section block py-3 text-center text-2xl text-gold transition-colors hover:text-gold-soft md:text-3xl"
                    >
                      {n.label}
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
            <div className="pb-10 text-center text-xs tracking-[0.25em] text-white/40">
              ONE LIGHTHOUSE · TWENTY-EIGHT LAMPS
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </>
  );
}
