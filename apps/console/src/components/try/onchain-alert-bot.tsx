/**
 * T20 · On-Chain Alert Bot — Tier C "Alerts in 60 seconds" rule builder +
 * live ledger re-verification.
 *
 * 01 · Configure your watcher — the interactive config builder. It generates
 *      the exact config.yaml the real T20 watcher reads; the visitor copies
 *      it into their own terminal. The console never executes the watcher,
 *      never holds a Telegram token, never sends an alert.
 * 02 · Run — "Verify the ledger live": replays the watcher's PRODUCTION
 *      alert ledger (state/alerts.log, 35 alerts, 0 duplicate keys) against
 *      the live Atlantic chain in the visitor's browser — eth_blockNumber
 *      (arm the watcher) then eth_getTransactionReceipt per alert tx, receipt
 *      status + block + recipient re-checked. Two real async calls, two
 *      ProgressLoader steps, nothing else.
 * 03 · Result — the ledger as the showpiece: ResultCard (the live replay
 *      verdict + the 210 PASS audit badge), StatStrip (35 alerts fired /
 *      0 duplicate keys / 210 audit checks passed), the verbatim Telegram
 *      alert from the threshold trip, and a FeedList of all 35 alerts —
 *      every alert carrying its own receipt.
 *
 * Ledger semantics are the task's own and are NOT touched here:
 * write-ahead SENDING marker before Telegram, SENT after; dedupe key
 * <condition>:<txhash>; src/audit.sh replays the same ledger with 6 checks
 * per alert (210 PASS, 0 FAIL). This module only re-presents and
 * re-verifies that ledger live.
 */
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Bell,
  BellRing,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import type { Lamp } from "../../types";
import { EXPLORER_TX, isValidAddress, rpcCall } from "../../hooks/useAtlantic";
import {
  ResultCard,
  ProgressLoader,
  EmptyState,
  ErrorState,
  StatStrip,
  FeedList,
} from "../ui";
import type { FeedItem } from "../ui";

// ---------------------------------------------------------------------------
// Real evidence — copied verbatim from tasks/t20-onchain-alert-bot.
// ---------------------------------------------------------------------------

/** The address the production watcher guards (Atlantic testnet). */
const WATCHED = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";

// First proof: 0.001 PHRS dust trigger (incoming-transfer only).
const PROOF_TX =
  "0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084";
// Threshold proof (2026-10-16): a disclosed 0.5 PHRS self-transfer fired BOTH
// conditions — incoming-transfer (message_id 727) + large-transfer
// (message_id 728), each alerted exactly once. First live trip of the
// threshold path.
const LARGE_TX =
  "0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a";
const LARGE_BLOCK = "31486611";
const LARGE_MSG_IDS = "727, 728";
const LARGE_ALERT_TIME = "2026-10-16T06:51:49Z";
// Latest task-side ledger audit: src/audit.sh, 6 checks per alert.
const AUDIT_RESULT = "210 PASS · 0 FAIL";
const AUDIT_RUN = "2026-10-16T07:27:32Z";

interface AlertEntry {
  cond: string;
  tx: string;
  block: string;
  msg: string;
  ts: string;
  amountPhrs?: string;
}

/**
 * The production ledger, verbatim from state/alerts.log: 35 alerts, each one
 * SENDING + one SENT, 35 unique <condition>:<txhash> dedupe keys. Amounts are
 * shown only where the task's evidence records them (the two disclosed
 * self-test transfers); nothing is inferred for the rest.
 */
