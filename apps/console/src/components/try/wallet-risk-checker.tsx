/**
 * T23 Wallet Risk Checker — Tier A (live reads, no wallet, costs nothing).
 *
 * "X-ray any wallet": paste an Atlantic address and the console runs all 8
 * wallet-risk-checker checks live against the public RPC — account age via
 * first-activity block (nonce binary search, EIP-161-aware for contracts),
 * tx count / freshly-funded pattern, native balance, EOA vs contract,
 * recent activity burst, interaction diversity from Transfer logs, and
 * approval hygiene from Approval logs with the actual spender/token pairs
 * that can move this wallet's tokens.
 *
 * The differentiator is the report: every check ships a PASS / FLAG /
 * UNKNOWN / N/A chip, the raw values, and a PLAIN-LANGUAGE explanation of
 * what each flag means and what to do about it. Approval flags name the
 * exact token → spender grants (the "who can drain this wallet" list).
 * The composite LOW/MED/HIGH is a disclosed heuristic derived by the
 * printed formula — never an authoritative score.
 *
 * Heuristic thresholds mirror tasks/t23-wallet-risk-checker/signals.yaml.
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

/** One token approval grant found in the window: token contract → spender. */
interface ApprovalGrant {
  token: string;
  spender: string;
  unlimited: boolean;
}

