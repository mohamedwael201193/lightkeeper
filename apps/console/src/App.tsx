import { useEffect, useMemo, useState } from "react";
import Hero from "./components/Hero";
import StatsStrip from "./components/StatsStrip";
import LampsSection from "./components/LampsSection";
import ActivityFeed from "./components/ActivityFeed";
import TaskDetail from "./components/TaskDetail";
import NavChrome from "./components/NavChrome";
import { CircularMark, MenuPill } from "./components/Chrome";
import lampsRaw from "./data/lamps.json";
import type { LampsData } from "./types";

const data = lampsRaw as LampsData;

function useRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash || "#/");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-abyss-deep/70">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 py-12 text-center">
        <p className="display-section text-lg">Lightkeeper</p>
        <p className="max-w-md text-xs leading-relaxed text-white/50">
          One lighthouse. Twenty-eight lamps. One octopus to tend them.
          <br />
          Lamp statuses are generated from{" "}
          <code className="text-gold-soft/80">tasks/*/evidence.json</code> at{" "}
          {new Date(data.generated_at).toLocaleString("en-GB", { timeZone: "Africa/Cairo" })} — a
          missing evidence file means in progress, never shipped, never mocked.
        </p>
        <p className="text-[11px] tracking-[0.3em] text-white/30">
          {data.lamps_lit}/28 LAMPS LIT · {data.points_secured.toLocaleString()}/
          {data.total_points.toLocaleString()} PTS
        </p>
      </div>
    </footer>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const hash = useRoute();

  const taskSlug = useMemo(() => {
    const m = hash.match(/^#\/task\/([\w-]+)/);
    return m ? m[1] : null;
  }, [hash]);

  const task = taskSlug ? data.tasks.find((t) => t.slug === taskSlug) : undefined;

  useEffect(() => {
    document.title = task
      ? `${task.id} ${task.name} · LIGHTKEEPER`
      : "LIGHTKEEPER — One lighthouse. Twenty-eight lamps.";
  }, [task]);

  return (
    <NavChrome menuOpen={menuOpen} onClose={() => setMenuOpen(false)}>
      <div className="min-h-screen bg-abyss text-white">
        {/* top chrome: circular mark left, Menu pill right (above menu overlay) */}
        <div className="fixed inset-x-0 top-0 z-[60]">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 lg:px-10">
            <CircularMark />
            <MenuPill open={menuOpen} onToggle={() => setMenuOpen((v) => !v)} />
          </div>
        </div>

        {task ? (
          <main className="lg:pl-60">
            <TaskDetail lamp={task} />
          </main>
        ) : (
          <main className="lg:pl-60">
            <Hero />
            <div className="relative bg-gradient-to-b from-abyss-deep/90 to-abyss py-6">
              <StatsStrip data={data} />
            </div>
            <LampsSection lamps={data.tasks} />
            <ActivityFeed lamps={data.tasks} />
          </main>
        )}

        <div className="lg:pl-60">
          <Footer />
        </div>
      </div>
    </NavChrome>
  );
}