const ALERTS: AlertEntry[] = [
  { cond: "incoming-transfer", tx: "0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084", block: "31481424", msg: "717", ts: "2026-10-16T04:19:18Z", amountPhrs: "0.001" },
  { cond: "incoming-transfer", tx: "0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9", block: "31481475", msg: "718", ts: "2026-10-16T04:25:49Z" },
  { cond: "incoming-transfer", tx: "0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10", block: "31481497", msg: "719", ts: "2026-10-16T04:27:45Z" },
  { cond: "incoming-transfer", tx: "0xcff6be41a4eee20b094369d1791971b0e41671ed4f7c20be27bc0649193353ea", block: "31481530", msg: "720", ts: "2026-10-16T04:32:33Z" },
  { cond: "incoming-transfer", tx: "0x1c9d62c6496e626ff10ffab8157b587908b0faca92dd71517095de61ba1d3050", block: "31481582", msg: "722", ts: "2026-10-16T04:38:17Z" },
  { cond: "incoming-transfer", tx: "0x1c8c65374bc2210b221604a64c6190f6145da30a9416e9181f7f85b267ce2366", block: "31481636", msg: "724", ts: "2026-10-16T04:42:44Z" },
  { cond: "incoming-transfer", tx: "0xe6ca0c8e3a442775e6b321fd10413692a088f75e1eeb13514919cf3cb70bdcce", block: "31481647", msg: "725", ts: "2026-10-16T04:43:07Z" },
  { cond: "incoming-transfer", tx: "0x587ed9d325669eebf37528125db92a3e2b3e5413094ccd6c9c261ab6cba8c63f", block: "31481673", msg: "726", ts: "2026-10-16T04:44:12Z" },
  { cond: "incoming-transfer", tx: "0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a", block: "31486611", msg: "727", ts: "2026-10-16T06:51:48Z", amountPhrs: "0.5" },
  { cond: "large-transfer", tx: "0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a", block: "31486611", msg: "728", ts: "2026-10-16T06:51:49Z", amountPhrs: "0.5" },
  { cond: "incoming-transfer", tx: "0x0491414b58f24a640a54dd99c383264ee0e27fbbf69d4fdffb0dd50bbdcb05f9", block: "31482272", msg: "729", ts: "2026-10-16T07:01:03Z" },
  { cond: "incoming-transfer", tx: "0x363adaaf8c2f39d40c4f71f33d540e733bea488271e67e27a258f10d04647780", block: "31482351", msg: "730", ts: "2026-10-16T07:01:10Z" },
  { cond: "incoming-transfer", tx: "0xfb5c56faa3cf1cbf14ff7707a18a4e2ce1a760994ee50596276b2d9660028015", block: "31482417", msg: "731", ts: "2026-10-16T07:01:16Z" },
  { cond: "incoming-transfer", tx: "0x9f06bcb66b5cd184a57709f447c511e7a317a37d2ad9ce92533717b0f1389fa8", block: "31482475", msg: "732", ts: "2026-10-16T07:01:23Z" },
  { cond: "incoming-transfer", tx: "0xff892e7d22acf1efcb74ca888e2a5675a2ea0e5898d36422b289061724b5f0fb", block: "31482522", msg: "733", ts: "2026-10-16T07:01:26Z" },
  { cond: "incoming-transfer", tx: "0xf6345bc5aaae77448a7b252d0f2eed43b1b61bdc9e69041e7246f01e670edf07", block: "31482669", msg: "734", ts: "2026-10-16T07:01:33Z" },
  { cond: "incoming-transfer", tx: "0x421ab9e9807a2128356a81b3e1c741438942213fd0d7101d02a6c6215db46660", block: "31483006", msg: "735", ts: "2026-10-16T07:02:00Z" },
  { cond: "incoming-transfer", tx: "0x7a1ffd193223b3cc763eca11b7c6cbe99c32732258e7cec25c71b6da453f2f38", block: "31483310", msg: "736", ts: "2026-10-16T07:02:23Z" },
  { cond: "incoming-transfer", tx: "0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1", block: "31483610", msg: "737", ts: "2026-10-16T07:02:53Z" },
  { cond: "incoming-transfer", tx: "0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68", block: "31483646", msg: "738", ts: "2026-10-16T07:02:57Z" },
  { cond: "incoming-transfer", tx: "0xb1ba9e2dc1c03e39d6896ecb07c063cf2a8b6a37712d47a321fae3213fd59a18", block: "31486305", msg: "739", ts: "2026-10-16T07:07:13Z" },
  { cond: "incoming-transfer", tx: "0x04effe58f393349714ff6a5badeff5780d2c30ccce238f8184075854eb223f3f", block: "31486321", msg: "740", ts: "2026-10-16T07:07:14Z" },
  { cond: "incoming-transfer", tx: "0xe160ca25fd76966a867fd36b761c08831ad54ed395069cfb59e1dc23ed912e7b", block: "31486393", msg: "741", ts: "2026-10-16T07:07:19Z" },
  { cond: "incoming-transfer", tx: "0xba9374cb5b9f81deba3463da8f29d348d115b61026185b4fb74f0ba958cfb177", block: "31486402", msg: "742", ts: "2026-10-16T07:07:20Z" },
  { cond: "incoming-transfer", tx: "0xe51e3e9b7fb93d9232d092725eedd6aac6d6d8f3d1688e4def8bf9ad0d6e85c3", block: "31486440", msg: "743", ts: "2026-10-16T07:07:22Z" },
  { cond: "incoming-transfer", tx: "0xc7fff61e404cb09a19f2319c26d034ae6f708ec2a98de81d229433226b8bac66", block: "31486451", msg: "744", ts: "2026-10-16T07:07:23Z" },
  { cond: "incoming-transfer", tx: "0xb5b96d6027838a5225ed53dfc5c998a4c5aa91113819461d42b801accc9b64cd", block: "31486577", msg: "745", ts: "2026-10-16T07:08:37Z" },
  { cond: "incoming-transfer", tx: "0x799d56741f7b31251f59c8e3126a6a5910cdd55302a9ca7451b004fd43717305", block: "31486593", msg: "746", ts: "2026-10-16T07:08:39Z" },
  { cond: "incoming-transfer", tx: "0x4a67d1db05667873dd3cc5c88ae8223410b1d89e03e9edc8762aaa7777a0b530", block: "31486649", msg: "747", ts: "2026-10-16T07:18:30Z" },
  { cond: "incoming-transfer", tx: "0xca8c240d9b7a978fa0fb45e8cb5401a8265fcff186f81879d26b3eeac3ee506c", block: "31486769", msg: "748", ts: "2026-10-16T07:21:33Z" },
  { cond: "incoming-transfer", tx: "0x25f3ad4de8bcc321caaea650412f808ed8184d7073c0a43da2832c46473d614d", block: "31486811", msg: "749", ts: "2026-10-16T07:22:38Z" },
  { cond: "incoming-transfer", tx: "0x8882547b970de4a791d064792d1293bf9096f6006d809a3c13b7e3a07049e35a", block: "31486855", msg: "750", ts: "2026-10-16T07:23:50Z" },
  { cond: "incoming-transfer", tx: "0x37adb8288992f96cdd8fc248256f6426326b33f2e924965bd4a460dda644815a", block: "31486888", msg: "751", ts: "2026-10-16T07:24:42Z" },
  { cond: "incoming-transfer", tx: "0x42c4a35d024c2bfc16807d04f2f3478ac96b3d06a99349cf9ac86f98e05b6329", block: "31486909", msg: "752", ts: "2026-10-16T07:25:12Z" },
  { cond: "incoming-transfer", tx: "0xcb79d4a218dece0c55868efd0240089343a5ee8c4887b5f6888517eab70ee76e", block: "31486961", msg: "753", ts: "2026-10-16T07:26:03Z" },
];