interface CheckResult {
  id: string;
  name: string;
  verdict: Verdict;
  heuristic: boolean;
  raw: Array<[string, string]>;
  explanation: string;
  whyMatters?: string;
  whatToDo?: string;
  /** Rendered when present: the actual grants / peers behind a flag. */
  detailRows?: ApprovalGrant[];
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
const BURST_OUTBOUND_TXS = 500;
const LOW_DIVERSITY_MAX_PEERS = 2;
const MAX_APPROVAL_SPENDERS = 5;

const blockHex = (n: number): string => "0x" + n.toString(16);
const addrToTopic = (a: string): string => "0x" + "0".repeat(24) + a.slice(2).toLowerCase();
const topicToAddr = (t: string): string => "0x" + t.slice(-40).toLowerCase();

/** First-activity probe: earliest block where the account's nonce reached ≥1. */
async function firstOutboundBlock(
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

/**
 * Funding-age probe for never-outbound wallets: earliest block where the
 * balance exceeded 0 (monotonicity assumed; validated before accepting).
 * Returns null when the balance history is not monotonic — then the CLI
 * reports UNKNOWN rather than a guess, and we do the same.
 */
async function firstFundedBlock(
  address: string,
  latest: number,
  onProbe: (done: number, total: number) => void
): Promise<number | null> {
  const total = Math.ceil(Math.log2(Math.max(latest, 2)));
  let done = 0;
  let lo = 0;
  let hi = latest;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const b = (await rpcCall("eth_getBalance", [address, blockHex(mid)])) as string;
    if (BigInt(b) > 0n) hi = mid;
    else lo = mid;
    done += 1;
    onProbe(done, total);
  }
  if (lo <= 0) return hi;
  const before = (await rpcCall("eth_getBalance", [address, blockHex(lo - 1)])) as string;
  return BigInt(before) === 0n ? lo : null;
}

interface LogScan {
  logs: Array<{ address?: string; topics?: string[]; data?: string }>;
  readableChunks: number;
  totalChunks: number;
}

/**
 * eth_getLogs over the trailing window in LOG_CHUNK_BLOCKS-block chunks,
 * all fired in parallel. Partial success degrades honestly: the check notes
 * how many chunks were readable instead of going fully UNKNOWN.
 * (The Atlantic RPC rejects null topic positions, so topic0-only filters
 * are used where the owner/spender topic is not fixed, matching the CLI.)
 */
async function scanWindowLogs(
  topic0: string,
  extraTopics: string[],
  latest: number,
  onPhase: (phase: string) => void,
  phaseLabel: string
): Promise<LogScan> {
  const winFrom = Math.max(0, latest - LOG_WINDOW_BLOCKS);
  const nChunks = Math.ceil(LOG_WINDOW_BLOCKS / LOG_CHUNK_BLOCKS);
  const calls: Array<Promise<unknown>> = [];
  for (let i = 0; i < nChunks; i++) {
    const from = winFrom + i * LOG_CHUNK_BLOCKS;
    // Last chunk runs to `latest` (inclusive); earlier chunks are full.
    const to = i === nChunks - 1 ? latest : from + LOG_CHUNK_BLOCKS - 1;
    calls.push(
      rpcCall("eth_getLogs", [
        {
          fromBlock: blockHex(Math.max(from, 0)),
          toBlock: blockHex(to),
          topics: [topic0, ...extraTopics],
        },
      ])
    );
    onPhase(`${phaseLabel} — chunk ${i + 1}/${nChunks} queued`);
  }
  const settled = await Promise.allSettled(calls);
  const logs = settled.flatMap((r) =>
    r.status === "fulfilled" ? (r.value as LogScan["logs"]) : []
  );
  const readableChunks = settled.filter((r) => r.status === "fulfilled").length;
  return { logs, readableChunks, totalChunks: nChunks };
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
      const winFrom = Math.max(0, latest - LOG_WINDOW_BLOCKS);

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
      const effectiveOutbound = isContract ? (nonce > 0n ? nonce - 1n : 0n) : nonce;

      const checks: CheckResult[] = [];

      // ── S1 · Account age (first activity; funding age for never-outbound wallets) ──
      if (nonce === 0n && balanceWei === 0n) {
        checks.push({
          id: "S1",
          name: "Account age (first activity)",
          verdict: "UNKNOWN",
          heuristic: true,
          raw: [
            ["outbound_tx_count", "0"],
            ["balance", "0 PHRS"],
            ["first_activity_block", "unknown — no on-chain activity at all"],
          ],
          explanation:
            "This address has no on-chain activity at all (no transactions, zero balance), so there is no first-activity block to measure. It may never have been used. (HEURISTIC)",
        });
      } else if (nonce === 0n) {
        // Funded but never outbound: the CLI measures funding age, and so do we.
        setPhase("Pinpointing first funding (balance binary search)…");
        const firstBlock = await firstFundedBlock(address, latest, (done, total) =>
          setPhase(`Pinpointing first funding… ${done}/${total} probes`)
        );
        if (firstBlock === null) {
          checks.push({
            id: "S1",
            name: "Account age (first activity)",
            verdict: "UNKNOWN",
            heuristic: true,
            raw: [
              ["outbound_tx_count", "0"],
              ["balance", `${weiToPhrs(balanceWeiHex)} PHRS`],
              ["first_activity_block", "unknown — balance history not monotonic"],
            ],
            explanation:
              "No outbound transactions and the balance history is not monotonic, so no RPC-only first-seen block exists. Without an indexer the true first-seen block is unknown. (UNKNOWN is not treated as safe. HEURISTIC)",
          });
        } else {
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
              ["basis", "first block with balance > 0 (never initiated a transaction)"],
            ],
            explanation: young
              ? `First seen ~${ageBlocks.toLocaleString()} blocks ago (block ${firstBlock.toLocaleString()}) — under the ${YOUNG_ACCOUNT_BLOCKS.toLocaleString()}-block heuristic threshold. Never-outbound but funded accounts match the setup phase of disposable wallets.`
              : `First seen ~${ageBlocks.toLocaleString()} blocks ago (block ${firstBlock.toLocaleString()}) — older than the ${YOUNG_ACCOUNT_BLOCKS.toLocaleString()}-block heuristic threshold, so it passes on age even though it never initiated a transaction.`,
            whyMatters: young
              ? "Many scam/rug contracts and mule wallets are hours or days old — age alone proves nothing, but youth deserves a second look."
              : undefined,
            whatToDo: young
              ? "Wait for a track record before interacting: verify who funded it, never send first to an unverifiable counterparty, and read the code."
              : undefined,
          });
        }
      } else {
        setPhase("Pinpointing first activity (nonce binary search)…");
        const firstBlock = await firstOutboundBlock(address, latest, (done, total) =>
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

      // ── S5 · Recent activity window (nonce delta — EIP-161-aware) ──
      setPhase("Checking recent activity (10,000-block window)…");
      const nonceThenHex = (await rpcCall("eth_getTransactionCount", [address, blockHex(winFrom)])) as string;
      const nonceThen = BigInt(nonceThenHex);
      const effThen = isContract ? (nonceThen > 0n ? nonceThen - 1n : 0n) : nonceThen;
      const outboundInWindow = effectiveOutbound >= effThen ? effectiveOutbound - effThen : 0n;
      const burst = outboundInWindow > BigInt(BURST_OUTBOUND_TXS);
      checks.push({
        id: "S5",
        name: "Recent activity window",
        verdict: burst ? "FLAG" : "PASS",
        heuristic: true,
        raw: [
          ["window_blocks", LOG_WINDOW_BLOCKS.toLocaleString()],
          ["window", `blocks ${winFrom.toLocaleString()}–${latest.toLocaleString()}`],
          ["effective_outbound_txs_in_window", outboundInWindow.toString()],
          ["burst_threshold", BURST_OUTBOUND_TXS.toLocaleString()],
          ...(isContract ? [["note", "contract-creation nonce (EIP-161) excluded from the effective count"] as [string, string]] : [["note", "EOA: nonce delta = outbound txs"] as [string, string]]),
        ],
        explanation: burst
          ? `${outboundInWindow.toLocaleString()} outbound transactions in the last ${LOG_WINDOW_BLOCKS.toLocaleString()} blocks — above the ${BURST_OUTBOUND_TXS.toLocaleString()} heuristic burst threshold. Burst activity can indicate automated draining, spam, or bot operation.`
          : `${outboundInWindow.toLocaleString()} outbound transaction(s) in the last ${LOG_WINDOW_BLOCKS.toLocaleString()} blocks (blocks ${winFrom.toLocaleString()}–${latest.toLocaleString()}). No burst pattern.`,
        whyMatters: burst
          ? "Normal wallets and contracts do not fire hundreds of transactions in a short window — bursts look like scripts, drainers, or spam campaigns."
          : undefined,
        whatToDo: burst
          ? "Check what those transactions do on the explorer before interacting — a burst of token movements or approvals is a red flag."
          : undefined,
      });

      // ── S6 · Interaction diversity (Transfer logs, topic0-only + client-side filter) ──
      const transferTopic = keccak256Hex("Transfer(address,address,uint256)");
      const transferScan = await scanWindowLogs(transferTopic, [], latest, setPhase, "Mapping token counterparties");
      const peers = new Set<string>();
      let myTransfers = 0;
      const me = address.toLowerCase();
      for (const l of transferScan.logs) {
        if (!l.topics || l.topics.length < 3) continue;
        const from = topicToAddr(l.topics[1]);
        const to = topicToAddr(l.topics[2]);
        if (from !== me && to !== me) continue;
        myTransfers++;
        if (from !== me) peers.add(from);
        if (to !== me) peers.add(to);
      }
      const peerCount = peers.size;
      const lowDiv = peerCount <= LOW_DIVERSITY_MAX_PEERS;
      const partialS6 = transferScan.readableChunks < transferScan.totalChunks;
      checks.push({
        id: "S6",
        name: "Interaction diversity (Transfer counterparties)",
        verdict: lowDiv ? "FLAG" : "PASS",
        heuristic: true,
        raw: [
          ["window_blocks", LOG_WINDOW_BLOCKS.toLocaleString()],
          ["transfer_events_in_chain_window", transferScan.logs.length.toLocaleString()],
          ["transfer_events_involving_address", myTransfers.toLocaleString()],
          ["distinct_counterparties", peerCount.toLocaleString()],
          ["counterparty_sample", [...peers].slice(0, 10).join(", ") || "—"],
          ["low_diversity_threshold", LOW_DIVERSITY_MAX_PEERS.toLocaleString()],
          ["note", "ERC-20/721 Transfer events only; native PHRS transfers are not in logs"],
          ...(partialS6 ? [["coverage_note", `partial window: ${transferScan.readableChunks}/${transferScan.totalChunks} log chunks readable`] as [string, string]] : []),
        ],
        explanation: lowDiv
          ? `Only ${peerCount} distinct counterpart(ies) in token Transfer events over the last ${LOG_WINDOW_BLOCKS.toLocaleString()} blocks. Real, established wallets usually interact with many addresses; a tiny interaction graph is typical of fresh/single-purpose wallets.${partialS6 ? " (Partial window: some log chunks were unreadable.)" : ""}`
          : `${peerCount} distinct counterparties in token Transfer events over the last ${LOG_WINDOW_BLOCKS.toLocaleString()} blocks — a normal interaction graph.${partialS6 ? " (Partial window: some log chunks were unreadable.)" : ""}`,
        whyMatters: lowDiv
          ? "A wallet that talks to almost nobody is either brand new or built for one purpose. Disposable scam wallets and airdrop-farming wallets share that shape."
          : undefined,
        whatToDo: lowDiv
          ? "Combine with the age and funding checks above: a young, idle, lonely wallet is the classic setup for a rug or phishing contract."
          : undefined,
      });

      // ── S7 · Approval hygiene (Approval logs with owner topic) ──
      const approvalTopic = keccak256Hex("Approval(address,address,uint256)");
      const ownerTopic = addrToTopic(address);
      const approvalScan = await scanWindowLogs(approvalTopic, [ownerTopic], latest, setPhase, "Scanning token approvals");
      const unlimitedCap = (1n << 256n) - 1n;
      const spenders = new Set<string>();
      const grants: ApprovalGrant[] = [];
      let unlimited = 0;
      for (const log of approvalScan.logs) {
        if (!log.topics || log.topics.length < 3) continue;
        const spender = topicToAddr(log.topics[2]);
        spenders.add(spender);
        let isUnlimited = false;
        try {
          isUnlimited = BigInt(log.data ?? "0x0") === unlimitedCap;
        } catch {
          /* ignore malformed log data */
        }
        if (isUnlimited) unlimited += 1;
        grants.push({ token: (log.address ?? "").toLowerCase(), spender, unlimited: isUnlimited });
      }
      const manySpenders = spenders.size > MAX_APPROVAL_SPENDERS;
      const flagged = unlimited > 0 || manySpenders;
      const partialS7 = approvalScan.readableChunks < approvalScan.totalChunks;
      checks.push({
        id: "S7",
        name: "Token approvals (allowance hygiene)",
        verdict: flagged ? "FLAG" : "PASS",
        heuristic: true,
        raw: [
          ["approval_events_in_window", approvalScan.logs.length.toLocaleString()],
          ["distinct_spenders", spenders.size.toLocaleString()],
          ["unlimited_approvals", unlimited.toLocaleString()],
          ["max_spenders_threshold", MAX_APPROVAL_SPENDERS.toLocaleString()],
          ["note", "window-limited; older approvals outside the window are NOT covered"],
          ...(partialS7 ? [["coverage_note", `partial window: ${approvalScan.readableChunks}/${approvalScan.totalChunks} log chunks readable`] as [string, string]] : []),
        ],
        explanation: flagged
          ? `${unlimited} UNLIMITED approval(s) to ${spenders.size} spender(s) in the window. An unlimited approval lets the spender move ALL of that token from this wallet at any time, until revoked.${partialS7 ? " (Partial window: some log chunks were unreadable.)" : ""}`
          : `${approvalScan.logs.length} approval event(s), ${spenders.size} distinct spender(s), ${unlimited} unlimited. No unusual approval pattern in the window.${partialS7 ? " (Partial window: some log chunks were unreadable.)" : ""}`,
        whyMatters: flagged
          ? "Unlimited approvals are the single most common way wallets get drained: one compromised or malicious spender contract can empty every approved token."
          : undefined,
        whatToDo: flagged
          ? "Revoke approvals you do not actively use — send approve(spender, 0) for the token contract, or use a revocation tool. Keep only the spenders you need."
          : undefined,
        detailRows: grants.length > 0 ? grants : undefined,
      });

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
    LOW: "Nothing in these checks looks suspicious. Stay alert anyway: these are heuristics, not proof of safety.",
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
          all 8 checks — account age, funding pattern, balance, EOA-vs-contract, activity burst,
          token counterparties, and approval hygiene — then prints a per-check report that{" "}
          <strong>explains every flag in plain language</strong>, not just a score.
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
          <div className="mt-3 rounded-lg bg-failbg px-3 py-2" role="alert">
            <p className="text-sm text-fail">{error}</p>
            <button className="btn-outline !min-h-0 !py-1.5 !px-3 text-xs mt-2" onClick={runScan} disabled={scanning}>
              Retry the scan
            </button>
          </div>
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
                className="font-mono text-xs text-accent hover:underline break-all"
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
                        <td className="font-mono text-xs text-ink break-all">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {c.detailRows && c.detailRows.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-hairline bg-porcelain">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="text-left">Token contract</th>
                        <th className="text-left">Spender (can move the tokens)</th>
                        <th className="text-left">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.detailRows.slice(0, 12).map((g, i) => (
                        <tr key={i}>
                          <td>
                            <a
                              className="font-mono text-xs text-accent hover:underline break-all"
                              href={`${EXPLORER_ADDRESS}${g.token}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {g.token.slice(0, 10)}…{g.token.slice(-6)} ↗
                            </a>
                          </td>
                          <td>
                            <a
                              className="font-mono text-xs text-accent hover:underline break-all"
                              href={`${EXPLORER_ADDRESS}${g.spender}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {g.spender.slice(0, 10)}…{g.spender.slice(-6)} ↗
                            </a>
                          </td>
                          <td className={"font-mono text-xs " + (g.unlimited ? "text-fail font-bold" : "text-ink")}>
                            {g.unlimited ? "UNLIMITED" : "limited"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {c.detailRows.length > 12 && (
                    <p className="px-3 py-2 text-xs text-slate">
                      + {c.detailRows.length - 12} more grant(s) — full list in the CLI report.
                    </p>
                  )}
                </div>
              )}
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
                This page runs all 8 checks (S1–S8) live against the public RPC, mirroring the
                CLI at <span className="font-mono">tasks/t23-wallet-risk-checker/bin/run.mjs</span>.
              </li>
              <li>Native PHRS transfers are not in logs, so the transfer and approval scans never see them.</li>
              <li>Approval hygiene covers only the last 10,000 blocks — older approvals are not covered.</li>
              <li>Contract source verification depends on an explorer API that is currently unreachable — contracts report UNKNOWN here.</li>
              <li>A FLAG means "this on-chain pattern is worth a second look" — never "this wallet is malicious".</li>
            </ul>
            <p className="mt-2 text-xs text-slate">
              Evidence for the 8-check runs (both demo addresses, block numbers, tx hashes, spend
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
