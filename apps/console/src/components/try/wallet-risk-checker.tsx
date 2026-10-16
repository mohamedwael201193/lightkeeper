/**
 * T23 Wallet Risk Checker — Tier A (live reads, no wallet, costs nothing).
 *
 * "X-ray any wallet": paste an Atlantic address and the console runs the
 * wallet-risk-checker heuristics live against the public RPC — native
 * balance (eth_getBalance), tx count (eth_getTransactionCount), EOA vs
 * contract (eth_getCode), first-activity block (nonce binary search), and
 * approval hygiene (Approval logs in the last 10,000 blocks).
 *
 * The differentiator is the report: every check ships a PASS / FLAG /
 * UNKNOWN / N/A chip, the raw values, and a PLAIN-LANGUAGE explanation of
 * what each flag means and what to do about it. The composite LOW/MED/HIGH
 * is a disclosed heuristic derived by the printed formula — never an
 * authoritative score.
 *
 * Coverage honesty: the browser surface runs 6 of the 8 CLI checks. The
 * CLI (tasks/t23-wallet-risk-checker/bin/run.mjs) also covers S5 (recent
 * activity burst) and S6 (interaction diversity), which need heavier log
 * windows than belong in a page. That boundary is printed on the page.
 *
 * LIGHTKEEPER never signs here — reads only. Testnet only (chain 688689,
 * asserted before any check).
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import { weiToPhrs } from "../../types";
import {
  ATLANTIC_CHAIN_ID_HEX,
  EXPLORER_ADDRESS,
  isValidAddress,
  rpcCall,
} from "../../hooks/useAtlantic";
import { keccak256Hex } from "./keccak256";

type Verdict = "PASS" | "FLAG" | "UNKNOWN" | "N/A";

interface CheckResult {
  id: string;
  name: string;
  verdict: Verdict;
  heuristic: boolean;
  raw: Array<[string, string]>;
  explanation: string;
  whyMatters?: string;
  whatToDo?: string;
}

interface ScanReport {
  address: string;
  latestBlock: number;
  accountType: "EOA" | "contract";
  checks: CheckResult[];
  composite: "LOW" | "MED" | "HIGH";
  compositeBasis: string;
}

const COMPOSITE_FORMULA =
  "HIGH if watchlist hit or ≥3 FLAGs; MED if 1–2 FLAGs or any UNKNOWN; " +
  "LOW if 0 FLAGs and 0 UNKNOWNs (N/A checks excluded)";

/** The two evidence demo addresses, copied verbatim from tasks/t23-wallet-risk-checker/evidence.json. */
const DEMO_ESTABLISHED = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const DEMO_FIXTURE = "0x2459eC8B2ca982a8c2C6188c098701177D63EC43";

/** Heuristic thresholds — same values as tasks/t23-wallet-risk-checker/signals.yaml. */
const YOUNG_ACCOUNT_BLOCKS = 50000;
const LOG_WINDOW_BLOCKS = 10000;
const LOG_CHUNK_BLOCKS = 1000;
const MAX_APPROVAL_SPENDERS = 5;

const blockHex = (n: number): string => "0x" + n.toString(16);

/** First-activity probe: earliest block where the account's nonce reached ≥1. */
async function firstActivityBlock(
  address: string,
  latest: number,
  onProbe: (done: number, total: number) => void
): Promise<number> {
  const total = Math.ceil(Math.log2(Math.max(latest, 2)));
  let done = 0;
  let lo = 0;
  let hi = latest;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const n = (await rpcCall("eth_getTransactionCount", [address, blockHex(mid)])) as string;
    if (BigInt(n) >= 1n) hi = mid;
    else lo = mid;
    done += 1;
    onProbe(done, total);
  }
  return hi;
}

function verdictChip(v: Verdict): string {
  if (v === "PASS") return "chip chip-pass";
  if (v === "FLAG") return "chip chip-fail";
  if (v === "UNKNOWN") return "chip chip-info";
  return "chip chip-dim";
}

