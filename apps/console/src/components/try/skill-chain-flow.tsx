/**
 * T12 — Skill + Chain MCP Flow · Tier C (CLI-native deepening module)
 *
 * "See the whole chain before you run it."
 * Differentiator: the full skill→chain flow is inspectable — phase by phase,
 * command by command — before a single command runs, and the verdict rule
 * math is probeable live: six real chain reads, the exact wei conversion
 * (byte-identical to flow.py's Decimal math — verified by classifier parity
 * tests), six named rules evaluated on live values.
 *
 * Every command, rule, value, and tx hash below is real, taken from the
 * task's own contrast runs (tasks/t12-skill-chain-flow/run-logs/flow-transcript.jsonl).
 */
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gauge, Hash, ShieldCheck, Wallet } from "lucide-react";
import type { Lamp } from "../../types";
import { rpcCall } from "../../hooks/useAtlantic";
import {
  EmptyState,
  ErrorState,
  FeedList,
  ProgressLoader,
  ResultCard,
  StatStrip,
  type FeedItem,
  type Stat,
} from "../ui";

const RPC = "https://atlantic.dplabs-internal.com";
const CONTRACT = "0xFc9fe952036bFe00F8BC5d9D2860c3750B834Ad1";
const SENDER = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const EXPLORER_TX = "https://atlantic.pharosscan.xyz/tx/";
const EXPLORER_ADDR = "https://atlantic.pharosscan.xyz/address/";
const ALLOW_TX = "0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349";
const ALLOW4_TX = "0x022bc47b3f1932f531791f7b6fc9ed30da719bf9535394c30e4bbcbc11fd7128";
const DEPLOY_TX = "0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3";
const MAX_TX_WEI = 5000000000000000n; // 0.005 PHRS — policy.yaml limits.max_per_tx_phrs
const MAX_GAS_WEI = 50000000000n; // 50 gwei — policy.yaml limits.max_gas_price_gwei
const PINGCOUNT_DATA = "0x87704569"; // keccak("pingCount()")[:4]
const KEEPER_DATA = "0xaced1661"; // keccak("keeper()")[:4]

/** Exact PHRS → wei (18 decimals), same math as flow.py's Decimal conversion.
 *  Byte-identical CLI↔console — DO NOT TOUCH (parity-tested at the boundary,
 *  including the 1-wei edge). */
function phrsToWei(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [i, f = ""] = t.split(".");
  return BigInt(i) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
}

type Scenario = "allow" | "block";

interface RuleRow {
  rule: string;
  checks: string;
  allow: { pass: boolean; detail: string };
  block: { pass: boolean; detail: string };
}

const RULES: RuleRow[] = [
  {
    rule: "RULE-NETWORK",
    checks: "live chainId == 688689 (Atlantic)",
    allow: { pass: true, detail: "live chainId=688689 vs allowed=688689" },
    block: { pass: true, detail: "live chainId=688689 vs allowed=688689" },
  },
  {
    rule: "RULE-DEST",
    checks: "target == deployed KeeperPing",
    allow: { pass: true, detail: `target=${CONTRACT}` },
    block: { pass: true, detail: `target=${CONTRACT}` },
  },
  {
    rule: "RULE-KEEPER-CONSISTENCY",
    checks: "on-chain keeper() == expected keeper",
    allow: { pass: true, detail: `on-chain keeper()=${SENDER}` },
    block: { pass: true, detail: `on-chain keeper()=${SENDER}` },
  },
  {
    rule: "RULE-AMOUNT",
    checks: "proposed value ≤ 0.005 PHRS",
    allow: {
      pass: true,
      detail: "proposed 100000000000000 wei <= max 5000000000000000 wei (0.005 PHRS)",
    },
    block: {
      pass: false,
      detail:
        "proposed 100000000000000000 wei <= max 5000000000000000 wei (0.005 PHRS) — verdict FAIL; quoting the live balance 5.868857845315957842 PHRS",
    },
  },
  {
    rule: "RULE-GAS",
    checks: "live gas price ≤ 50 gwei",
    allow: { pass: true, detail: "live gas 10000000000 wei <= max 50000000000 wei (50 gwei)" },
    block: { pass: true, detail: "live gas 10000000000 wei <= max 50000000000 wei (50 gwei)" },
  },
  {
    rule: "RULE-FRESHNESS",
    checks: "pinned reads ≤ 120 blocks old (skill time AND broadcast time)",
    allow: { pass: true, detail: "execute@block − read@block within 120-block window" },
    block: { pass: true, detail: "execute@block − read@block within 120-block window" },
  },
];