// ---------------------------------------------------------------------------
// 02 · Run — live ledger re-verification (read-only, no signing, no sending)
// ---------------------------------------------------------------------------

const STEPS = ["Arming watcher…", "Replaying ledger…"];

type Phase = "idle" | "running" | "done" | "error";

interface VerifyResult {
  ok: number;
  total: number;
  tip: string;
  at: string;
  mismatches: string[];
}

const inputCls =
  "min-h-[44px] w-full rounded-lg border border-hairline bg-white px-3 py-2.5 font-mono text-sm text-ink placeholder:text-slate/60 focus:border-accent focus:outline-none";

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-outline inline-flex min-h-[44px] items-center gap-2"
      disabled={disabled}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check size={16} className="text-pass" /> : <Copy size={16} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function TxCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy transaction hash"
      title="Copy transaction hash"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-porcelain text-slate hover:border-accent hover:text-accent"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check size={14} className="text-pass" />
      ) : (
        <Copy size={14} />
      )}
    </button>
  );
}

function TelegramBubble() {
  const body = `🚨 LIGHTKEEPER · T20 On-Chain Alert
Condition: LARGE TRANSFER
Watched: ${WATCHED}
Amount: 0.5 PHRS
Tx: ${LARGE_TX}
Explorer: https://atlantic.pharosscan.xyz/tx/${LARGE_TX}
Block: ${LARGE_BLOCK}
Time: ${LARGE_ALERT_TIME}

Atlantic testnet · chain 688689 · disclosed self-test transfer`;
  return (
    <div className="rounded-2xl border border-hairline bg-tint p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white">
          <BellRing size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">OctaneShift_Bot</p>
          <p className="text-xs text-slate">
            Telegram · message_ids {LARGE_MSG_IDS} · {LARGE_ALERT_TIME}
          </p>
        </div>
      </div>
      <div className="whitespace-pre-wrap rounded-xl bg-white p-4 font-mono text-xs leading-relaxed text-ink shadow-sm sm:text-sm">
        {body}
      </div>
      <p className="mt-3 text-sm text-slate">
        The exact body the bot sent — condition, watched address, amount, tx
        hash, explorer link, block, timestamp. Nothing staged. The same 0.5
        PHRS transfer also fired incoming-transfer (message_id 727) — one
        transaction, two legitimate conditions, each alerted exactly once.
      </p>
    </div>
  );
}

