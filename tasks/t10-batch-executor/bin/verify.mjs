#!/usr/bin/env node
/**
 * t10-batch-executor — post-batch ON-CHAIN READBACK (`verify`).
 *
 * After a batch broadcast, every action's application is proven twice:
 *   1. from the receipt: the `Distributed(recipient, amount, success)` events
 *      in the transaction receipt (success=false -> the isolated per-recipient
 *      failure the distributor is built for, e.g. the RevertingReceiver).
 *   2. live re-check: each recipient's native balance at the receipt block
 *      MINUS their balance at the block BEFORE the batch. The on-chain effect
 *      of a successful transfer is exactly the event amount; a reverted one
 *      moves 0.
 *
 * Per-recipient verdict, tied 1:1 to receipt logs in logIndex order:
 *   APPLIED                 success && delta == event amount
 *   NOT APPLIED (reverted)  !success && delta == 0
 *   MISMATCH                anything else (reported, never papered over)
 *
 * The BatchExecuted totals in the same receipt are cross-checked against
 * the Distributed events. Read-only: 0 gas, no keys.
 *
 * Usage: node bin/verify.mjs <txhash> [--out report.json]
 *        (also reachable as `node bin/run.mjs verify <txhash>`)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DISTRIBUTED_TOPIC =
  "0x95d933c4e6c79badbfce85f691af2544c47fd03b3874af9254b6450affb54b1a"; // keccak("Distributed(address,uint256,bool)")
export const BATCH_EXECUTED_TOPIC =
  "0x70cd69ce28159a2c66b842c169eec4a3876d3f320c3ff816e09ef1db90b447d6"; // keccak("BatchExecuted(address,uint256,uint256,uint256,uint256)")

function rpcUrl() {
  const url = process.env.ATLANTIC_RPC_URL;
  if (!url) throw new Error("ATLANTIC_RPC_URL is not set (source the repo .env first)");
  return url;
}

function envWithFoundry() {
  const foundryBin = join(homedir(), ".foundry", "bin");
  if (existsSync(join(foundryBin, "cast")) && !(process.env.PATH ?? "").split(delimiter).includes(foundryBin)) {
    return { ...process.env, PATH: `${foundryBin}${delimiter}${process.env.PATH}` };
  }
  return process.env;
}

function castJson(...args) {
  const out = execFileSync("cast", [...args, "--rpc-url", rpcUrl()], {
    encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"], env: envWithFoundry(),
  });
  const parsed = JSON.parse(out);
  // Some cast commands wrap the payload in {data: ...}; unwrap when present.
  if (parsed && typeof parsed === "object" && parsed.data &&
      (parsed.data.hash !== undefined || parsed.data.logs !== undefined ||
       parsed.data.value !== undefined)) {
    return parsed.data;
  }
  return parsed;
}

/** Decode one Distributed log -> {logIndex, recipient, amountWei, success}. Pure. */
export function decodeDistributedLog(log) {
  const topics = log.topics ?? [];
  if (topics.length < 2 || topics[0].toLowerCase() !== DISTRIBUTED_TOPIC) {
    throw new Error(`log ${log.logIndex} is not a Distributed event`);
  }
  const recipient = "0x" + topics[1].slice(-40);
  const data = (log.data ?? "0x").slice(2).padEnd(128, "0");
  const amountWei = BigInt("0x" + data.slice(0, 64));
  const success = BigInt("0x" + data.slice(64, 128)) !== 0n;
  return { logIndex: Number(log.logIndex), recipient, amountWei, success };
}

/** Decode BatchExecuted totals (succeeded/failed/total/totalValue). Pure. */
export function decodeBatchExecutedLog(log) {
  const data = (log.data ?? "0x").slice(2).padEnd(256, "0");
  return {
    caller: "0x" + (log.topics[1] ?? "").slice(-40),
    totalRecipients: Number(BigInt("0x" + data.slice(0, 64))),
    succeeded: Number(BigInt("0x" + data.slice(64, 128))),
    failed: Number(BigInt("0x" + data.slice(128, 192))),
    totalValueWei: BigInt("0x" + data.slice(192, 256)).toString(),
  };
}

