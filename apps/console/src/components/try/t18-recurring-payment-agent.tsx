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
 */
import { useMemo, useState } from "react";
import type { Lamp } from "../../types";
import { isDustWarning, isValidAddress, phrsToWeiHex } from "../../hooks/useAtlantic";

const SECONDS_PER_DAY = 86_400;
const INTERVALS = {
  weekly: { label: "weekly", every: "every 7 days", seconds: 7 * SECONDS_PER_DAY },
  monthly: { label: "monthly", every: "every 30 days", seconds: 30 * SECONDS_PER_DAY },
} as const;
type IntervalKey = keyof typeof INTERVALS;

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

export default function TryT18({ lamp }: { lamp: Lamp }) {
  void lamp;
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState<IntervalKey>("weekly");
  const [count, setCount] = useState("4");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("12:00");
  const [floor, setFloor] = useState("1.0");
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedCmds, setCopiedCmds] = useState(false);
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
  const runs = useMemo(() => {
    if (!ready || !startUtc) return [];
    return Array.from({ length: countN }, (_, i) => new Date(startUtc.getTime() + i * spec.seconds * 1000));
  }, [ready, startUtc, countN, spec]);

  // Table rows: installment number + due date. When there are many runs we
  // show the first three, a gap row, and the last — the idempotency key
  // (`schedule_id` · `#n`) is the exact key tide.py uses to never double-pay.
  const rows = useMemo(() => {
    if (runs.length <= 1) return [];
    if (runs.length <= 7) return runs.map((d, n) => ({ n, d, gap: false as const }));
    return [
      ...runs.slice(0, 3).map((d, n) => ({ n, d, gap: false as const })),
      { n: -1, d: new Date(0), gap: true as const },
      { n: runs.length - 1, d: runs[runs.length - 1], gap: false as const },
    ];
  }, [runs]);

  const scheduleJson = useMemo(() => {
    if (!ready || !startUtc) return "# fill in every field above to generate the schedule";
    return JSON.stringify(
      {
        schedule_id: scheduleId,
        recipient: recipient.trim(),
        amount_phrs: amount.trim(),
        token: "PHRS",
        token_type: "native",
        interval: spec.label,
        start_time: startUtc.toISOString().replace(".000Z", "Z"),
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
  }, [ready, startUtc, scheduleId, recipient, amount, spec, countN, floor, floorOk]);

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

  const copy = async (text: string, which: "json" | "cmds") => {
    await navigator.clipboard.writeText(text);
    if (which === "json") {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
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

  return (
    <div className="space-y-6">
      {/* 01 — design the schedule */}
      <div>
        <p className="smallcaps mb-3">01 · Design the schedule</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Recipient</span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-slate/60"
              placeholder="0x…"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Amount (PHRS)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-slate/60"
              placeholder="e.g. 0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">Interval</span>
            <select
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-xs text-ink"
              value={interval}
              onChange={(e) => setInterval(e.target.value as IntervalKey)}
            >
              {Object.entries(INTERVALS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} — {v.every}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">How many payments (max runs)</span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-slate/60"
              placeholder="e.g. 4"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              inputMode="numeric"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">First run — date (UTC)</span>
            <input
              type="date"
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-xs text-ink"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">First run — time (UTC)</span>
            <input
              type="time"
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-xs text-ink"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-ink">
              Stop condition — minimum wallet balance left after a payment (PHRS)
            </span>
            <input
              className="w-full rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-xs text-ink placeholder:text-slate/60 md:w-64"
              placeholder="1.0"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              inputMode="decimal"
              spellCheck={false}
            />
            <span className="mt-1 block text-xs text-slate">
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
      </div>

      {/* 02 — plain-language summary */}
      <div>
        <p className="smallcaps mb-3">02 · What you just designed</p>
        {!ready || runs.length === 0 ? (
          <div className="empty-panel px-5 py-6 text-sm text-slate">
            Fill in every field above — a plain-language summary of the rhythm appears here.
          </div>
        ) : (
          <div className="rounded-xl border border-hairline bg-porcelain p-4">
            <p className="text-sm leading-relaxed text-ink">
              <span className="font-mono font-bold">{amount.trim()} PHRS</span> to{" "}
              <span className="font-mono font-bold">{shortAddr(recipient.trim())}</span>{" "}
              {spec.every} (<span className="font-semibold">{spec.label}</span>),{" "}
              <span className="font-bold">{countN} payment{countN === 1 ? "" : "s"}</span> —
              first run <span className="font-semibold">{fmtUtc(runs[0])}</span>, last run{" "}
              <span className="font-semibold">{fmtUtc(runs[runs.length - 1])}</span>.
            </p>
            <p className="mt-2 text-xs text-slate">
              Each payment happens exactly once: an installment is marked paid only after an
              observed on-chain receipt — re-running a tick can never double-pay.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate">
              <li>
                <span className="font-semibold text-ink">Never twice.</span> Every installment
                carries the idempotency key{" "}
                <span className="font-mono text-ink">{scheduleId} · #n</span> — the same key
                re-ticked skips instead of paying.
              </li>
              <li>
                <span className="font-semibold text-ink">Never broke.</span> Validation runs
                before every broadcast: a tick that would overdraw or breach your balance
                floor fails without broadcasting anything.
              </li>
              <li>
                <span className="font-semibold text-ink">Never stranded.</span> A broadcast
                that stalls is parked <span className="font-mono">broadcast-unknown</span> and
                never auto-retried — the operator reconciles, the agent waits.
              </li>
            </ul>
            {runs.length > 1 && (
              <div className="mt-3 overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Idempotency key</th>
                      <th>Due (UTC)</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) =>
                      r.gap ? (
                        <tr key="gap">
                          <td colSpan={4} className="text-center text-slate">
                            … {runs.length - 4} more …
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.d.getTime()}>
                          <td className="font-mono">{r.n + 1}</td>
                          <td className="font-mono">
                            {scheduleId} · #{r.n}
                          </td>
                          <td className="font-mono">{fmtUtc(r.d)}</td>
                          <td className="font-mono">{amount.trim()} PHRS</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 03 — config + commands */}
      <div>
        <p className="smallcaps mb-3">03 · Your schedule file & commands — run in your terminal</p>
        <p className="mb-2 text-xs font-semibold text-ink">
          schedule.json <span className="font-mono text-slate">({scheduleId})</span>
        </p>
        <div className="code-block mb-3 max-h-72 overflow-auto whitespace-pre font-mono text-xs leading-relaxed">
          {scheduleJson}
        </div>
        <button className="btn-primary mb-5" disabled={!ready} onClick={() => copy(scheduleJson, "json")}>
          {copiedJson ? "Copied ✓" : "Copy schedule.json"}
        </button>
        <p className="mb-2 text-xs font-semibold text-ink">Commands</p>
        <div className="code-block mb-3 max-h-80 overflow-auto whitespace-pre font-mono text-xs leading-relaxed">
          {commands}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-outline" onClick={() => copy(commands, "cmds")}>
            {copiedCmds ? "Copied ✓" : "Copy commands"}
          </button>
          <p className="max-w-xl text-xs text-slate">
            Nothing here broadcasts anything: this is a file and a set of commands. The schedule
            runs only after <span className="font-semibold">you</span> install the cron line on{" "}
            <span className="font-semibold">your</span> machine, with <span className="font-semibold">your</span>{" "}
            keys, on Atlantic testnet. LIGHTKEEPER never sees your keys.
          </p>
        </div>
      </div>
    </div>
  );
}