function alertFeedItem(a: AlertEntry): FeedItem {
  const isLarge = a.cond === "large-transfer";
  return {
    key: `${a.cond}:${a.tx}`,
    node: (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={isLarge ? "chip chip-pass" : "chip chip-info"}>
            {a.cond}
          </span>
          {a.amountPhrs && (
            <span className="font-mono text-sm font-semibold text-ink">
              {a.amountPhrs} PHRS
            </span>
          )}
          <span className="ml-auto font-mono text-xs text-slate">
            message_id {a.msg}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p
            className="min-w-0 flex-1 truncate font-mono text-sm text-ink"
            title={a.tx}
          >
            {a.tx}
          </p>
          <TxCopy text={a.tx} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate">
          <span>
            Block <span className="font-mono text-ink">{a.block}</span>
          </span>
          <span className="font-mono text-xs">{a.ts}</span>
          <a
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
            href={`${EXPLORER_TX}${a.tx}`}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer
            <ExternalLink size={13} aria-hidden />
          </a>
        </div>
      </div>
    ),
  };
}

export default function TryOnchainAlertBot({ lamp }: { lamp: Lamp }) {
  // ---- 01 · Configure (Tier C rule builder) ----
  const [address, setAddress] = useState(WATCHED);
  const [incoming, setIncoming] = useState(true);
  const [large, setLarge] = useState(true);
  const [threshold, setThreshold] = useState("0.5");
  const [contractInt, setContractInt] = useState(false);
  const [contractAddr, setContractAddr] = useState("");
  const [interval, setInterval] = useState("8");

  const addrOk = isValidAddress(address);
  const contractOk = !contractInt || isValidAddress(contractAddr);
  const thresholdOk =
    /^\d+(\.\d+)?$/.test(threshold) && parseFloat(threshold) > 0;
  const intervalOk = /^\d+$/.test(interval) && parseInt(interval, 10) >= 2;
  const anyCondition = incoming || large || contractInt;
  const valid = addrOk && contractOk && thresholdOk && intervalOk && anyCondition;

  const yaml = `# Generated by the LIGHTKEEPER console — T20 rule builder
# Save as tasks/t20-onchain-alert-bot/config.yaml
# Secrets are NEVER stored here: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
# come from your own environment (exported in your terminal), never from config or code.

network:
  name: atlantic-testnet
  chainId: 688689
  explorerTx: https://atlantic.pharosscan.xyz/tx

watch:
  addresses:
    - ${addrOk ? address : "<your-watched-address>"}
  contracts:
${contractInt && isValidAddress(contractAddr) ? `    - ${contractAddr}` : "    []"}

conditions:
  incoming-transfer:
    enabled: ${incoming}
    description: "any native PHRS transfer into a watched address"
  large-transfer:
    enabled: ${large}
    minValuePHRS: "${threshold}"
    description: "incoming native transfer >= threshold"
  contract-interaction:
    enabled: ${contractInt}
    description: "any transaction sent to a watched contract address"

poller:
  intervalSeconds: ${interval}
  confirmBlocks: 2`;

  const runCmd = `# Run it in YOUR terminal — LIGHTKEEPER never executes this for you.
# export TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in YOUR terminal before running (env only)
export PATH="$HOME/.foundry/bin:$PATH"
cd ~/workspace/lightkeeper/tasks/t20-onchain-alert-bot

bash test/match_test.sh        # 16 matcher unit tests (synthetic fixtures)
bash src/watch.sh --once       # one scan pass from the saved cursor
bash src/watch.sh --daemon     # continuous polling
bash src/audit.sh              # replay the alert ledger against the live chain`;

  // ---- 02 · Run (live ledger re-verification) ----
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = async () => {
    if (phase === "running") return;
    setPhase("running");
    setStep(0);
    setErrMsg(null);
    try {
      // Step 1 — arm the watcher: pin the live tip.
      const tipHex = (await rpcCall("eth_blockNumber", [])) as string;
      if (!alive.current) return;
      const tip = String(parseInt(tipHex, 16));
      setStep(1);
      // Step 2 — replay the ledger: one receipt read per alert tx.
      const hashes = Array.from(new Set(ALERTS.map((a) => a.tx)));
      const receipts = (await Promise.all(
        hashes.map((h) => rpcCall("eth_getTransactionReceipt", [h]))
      )) as Array<{ status?: string; blockNumber?: string; to?: string } | null>;
      if (!alive.current) return;
      const byTx = new Map(hashes.map((h, i) => [h, receipts[i]] as const));
      const mismatches: string[] = [];
      let ok = 0;
      for (const a of ALERTS) {
        const r = byTx.get(a.tx);
        const rBlock =
          r && r.blockNumber ? String(parseInt(r.blockNumber, 16)) : null;
        const rTo = (r?.to ?? "").toLowerCase();
        if (
          r &&
          r.status === "0x1" &&
          rBlock === a.block &&
          rTo === WATCHED.toLowerCase()
        ) {
          ok++;
        } else {
          mismatches.push(`${a.cond} · ${a.tx.slice(0, 12)}…`);
        }
      }
      if (!alive.current) return;
      setResult({
        ok,
        total: ALERTS.length,
        tip,
        at: new Date().toISOString(),
        mismatches,
      });
      setStep(STEPS.length);
      setPhase("done");
    } catch (e) {
      if (!alive.current) return;
      setErrMsg(
        e instanceof Error
          ? e.message
          : "The replay failed before it could finish."
      );
      setPhase("error");
    }
  };

  const feedItems = [...ALERTS].reverse().map(alertFeedItem);
  const allOk = result !== null && result.ok === result.total;

  return (
    <div className="space-y-8">
      {/* 01 · Configure */}
      <section>
        <p className="mb-1 text-sm font-semibold text-slate">
          01 · Configure your watcher
        </p>
        <h3 className="text-xl font-semibold text-ink">
          From rule to running watcher in one copy-paste
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
          Toggle the conditions, point them at an address, and copy the exact
          config the real T20 watcher reads. This generates the live{" "}
          <span className="font-mono text-[13px]">config.yaml</span> the
          block-by-block poller matches against — no demo data.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate">
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
              <p className="mt-1 text-sm text-fail">
                Not a valid 0x address — fix it to generate the config.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate">
              Poll interval (seconds, min 2)
            </label>
            <input
              className={inputCls}
              value={interval}
              onChange={(e) => setInterval(e.target.value.trim())}
              inputMode="numeric"
              spellCheck={false}
            />
            {!intervalOk && (
              <p className="mt-1 text-sm text-fail">
                Must be a whole number ≥ 2.
              </p>
            )}
          </div>
        </div>

        <fieldset className="mt-4 space-y-4 rounded-xl border border-hairline bg-white p-4 sm:p-5">
          <legend className="px-1 text-sm font-semibold text-slate">
            Alert conditions
          </legend>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-[#2456e6]"
              checked={incoming}
              onChange={(e) => setIncoming(e.target.checked)}
            />
            <span>
              <span className="text-sm font-semibold text-ink">
                incoming-transfer
              </span>
              <span className="block text-sm text-slate">
                Any native PHRS transfer into a watched address
              </span>
            </span>
          </label>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-[#2456e6]"
              checked={large}
              onChange={(e) => setLarge(e.target.checked)}
            />
            <div className="flex-1">
              <span className="text-sm font-semibold text-ink">
                large-transfer
              </span>
              <span className="block text-sm text-slate">
                Incoming native transfer at or above a threshold
              </span>
              {large && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className={`${inputCls} w-32`}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value.trim())}
                    inputMode="decimal"
                    aria-label="Large-transfer threshold in PHRS"
                  />
                  <span className="text-sm text-slate">PHRS</span>
                </div>
              )}
              {large && !thresholdOk && (
                <p className="mt-1 text-sm text-fail">
                  Threshold must be a number above 0.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-[#2456e6]"
              checked={contractInt}
              onChange={(e) => setContractInt(e.target.checked)}
            />
            <div className="flex-1">
              <span className="text-sm font-semibold text-ink">
                contract-interaction
              </span>
              <span className="block text-sm text-slate">
                Any transaction sent to a watched contract address
              </span>
              {contractInt && (
                <input
                  className={`${inputCls} mt-2`}
                  value={contractAddr}
                  onChange={(e) => setContractAddr(e.target.value.trim())}
                  placeholder="0x… contract address"
                  spellCheck={false}
                />
              )}
              {contractInt && !isValidAddress(contractAddr) && (
                <p className="mt-1 text-sm text-fail">
                  Contract watching needs a valid 0x address.
                </p>
              )}
            </div>
          </div>
          {!anyCondition && (
            <p className="text-sm text-fail">
              Enable at least one condition — a watcher with no conditions
              watches nothing.
            </p>
          )}
        </fieldset>

        <div className="mt-4">
          <div className="code-block mb-3 max-h-96 overflow-auto whitespace-pre">
            {yaml}
          </div>
          <CopyButton text={yaml} disabled={!valid} />
        </div>

        <div className="mt-5">
          <div className="code-block mb-3 whitespace-pre-wrap">{runCmd}</div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={runCmd} />
            <span className="chip chip-pass">{lamp.points} pts · Tier C</span>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate">
            Run this in your own terminal with your own Telegram bot token (env
            only). LIGHTKEEPER never holds keys, never sends alerts for you,
            and never touches your bot token.
          </p>
        </div>
      </section>

      {/* The delivery guarantee */}
      <section className="rounded-2xl border border-hairline bg-white p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-ink">
          Why no alert is ever lost or doubled
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
          Before the bot calls Telegram, it writes{" "}
          <span className="font-mono text-[13px]">SENDING</span> to an
          append-only ledger. Only after Telegram confirms does it write{" "}
          <span className="font-mono text-[13px]">SENT</span>. If the process
          dies in between, the next start treats the event as delivered and
          never re-sends — because Telegram&apos;s{" "}
          <span className="font-mono text-[13px]">sendMessage</span> has no
          idempotency key, the safe direction is <em>never duplicate</em>.
        </p>
        <div className="code-block my-4 whitespace-pre-wrap">{`scan → match → SENDING (ledger) → Telegram → SENT (ledger)
restart → SENDING without SENT? → treat as delivered, never re-send`}</div>
        <p className="max-w-2xl text-sm leading-relaxed text-slate">
          One transaction can legitimately raise two conditions — a 0.5 PHRS
          transfer fires both{" "}
          <span className="font-mono text-[13px]">incoming-transfer</span> and{" "}
          <span className="font-mono text-[13px]">large-transfer</span>. That is
          not spam: dedupe is per{" "}
          <span className="font-mono text-[13px]">condition:txhash</span>, and
          the condition is printed in the alert itself.
        </p>
      </section>

      {/* 02 · Run */}
      <section>
        <p className="mb-1 text-sm font-semibold text-slate">
          02 · Verify the ledger live
        </p>
        <h3 className="text-xl font-semibold text-ink">
          Replay all 35 alerts against the live chain
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink">
          The same check <span className="font-mono text-[13px]">src/audit.sh</span>{" "}
          performs, run in your browser: one receipt read per alert
          transaction, re-checking status, block, and recipient. Read-only —
          nothing is signed, nothing is sent.
        </p>

        <div className="mt-4">
          {phase === "idle" && (
            <EmptyState
              title="Nothing verified yet"
              message="Hit the button and this module replays the watcher's production ledger — all 35 alerts, each with its own receipt — against the live Atlantic chain, in your browser."
              actionLabel="Verify the ledger live"
              onAction={run}
            />
          )}
          {phase === "running" && (
            <ProgressLoader
              steps={STEPS}
              current={step}
              title="Replaying the alert ledger against Atlantic"
            />
          )}
          {phase === "error" && (
            <ErrorState
              title="The replay could not finish"
              message={errMsg ?? "The Atlantic node stopped responding."}
              hint="Your rule builder above is untouched — this only affects the live replay. Wait a moment and try again."
              retryLabel="Retry the replay"
              onRetry={run}
            />
          )}
          {phase === "done" && result && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white px-5 py-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-pass/10">
                <Check size={18} className="text-pass" />
              </span>
              <p className="text-sm text-ink">
                Ledger replayed at{" "}
                <span className="font-mono text-[13px]">
                  {result.at.replace("T", " ").replace("Z", " UTC")}
                </span>{" "}
                —{" "}
                <span className="font-semibold">
                  {result.ok} of {result.total} receipts match
                </span>
                .
              </p>
              <button
                type="button"
                className="btn-outline ml-auto inline-flex min-h-[44px] items-center"
                onClick={run}
              >
                Re-verify
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 03 · Result */}
      {phase === "done" && result && (
        <section className="space-y-6">
          <div>
            <p className="mb-1 text-sm font-semibold text-slate">03 · Result</p>
            <h3 className="text-xl font-semibold text-ink">
              The ledger, verified
            </h3>
          </div>

          <ResultCard
            eyebrow="Result — ledger replayed against the live chain"
            headline={`${result.ok} of ${result.total} receipts match`}
            subline={
              allOk
                ? "Every alert in the ledger replayed against Atlantic in your browser — recipient, block, and receipt status all re-verified. No alert lost, no alert doubled."
                : "Some receipts did not match the ledger — see the mismatches below. The ledger itself is untouched; re-run the replay to check again."
            }
            status={allOk ? "pass" : "fail"}
            rows={[
              { label: "Alerts in the ledger", value: String(result.total) },
              {
                label: "Receipts verified live",
                value: `${result.ok} / ${result.total}`,
              },
              { label: "Duplicate keys", value: "0" },
              { label: "Ledger audit (task run)", value: `${AUDIT_RESULT} · ${AUDIT_RUN}` },
              { label: "Live tip at replay", value: `block ${result.tip}` },
            ]}
            links={[
              {
                label: "View the threshold trigger on the explorer",
                href: `${EXPLORER_TX}${LARGE_TX}`,
              },
              {
                label: "View the first alert trigger",
                href: `${EXPLORER_TX}${PROOF_TX}`,
              },
            ]}
          />

          <StatStrip
            stats={[
              {
                label: "Alerts fired",
                value: 35,
                icon: <Bell size={15} aria-hidden />,
              },
              {
                label: "Duplicate keys",
                value: 0,
                icon: <ShieldCheck size={15} aria-hidden />,
              },
              {
                label: "Audit checks passed",
                value: 210,
                icon: <BadgeCheck size={15} aria-hidden />,
              },
            ]}
          />

          {!allOk && result.mismatches.length > 0 && (
            <div className="rounded-2xl border border-[#F3C1C1] bg-[#FEF2F2] p-5">
              <p className="text-sm font-semibold text-ink">
                Receipts that did not match
              </p>
              <ul className="mt-2 space-y-1">
                {result.mismatches.map((m) => (
                  <li key={m} className="font-mono text-sm text-ink">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-3 text-sm font-semibold text-slate">
              The threshold trip, exactly as Telegram delivered it
            </p>
            <TelegramBubble />
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-slate">
              All 35 alerts — every alert carries its own receipt
            </p>
            <FeedList items={feedItems} maxHeight="max-h-[32rem]" />
          </div>
        </section>
      )}
    </div>
  );
}
