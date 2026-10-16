/**
 * T26 · Weekly Digest Agent — Tier C "Build your digest" config builder.
 *
 * Honest CLI config builder: the console never signs and never sends Telegram
 * messages — it generates the exact env config + run commands for the T26
 * digest agent, which the visitor copies into their own terminal. The sample
 * below is the task's REAL delivered digest (Telegram message_id 723).
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import { EXPLORER_ADDRESS, isValidAddress } from "../../hooks/useAtlantic";

// Public, real evidence — copied verbatim from tasks/t26-weekly-digest-agent.
const WATCH = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const DIGEST_MSG_ID = "723";
const DIGEST_WINDOW = "2026-10-09 → 2026-10-16 · blocks 31186577–31482619";
const DIGEST_TEXT = `📊 Weekly Digest — 0xf76e…71a3
Atlantic testnet · 2026-10-09 → 2026-10-16

Txs: 110 (+110 (prev 0))
Sent: 109 · Received: 1
Native in/out: 0.05/0.139866667 PHRS
Gas spent: 0.022912577 PHRS
Creations: 25 · Failed: 7 · Token xfers: 31

TOP 3 notable:
1. [FAILED TX] tx 0x91f7e02125… reverted/failed (receipt_status=0) in block 31482534
2. [FAILED TX] tx 0x31993dc871… reverted/failed (receipt_status=0) in block 31482265
3. [FAILED TX] tx 0x1a968603d0… reverted/failed (receipt_status=0) in block 31482202

Full digest: see LIGHTKEEPER t26 deliverable.`;

const inputCls =
  "w-full rounded-lg border border-hairline bg-white px-3 py-2.5 font-mono text-sm text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none";

const SECTIONS = [
  { id: "top3", label: "TOP 3 notable events", note: "deterministic ranking — failures first, no hand-picking" },
  { id: "volume", label: "Tx count + native volume", note: "sent/received, in/out PHRS, with previous-week Δ" },
  { id: "gas", label: "Gas stats", note: "total gas spent, previous-week Δ" },
  { id: "whales", label: "Whale moves", note: "large transfers ranked above the noise" },
  { id: "tokens", label: "Token transfers", note: "ERC20 Transfer events via chain-direct eth_getLogs" },
  { id: "failed", label: "Failed txs + creations", note: "reverts and contract creations in the window" },
] as const;

const CADENCES = [
  { id: "weekly", label: "Weekly · Monday 08:00", days: "7", cron: "0 8 * * 1" },
  { id: "daily", label: "Daily · 08:00", days: "1", cron: "0 8 * * *" },
  { id: "monthly", label: "Monthly · 1st, 08:00", days: "30", cron: "0 8 1 * *" },
] as const;

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-outline"
      disabled={disabled}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export default function TryWeeklyDigestAgent({ lamp }: { lamp: Lamp }) {
  const [address, setAddress] = useState(WATCH);
  const [sections, setSections] = useState<string[]>([
    "top3",
    "volume",
    "gas",
    "whales",
    "tokens",
    "failed",
  ]);
  const [cadenceId, setCadenceId] = useState<string>("weekly");

  const cadence = CADENCES.find((c) => c.id === cadenceId)!;
  const addrOk = isValidAddress(address);
  const valid = addrOk && sections.length > 0;

  const sectionLines = SECTIONS.filter((s) => sections.includes(s.id))
    .map((s) => `#   - ${s.label}: ${s.note}`)
    .join("\n");

  const configCmd = `# LIGHTKEEPER T26 — digest config (run inside tasks/t26-weekly-digest-agent)
# Secrets are NEVER stored here: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
# come from your environment (.env), never from config or code.

export WATCH_ADDRESS=${addrOk ? address : "<your-watched-address>"}
export WINDOW_DAYS=${cadence.days}
${sectionLines}

python3 src/digest.py --backfill   # once: real previous-window baseline -> state.json
python3 src/digest.py --run        # weekly: current digest + deltas -> digests/
python3 src/digest.py --deliver    # weekly: ONE Telegram sendMessage -> message_id receipt`;

  const cronCmd = `# Scheduling is external — Pharos SkillEngine exposes no cron primitive,
# so the skill does not schedule itself. Two operator-run options:
bash cron/install-weekly-cron.sh   # installs a Monday-08:00 crontab entry (interactive; --remove to uninstall)
# or copy cron/weekly-digest.github.yml into .github/workflows/ (same cadence, secrets in repo settings)
#
# The installed line looks like:
# ${cadence.cron} set -a; . "$ENV_FILE"; set +a; cd <task-dir> && /usr/bin/python3 src/digest.py --run >> cron/digest-cron.log 2>&1 && /usr/bin/python3 src/digest.py --deliver >> cron/digest-cron.log 2>&1`;

  const toggleSection = (id: string) =>
    setSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  return (
    <div className="space-y-6">
      {/* 1 — builder */}
      <div>
        <p className="smallcaps mb-1 text-slate">01 · Build your digest</p>
        <h3 className="text-lg font-semibold text-ink">
          Pick the sections, set the schedule — copy the exact commands
        </h3>
        <p className="mt-1 text-sm text-slate">
          The real T26 agent reads the chain directly and delivers one Telegram
          message per run. Configure it here, run it in your own terminal —
          nothing below is mock data.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate">
          Watched address (Atlantic testnet)
        </label>
        <input
          className={inputCls}
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
          placeholder="0x…"
          spellCheck={false}
        />
        {!addrOk && (
          <p className="mt-1 text-xs text-fail">
            Not a valid 0x address — fix it to generate the config.
          </p>
        )}
      </div>

      <fieldset className="rounded-xl border border-hairline bg-white p-4">
        <legend className="px-1 text-xs font-semibold text-slate">
          Digest sections ({sections.length}/{SECTIONS.length})
        </legend>
        <div className="grid gap-2 md:grid-cols-2">
          {SECTIONS.map((s) => (
            <label key={s.id} className="flex items-start gap-3 rounded-lg p-2 hover:bg-porcelain">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[#2456e6]"
                checked={sections.includes(s.id)}
                onChange={() => toggleSection(s.id)}
              />
              <span>
                <span className="text-sm font-semibold text-ink">{s.label}</span>
                <span className="block text-xs text-slate">{s.note}</span>
              </span>
            </label>
          ))}
        </div>
        {sections.length === 0 && (
          <p className="mt-2 text-xs text-fail">
            Pick at least one section — an empty digest is not a digest.
          </p>
        )}
      </fieldset>

      <div>
        <p className="mb-2 text-xs font-semibold text-slate">Schedule</p>
        <div className="flex flex-wrap gap-2">
          {CADENCES.map((c) => (
            <button
              key={c.id}
              className={c.id === cadenceId ? "btn-primary" : "btn-outline"}
              onClick={() => setCadenceId(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2 — generated config + commands */}
      <div>
        <p className="smallcaps mb-1 text-slate">02 · Your digest config</p>
        <div className="code-block mb-3 whitespace-pre-wrap">{configCmd}</div>
        <CopyButton text={configCmd} disabled={!valid} />
      </div>

      <div>
        <p className="smallcaps mb-1 text-slate">03 · Schedule it</p>
        <div className="code-block mb-3 whitespace-pre-wrap">{cronCmd}</div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={cronCmd} />
          <span className="chip chip-pass self-center">
            {lamp.points} pts · Tier C
          </span>
        </div>
        <p className="mt-2 text-xs text-slate">
          Read-only agent: zero transactions broadcast, 0 PHRS spent. The first
          digest has no previous period —{" "}
          <span className="font-mono text-xs">--backfill</span> exists precisely
          so the comparison is real history, and until it runs the digest
          labels deltas "baseline".
        </p>
      </div>

      {/* 4 — real sample digest */}
      <div>
        <p className="smallcaps mb-1 text-slate">04 · A real digest, delivered</p>
        <p className="mb-3 text-sm text-slate">
          The exact text the T26 agent delivered to a real Telegram channel on
          2026-10-16 (message_id{" "}
          <span className="font-mono text-xs">{DIGEST_MSG_ID}</span>, {DIGEST_WINDOW}).
        </p>
        <div className="code-block mb-3 whitespace-pre-wrap">{DIGEST_TEXT}</div>
        <table className="data-table">
          <tbody>
            <tr>
              <td className="font-semibold">Window</td>
              <td>{DIGEST_WINDOW}</td>
            </tr>
            <tr>
              <td className="font-semibold">Activity</td>
              <td>110 txs (109 sent / 1 received), 25 creations, 7 failed, 31 token-transfer events</td>
            </tr>
            <tr>
              <td className="font-semibold">Previous period</td>
              <td>0 txs — a real quiet baseline week, every delta is real data vs real data</td>
            </tr>
            <tr>
              <td className="font-semibold">Delivery</td>
              <td>
                one Telegram <span className="font-mono text-xs">sendMessage</span>,
                message_id <span className="font-mono text-xs">{DIGEST_MSG_ID}</span>,
                receipt recorded in <span className="font-mono text-xs">evidence.json</span>
              </td>
            </tr>
            <tr>
              <td className="font-semibold">Spend</td>
              <td>0 PHRS — the agent broadcasts nothing; only RPC reads + one Telegram message</td>
            </tr>
          </tbody>
        </table>
        <a
          className="mt-3 inline-block font-mono text-xs text-accent hover:underline"
          href={`${EXPLORER_ADDRESS}${WATCH}`}
          target="_blank"
          rel="noreferrer"
        >
          Watch the address on the explorer →
        </a>
      </div>
    </div>
  );
}