export default function TryRisk({ lamp }: { lamp: Lamp }) {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);

  const runScan = async () => {
    const address = input.trim();
    if (!isValidAddress(address)) {
      setError("That is not a valid address — paste a 0x address with 40 hex characters.");
      return;
    }
    setScanning(true);
    setError(null);
    setReport(null);

    try {
      // Chain assertion first — refuse any network but Atlantic.
      setPhase("Asserting chain ID 688689…");
      const chainId = (await rpcCall("eth_chainId", [])) as string;
      if (chainId.toLowerCase() !== ATLANTIC_CHAIN_ID_HEX.toLowerCase()) {
        throw new Error(
          `This page only scans Pharos Atlantic testnet (chain 688689). The node answered chain ID ${chainId} — aborting.`
        );
      }

      const latestHex = (await rpcCall("eth_blockNumber", [])) as string;
      const latest = Number(BigInt(latestHex));

      // S3 / S2 / S4 core reads, pinned to the same latest block.
      setPhase("Reading balance, transaction count and bytecode…");
      const [balanceWeiHex, nonceHex, code] = (await Promise.all([
        rpcCall("eth_getBalance", [address, blockHex(latest)]),
        rpcCall("eth_getTransactionCount", [address, blockHex(latest)]),
        rpcCall("eth_getCode", [address, blockHex(latest)]),
      ])) as [string, string, string];
      const balanceWei = BigInt(balanceWeiHex);
      const nonce = BigInt(nonceHex);
      const isContract = code !== "0x" && code !== "0X";
      const accountType: "EOA" | "contract" = isContract ? "contract" : "EOA";
      // EIP-161: a contract's creation transaction starts its nonce at 1.
      const effectiveOutbound = isContract ? nonce - 1n : nonce;

      const checks: CheckResult[] = [];

      // ── S1 · Account age (first-activity binary search on the nonce) ──
      if (nonce === 0n) {
        checks.push({
          id: "S1",
          name: "Account age (first activity)",
          verdict: "UNKNOWN",
          heuristic: true,
          raw: [
            ["outbound_tx_count", "0"],
            ["first_activity_block", "unknown — never sent a transaction"],
          ],
          explanation:
            "This account has never initiated a transaction, so there is no first-activity block to find. A zero-nonce funded account is common for fresh wallets — and also for throwaway receive-only wallets.",
        });
      } else {
        setPhase("Pinpointing first activity (nonce binary search)…");
        const firstBlock = await firstActivityBlock(address, latest, (done, total) =>
          setPhase(`Pinpointing first activity… ${done}/${total} probes`)
        );
        const latestBlockObj = (await rpcCall("eth_getBlockByNumber", [blockHex(latest), false])) as {
          timestamp?: string;
        } | null;
        const firstBlockObj = (await rpcCall("eth_getBlockByNumber", [blockHex(firstBlock), false])) as {
          timestamp?: string;
        } | null;
        const ageBlocks = latest - firstBlock;
        let ageLine = `~${ageBlocks.toLocaleString()} blocks`;
        if (latestBlockObj?.timestamp && firstBlockObj?.timestamp) {
          const days = (Number(BigInt(latestBlockObj.timestamp)) - Number(BigInt(firstBlockObj.timestamp))) / 86400;
          ageLine += `, ≈${days < 1 ? "<1" : Math.round(days).toLocaleString()} day${Math.round(days) === 1 ? "" : "s"}`;
        }
        const young = ageBlocks < YOUNG_ACCOUNT_BLOCKS;
        checks.push({
          id: "S1",
          name: "Account age (first activity)",
          verdict: young ? "FLAG" : "PASS",
          heuristic: true,
          raw: [
            ["first_activity_block", firstBlock.toLocaleString()],
            ["age", ageLine],
            [
              "basis",
              isContract
                ? "contract creation block (EIP-161: new contracts start at nonce 1)"
                : "first outbound transaction (nonce binary search)",
            ],
          ],
          explanation: young
            ? `First activity was only ~${ageBlocks.toLocaleString()} blocks ago (block ${firstBlock.toLocaleString()}) — under the ${YOUNG_ACCOUNT_BLOCKS.toLocaleString()}-block heuristic threshold.`
            : `First activity was ~${ageBlocks.toLocaleString()} blocks ago (block ${firstBlock.toLocaleString()}) — older than the ${YOUNG_ACCOUNT_BLOCKS.toLocaleString()}-block heuristic threshold, so it passes on age.`,
          whyMatters: young
            ? "Many scam/rug contracts and mule wallets are hours or days old — age alone proves nothing, but youth deserves a second look."
            : undefined,
          whatToDo: young
            ? "Wait for a track record before interacting: verify who deployed it, never send first to an unverifiable contract, and read the code."
            : undefined,
        });
      }

      // ── S2 · Transaction count / freshly-funded pattern ──
      const fundedIdle = balanceWei > 0n && effectiveOutbound === 0n;
      checks.push({
        id: "S2",
        name: "Transaction count / funding pattern",
        verdict: fundedIdle ? "FLAG" : "PASS",
        heuristic: true,
        raw: [
          ["outbound_tx_count (nonce)", nonce.toString()],
          ...(isContract ? [["effective_outbound (creation excluded)", effectiveOutbound.toString()] as [string, string]] : []),
          ["balance", `${weiToPhrs(balanceWeiHex)} PHRS`],
        ],
        explanation: fundedIdle
          ? `Holds ${weiToPhrs(balanceWeiHex)} PHRS but has NEVER initiated a transaction. This funded-but-idle pattern matches mule wallets, airdrop-farming wallets, and just-deployed contracts awaiting first use.`
          : `Transaction count (nonce): ${nonce}. Balance: ${weiToPhrs(balanceWeiHex)} PHRS. No freshly-funded-idle pattern.`,
        whyMatters: fundedIdle
          ? "Scam operators pre-fund disposable wallets and contracts, then activate them for a single campaign. An idle balance is the setup phase of that pattern."
          : undefined,
        whatToDo: fundedIdle
          ? "This is not proof of anything — but interact only if you know the owner, and watch whether it activates before trusting it."
          : undefined,
      });

      // ── S3 · Native balance (informational only) ──
      checks.push({
        id: "S3",
        name: "Native balance (PHRS)",
        verdict: "PASS",
        heuristic: false,
        raw: [
          ["balance", `${weiToPhrs(balanceWeiHex)} PHRS`],
          ["block", latest.toLocaleString()],
        ],
        explanation:
          "Balance alone is not a risk signal — it is raw context for the other checks. A whale balance and a dust balance get the same treatment.",
      });

      // ── S4 · EOA vs contract ──
      if (isContract) {
        const bytes = (code.length - 2) / 2;
        checks.push({
          id: "S4",
          name: "Account type / code verification",
          verdict: "UNKNOWN",
          heuristic: true,
          raw: [
            ["type", "contract"],
            ["bytecode_bytes", String(bytes)],
            ["source_verified", "unknown — explorer verification API unreachable"],
          ],
          explanation:
            "This is a CONTRACT (bytecode present) but its source could not be verified against the deployed code — the Atlantic explorer's verification API is unreachable, so no check can confirm what the code does.",
          whyMatters:
            "Unverifiable logic is a real risk factor: you are trusting behavior you cannot read. Approvals and sends to it are trust-on-faith.",
          whatToDo:
            "Ask the project for verified source matching this bytecode. Until then, treat any approval to it as unlimited risk and never send first.",
        });
      } else {
        checks.push({
          id: "S4",
          name: "Account type / code verification",
          verdict: "PASS",
          heuristic: false,
          raw: [
            ["type", "EOA (externally owned account)"],
            ["bytecode", "0x (empty)"],
          ],
          explanation:
            "Externally owned account — no bytecode, so there is nothing to verify. Counterparty risk here is about the person, not hidden code.",
        });
      }

      // ── S7 · Approval hygiene (Approval logs, 10k-block window) ──
      setPhase("Scanning token approvals (10,000-block window)…");
      const approvalTopic = keccak256Hex("Approval(address,address,uint256)");
      const ownerTopic = "0x000000000000000000000000" + address.slice(2).toLowerCase();
      const chunkCalls: Array<Promise<unknown>> = [];
      for (let i = 0; i < LOG_WINDOW_BLOCKS / LOG_CHUNK_BLOCKS; i++) {
        const from = latest - LOG_WINDOW_BLOCKS + i * LOG_CHUNK_BLOCKS;
        const to = from + LOG_CHUNK_BLOCKS - 1;
        chunkCalls.push(
          rpcCall("eth_getLogs", [
            {
              fromBlock: blockHex(Math.max(from, 0)),
              toBlock: blockHex(to),
              topics: [approvalTopic, ownerTopic],
            },
          ])
        );
      }
      const settled = await Promise.allSettled(chunkCalls);
      const rejected = settled.filter((r) => r.status === "rejected");
      if (rejected.length > 0) {
        checks.push({
          id: "S7",
          name: "Token approvals (allowance hygiene)",
          verdict: "UNKNOWN",
          heuristic: true,
          raw: [
            ["window_blocks", LOG_WINDOW_BLOCKS.toLocaleString()],
            ["readable_chunks", `${(settled.length - rejected.length)}/${settled.length}`],
            ["note", "log window could not be read fully; the CLI (bin/run.mjs) covers the full window"],
          ],
          explanation:
            "The approval log window could not be read completely, so allowance hygiene is unknown rather than clean. UNKNOWN is never treated as safe.",
        });
      } else {
        const logs = settled.flatMap((r) =>
          r.status === "fulfilled" ? (r.value as Array<{ topics?: string[]; data?: string }>) : []
        );
        const unlimitedCap = (1n << 256n) - 1n;
        const spenders = new Set<string>();
        let unlimited = 0;
        for (const log of logs) {
          const spenderTopic = log.topics?.[2] ?? "";
          spenders.add("0x" + spenderTopic.slice(-40).toLowerCase());
          try {
            if (BigInt(log.data ?? "0x0") === unlimitedCap) unlimited += 1;
          } catch {
            /* ignore malformed log data */
          }
        }
        const manySpenders = spenders.size > MAX_APPROVAL_SPENDERS;
        const flagged = unlimited > 0 || manySpenders;
        checks.push({
          id: "S7",
          name: "Token approvals (allowance hygiene)",
          verdict: flagged ? "FLAG" : "PASS",
          heuristic: true,
          raw: [
            ["approval_events_in_window", logs.length.toString()],
            ["distinct_spenders", spenders.size.toString()],
            ["unlimited_approvals", unlimited.toString()],
            ["note", "window-limited; older approvals outside the window are NOT covered"],
          ],
          explanation: flagged
            ? `${unlimited} UNLIMITED approval(s) to ${spenders.size} spender(s) in the window. An unlimited approval lets the spender move ALL of that token from this wallet at any time, until revoked.`
            : `${logs.length} approval event(s), ${spenders.size} distinct spender(s), ${unlimited} unlimited. No unusual approval pattern in the window.`,
          whyMatters: flagged
            ? "Unlimited approvals are the single most common way wallets get drained: one compromised or malicious spender contract can empty every approved token."
            : undefined,
          whatToDo: flagged
            ? "Revoke approvals you do not actively use — send approve(spender, 0) for the token contract, or use a revocation tool. Keep only the spenders you need."
            : undefined,
        });
      }

      // ── S8 · Flagged-address watchlist — N/A on Atlantic testnet ──
      checks.push({
        id: "S8",
        name: "Flagged-address interaction",
        verdict: "N/A",
        heuristic: true,
        raw: [
          ["watchlist_size", "0"],
          ["note", "no flagged-address set configured for Atlantic testnet; check not applicable"],
        ],
        explanation:
          "There is no published sanctions/flagged-address set for the Atlantic testnet, so this check is not applicable here and is excluded from the composite. Configure a watchlist (signals.yaml) to enable it — e.g. for mainnet use. N/A is never reported as a clean PASS.",
      });

      // ── Composite (disclosed heuristic, never an authoritative score) ──
      const flags = checks.filter((c) => c.verdict === "FLAG").length;
      const unknowns = checks.filter((c) => c.verdict === "UNKNOWN").length;
      const composite: "LOW" | "MED" | "HIGH" =
        flags >= 3 ? "HIGH" : flags >= 1 || unknowns >= 1 ? "MED" : "LOW";
      const compositeBasis =
        composite === "HIGH"
          ? `${flags} check(s) flagged (≥3)`
          : composite === "MED"
            ? flags > 0
              ? `${flags} check(s) flagged`
              : `${unknowns} check(s) unknown — unknown is not treated as safe`
            : "0 flags, 0 unknowns (N/A checks excluded)";

      setReport({ address, latestBlock: latest, accountType, checks, composite, compositeBasis });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The scan failed — retry in a moment.");
    } finally {
      setScanning(false);
      setPhase(null);
    }
  };

  const compositeTone =
    report?.composite === "HIGH" ? "chip chip-fail" : report?.composite === "MED" ? "chip chip-info" : "chip chip-pass";
  const verdictPlain: Record<"LOW" | "MED" | "HIGH", string> = {
    LOW: "Nothing in these checks looks suspicious. Stay alert anyway: this is six of eight checks, and heuristics are not proof of safety.",
    MED: "Something here deserves a second look before you interact. Read the flagged checks below — the explanations say exactly what to do.",
    HIGH: "Treat this wallet as unfamiliar: do not send first, do not approve tokens, and verify off-chain who controls it before any interaction.",
  };

  return (
    <div className="space-y-6">
      {/* Tier A honesty header */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <p className="smallcaps mb-2">Tier A — live reads · no wallet · no signature · free</p>
        <h3 className="text-base font-bold text-ink">X-ray any wallet</h3>
        <p className="mt-1 text-sm text-ink">
          Paste an address and <strong>{lamp.name}</strong> scans it live against the Atlantic RPC:
          balance, transaction count, EOA-vs-contract, first-activity age, and token approval
          hygiene — then prints a per-check report that <strong>explains every flag in plain
          language</strong>, not just a score.
        </p>
        <p className="mt-2 text-xs text-slate">
          Read-only: this page cannot sign or broadcast anything, and LIGHTKEEPER never sees,
          holds, or asks for private keys. Every heuristic is labeled HEURISTIC; the composite
          LOW/MED/HIGH is derived by the printed formula and is not an authoritative risk score.
        </p>
      </div>

      {/* Scanner */}
      <div className="rounded-xl border border-hairline bg-white p-4">
        <label htmlFor="t23-address" className="smallcaps mb-2 block">
          Atlantic address to scan
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="t23-address"
            className="min-w-0 flex-1 rounded-lg border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink"
            placeholder="0x…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="btn-primary" onClick={runScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Run live scan"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate">Try a demo address:</span>
          <button
            className="btn-outline !min-h-0 !py-1.5 !px-3 text-xs"
            onClick={() => setInput(DEMO_ESTABLISHED)}
            disabled={scanning}
          >
            Established wallet
          </button>
          <button
            className="btn-outline !min-h-0 !py-1.5 !px-3 text-xs"
            onClick={() => setInput(DEMO_FIXTURE)}
            disabled={scanning}
          >
            Fresh fixture contract
          </button>
        </div>
        <p className="mt-2 text-xs text-slate">
          The fixture is a self-deployed, known-benign test contract — its flags demonstrate the
          mechanics, never an accusation.{" "}
          <a
            className="text-accent hover:underline"
            href={`${EXPLORER_ADDRESS}${DEMO_FIXTURE}`}
            target="_blank"
            rel="noreferrer"
          >
            Fixture on the explorer ↗
          </a>
        </p>
        {scanning && phase && (
          <p className="mt-3 text-sm font-semibold text-accentdeep" role="status">
            {phase}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-failbg px-3 py-2 text-sm text-fail" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Report */}
      {report && (
        <div className="space-y-4">
          <div className="rounded-xl border border-hairline bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={compositeTone + " !text-sm"}>{report.composite}</span>
              <span className="chip">{report.accountType.toUpperCase()}</span>
              <a
                className="font-mono text-xs text-accent hover:underline"
                href={`${EXPLORER_ADDRESS}${report.address}`}
                target="_blank"
                rel="noreferrer"
              >
                {report.address} ↗
              </a>
              <span className="text-xs text-slate">scanned at block {report.latestBlock.toLocaleString()}</span>
              <button className="btn-outline !min-h-0 !py-1.5 !px-3 text-xs" onClick={runScan} disabled={scanning}>
                Re-scan (free)
              </button>
            </div>
            <p className="mt-2 text-sm font-semibold text-ink">{verdictPlain[report.composite]}</p>
            <p className="mt-1 text-xs text-slate">
              <strong>Composite formula (HEURISTIC):</strong> {COMPOSITE_FORMULA} — this scan:{" "}
              <strong>{report.compositeBasis}</strong>. This composite is derived from the checks
              below by that formula; it is <strong>not</strong> an authoritative risk score.
            </p>
          </div>

          {report.checks.map((c) => (
            <div key={c.id} className="rounded-xl border border-hairline bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate">{c.id}</span>
                <h4 className="text-sm font-bold text-ink">{c.name}</h4>
                <span className={verdictChip(c.verdict)}>{c.verdict}</span>
                {c.heuristic && <span className="chip chip-info">HEURISTIC</span>}
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-hairline bg-porcelain">
                <table className="data-table">
                  <tbody>
                    {c.raw.map(([k, v]) => (
                      <tr key={k}>
                        <td className="w-1/3 font-mono text-xs text-slate">{k}</td>
                        <td className="font-mono text-xs text-ink">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-slate">{c.explanation}</p>
              {c.verdict === "FLAG" && c.whyMatters && (
                <div className="mt-2 rounded-lg bg-failbg px-3 py-2">
                  <p className="text-xs text-slate">
                    <strong className="text-fail">Why this flag exists:</strong> {c.whyMatters}
                  </p>
                  {c.whatToDo && (
                    <p className="mt-1 text-xs text-slate">
                      <strong className="text-ink">What to do:</strong> {c.whatToDo}
                    </p>
                  )}
                </div>
              )}
              {c.verdict === "UNKNOWN" && c.whyMatters && (
                <div className="mt-2 rounded-lg bg-porcelain px-3 py-2">
                  <p className="text-xs text-slate">
                    <strong className="text-ink">Why this matters:</strong> {c.whyMatters}
                  </p>
                  {c.whatToDo && (
                    <p className="mt-1 text-xs text-slate">
                      <strong className="text-ink">What to do:</strong> {c.whatToDo}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Coverage honesty footer */}
          <div className="empty-panel px-5 py-4">
            <p className="smallcaps mb-2">Coverage boundaries — read before quoting this report</p>
            <ul className="list-disc pl-5 text-xs text-slate">
              <li>
                This page runs 6 of the checker's 8 checks (S1, S2, S3, S4, S7, S8). The CLI at{" "}
                <span className="font-mono">tasks/t23-wallet-risk-checker/bin/run.mjs</span> additionally
                covers S5 (recent activity burst) and S6 (interaction diversity from Transfer logs),
                which need heavier log windows than belong in a page.
              </li>
              <li>Native PHRS transfers are not in logs, so approval and token scans never see them.</li>
              <li>Approval hygiene covers only the last 10,000 blocks — older approvals are not covered.</li>
              <li>Contract source verification depends on an explorer API that is currently unreachable — contracts report UNKNOWN here.</li>
              <li>A FLAG means "this on-chain pattern is worth a second look" — never "this wallet is malicious".</li>
            </ul>
            <p className="mt-2 text-xs text-slate">
              Evidence for the full 8-check runs (both demo addresses, block numbers, tx hashes, spend
              log) lives in the task repo:{" "}
              <span className="font-mono">tasks/t23-wallet-risk-checker/evidence.json</span>.
              This page is read-only — no broadcasts, no spend, nothing to add to the spend log.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