const READ_STEPS = [
  {
    cmd: `cast block-number --rpc-url ${RPC}`,
    why: "Pin one block — every later read happens AT this block, so the skill sees one consistent snapshot.",
  },
  {
    cmd: `cast chain-id --rpc-url ${RPC}`,
    why: "ChainId guard: 688689 must come back, or RULE-NETWORK blocks the run.",
  },
  {
    cmd: `cast balance ${SENDER} --block <pinned> --rpc-url ${RPC}`,
    why: "Live native PHRS balance of the sender — quoted verbatim in the RULE-AMOUNT detail.",
  },
  {
    cmd: `cast gas-price --rpc-url ${RPC}`,
    why: "Live gas price — evaluated verbatim against RULE-GAS (≤ 50 gwei).",
  },
  {
    cmd: `cast call ${CONTRACT} "pingCount()" --block <pinned> --rpc-url ${RPC}`,
    why: "Contract state before the run — the VERIFY phase asserts it moves by exactly +1 (ALLOW) or 0 (BLOCK).",
  },
  {
    cmd: `cast call ${CONTRACT} "keeper()" --block <pinned> --rpc-url ${RPC}`,
    why: "RULE-KEEPER-CONSISTENCY: the on-chain keeper must match the policy, or the run blocks.",
  },
];

function runbook(scenario: Scenario): string {
  const amount = scenario === "allow" ? "0.0001" : "0.1";
  const valueWei = scenario === "allow" ? "100000000000000" : "100000000000000000";
  return [
    `# T12 runbook — ${scenario === "allow" ? "ALLOW" : "BLOCK"} path (real values from the task's contrast runs)`,
    `# Your own env — set these in YOUR terminal before running:`,
    `export ATLANTIC_RPC_URL="${RPC}"`,
    `export DEPLOYER_PRIVATE_KEY="<your-private-key>"`,
    `export PATH="$HOME/.foundry/bin:$PATH"`,
    `cd ~/workspace/lightkeeper/tasks/t12-skill-chain-flow`,
    `python3 flow.py validate                      # policy sanity check`,
    `python3 flow.py --amount-phrs ${amount} --run-label ${scenario}`,
    ``,
    `# — or the raw chain calls the skill sees —`,
    `RPC="${RPC}"`,
    `CTR="${CONTRACT}"`,
    `B=$(cast block-number --rpc-url $RPC)         # READ: pin one block`,
    `cast chain-id --rpc-url $RPC`,
    `cast balance ${SENDER} --block $B --rpc-url $RPC`,
    `cast gas-price --rpc-url $RPC`,
    `cast call $CTR "pingCount()" --block $B --rpc-url $RPC`,
    `cast call $CTR "keeper()" --block $B --rpc-url $RPC`,
    scenario === "allow"
      ? `flock /tmp/lk-nonce.lock cast send $CTR "ping()" --value ${valueWei} --rpc-url $RPC --private-key $DEPLOYER_PRIVATE_KEY   # EXECUTE: skill said ALLOW`
      : `# EXECUTE: skill said BLOCK — no broadcast, nothing leaves the wallet`,
    `cast call $CTR "pingCount()" --rpc-url $RPC   # VERIFY: expect ${
      scenario === "allow" ? "0 → 1" : "1 → 1 (unchanged)"
    }`,
  ].join("\n");
}

const PHASES = ["READ", "SKILL", "EXECUTE", "VERIFY"] as const;

// ---------------------------------------------------------------------------
// Live probe — six real async RPC calls, then flow.py's evaluate() rule math
// replayed verbatim on the live values.
// ---------------------------------------------------------------------------

interface LiveValues {
  blockNum: number;
  chainId: number;
  balanceWei: bigint;
  gasWei: bigint;
  pingCount: number;
  keeper: string;
}

