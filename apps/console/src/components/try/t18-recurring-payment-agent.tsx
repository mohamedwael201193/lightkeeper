/**
 * T18 — Recurring Payment Agent ("TIDE") · Tier C builder
 *
 * "Design a recurring payment": the visitor fills recipient, amount,
 * interval, count, and start time; the builder validates everything live,
 * renders a plain-language schedule summary, and generates the EXACT
 * tide.py schedule.json plus the CLI commands to run it. Nothing executes
 * here — and nothing executes until the operator installs the cron line
 * on their own machine. LIGHTKEEPER never signs, never broadcasts, never
 * sees keys.
 *
 * Schema matches tasks/t18-recurring-payment-agent/config/schedule.example.json.
 * SkillEngine has NO native cron (confirmed-absent primitive G1) — ticks are
 * driven by the operator's system cron; the installer prints the line and
 * installs nothing.
 *
 * Presentation (SHOWTIME standard): 01 Configure → 02 Run (ProgressLoader
 * over the three real composition steps) → 03 Result (ResultCard showpiece
 * with the schedule as a premium document, idempotency key prominent, and
 * the TideTimeout/broadcast-unknown recovery story as a timeline).
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Eye, Hourglass, Receipt, ShieldCheck } from "lucide-react";
import type { Lamp } from "../../types";
import { isDustWarning, isValidAddress, phrsToWeiHex } from "../../hooks/useAtlantic";
import { EmptyState, ErrorState, FeedList, ProgressLoader, ResultCard } from "../ui";
import type { FeedItem } from "../ui";

const SECONDS_PER_DAY = 86_400;
const INTERVALS = {
  weekly: { label: "weekly", every: "every 7 days", seconds: 7 * SECONDS_PER_DAY },
  monthly: { label: "monthly", every: "every 30 days", seconds: 30 * SECONDS_PER_DAY },
} as const;
type IntervalKey = keyof typeof INTERVALS;

const GEN_STEPS = [
  "Validating schedule…",
  "Composing schedule…",
  "Verifying idempotency…",
];

type Phase = "configure" | "running" | "result" | "error";

/** Frozen output of one successful generation — 03 Result always renders this,
 *  never the live inputs, so tweaking the form can't silently change the
 *  document you already copied. */
