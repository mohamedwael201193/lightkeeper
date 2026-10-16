import { useEffect, useRef } from "react";

/**
 * AsciiGlow — lightweight ambient background for the hero ONLY.
 * A 2D canvas: drifting glyphs in gold/abyss tones at low opacity, with a
 * soft radial gold glow. Zero WebGL, capped DPR, honors prefers-reduced-motion.
 */
export default function AsciiGlow({ opacity = 0.5 }: { opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const glyphs = " .:-=+xX0S8#";
    const cols = ["#d9a821", "#e8c766", "#3b3bff", "#f4f6ff"];
    let w = 0;
    let h = 0;
    let parts: { x: number; y: number; c: string; g: string; v: number }[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = w;
      canvas.height = h;
      parts = Array.from({ length: Math.floor((w * h) / 16000) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        c: cols[Math.floor(Math.random() * cols.length)],
        g: glyphs[Math.floor(Math.random() * glyphs.length)],
        v: 0.15 + Math.random() * 0.5,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 0.008;
      ctx.clearRect(0, 0, w, h);
      // soft gold glow core
      const glow = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.45);
      glow.addColorStop(0, "rgba(217,168,33,0.14)");
      glow.addColorStop(0.5, "rgba(217,168,33,0.05)");
      glow.addColorStop(1, "rgba(217,168,33,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.font = "14px ui-monospace, monospace";
      for (const p of parts) {
        const y = p.y + Math.sin(t * 2 + p.x * 0.01) * 12;
        const x = p.x + Math.cos(t * 1.4 + p.y * 0.01) * 12;
        ctx.globalAlpha = 0.28 * p.v * opacity * 2;
        ctx.fillStyle = p.c;
        ctx.fillText(p.g, x, y);
      }
      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    if (reduced) {
      // single static frame
      t = 1.7;
      draw();
    } else {
      raf = requestAnimationFrame(draw);
    }
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, [opacity]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="absolute inset-0 h-full w-full"
      style={{ opacity }}
    />
  );
}
