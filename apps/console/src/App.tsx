import { Suspense, lazy, useEffect, useState } from "react";
import Hero from "./components/Hero";
import StatusStrip from "./components/StatusStrip";
import StackSection from "./components/StackSection";
import LampsSection from "./components/LampsSection";
import ActivityFeed from "./components/ActivityFeed";
import Header from "./components/Header";
import { WalletProvider } from "./components/WalletContext";
import { useFounderMode, useFounderNoindex, enableFounderMode } from "./hooks/useFounderMode";
import ComingSoon from "./components/ComingSoon";
import { isTaskPubliclyOpen } from "./data/launch";
import lampsRaw from "./data/lamps.json";
import type { LampsData } from "./types";

// Lazy: react-markdown only lives in the task view, keeping the home bundle light.
const TaskDetail = lazy(() => import("./components/TaskDetail"));
// Lazy: the founder cockpit is never in the public chrome — loads only on #/founder.
const FounderCockpit = lazy(() => import("./components/FounderCockpit"));

const data = lampsRaw as LampsData;

const SECTIONS = new Set(["lamps", "stack", "activity"]);

function useRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => {
      const h = window.location.hash || "#/";
      setHash(h);
      const m = h.match(/^#\/([\w-]+)$/);
      if (m && SECTIONS.has(m[1])) {
        requestAnimationFrame(() => {
          document.getElementById(m[1])?.scrollIntoView({ behavior: "smooth" });
        });
      } else {
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener("hashchange", onChange);
    // handle initial load with a section hash
    onChange();
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function Footer() {
  return (
    <footer className="border-t border-hairline bg-paper">
      <div className="royal-frame h-1 w-full" aria-hidden />
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-5 py-12 text-center">
        <img
          src="/assets/octopus.png"
          alt=""
          aria-hidden
          className="h-10 w-10 rounded-full object-cover opacity-70"
          width={40}
          height={40}
        />
        <p className="wordmark text-lg">Lightkeeper</p>
        <p className="max-w-md text-xs leading-relaxed text-slate">
          One lighthouse. Twenty-eight lamps. One octopus to tend them.
          <br />
          Lamp statuses are generated from{" "}
          <code className="font-mono text-accentdeep">tasks/*/evidence.json</code> at{" "}
          {new Date(data.generated_at).toLocaleString("en-GB", { timeZone: "Africa/Cairo" })} — a
          missing evidence file means in progress, never shipped, never mocked.
        </p>
        <p className="tabular text-[11px] font-bold tracking-[0.3em] text-slate">
          {data.lamps_lit}/28 LAMPS LIT · {data.points_secured.toLocaleString()}/
          {data.total_points.toLocaleString()} PTS
        </p>
        {/* discreet founder entry — local-only mode, never indexed, never advertised */}
        <button
          type="button"
          onClick={() => enableFounderMode()}
          aria-label="Enter founder mode"
          className="text-[10px] lowercase tracking-widest text-slate/40 transition-colors hover:text-slate"
        >
          founder
        </button>
      </div>
    </footer>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const hash = useRoute();
  const founder = useFounderMode();
  useFounderNoindex(founder);

  const taskSlug = (() => {
    const m = hash.match(/^#\/task\/([\w-]+)/);
    return m ? m[1] : null;
  })();

  const task = taskSlug ? data.tasks.find((t) => t.slug === taskSlug) : undefined;

  const isFounderRoute = /^#\/founder([?/]|$)/.test(hash);

  useEffect(() => {
    document.title = task
      ? `${task.id} ${task.name} · LIGHTKEEPER`
      : "LIGHTKEEPER — One lighthouse. Twenty-eight lamps.";
  }, [task]);

  return (
    <WalletProvider>
      <div className="min-h-screen bg-paper text-ink">
        <Header menuOpen={menuOpen} onToggle={() => setMenuOpen((v) => !v)} />
        <div className="pt-[74px]">
          <StatusStrip data={data} />
          {isFounderRoute ? (
            <main>
              <Suspense
                fallback={
                  <div className="mx-auto max-w-4xl px-5 py-24 text-center text-sm text-slate">
                    Loading…
                  </div>
                }
              >
                <FounderCockpit data={data} />
              </Suspense>
            </main>
          ) : task ? (
            <main>
              <Suspense
                fallback={
                  <div className="mx-auto max-w-4xl px-5 py-24 text-center text-sm text-slate">
                    Loading the lamp…
                  </div>
                }
              >
                {/* Staged launch: locked lamps show Coming soon to the public;
                    founder mode bypasses so videos can be filmed and
                    submissions prepared. */}
                {isTaskPubliclyOpen(task.id) || founder ? (
                  <TaskDetail lamp={task} />
                ) : (
                  <ComingSoon lamp={task} />
                )}
              </Suspense>
            </main>
          ) : (
            <main>
              <Hero data={data} />
              <StackSection lamps={data.tasks} />
              <LampsSection lamps={data.tasks} />
              <ActivityFeed lamps={data.tasks.filter((t) => founder || isTaskPubliclyOpen(t.id))} />
            </main>
          )}
          <Footer />
        </div>
      </div>
    </WalletProvider>
  );
}