interface LiveRule {
  rule: string;
  checks: string;
  pass: boolean;
  detail: string;
}

interface ProbeResult {
  amountStr: string;
  amountWei: bigint;
  verdict: "ALLOW" | "BLOCK";
  rules: LiveRule[];
  live: LiveValues;
  marginWei: bigint;
}

function evaluateLive(amountStr: string, amountWei: bigint, live: LiveValues): ProbeResult {
  const keeperMatch = live.keeper.toLowerCase() === SENDER.toLowerCase();
  const rules: LiveRule[] = [
    {
      rule: "RULE-NETWORK",
      checks: "live chainId == 688689 (Atlantic)",
      pass: live.chainId === 688689,
      detail: `live chainId=${live.chainId} vs allowed=688689`,
    },
    {
      rule: "RULE-DEST",
      checks: "target == deployed KeeperPing",
      pass: true,
      detail: `target=${CONTRACT}`,
    },
    {
      rule: "RULE-KEEPER-CONSISTENCY",
      checks: "on-chain keeper() == expected keeper",
      pass: keeperMatch,
      detail: `on-chain keeper()=${live.keeper}`,
    },
    {
      rule: "RULE-AMOUNT",
      checks: "proposed value ≤ 0.005 PHRS",
      pass: amountWei <= MAX_TX_WEI,
      detail: `proposed ${amountWei} wei <= max ${MAX_TX_WEI} wei (0.005 PHRS)`,
    },
    {
      rule: "RULE-GAS",
      checks: "live gas price ≤ 50 gwei",
      pass: live.gasWei <= MAX_GAS_WEI,
      detail: `live gas ${live.gasWei} wei <= max ${MAX_GAS_WEI} wei (50 gwei)`,
    },
    {
      rule: "RULE-FRESHNESS",
      checks: "pinned reads ≤ 120 blocks old (skill time AND broadcast time)",
      pass: true,
      detail: `execute@${live.blockNum} - read@${live.blockNum} = 0 <= 120 blocks (probe only — nothing broadcast)`,
    },
  ];
  const verdict = rules.every((r) => r.pass) ? "ALLOW" : "BLOCK";
  return {
    amountStr,
    amountWei,
    verdict,
    rules,
    live,
    marginWei: verdict === "ALLOW" ? MAX_TX_WEI - amountWei : amountWei - MAX_TX_WEI,
  };
}

const PROBE_STEPS = [
  "Pinning block — eth_blockNumber",
  "Checking chain id — eth_chainId",
  "Reading sender balance — eth_getBalance",
  "Reading live gas price — eth_gasPrice",
  "Reading pingCount() — eth_call",
  "Reading keeper() — eth_call",
];

type ProbeStatus = "idle" | "probing" | "done" | "error";

function weiToPhrs(w: bigint): string {
  const s = w.toString().padStart(19, "0");
  const i = s.slice(0, -18);
  const f = s.slice(-18).replace(/0+$/, "");
  return f ? `${i}.${f}` : i;
}

const QUICK_AMOUNTS = ["0.0001", "0.004", "0.005", "0.0051", "0.1"];

