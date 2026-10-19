import { Suspense, lazy } from "react";
import type { Lamp } from "../types";

/**
 * Try it live — with your own wallet.
 *
 * Glob-based loader: a per-task module at `./try/<lamp-slug>.tsx` default-exports
 * a component receiving `{ lamp }`. It is loaded via React.lazy + Suspense.
 * ZERO per-task registry edits needed — drop the file in and the section appears.
 * If no module exists for the task, this renders null (section stays hidden).
 */
const modules = import.meta.glob(["./try/*.tsx", "!./try/_TEMPLATE.tsx"]) as Record<
  string,
  () => Promise<{ default: React.ComponentType<{ lamp: Lamp }> }>
>;

export default function TryPanel({ lamp }: { lamp: Lamp }) {
  const load = modules[`./try/${lamp.slug}.tsx`];
  if (!load) return null;
  const LazyTry = lazy(load);

  return (
    <>
      <section className="mb-2 rounded-2xl border border-hairline bg-paper p-6 md:p-8">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="font-display text-2xl font-bold text-accent">◈</span>
          <h2 className="smallcaps !text-ink">Try it live — with your own wallet</h2>
        </div>
        <p className="mb-5 max-w-3xl text-xs leading-relaxed text-slate">
          Live reads run against the public Atlantic RPC and cost nothing — except where a panel
          says it reads via the Chain MCP (Pharos mainnet), which is mainnet-only by the Arena's
          requirement. Anything that moves funds is only ever <span className="font-semibold text-ink">proposed</span> here — you
          review it, then sign it in <span className="font-semibold text-ink">your own wallet</span>{" "}
          with <span className="font-semibold text-ink">your own testnet PHRS</span>. LIGHTKEEPER
          never sees, holds, or asks for private keys.
        </p>
        <Suspense
          fallback={
            <div className="empty-panel px-5 py-6 text-sm text-slate">
              Loading the live surface…
            </div>
          }
        >
          <LazyTry lamp={lamp} />
        </Suspense>
      </section>
      <hr className="flow-rule my-2" />
    </>
  );
}