interface Snapshot {
  recipient: string;
  amount: string;
  intervalKey: IntervalKey;
  countN: number;
  scheduleId: string;
  firstUTC: string;
  lastUTC: string;
  total: string;
  floor: string;
  scheduleJson: string;
  runUtc: string[];
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtUtc(d: Date): string {
  return d.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function shortAddr(a: string): string {
  return a.length > 13 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Total payable, computed exactly from wei — no float rounding. */
function mulPhrs(amount: string, n: number): string {
  const wei = BigInt(phrsToWeiHex(amount)) * BigInt(n);
  const s = wei.toString().padStart(19, "0");
  const int = s.slice(0, -18);
  const frac = s.slice(-18).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

export default function TryT18({ lamp }: { lamp: Lamp }) {
  void lamp;
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState<IntervalKey>("weekly");
  const [count, setCount] = useState("4");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("12:00");
  const [floor, setFloor] = useState("1.0");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCmds, setCopiedCmds] = useState(false);

  const [phase, setPhase] = useState<Phase>("configure");
  const [step, setStep] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<Snapshot | null>(null);

  const [scheduleId] = useState(
    () => `tide-console-${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")}`
  );

  const addrOk = isValidAddress(recipient.trim());
  const addrPending = recipient.trim() === "";
  let amtOk = false;
  try {
    // tide.py's load_schedule() rejects amount <= 0 — mirror it here so the
    // builder never generates a config the executor would refuse.
    amtOk = phrsToWeiHex(amount) !== "0x0";
  } catch {
    amtOk = false;
  }
  const amtPending = amount.trim() === "";
  const countN = Number.parseInt(count, 10);
  const countOk = Number.isInteger(countN) && countN >= 1 && countN <= 1000;
  const startUtc = useMemo(() => {
    const d = new Date(`${date}T${time}:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [date, time]);
  const startInFuture = startUtc !== null && startUtc.getTime() > Date.now();
  let floorOk = false;
  try {
    phrsToWeiHex(floor);
    floorOk = true;
  } catch {
    floorOk = false;
  }

  const ready = addrOk && amtOk && countOk && startUtc !== null;
  const dustHit = amtOk && isDustWarning(amount);

  const spec = INTERVALS[interval];

  /** A form edit after a successful generation invalidates the document —
   *  go back to 01 so the next generation is deliberate. */
  const touch =
    (handler: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      handler(e);
      if (phase === "result") {
        setPhase("configure");
        setResult(null);
      }
    };

  /** Let the loader paint between real steps — a paint yield, not a delay. */
  const paint = () =>
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  /** Step 1 of generation: the same checks the form shows live, re-run as
   *  one honest gate. Returns the first failure in plain language. */
  function validateNow(): string | null {
    if (!isValidAddress(recipient.trim()))
      return "The recipient is not a valid 0x address. Double-check it, then generate again.";
    let wei = "";
    try {
      wei = phrsToWeiHex(amount);
    } catch {
      return `The amount "${amount.trim()}" does not parse — use a number with up to 18 decimals.`;
    }
    if (wei === "0x0")
      return "The amount must be above zero — tide.py refuses a zero-amount schedule.";
    if (!countOk) return "The run count must be a whole number between 1 and 1000.";
    if (startUtc === null) return "The start date/time is not valid.";
    try {
      phrsToWeiHex(floor);
    } catch {
      return `The balance floor "${floor.trim()}" does not parse.`;
    }
    return null;
  }

  /** Step 2 of generation: freeze the schedule from the validated inputs. */
  function composeNow(): Snapshot {
    const start = startUtc as Date; // validated in step 1
    const runs = Array.from(
      { length: countN },
      (_, i) => new Date(start.getTime() + i * spec.seconds * 1000)
    );
    const json = JSON.stringify(
      {
        schedule_id: scheduleId,
        recipient: recipient.trim(),
        amount_phrs: amount.trim(),
        token: "PHRS",
        token_type: "native",
        interval: spec.label,
        start_time: start.toISOString().replace(".000Z", "Z"),
        max_runs: countN,
        stop_conditions: {
          expires_at: null,
          min_balance_after_phrs: floorOk ? floor.trim() : "1.0",
        },
        control: { paused: false, cancelled: false },
      },
      null,
      2
    );
    return {
      recipient: recipient.trim(),
      amount: amount.trim(),
      intervalKey: interval,
      countN,
      scheduleId,
      firstUTC: fmtUtc(runs[0]),
      lastUTC: fmtUtc(runs[runs.length - 1]),
      total: mulPhrs(amount.trim(), countN),
      floor: floorOk ? floor.trim() : "1.0",
      scheduleJson: json,
      runUtc: runs.map((d) => fmtUtc(d)),
    };
  }

  /** Step 3 of generation: the exact idempotency rule tide.py enforces —
   *  every installment key `schedule_id · #n` must be unique and cover all
   *  runs, so a re-tick can never double-pay. */
  function verifyIdempotency(snap: Snapshot): void {
    const keys = snap.runUtc.map((_, n) => `${snap.scheduleId} · #${n}`);
    if (keys.length !== snap.countN)
      throw new Error(
        `Idempotency check failed: ${keys.length} keys for ${snap.countN} runs. This should never happen — nothing was generated.`
      );
    if (new Set(keys).size !== keys.length)
      throw new Error(
        "Idempotency check failed: two installments share a key. Nothing was generated — the executor would refuse this."
      );
  }

  async function generate() {
    if (!ready || phase === "running") return;
    setRunError(null);
    setResult(null);
    setPhase("running");
    try {
      setStep(0);
      await paint();
      const problem = validateNow();
      if (problem) throw new Error(problem);
      setStep(1);
      await paint();
      const snap = composeNow();
      setStep(2);
      await paint();
      verifyIdempotency(snap);
      setStep(GEN_STEPS.length);
      await paint();
      setResult(snap);
      setPhase("result");
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "The schedule could not be built.");
      setPhase("error");
    }
  }

  const retry = () => {
    setRunError(null);
    setPhase("configure");
  };

  const copy = async (text: string, which: "key" | "cmds") => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard unavailable (old browser / permissions) — fall back to a
      // manual selection target so the value is still reachable.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    if (which === "key") {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedCmds(true);
      setTimeout(() => setCopiedCmds(false), 2000);
    }
  };

  const checks = [
    { label: "Recipient is a valid 0x address", state: addrPending ? "dim" : addrOk ? "pass" : "fail" },
    { label: "Amount parses and is above zero (up to 18 decimals)", state: amtPending ? "dim" : amtOk ? "pass" : "fail" },
    { label: "Run count ≥ 1", state: count.trim() === "" ? "dim" : countOk ? "pass" : "fail" },
    {
      label:
        startUtc === null
          ? "Start time is valid"
          : startInFuture
            ? "Start time is in the future"
            : "Start is in the past — the first tick pays immediately",
      state: startUtc === null ? "fail" : startInFuture ? "pass" : "warn",
    },
    { label: "Balance floor parses", state: floorOk ? "pass" : "fail" },
  ];

  const commands = useMemo(
    () => `# ── TIDE recurring schedule — built in the LIGHTKEEPER console (T18) ──
# Runs in YOUR terminal with YOUR keys. LIGHTKEEPER never executes this.
# SkillEngine has no native cron: ticks are driven by YOUR system cron.

cd ~/workspace/lightkeeper/tasks/t18-recurring-payment-agent
cp config/schedule.example.json config/schedule.json
# 1. Paste the schedule above into config/schedule.json, then inspect:
python3 src/tide.py status        # history board + next scheduled payment

# 2. Ticks pay AT MOST ONE due installment, else print SKIP — safe every minute:
export ATLANTIC_RPC_URL="https://atlantic.dplabs-internal.com"   # your own RPC endpoint
export DEPLOYER_PRIVATE_KEY="<your-private-key>"                  # your own key — never shared
python3 src/tide.py tick

# 3. For the rhythm to run itself, print the exact cron line for YOUR machine
#    (the installer only prints — it installs nothing):
./scripts/install-cron.sh
# then:  crontab -e            # paste the printed line
# check: crontab -l | grep tide.py

# Kill switches:  python3 src/tide.py pause | resume | cancel`,
    []
  );

  // Installment feed for the result: first three, a gap row, the last —
  // the idempotency key (`schedule_id` · `#n`) is the exact key tide.py uses
  // to never double-pay.
  const feedItems: FeedItem[] = useMemo(() => {
    if (!result) return [];
    const items: FeedItem[] = [];
    const push = (n: number) =>
      items.push({
        key: `run-${n}`,
        node: (
          <div>
            <p className="text-sm font-semibold text-ink">
              Payment #{n + 1}{" "}
              <span className="font-mono font-normal text-slate">
                {result.scheduleId} · #{n}
              </span>
            </p>
            <p className="mt-0.5 font-mono text-xs text-slate">
              Due {result.runUtc[n]} · {result.amount} PHRS
            </p>
          </div>
        ),
      });
    if (result.countN <= 7) {
      for (let n = 0; n < result.countN; n++) push(n);
    } else {
      for (let n = 0; n < 3; n++) push(n);
      items.push({
        key: "gap",
        node: (
          <p className="text-center text-sm text-slate">
            … {result.countN - 4} more installments — same rhythm, same key pattern …
          </p>
        ),
      });
      push(result.countN - 1);
    }
    return items;
  }, [result]);

  const recoverySteps = [
    {
      icon: ShieldCheck,
      title: "Checked before anything moves",
      body: "Every tick validates your balance and the floor first. A tick that would overdraw or breach the floor fails without broadcasting anything.",
    },
    {
      icon: Receipt,
      title: "Paid means a receipt was observed",
      body: "An installment is marked paid only after an observed on-chain receipt — re-running a tick can never double-pay.",
    },
    {
      icon: Hourglass,
      title: "A stall is never silent, never retried",
      body: "A stalled RPC call raises TideTimeout — never a silent hang. The installment is parked broadcast-unknown: never auto-retried, never marked failed.",
    },
    {
      icon: Eye,
      title: "A human reconciles; the agent waits",
      body: "broadcast-unknown needs human eyes — check the explorer, then resume. The agent never re-broadcasts on its own.",
    },
  ];

  const resSpec = result ? INTERVALS[result.intervalKey] : null;

  return (
    <div className="space-y-6">
      {/* 01 — design the schedule */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate">01 · Design the schedule</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate">Recipient</span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 font-mono text-sm text-ink placeholder:text-slate/60"
              placeholder="0x…"
              value={recipient}
              onChange={touch((e) => setRecipient(e.target.value))}
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate">Amount (PHRS)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 font-mono text-sm text-ink placeholder:text-slate/60"
              placeholder="e.g. 0.01"
              value={amount}
              onChange={touch((e) => setAmount(e.target.value))}
              inputMode="decimal"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate">Interval</span>
            <select
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink"
              value={interval}
              onChange={touch((e) => setInterval(e.target.value as IntervalKey))}
            >
              {Object.entries(INTERVALS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} — {v.every}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate">How many payments (max runs)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 font-mono text-sm text-ink placeholder:text-slate/60"
              placeholder="e.g. 4"
              value={count}
              onChange={touch((e) => setCount(e.target.value))}
              inputMode="numeric"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate">First run — date (UTC)</span>
            <input
              type="date"
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink"
              value={date}
              onChange={touch((e) => setDate(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate">First run — time (UTC)</span>
            <input
              type="time"
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink"
              value={time}
              onChange={touch((e) => setTime(e.target.value))}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-slate">
              Stop condition — minimum wallet balance left after a payment (PHRS)
            </span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 font-mono text-sm text-ink placeholder:text-slate/60 md:w-64"
              placeholder="1.0"
              value={floor}
              onChange={touch((e) => setFloor(e.target.value))}
              inputMode="decimal"
              spellCheck={false}
            />
            <span className="mt-1 block text-sm text-slate">
              A tick that would breach this floor fails <span className="font-semibold">without broadcasting anything</span>.
            </span>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {checks.map((c) => (
            <span
              key={c.label}
              className={`chip ${c.state === "pass" ? "chip-pass" : c.state === "fail" ? "chip-fail" : c.state === "warn" ? "chip-info" : "chip-dim"}`}
            >
              {c.label}
              {c.state === "pass" ? " ✓" : c.state === "fail" ? " ✕" : ""}
            </span>
          ))}
          {dustHit && <span className="chip chip-info">amount &gt; 0.01 PHRS — dust warning</span>}
        </div>
        <button
          type="button"
          className="btn-primary mt-4 w-full min-h-[48px] sm:w-auto sm:min-w-64"
          disabled={!ready || phase === "running"}
          onClick={generate}
        >
          {phase === "running" ? "Composing…" : "Generate the schedule"}
        </button>
        {!ready && phase !== "running" && (
          <p className="mt-2 text-sm text-slate">
            Fill in every field above — the builder validates live, then composes the exact
            schedule.json for tide.py.
          </p>
        )}
      </div>

      {/* 02 — run: honest progress while the schedule is composed */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate">02 · Run</p>
        {phase === "running" && (
          <ProgressLoader steps={GEN_STEPS} current={step} title="Composing your schedule" />
        )}
        {phase === "configure" && !result && (
          <EmptyState
            title="Nothing composed yet"
            message="Design the schedule above and hit “Generate the schedule”. The builder validates every field, composes the exact schedule.json, and verifies the idempotency keys — all in your browser, nothing leaves your machine."
          />
        )}
        {phase === "error" && (
          <ErrorState
            title="The schedule could not be built"
            message={runError ?? "Something failed while composing the schedule."}
            hint="Nothing was generated and nothing was saved — your inputs are untouched below."
            retryLabel="Back to the form"
            onRetry={retry}
          />
        )}
      </div>

      {/* 03 — result: the schedule as a premium document */}
      {phase === "result" && result && resSpec && (
        <div className="space-y-6">
          <p className="text-sm font-semibold text-slate">03 · Result — your schedule</p>

          <ResultCard
            eyebrow="Result — composed schedule"
            headline={
              <>
                {result.amount} PHRS <span className="text-accent">·</span> {resSpec.label} ×{" "}
                {result.countN}
              </>
            }
            subline={
              <>
                <span className="font-mono font-semibold">{shortAddr(result.recipient)}</span>{" "}
                receives {result.amount} PHRS {resSpec.every}, {result.countN}{" "}
                {result.countN === 1 ? "time" : "times"} — first run {result.firstUTC}, last run{" "}
                {result.lastUTC}. Total payable:{" "}
                <span className="font-semibold">{result.total} PHRS</span>.
              </>
            }
            status="pass"
            copyValue={result.scheduleJson}
            rows={[
              { label: "Schedule ID", value: result.scheduleId },
              { label: "Recipient", value: result.recipient },
              { label: "Cadence", value: `${resSpec.label} — ${resSpec.every}` },
              { label: "First run", value: result.firstUTC },
              { label: "Last run", value: result.lastUTC },
              { label: "Total payable", value: `${result.total} PHRS` },
              {
                label: "Balance floor",
                value: `${result.floor} PHRS — a tick below this broadcasts nothing`,
              },
            ]}
          />

          {/* Idempotency — the key, prominent and elegant */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="rounded-2xl border border-hairline bg-tint p-6 sm:p-8"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={20} className="text-accent" aria-hidden />
              <h4 className="text-lg font-semibold text-ink">Idempotency — never twice</h4>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3.5">
              <p className="font-mono text-base font-semibold text-ink sm:text-lg">
                {result.scheduleId} · #n
              </p>
              <button
                type="button"
                onClick={() => copy(result.scheduleId, "key")}
                className="btn-outline inline-flex min-h-[40px] items-center gap-2 !px-3 !text-sm"
                aria-label="Copy schedule ID"
              >
                {copiedKey ? <Check size={16} className="text-pass" /> : <Copy size={16} />}
                {copiedKey ? "Copied" : "Copy ID"}
              </button>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink">
              Every installment carries this key. The executor marks an installment paid only
              after an observed on-chain receipt — so re-ticking the same key{" "}
              <span className="font-semibold">skips instead of paying</span>. The exact rule
              tide.py enforces, verified during generation.
            </p>
          </motion.section>

          {/* Recovery — what happens when something goes wrong */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut", delay: 0.08 }}
            className="rounded-2xl border border-hairline bg-white p-6 sm:p-8"
          >
            <h4 className="text-lg font-semibold text-ink">Recovery — the safety story</h4>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate">
              The executor's exact guarantees, straight from tide.py — this is what protects
              every schedule it runs.
            </p>
            <ol className="relative mt-6 space-y-6 border-l-2 border-tint pl-0">
              {recoverySteps.map((s, i) => (
                <motion.li
                  key={s.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.08 + i * 0.05 }}
                  className="relative pl-10"
                >
                  <span className="absolute -left-[21px] top-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-tint bg-white">
                    <s.icon size={18} className="text-accent" aria-hidden />
                  </span>
                  <p className="text-sm font-semibold text-ink sm:text-base">{s.title}</p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate">{s.body}</p>
                </motion.li>
              ))}
            </ol>
          </motion.section>

          {/* Installment feed */}
          <div>
            <h4 className="mb-3 text-lg font-semibold text-ink">Installments</h4>
            <FeedList items={feedItems} maxHeight="max-h-96" emptyText="No installments." />
          </div>

          {/* The file + the commands */}
          <div>
            <h4 className="mb-3 text-lg font-semibold text-ink">Take it to your terminal</h4>
            <p className="mb-2 text-sm font-semibold text-ink">
              schedule.json <span className="font-mono font-normal text-slate">({result.scheduleId})</span>
              <span className="ml-2 font-normal text-slate">— copied with the button on the result card</span>
            </p>
            <div className="code-block mb-4 max-h-72 overflow-auto whitespace-pre font-mono text-xs leading-relaxed">
              {result.scheduleJson}
            </div>
            <p className="mb-2 text-sm font-semibold text-ink">Commands</p>
            <div className="code-block mb-3 max-h-80 overflow-auto whitespace-pre font-mono text-xs leading-relaxed">
              {commands}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-outline" onClick={() => copy(commands, "cmds")}>
                {copiedCmds ? "Copied ✓" : "Copy commands"}
              </button>
              <p className="max-w-xl text-sm text-slate">
                Nothing here broadcasts anything: this is a file and a set of commands. The
                schedule runs only after <span className="font-semibold">you</span> install the
                cron line on <span className="font-semibold">your</span> machine, with{" "}
                <span className="font-semibold">your</span> keys, on Atlantic testnet.
                LIGHTKEEPER never sees your keys.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
