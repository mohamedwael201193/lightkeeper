// node --test test/verify.test.mjs — Distributed-log decoding + verdict logic.
// Fixtures mirror the real BatchDistributor receipt log shape (1:1 with the
// logs of tx 0x3daa4e7d… in evidence.json, block 31481710): Distributed events
// carry (indexed recipient, amount, success) with topic0 0x95d933c4…
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeDistributedLog, decodeBatchExecutedLog, verdictFor, senderExpectedDelta, senderVerdict,
         DISTRIBUTED_TOPIC, BATCH_EXECUTED_TOPIC } from "../bin/verify.mjs";

const word = (hex) => hex.padStart(64, "0");
const REVERTING = "0x49b26d4685262e7756cbE623f134cFa97d142B94";
const EOA = "0x174CFa52Eb47368A74Aa194471ADC745B6b248cA";

function distLog({ recipient, amount, success, logIndex }) {
  return {
    topics: [DISTRIBUTED_TOPIC, "0x" + "0".repeat(24) + recipient.slice(2)],
    data: "0x" + word(amount.toString(16)) + word(success ? "1" : "0"),
    logIndex: "0x" + logIndex.toString(16),
  };
}

test("decodeDistributedLog: success event", () => {
  const amount = 1000000000000000n; // 0.001 PHRS (the demo batch unit)
  const d = decodeDistributedLog(distLog({ recipient: EOA, amount, success: true, logIndex: 3 }));
  assert.equal(d.recipient.toLowerCase(), EOA.toLowerCase());
  assert.equal(d.amountWei, amount);
  assert.equal(d.success, true);
  assert.equal(d.logIndex, 3);
});

test("decodeDistributedLog: isolated failure event (RevertingReceiver)", () => {
  const d = decodeDistributedLog(
    distLog({ recipient: REVERTING, amount: 1000000000000000n, success: false, logIndex: 13 }));
  assert.equal(d.success, false);
  assert.equal(d.recipient.toLowerCase(), REVERTING.toLowerCase());
});

test("decodeDistributedLog: rejects a non-Distributed log", () => {
  assert.throws(() => decodeDistributedLog({
    topics: [BATCH_EXECUTED_TOPIC, "0x" + "0".repeat(64)],
    data: "0x" + "0".repeat(128), logIndex: "0x0",
  }), /not a Distributed event/);
});

test("decodeBatchExecutedLog: totals from the real batch shape", () => {
  const log = {
    topics: [BATCH_EXECUTED_TOPIC, "0x" + "0".repeat(24) + "f76e6B0920e9332fF4410f6dD53F01722AbC71a3".toLowerCase()],
    data: "0x" + word("c") + word("b") + word("1") + word((12000000000000000n).toString(16)),
    logIndex: "0x10",
  };
  const b = decodeBatchExecutedLog(log);
  assert.equal(b.totalRecipients, 12);
  assert.equal(b.succeeded, 11);
  assert.equal(b.failed, 1);
});

test("verdictFor: APPLIED when success and delta equals the event amount", () => {
  assert.equal(verdictFor({ success: true, amountWei: 5n, deltaWei: 5n }), "APPLIED");
});

test("verdictFor: NOT APPLIED (reverted) when failure and delta is zero", () => {
  assert.equal(verdictFor({ success: false, amountWei: 5n, deltaWei: 0n }), "NOT APPLIED (reverted)");
});

test("verdictFor: MISMATCH when the live delta disagrees with the event", () => {
  assert.equal(verdictFor({ success: true, amountWei: 5n, deltaWei: 0n }), "MISMATCH");
  assert.equal(verdictFor({ success: false, amountWei: 5n, deltaWei: 5n }), "MISMATCH");
});

test("senderExpectedDelta: received + refund - gas - value", () => {
  // distributeNative: sender paid 12 units value, got 1 unit as their own
  // transfer and 1 unit back as refund, paid 3 units of gas.
  const d = senderExpectedDelta({
    gasWei: 3n, valueWei: 12n, ownReceivedWei: 1n, refundWei: 1n,
  });
  assert.equal(d, -13n);
});

test("senderExpectedDelta: matches the real Atlantic batch accounting shape", () => {
  // from the live readback of tx 0x3daa4e7d… (block 31481710): gas =
  // gasUsed × effectiveGasPrice, value 0.012 PHRS, own receive 0.001 PHRS,
  // refund 0.001 PHRS (value − sum of successful event amounts).
  const gasWei = 430405n * 1000000001n;
  const d = senderExpectedDelta({
    gasWei, valueWei: 12000000000000000n,
    ownReceivedWei: 1000000000000000n, refundWei: 1000000000000000n,
  });
  assert.equal(d, 2000000000000000n - 12000000000000000n - gasWei);
});

test("senderVerdict: sub-gwei residual inside the bound is APPLIED", () => {
  // the live batch's sender residual is -595 wei (chain-fee dust)
  assert.equal(senderVerdict({ success: true, residualWei: -595n }), "APPLIED");
  assert.equal(senderVerdict({ success: true, residualWei: 999999999n }), "APPLIED");
  assert.equal(senderVerdict({ success: false, residualWei: 0n }), "NOT APPLIED (reverted)");
});

test("senderVerdict: residual at/over the bound is MISMATCH", () => {
  assert.equal(senderVerdict({ success: true, residualWei: 1000000000n }), "MISMATCH");
  assert.equal(senderVerdict({ success: true, residualWei: -5000000000n }), "MISMATCH");
});