/** Verdict from event truth + live balance delta. Pure. */
export function verdictFor({ success, amountWei, deltaWei }) {
  const expected = success ? amountWei : 0n;
  if (deltaWei !== expected) return "MISMATCH";
  return success ? "APPLIED" : "NOT APPLIED (reverted)";
}

/**
 * Sender-side expected balance delta. The sender both funded the batch and
 * paid gas, so their delta cannot be the raw event amount; it is:
 *   ownReceived + refund - gasCost - txValue
 * where refund = txValue - sum(successful event amounts), all from the same
 * receipt's Distributed events. The contract held 0 before/after, so every
 * successful amount came back out either as a transfer or the refund.
 */
export function senderExpectedDelta({ gasWei, valueWei, ownReceivedWei, refundWei }) {
  return ownReceivedWei + refundWei - gasWei - valueWei;
}

export const DUST_WEI = 1000000000n; // 1 gwei

export function hexInt(v) {
  return BigInt(typeof v === "string" ? v : v.toString());
}

/**
 * Sender verdict. The sender funded the batch AND paid gas, so their delta
 * is judged against senderExpectedDelta(...) — whose receive and refund
 * terms must reconcile exactly — with a documented 1-gwei materiality bound
 * (DUST_WEI) on the residual. Residuals are always printed in
 * senderAccounting (never hidden); anything beyond the bound is MISMATCH.
 */
export function senderVerdict({ success, residualWei }) {
  const dustOK = residualWei > -DUST_WEI && residualWei < DUST_WEI;
  if (!dustOK) return "MISMATCH";
  return success ? "APPLIED" : "NOT APPLIED (reverted)";
}

export function verify(txHash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error(`bad tx hash: ${txHash}`);
  const receipt = castJson("receipt", txHash, "--json");
  if (!receipt || !receipt.logs) throw new Error(`no receipt/logs for ${txHash} on Atlantic`);
  const block = Number(receipt.blockNumber);
  const statusOk = hexInt(receipt.status) === 1n;
  const sender = (receipt.from ?? "").toLowerCase();
  const gasUsed = hexInt(receipt.gasUsed);
  const gasPrice = hexInt(receipt.effectiveGasPrice ?? receipt.gasPrice);
  const gasWei = gasUsed * gasPrice;
  const tx = castJson("tx", txHash, "--json");
  const txValue = hexInt(tx.value ?? "0x0");

  // First pass: decode all Distributed events; sender refund is derived from
  // the same receipt (txValue - sum of successful event amounts).
  const decoded = [];
  let batchExecuted = null;
  for (const log of receipt.logs) {
    const t0 = (log.topics?.[0] ?? "").toLowerCase();
    if (t0 === DISTRIBUTED_TOPIC) decoded.push(decodeDistributedLog(log));
    else if (t0 === BATCH_EXECUTED_TOPIC) batchExecuted = decodeBatchExecutedLog(log);
  }
  const sumSuccessful = decoded
    .filter((d) => d.success)
    .reduce((a, d) => a + d.amountWei, 0n);
  const refundWei = txValue - sumSuccessful;

  const rows = [];
  for (const d of decoded) {
    const before = hexInt(castJson("balance", d.recipient, "--block", String(block - 1)));
    const after = hexInt(castJson("balance", d.recipient, "--block", String(block)));
    const deltaWei = after - before;
    const isSender = d.recipient.toLowerCase() === sender;
    const ownReceivedWei = isSender && d.success ? d.amountWei : 0n;
    const expectedDeltaWei = isSender
      ? senderExpectedDelta({ gasWei, valueWei: txValue, ownReceivedWei, refundWei })
      : (d.success ? d.amountWei : 0n);
    const residualWei = isSender ? deltaWei - expectedDeltaWei : null;
    rows.push({
      txHash,
      logIndex: d.logIndex,
      recipient: d.recipient,
      isSender,
      amountWei: d.amountWei.toString(),
      success: d.success,
      balanceBeforeWei: before.toString(),
      balanceAfterWei: after.toString(),
      deltaWei: deltaWei.toString(),
      expectedDeltaWei: expectedDeltaWei.toString(),
      senderAccounting: isSender ? {
        gasWei: gasWei.toString(),
        valueWei: txValue.toString(),
        refundWei: refundWei.toString(),
        ownReceivedWei: ownReceivedWei.toString(),
        residualWei: residualWei.toString(),
        dustBoundWei: DUST_WEI.toString(),
        note: "sender funded the batch and paid gas; expected = received + refund - gas - value; " +
              "verdict APPLIED requires receive/refund exact and |residual| < 1 gwei (materiality bound)",
      } : null,
      verdict: isSender
        ? senderVerdict({ success: d.success, residualWei })
        : (deltaWei === expectedDeltaWei
          ? (d.success ? "APPLIED" : "NOT APPLIED (reverted)")
          : "MISMATCH"),
    });
  }
  rows.sort((a, b) => a.logIndex - b.logIndex);

  const applied = rows.filter((r) => r.verdict === "APPLIED").length;
  const reverted = rows.filter((r) => r.verdict === "NOT APPLIED (reverted)").length;
  const mismatched = rows.filter((r) => r.verdict === "MISMATCH").length;
  // Cross-check BatchExecuted against the EVENTS themselves (independent
  // axis from the balance-verdicts above): event success/failure counts.
  const eventSucceeded = rows.filter((r) => r.success).length;
  const eventFailed = rows.filter((r) => !r.success).length;
  const crossCheck = batchExecuted
    ? {
        batchExecuted,
        matchesDistributedEvents:
          batchExecuted.succeeded === eventSucceeded &&
          batchExecuted.failed === eventFailed &&
          batchExecuted.totalRecipients === rows.length,
      }
    : null;

  return {
    tool: "t10-batch-executor",
    mode: "verify",
    txHash,
    block,
    receiptStatusOk: statusOk,
    distributorEvents: rows.length,
    summary: { applied, reverted, mismatched, crossCheckMatches: crossCheck?.matchesDistributedEvents ?? null },
    batchExecuted: crossCheck,
    recipients: rows,
    rpcNote: "every value above is a live Atlantic read (cast receipt/balance --block); chain 688689 asserted by the endpoint",
  };
}

