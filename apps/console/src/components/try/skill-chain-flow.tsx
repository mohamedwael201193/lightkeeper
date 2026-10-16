/**
 * T12 — Skill + Chain MCP Flow · Tier C (CLI-native deepening module)
 *
 * "See the whole chain before you run it."
 * Differentiator: the full skill→chain flow is inspectable — phase by phase,
 * command by command — before a single command runs. Every command, rule,
 * value, and tx hash below is real, taken from the task's own contrast runs
 * (tasks/t12-skill-chain-flow/run-logs/flow-transcript.jsonl, evidence.json).
 */
import { useMemo, useState } from "react";
import type { Lamp } from "../../types";

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

/** Exact PHRS → wei (18 decimals), same math as flow.py's Decimal conversion. */
function phrsToWei(s: string): bigint | null {
  const t = s.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [i, f = ""] = t.split(".");
  return BigInt(i) * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
}

/** Replays flow.py's evaluate() rule math on recorded live values. Simulation only. */
function simulateVerdict(
  amountStr: string,
  liveBalance: string,
): { ok: boolean; valueWei: bigint | null; amountRule: string } {
  const valueWei = phrsToWei(amountStr);
  if (valueWei === null) return { ok: false, valueWei: null, amountRule: "" };
  const pass = valueWei <= MAX_TX_WEI;
  return {
    ok: pass,
    valueWei,
    amountRule: pass
      ? `proposed ${valueWei} wei <= max 5000000000000000 wei (0.005 PHRS)`
      : `proposed ${valueWei} wei > max 5000000000000000 wei (0.005 PHRS) — quoting the live balance ${liveBalance} PHRS`,
  };
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
    allow: { pass: true, detail: "target=0xFc9f…Ad1 (the KeeperPing contract)" },
    block: { pass: true, detail: "target=0xFc9f…Ad1 (the KeeperPing contract)" },
  },
  {
    rule: "RULE-KEEPER-CONSISTENCY",
    checks: "on-chain keeper() == expected keeper",
    allow: { pass: true, detail: "on-chain keeper() matched the policy expectation" },
    block: { pass: true, detail: "on-chain keeper() matched the policy expectation" },
  },
  {
    rule: "RULE-AMOUNT",
    checks: "proposed value ≤ 0.005 PHRS",
    allow: {
      pass: true,
      detail: "proposed 100000000000000 wei ≤ max 5000000000000000 wei (0.005 PHRS)",
    },
    block: {
      pass: false,
      detail:
        "proposed 100000000000000000 wei > max 5000000000000000 wei — quoting the live balance 5.868857845315957842 PHRS",
    },
  },
  {
    rule: "RULE-GAS",
    checks: "live gas price ≤ 50 gwei",
    allow: { pass: true, detail: "live gas 10000000000 wei (10 gwei) ≤ max 50000000000 wei (50 gwei)" },
    block: { pass: true, detail: "live gas 10000000000 wei (10 gwei) ≤ max 50000000000 wei (50 gwei)" },
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

function VerdictProbe({
  probe,
  setProbe,
  liveBalance,
}: {
  probe: string;
  setProbe: (s: string) => void;
  liveBalance: string;
}) {
  const sim = probe === "" ? null : simulateVerdict(probe, liveBalance);
  const quick = ["0.0001", "0.004", "0.005", "0.0051", "0.1"];
  return (
    <div className="rounded-xl border border-hairline bg-porcelain p-4">
      <p className="smallcaps">Probe the boundary yourself</p>
      <p className="mt-1 text-xs text-slate">
        Type any proposed amount in PHRS. The skill's exact rule math runs on the recorded live
        values — discover for yourself where ALLOW flips to BLOCK.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={probe}
          onChange={(e) => setProbe(e.target.value)}
          placeholder="e.g. 0.004"
          inputMode="decimal"
          className="w-40 rounded-lg border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink placeholder:text-slate/50 focus:border-accent focus:outline-none"
        />
        {quick.map((q) => (
          <button
            key={q}
            className="btn-outline !py-1 font-mono text-xs"
            onClick={() => setProbe(q)}
          >
            {q}
          </button>
        ))}
      </div>
      {sim !== null && sim.valueWei === null && (
        <p className="mt-3 text-xs text-slate">
          That isn't a valid PHRS amount — type a decimal like{" "}
          <span className="font-mono">0.004</span> (up to 18 decimals, no units or negatives).
          Nothing runs here; the input just can't be converted to wei.
        </p>
      )}
      {sim !== null && sim.valueWei !== null && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip ${sim.ok ? "!border-accent" : "!border-fail"}`}>
              {sim.ok ? "ALLOW" : "BLOCK"}
            </span>
            <span className="font-mono text-[11px] text-slate">{sim.amountRule}</span>
          </div>
          <div className="text-[11px] text-slate">
            <span className="font-mono text-ink">RULE-NETWORK</span> PASS ·{" "}
            <span className="font-mono text-ink">RULE-DEST</span> PASS ·{" "}
            <span className="font-mono text-ink">RULE-KEEPER-CONSISTENCY</span> PASS ·{" "}
            <span className="font-mono text-ink">RULE-GAS</span> PASS — live gas 10000000000 wei
            {" <= "}max {MAX_GAS_WEI.toString()} wei (50 gwei) ·{" "}
            <span className="font-mono text-ink">RULE-FRESHNESS</span> PASS — pinned reads; the
            broadcast-time gate re-checks
          </div>
        </div>
      )}
      <p className="mt-3 border-t border-hairline pt-2 text-[11px] text-slate">
        Simulation, not execution: this replays the skill's exact rule math on the recorded live
        values above. The real verdict always comes from{" "}
        <span className="font-mono">flow.py</span> against live chain state — nothing here
        broadcasts.
      </p>
    </div>
  );
}

const PHASES = ["READ", "SKILL", "EXECUTE", "VERIFY"] as const;

export default function TrySkillChainFlow({ lamp }: { lamp: Lamp }) {
  const [scenario, setScenario] = useState<Scenario>("allow");
  const [phase, setPhase] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [probe, setProbe] = useState<string>("");

  const rules = useMemo(() => RULES, []);
  const verdict = scenario === "allow" ? "ALLOW" : "BLOCK";

  const copyRunbook = async () => {
    await navigator.clipboard.writeText(runbook(scenario));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const phaseBody = (p: number) => {
    if (p === 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-slate">
            Six Chain MCP-class reads, pinned to one block. The skill never sees an estimate or a
            guess — only these live values, verbatim.
          </p>
          {READ_STEPS.map((s, i) => (
            <div key={i} className="rounded-xl border border-hairline bg-porcelain p-3">
              <div className="code-block !mb-1">{s.cmd}</div>
              <p className="text-xs text-slate">{s.why}</p>
            </div>
          ))}
          <div className="rounded-xl border border-hairline bg-porcelain p-3 text-xs text-slate">
            Real values from the <span className="font-semibold text-ink">{scenario}</span> run:
            balance{" "}
            <span className="font-mono text-ink">
              {scenario === "allow" ? "5.91989842331639842" : "5.868857845315957842"} PHRS
            </span>
            , gas <span className="font-mono text-ink">10 gwei</span>, chain{" "}
            <span className="font-mono text-ink">688689</span>, pingCount{" "}
            <span className="font-mono text-ink">{scenario === "allow" ? "0" : "1"}</span>.
          </div>
        </div>
      );
    }
    if (p === 1) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-slate">
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
              {rules.map((r) => {
                const v = scenario === "allow" ? r.allow : r.block;
                return (
                  <tr key={r.rule}>
                    <td className="font-mono text-xs">{r.rule}</td>
                    <td className="text-xs">{r.checks}</td>
                    <td>
                      <span
                        className={`chip ${v.pass ? "!border-accent" : "!border-fail"} text-xs`}
                      >
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
          <VerdictProbe
            probe={probe}
            setProbe={setProbe}
            liveBalance={scenario === "allow" ? "5.91989842331639842" : "5.868857845315957842"}
          />
        </div>
      );
    }
    if (p === 2) {
      return scenario === "allow" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate">
            Verdict was ALLOW — so, and only so, the skill re-checks freshness at broadcast time and
            sends the dust transaction. The broadcast goes through the shared nonce lock.
          </p>
          <div className="code-block">
            {`# broadcast-time freshness re-check (RULE-FRESHNESS, second gate)\ncast block-number --rpc-url ${RPC}\n\nflock /tmp/lk-nonce.lock cast send ${CONTRACT} "ping()" \\\n  --value 100000000000000 \\\n  --rpc-url ${RPC} \\\n  --private-key $DEPLOYER_PRIVATE_KEY`}
          </div>
          <div className="rounded-xl border border-accent bg-porcelain p-3 text-sm">
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
        <div className="space-y-3">
          <p className="text-sm text-slate">
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
      <div className="space-y-3">
        <p className="text-sm text-slate">
          A follow-up chain query re-reads <span className="font-mono text-ink">pingCount()</span> and
          asserts the expected post-state. The contract is the source of truth, not the log.
        </p>
        <div className="code-block">
          {`cast call ${CONTRACT} "pingCount()" --rpc-url ${RPC}`}
        </div>
        <div className="rounded-xl border border-hairline bg-porcelain p-3 text-sm">
          <span className="font-semibold text-ink">[VERIFY]</span>{" "}
          <span className="text-slate">
            pingCount{" "}
            <span className="font-mono text-ink">{scenario === "allow" ? "0 → 1" : "1 → 1"}</span>{" "}
            {scenario === "allow" ? "— as expected after an ALLOW run" : "— unchanged, as expected after a BLOCK run"}
          </span>
        </div>
        {scenario === "allow" && (
          <a
            className="text-xs text-accent hover:underline"
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

  return (
    <div className="space-y-5">
      <div>
        <p className="smallcaps">Spend Readiness Check · T12</p>
        <h3 className="mt-1 text-xl font-bold text-ink">See the whole chain before you run it</h3>
        <p className="mt-2 max-w-3xl text-sm text-slate">
          One request flows READ → SKILL → EXECUTE → VERIFY. Inspect every phase, every command, and
          the real values the skill judged — before a single command runs. This lamp is CLI-native:
          the console generates the exact runbook; everything executes in{" "}
          <span className="font-semibold text-ink">your own terminal</span>. LIGHTKEEPER never sees
          or asks for private keys.
        </p>
      </div>

      {/* Scenario toggle — the contrast proof */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate">Contrast scenario:</span>
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
        <span className="text-xs text-slate">
          Same flow, same contract — the verdict flips on the live data, not on intent.
        </span>
      </div>

      {/* Phase stepper */}
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
        <div className="rounded-2xl border border-hairline bg-paper p-5">{phaseBody(phase)}</div>
      </div>

      {/* Runbook */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={copyRunbook}>
          {copied ? "Runbook copied ✓" : `Copy full runbook (${scenario} path)`}
        </button>
        <span className="text-xs text-slate">
          The exact command sequence — paste into your terminal and watch it happen.
        </span>
      </div>

      {/* Honest footer */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4 text-xs text-slate">
        <p className="font-semibold text-ink">On the record</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>
            Deploy:{" "}
            <a className="font-mono text-accent hover:underline" href={`${EXPLORER_TX}${DEPLOY_TX}`} target="_blank" rel="noreferrer">
              {DEPLOY_TX.slice(0, 12)}…{DEPLOY_TX.slice(-8)}
            </a>{" "}
            · KeeperPing:{" "}
            <a className="font-mono text-accent hover:underline" href={`${EXPLORER_ADDR}${CONTRACT}`} target="_blank" rel="noreferrer">
              {CONTRACT.slice(0, 10)}…{CONTRACT.slice(-6)}
            </a>
          </li>
          <li>
            The transcript keeps the failed runs too — one freshness refusal, one broadcast crash
            that never sent a tx. Nothing edited out.
          </li>
          <li>
            Post-harden re-run (2026-10-16): the full contrast pair re-executed live — ALLOW →
            broadcast{" "}
            <a className="font-mono text-accent hover:underline" href={`${EXPLORER_TX}${ALLOW4_TX}`} target="_blank" rel="noreferrer">
              {ALLOW4_TX.slice(0, 12)}…{ALLOW4_TX.slice(-8)}
            </a>{" "}
            (block 31486412, fee 0.0000336980 PHRS) driving <span className="font-mono">pingCount()</span>{" "}
            1 → 2; BLOCK re-confirmed RULE-AMOUNT against a fresh live balance, no broadcast.
          </li>
          <li>
            Spend: 0.0005699020 of 0.15 PHRS. {lamp.name} — tested on Atlantic testnet (688689) only.
          </li>
        </ul>
      </div>
    </div>
  );
}