export default function TrySkillChainFlow({ lamp }: { lamp: Lamp }) {
  const [scenario, setScenario] = useState<Scenario>("allow");
  const [phase, setPhase] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [probeInput, setProbeInput] = useState<string>("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [probeStatus, setProbeStatus] = useState<ProbeStatus>("idle");
  const [probeStep, setProbeStep] = useState(0);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string>("");
  const [history, setHistory] = useState<FeedItem[]>([]);
  const seq = useRef(0);

  const runProbe = async (raw: string) => {
    const mySeq = ++seq.current;
    const amountWei = phrsToWei(raw);
    if (amountWei === null) {
      setInputError(
        "That isn't a valid PHRS amount — type a decimal like 0.004 (up to 18 decimals, no units or negatives). Nothing runs here; the input just can't be converted to wei.",
      );
      return;
    }
    setInputError(null);
    setProbeStatus("probing");
    setProbeStep(0);
    setProbeError("");
    try {
      const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
      if (seq.current !== mySeq) return;
      setProbeStep(1);
      const blockNum = Number(BigInt(blockHex));
      const pin = `0x${blockNum.toString(16)}`;

      const chainHex = (await rpcCall("eth_chainId", [])) as string;
      if (seq.current !== mySeq) return;
      setProbeStep(2);
      const chainId = Number(BigInt(chainHex));

      const balHex = (await rpcCall("eth_getBalance", [SENDER, pin])) as string;
      if (seq.current !== mySeq) return;
      setProbeStep(3);
      const balanceWei = BigInt(balHex);

      const gasHex = (await rpcCall("eth_gasPrice", [])) as string;
      if (seq.current !== mySeq) return;
      setProbeStep(4);
      const gasWei = BigInt(gasHex);

      const pingHex = (await rpcCall("eth_call", [{ to: CONTRACT, data: PINGCOUNT_DATA }, pin])) as string;
      if (seq.current !== mySeq) return;
      setProbeStep(5);
      const pingCount = Number(BigInt(pingHex));

      const keeperHex = (await rpcCall("eth_call", [{ to: CONTRACT, data: KEEPER_DATA }, pin])) as string;
      if (seq.current !== mySeq) return;
      setProbeStep(6);
      const keeper = `0x${keeperHex.slice(-40)}`;

      const live: LiveValues = { blockNum, chainId, balanceWei, gasWei, pingCount, keeper };
      const result = evaluateLive(raw.trim(), amountWei, live);
      setProbeResult(result);
      setProbeStatus("done");
      setHistory((h) =>
        [
          {
            key: `${Date.now()}-${result.amountWei}`,
            node: (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`chip ${result.verdict === "ALLOW" ? "chip-pass" : "chip-fail"}`}>
                  {result.verdict}
                </span>
                <span className="font-mono text-sm text-ink">
                  {result.amountStr} PHRS = {result.amountWei.toString()} wei
                </span>
                <span className="text-xs text-slate">block {blockNum.toLocaleString("en-US")}</span>
              </div>
            ),
          },
          ...h,
        ].slice(0, 12),
      );
    } catch (e) {
      if (seq.current !== mySeq) return;
      setProbeError(
        e instanceof Error && e.message
          ? e.message
          : "The node didn't answer. Check your connection and try again.",
      );
      setProbeStatus("error");
    }
  };

  const copyRunbook = async () => {
    await navigator.clipboard.writeText(runbook(scenario));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verdict = scenario === "allow" ? "ALLOW" : "BLOCK";
  const recBalance = scenario === "allow" ? "5.91989842331639842" : "5.868857845315957842";

  const phaseBody = (p: number) => {
    if (p === 0) {
      return (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">
            Six reads, pinned to one block — the same six the live probe runs below. The skill never
            sees an estimate or a guess — only these live values, verbatim.
          </p>
          {READ_STEPS.map((s, i) => (
            <div key={i} className="rounded-xl border border-hairline bg-porcelain p-4">
              <div className="code-block !mb-2">{s.cmd}</div>
              <p className="text-sm text-slate">{s.why}</p>
            </div>
          ))}
          <div className="rounded-xl border border-hairline bg-porcelain p-4 text-sm text-slate">
            Real values from the <span className="font-semibold text-ink">{scenario}</span> run:
            balance <span className="font-mono text-ink">{recBalance} PHRS</span>, gas{" "}
            <span className="font-mono text-ink">10 gwei</span>, chain{" "}
            <span className="font-mono text-ink">688689</span>, pingCount{" "}
            <span className="font-mono text-ink">{scenario === "allow" ? "0" : "1"}</span>.
          </div>
        </div>
      );
    }
    if (p === 1) {
      return (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">
            The preflight skill evaluates the live values against{" "}
            <span className="font-mono text-ink">policy.yaml</span> — six named rules, fail-closed,
            nothing else. The verdict depends on nothing but the reads above.
          </p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Checks</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map((r) => {
                  const v = scenario === "allow" ? r.allow : r.block;
                  return (
                    <tr key={r.rule}>
                      <td className="font-mono text-xs">{r.rule}</td>
                      <td className="text-xs">{r.checks}</td>
                      <td>
                        <span className={`chip ${v.pass ? "chip-pass" : "chip-fail"} text-xs`}>
                          {v.pass ? "PASS" : "FAIL"}
                        </span>
                        <div className="mt-1 font-mono text-[11px] text-slate">{v.detail}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className={`rounded-xl border p-4 text-sm font-semibold ${
              verdict === "ALLOW"
                ? "border-accent bg-porcelain text-ink"
                : "border-fail bg-porcelain text-fail"
            }`}
          >
            [SKILL] VERDICT: {verdict}
            {verdict === "ALLOW" ? (
              <span className="block text-xs font-normal text-slate">
                Six rules pass — the flow is allowed to continue.
              </span>
            ) : (
              <span className="block text-xs font-normal text-slate">
                Blocked by RULE-AMOUNT — quoting the live balance, not an assumption.
              </span>
            )}
          </div>
        </div>
      );
    }
    if (p === 2) {
      return scenario === "allow" ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">
            Verdict was ALLOW — so, and only so, the skill re-checks freshness at broadcast time
            and sends the dust transaction. The broadcast goes through the shared nonce lock.
          </p>
          <div className="code-block">
            {`# broadcast-time freshness re-check (RULE-FRESHNESS, second gate)\ncast block-number --rpc-url ${RPC}\n\nflock /tmp/lk-nonce.lock cast send ${CONTRACT} "ping()" \\\n  --value 100000000000000 \\\n  --rpc-url ${RPC} \\\n  --private-key $DEPLOYER_PRIVATE_KEY`}
          </div>
          <div className="rounded-xl border border-accent bg-porcelain p-4 text-sm">
            <span className="font-semibold text-ink">[EXECUTE] broadcast tx=</span>
            <a
              className="break-all font-mono text-xs text-accent hover:underline"
              href={`${EXPLORER_TX}${ALLOW_TX}`}
              target="_blank"
              rel="noreferrer"
            >
              {ALLOW_TX}
            </a>
            <div className="mt-1 text-xs text-slate">
              status 1 · block 31482141 · value 0.0001 PHRS · fee 0.0000678987 PHRS
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">
            Verdict was BLOCK — so the EXECUTE phase is skipped entirely. No transaction is built,
            signed, or broadcast. Nothing leaves the wallet.
          </p>
          <div className="code-block">
            {`# [EXECUTE] broadcast skipped — BLOCKED by RULE-AMOUNT\n# no tx hash. no signature. no funds moved.`}
          </div>
          <div className="empty-panel px-4 py-3 text-sm text-slate">
            This is the composition proof: the same flow, the same contract — a different proposed
            amount — and the skill refuses to spend.
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink">
          A follow-up chain query re-reads <span className="font-mono text-ink">pingCount()</span>{" "}
          and asserts the expected post-state. The contract is the source of truth, not the log.
        </p>
        <div className="code-block">
          {`cast call ${CONTRACT} "pingCount()" --rpc-url ${RPC}`}
        </div>
        <div className="rounded-xl border border-hairline bg-porcelain p-4 text-sm">
          <span className="font-semibold text-ink">[VERIFY]</span>{" "}
          <span className="text-slate">
            pingCount{" "}
            <span className="font-mono text-ink">{scenario === "allow" ? "0 → 1" : "1 → 1"}</span>{" "}
            {scenario === "allow"
              ? "— as expected after an ALLOW run"
              : "— unchanged, as expected after a BLOCK run"}
          </span>
        </div>
        {scenario === "allow" && (
          <a
            className="text-sm text-accent hover:underline"
            href={`${EXPLORER_TX}${ALLOW_TX}`}
            target="_blank"
            rel="noreferrer"
          >
            View the ALLOW execution on the Atlantic explorer →
          </a>
        )}
      </div>
    );
  };

  const r = probeResult;
  const passCount = r?.rules.filter((x) => x.pass).length ?? 0;
  const ratio = r ? Number((r.amountWei * 10000n) / MAX_TX_WEI) / 100 : 0; // % of cap, 2dp
  const clampedPct = Math.min(100, ratio);
  const stats: Stat[] = r
    ? [
        {
          label: "Rules passed",
          value: passCount,
          format: (n) => `${Math.round(n)} / 6`,
          icon: <ShieldCheck size={14} aria-hidden />,
        },
        {
          label: "Live balance",
          value: Number(weiToPhrs(r.live.balanceWei)),
          format: (n) => n.toFixed(4),
          suffix: "PHRS",
          icon: <Wallet size={14} aria-hidden />,
        },
        {
          label: "pingCount()",
          value: r.live.pingCount,
          icon: <Hash size={14} aria-hidden />,
        },
        {
          label: "Gas price",
          value: Number(r.live.gasWei) / 1e9,
          format: (n) => n.toFixed(1),
          suffix: "gwei",
          icon: <Gauge size={14} aria-hidden />,
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-slate">Spend Readiness Check · T12</p>
        <h3 className="mt-2 text-2xl font-bold text-ink">See the whole chain before you run it</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink">
          One request flows READ → SKILL → EXECUTE → VERIFY. Inspect every phase, every command, and
          the real values the skill judged — then probe the boundary yourself: six live chain reads
          run in this page and the skill's exact rule math renders the verdict. This lamp is
          CLI-native — the console generates the exact runbook; anything that moves funds executes
          in <span className="font-semibold text-ink">your own terminal</span>. LIGHTKEEPER never
          sees or asks for private keys.
        </p>
      </div>

      {/* ================================================================ 01 CONFIGURE */}
      <section aria-label="01 Configure">
        <p className="text-sm font-semibold text-slate">01 — Configure · the flow, defined</p>
        <div className="mt-4 space-y-6">
          {/* Contrast scenario */}
          <div className="rounded-2xl border border-hairline bg-paper p-5">
            <p className="text-sm font-semibold text-ink">The recorded contrast pair</p>
            <p className="mt-1 text-sm text-slate">
              Same flow, same contract — the verdict flipped on the live data, not on intent.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className={scenario === "allow" ? "btn-primary" : "btn-outline"}
                onClick={() => setScenario("allow")}
              >
                ALLOW path · 0.0001 PHRS
              </button>
              <button
                className={scenario === "block" ? "btn-primary" : "btn-outline"}
                onClick={() => setScenario("block")}
              >
                BLOCK path · 0.1 PHRS
              </button>
            </div>
          </div>

          {/* Phase inspector */}
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {PHASES.map((name, i) => (
                <button
                  key={name}
                  className={phase === i ? "btn-primary" : "btn-outline"}
                  onClick={() => setPhase(i)}
                >
                  <span className="font-mono text-xs">{i + 1}</span> {name}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-hairline bg-paper p-5 sm:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {phaseBody(phase)}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Probe input */}
          <div className="rounded-2xl border border-hairline bg-paper p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink">Probe the boundary yourself</p>
            <p className="mt-1 text-sm text-slate">
              Type any proposed amount in PHRS. The console runs the six live reads and the skill's
              exact rule math — discover for yourself where ALLOW flips to BLOCK.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={probeInput}
                  onChange={(e) => setProbeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runProbe(probeInput);
                  }}
                  placeholder="e.g. 0.004"
                  inputMode="decimal"
                  aria-label="Proposed amount in PHRS"
                  className="w-full rounded-lg border border-hairline bg-porcelain px-3 py-3 font-mono text-sm text-ink placeholder:text-slate/50 focus:border-accent focus:outline-none sm:max-w-xs"
                />
                <button
                  className="btn-primary min-h-[44px] sm:w-auto"
                  onClick={() => runProbe(probeInput)}
                  disabled={probeStatus === "probing"}
                >
                  {probeStatus === "probing" ? "Probing…" : "Probe the boundary — live"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate">Try:</span>
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    className="btn-outline !min-h-[40px] font-mono text-sm"
                    onClick={() => {
                      setProbeInput(q);
                      runProbe(q);
                    }}
                    disabled={probeStatus === "probing"}
                  >
                    {q}
                  </button>
                ))}
              </div>
              {inputError && (
                <p className="text-sm leading-relaxed text-slate">
                  <span className="font-semibold text-ink">Not a valid amount.</span> {inputError}
                </p>
              )}
              <p className="border-t border-hairline pt-3 text-xs text-slate">
                Simulation, not execution: the probe replays the skill's exact rule math on live
                values. The real verdict always comes from <span className="font-mono">flow.py</span>{" "}
                against live chain state — nothing here broadcasts, nothing here signs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ 02 RUN */}
      <AnimatePresence mode="wait">
        {probeStatus === "probing" && (
          <motion.section
            key="run"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            aria-label="02 Run"
          >
            <p className="text-sm font-semibold text-slate">02 — Run · probing the boundary</p>
            <div className="mt-4">
              <ProgressLoader
                steps={PROBE_STEPS}
                current={probeStep}
                title="Probing boundary… six live reads, then the skill's exact rule math."
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ================================================================ 03 RESULT */}
      <section aria-label="03 Result">
        <p className="text-sm font-semibold text-slate">03 — Result · the verdict</p>
        <div className="mt-4">
          {probeStatus === "idle" && (
            <EmptyState
              title="No probe yet"
              message="Enter an amount above and run a probe — six live chain reads and the skill's exact rule math, rendered as one clear verdict."
              actionLabel="Try the boundary: 0.005"
              onAction={() => {
                setProbeInput("0.005");
                runProbe("0.005");
              }}
            />
          )}

          {probeStatus === "error" && (
            <ErrorState
              title="The probe couldn't finish"
              message={probeError}
              hint="Your probe amount was fine — the read failed, not the math. Nothing was judged and no funds moved."
              retryLabel="Retry the probe"
              onRetry={() => runProbe(probeInput)}
            />
          )}

          {probeStatus === "done" && r && (
            <div className="space-y-6">
              <ResultCard
                eyebrow={`Result — live boundary probe · block ${r.live.blockNum.toLocaleString("en-US")}`}
                headline={r.verdict}
                status={r.verdict === "ALLOW" ? "pass" : "fail"}
                subline={
                  r.verdict === "ALLOW" ? (
                    <>
                      {r.amountWei.toString()} wei sits {r.marginWei.toString()} wei under the{" "}
                      {MAX_TX_WEI.toString()}-wei cap — every rule passes on live values.
                    </>
                  ) : (
                    <>
                      {r.amountWei.toString()} wei exceeds the {MAX_TX_WEI.toString()}-wei cap by{" "}
                      {r.marginWei.toString()} wei —{" "}
                      {r.rules.filter((x) => !x.pass).map((x) => x.rule).join(", ")} blocks it.
                    </>
                  )
                }
                rows={[
                  {
                    label: "Proposed value",
                    value: (
                      <>
                        {r.amountWei.toString()} wei{" "}
                        <span className="text-slate">({r.amountStr} PHRS)</span>
                      </>
                    ),
                  },
                  {
                    label: "Policy maximum",
                    value: (
                      <>
                        {MAX_TX_WEI.toString()} wei <span className="text-slate">(0.005 PHRS)</span>
                      </>
                    ),
                  },
                  {
                    label: "Margin to the cap",
                    value: (
                      <>
                        {r.marginWei.toString()} wei{" "}
                        <span className="text-slate">
                          {r.verdict === "ALLOW" ? "under" : "over"}
                        </span>
                      </>
                    ),
                  },
                  {
                    label: "Live balance",
                    value: (
                      <>
                        {r.live.balanceWei.toString()} wei{" "}
                        <span className="text-slate">({weiToPhrs(r.live.balanceWei)} PHRS)</span>
                      </>
                    ),
                  },
                  {
                    label: "Live gas price",
                    value: (
                      <>
                        {r.live.gasWei.toString()} wei{" "}
                        <span className="text-slate">
                          ({(Number(r.live.gasWei) / 1e9).toFixed(1)} gwei, cap 50)
                        </span>
                      </>
                    ),
                  },
                  {
                    label: "Chain",
                    value: (
                      <>
                        {r.live.chainId} <span className="text-slate">(Atlantic, allowed)</span>
                      </>
                    ),
                  },
                  {
                    label: "pingCount()",
                    value: <>{r.live.pingCount}</>,
                  },
                  {
                    label: "Keeper check",
                    value: (
                      <span className="break-all">
                        {r.live.keeper.toLowerCase() === SENDER.toLowerCase() ? "match" : "MISMATCH"} ·{" "}
                        {r.live.keeper}
                      </span>
                    ),
                  },
                ]}
                links={[
                  {
                    label: "View KeeperPing contract on the explorer",
                    href: `${EXPLORER_ADDR}${CONTRACT}`,
                  },
                  {
                    label: "View the recorded ALLOW broadcast",
                    href: `${EXPLORER_TX}${ALLOW_TX}`,
                  },
                ]}
              >
                {/* Precision ruler — the probe's exact position against the cap */}
                <div>
                  <p className="text-sm font-semibold text-slate">
                    Where the amount sits against the cap
                  </p>
                  <div className="mt-3">
                    <div className="relative h-3 overflow-hidden rounded-full bg-tint">
                      <motion.div
                        className={`absolute inset-y-0 left-0 rounded-full ${
                          r.verdict === "ALLOW" ? "bg-pass" : "bg-fail"
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${clampedPct}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-slate">0 wei</span>
                      <span className="font-mono text-xs text-slate">
                        cap {MAX_TX_WEI.toString()} wei
                      </span>
                    </div>
                    <p className="mt-2 break-all font-mono text-xs text-ink">
                      {r.amountStr} PHRS = {r.amountWei.toString()} wei
                      {r.verdict === "ALLOW" ? (
                        <span className="text-slate">
                          {" "}— {clampedPct.toFixed(2)}% of the cap, {r.marginWei.toString()} wei of
                          headroom
                        </span>
                      ) : (
                        <span className="text-slate">
                          {" "}— {r.marginWei.toString()} wei past the cap
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Live rule table */}
                <div>
                  <p className="text-sm font-semibold text-slate">Six rules on live values</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Rule</th>
                          <th>Checks</th>
                          <th>Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.rules.map((x) => (
                          <tr key={x.rule}>
                            <td className="font-mono text-xs">{x.rule}</td>
                            <td className="text-xs">{x.checks}</td>
                            <td>
                              <span className={`chip ${x.pass ? "chip-pass" : "chip-fail"} text-xs`}>
                                {x.pass ? "PASS" : "FAIL"}
                              </span>
                              <div className="mt-1 break-all font-mono text-[11px] text-slate">
                                {x.detail}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </ResultCard>

              <StatStrip stats={stats} />

              <div>
                <p className="mb-3 text-sm font-semibold text-slate">This session's probes</p>
                <FeedList
                  items={history}
                  maxHeight="max-h-64"
                  emptyText="No probes yet this session."
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Runbook */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={copyRunbook}>
          {copied ? "Runbook copied ✓" : `Copy full runbook (${scenario} path)`}
        </button>
        <span className="text-sm text-slate">
          The exact command sequence — paste into your terminal and watch it happen.
        </span>
      </div>

      {/* On the record */}
      <div className="rounded-xl border border-hairline bg-porcelain p-5 text-sm text-slate">
        <p className="font-semibold text-ink">On the record</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            Deploy:{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_TX}${DEPLOY_TX}`}
              target="_blank"
              rel="noreferrer"
            >
              {DEPLOY_TX.slice(0, 12)}…{DEPLOY_TX.slice(-8)}
            </a>{" "}
            · KeeperPing:{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_ADDR}${CONTRACT}`}
              target="_blank"
              rel="noreferrer"
            >
              {CONTRACT.slice(0, 10)}…{CONTRACT.slice(-6)}
            </a>
          </li>
          <li>
            The run log keeps the failed runs too — one freshness refusal, one broadcast crash that
            never sent a tx. Nothing edited out.
          </li>
          <li>
            Post-harden re-run (2026-10-16): the full contrast pair re-executed live — ALLOW →
            broadcast{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_TX}${ALLOW4_TX}`}
              target="_blank"
              rel="noreferrer"
            >
              {ALLOW4_TX.slice(0, 12)}…{ALLOW4_TX.slice(-8)}
            </a>{" "}
            (block 31486412, fee 0.0000336980 PHRS) driving{" "}
            <span className="font-mono">pingCount()</span> 1 → 2; BLOCK re-confirmed RULE-AMOUNT
            against a fresh live balance, no broadcast.
          </li>
          <li>
            Spend: 0.0005699020 of 0.15 PHRS. {lamp.name} — tested on Atlantic testnet (688689) only.
          </li>
        </ul>
      </div>
    </div>
  );
}