function phrs4(weiStr) {
  const w = BigInt(weiStr);
  const neg = w < 0n;
  const abs = neg ? -w : w;
  const s = `${abs / 10n ** 18n}.${(abs % 10n ** 18n).toString().padStart(18, "0").slice(0, 4)}`;
  return (neg ? "-" : "") + s;
}

function main() {
  const [txHash, maybeFlag, maybeOut] = process.argv.slice(2);
  if (!txHash) {
    console.error("usage: node bin/verify.mjs <txhash> [--out report.json]");
    process.exit(1);
  }
  const report = verify(txHash);
  const applied = report.summary.applied, reverted = report.summary.reverted, mismatched = report.summary.mismatched;
  console.log(`t10 verify :: ${txHash} @ block ${report.block} (status ${report.receiptStatusOk ? "ok" : "REVERTED"})`);
  console.log(`  distributed events: ${report.distributorEvents} | APPLIED ${applied} | NOT APPLIED (reverted) ${reverted} | MISMATCH ${mismatched}`);
  console.log("  logIdx  recipient                                    amount(PHRS)   event  delta(PHRS)    verdict");
  for (const r of report.recipients) {
    console.log(`  ${String(r.logIndex).padStart(6)}  ${r.recipient}  ${phrs4(r.amountWei).padStart(10)}  ${r.success ? "ok  " : "FAIL"}  ${phrs4(r.deltaWei).padStart(10)}  ${r.verdict}${r.isSender ? " [sender: gas+value+refund itemized in report]" : ""}`);
  }
  if (report.batchExecuted) {
    const b = report.batchExecuted.batchExecuted;
    console.log(`  batchExecuted totals: succeeded=${b.succeeded} failed=${b.failed} total=${b.totalRecipients} ` +
      `| cross-check vs Distributed events: ${report.batchExecuted.matchesDistributedEvents ? "MATCH" : "MISMATCH"}`);
  }
  if (maybeFlag === "--out" && maybeOut) {
    mkdirSync(dirname(maybeOut), { recursive: true });
    writeFileSync(maybeOut, JSON.stringify(report, null, 2) + "\n");
    console.log(`  report -> ${maybeOut}`);
  }
  if (!report.receiptStatusOk || mismatched > 0 ||
      (report.batchExecuted && !report.batchExecuted.matchesDistributedEvents)) {
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
