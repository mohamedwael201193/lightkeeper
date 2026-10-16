import { BookOpen, Package } from "lucide-react";
import type { Lamp } from "../types";
import { taskRoute } from "../types";

interface Lib {
  name: string;
  what: string;
  usedBy: string;
  status: string;
}

// Honest status: the 10 packages are spec'd in the shared-libs spec
// (pharos-arena/shards/a4-shared-libs.md); the scaffolds exist under
// packages/*/ with title-only READMEs and empty src/ — not implemented yet.
const LIBS: Lib[] = [
  {
    name: "@lightkeeper/chain-data",
    what: "The only package that touches RPC/Chain MCP — canonical Atlantic network table, balances, contract reads, logs, receipts, gas.",
    usedBy: "T01, T02, T05, T06, T12…",
    status: "spec'd",
  },
  {
    name: "@lightkeeper/docs-grounding",
    what: "Every technical assertion cites a canonical doc URL — doc-source types and citation helpers.",
    usedBy: "T03, T04, T13, T27",
    status: "spec'd",
  },
  {
    name: "@lightkeeper/skill-adapter",
    what: "Typed boundary for invoking SkillEngine skills — captures tool errors instead of masking them.",
    usedBy: "T05–T12, T17–T19, T28",
    status: "spec'd",
  },
  {
    name: "@lightkeeper/value-format",
    what: "Human formatting for amounts/addresses — every formatted value keeps its raw form alongside for evidence.",
    usedBy: "nearly all tasks",
    status: "spec'd",
  },
  {
    name: "@lightkeeper/policy",
    what: "Pre-execution gate. Fail-closed: missing policy, unknown destination, or stale data ⇒ BLOCK.",
    usedBy: "T05, T07, T08, T11",
    status: "spec'd",
  },
  {
    name: "@lightkeeper/workflow",
    what: "Durable multi-step state machine — retries, idempotency, and explicit compensating actions (not rollbacks).",
    usedBy: "T06, T28",
    status: "spec'd",
  },
  {
    name: "@lightkeeper/persistence",
    what: "Durable state between runs — observations, watchlists, checkpoints, digests. SQLite file backend, no server.",
    usedBy: "T02, T07, T09, T20…",
    status: "spec'd",
  },
  {
    name: "@lightkeeper/portfolio",
    what: "Normalized balances, positions, and yields across protocols. Read-only.",
    usedBy: "T14, T15, T28",
    status: "spec'd",
  },
  {
    name: "@lightkeeper/notifications",
    what: "Alert/report delivery (Telegram, Discord, email, console) — every send evidence-logged.",
    usedBy: "T02, T09, T16, T20, T21",
    status: "spec'd",
  },
  {
    name: "@lightkeeper/evidence",
    what: "The proof pipeline — every run emits records; evidence.md is rendered from them, never hand-written.",
    usedBy: "all tasks",
    status: "spec'd",
  },
];

const TOOLKIT_ORDER = [
  "Chain MCP",
  "SkillEngine",
  "Developer Docs MCP",
  "Composition",
  "Cross-tool / Advanced",
  "DeFi / Portfolio",
  "Payments",
  "Trading / Monitoring",
  "Compliance / Security",
  "Support / Reporting",
];

/**
 * The Stack — the 10 shared libraries (what each does) + the 28-task matrix
 * grouped by toolkit, each chip linking to its flow view.
 */
export default function StackSection({ lamps }: { lamps: Lamp[] }) {
  const byToolkit = new Map<string, Lamp[]>();
  for (const l of lamps) {
    const list = byToolkit.get(l.toolkit) ?? [];
    list.push(l);
    byToolkit.set(l.toolkit, list);
  }
  const ordered = TOOLKIT_ORDER.filter((t) => byToolkit.has(t)).concat(
    [...byToolkit.keys()].filter((t) => !TOOLKIT_ORDER.includes(t)).sort()
  );

  return (
    <section id="stack" className="scroll-mt-32 border-b border-hairline bg-porcelain">
      <div className="mx-auto max-w-[1440px] px-5 py-16 lg:px-10">
        <div className="mb-10 max-w-2xl">
          <h2 className="smallcaps mb-3">The Stack</h2>
          <p className="wordmark text-[clamp(1.5rem,3vw,2.2rem)]">
            Ten libraries. Twenty-eight skills.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-slate">
            The shared <code className="font-mono text-accentdeep">@lightkeeper/*</code> libraries
            every task builds on — and the 28-skill build matrix grouped by toolkit. Library
            status comes from the repo itself: the specs exist under{" "}
            <code className="font-mono text-accentdeep">packages/</code>, implementation is still
            landing.
          </p>
        </div>

        <div className="mb-14">
          <h3 className="mb-5 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-ink">
            <Package size={16} className="text-accent" /> Shared libraries
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {LIBS.map((lib) => (
              <article
                key={lib.name}
                className="rounded-2xl border border-hairline bg-paper p-5 transition-shadow hover:shadow-[0_8px_28px_rgba(11,21,51,0.08)]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <code className="font-mono text-[13px] font-bold text-ink">{lib.name}</code>
                  <span className="chip chip-info">{lib.status}</span>
                </div>
                <p className="text-sm leading-relaxed text-slate">{lib.what}</p>
                <p className="mt-3 font-mono text-xs text-slate/80">consumed by {lib.usedBy}</p>
              </article>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-5 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-ink">
            <BookOpen size={16} className="text-accent" /> Skill matrix — 28 tasks by toolkit
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ordered.map((toolkit) => {
              const list = byToolkit.get(toolkit)!;
              const lit = list.filter((l) => l.status === "shipped").length;
              return (
                <article
                  key={toolkit}
                  className="rounded-2xl border border-hairline bg-paper p-5"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-bold text-ink">{toolkit}</h4>
                    <span className="tabular text-xs font-semibold text-slate">
                      {lit}/{list.length} lit
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((l) => (
                      <a
                        key={l.id}
                        href={taskRoute(l)}
                        title={`${l.id} — ${l.name}`}
                        className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold transition-colors ${
                          l.status === "shipped"
                            ? "bg-gold/15 text-golddeep hover:bg-gold/25"
                            : "bg-tint text-accentdeep hover:bg-tintdeep"
                        }`}
                      >
                        {l.id}
                      </a>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
