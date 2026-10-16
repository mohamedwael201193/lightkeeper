// node --test test/mode.test.mjs — mode-selection unit tests (no deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectMode, chunkRecipients, planBatch } from "../bin/mode.mjs";

test("simple: 1–10 recipients", () => {
  for (const n of [1, 5, 10]) assert.equal(selectMode(n), "simple");
});

test("single-batch: 11–200 recipients", () => {
  for (const n of [11, 100, 199, 200]) assert.equal(selectMode(n), "single-batch");
});

test("multi-batch: >200 recipients", () => {
  for (const n of [201, 250, 1000]) assert.equal(selectMode(n), "multi-batch");
});

test("boundary errors", () => {
  assert.throws(() => selectMode(0), /invalid recipient count/);
  assert.throws(() => selectMode(-3), /invalid recipient count/);
  assert.throws(() => selectMode(2.5), /invalid recipient count/);
});

test("chunking: 450 recipients → 3 chunks of 200/200/50", () => {
  const list = Array.from({ length: 450 }, (_, i) => `0x${i}`);
  const chunks = chunkRecipients(list);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((c) => c.length), [200, 200, 50]);
});

test("chunking respects demo chunk size and keeps every address", () => {
  const list = Array.from({ length: 12 }, (_, i) => `addr-${i}`);
  const plan = planBatch(list, 6);
  // 12 ≤ 10? no → 12 is single-batch territory; force multi-batch path
  // by planning explicitly through chunkRecipients with chunk size 6:
  const chunks = chunkRecipients(list, 6);
  assert.deepEqual(chunks.map((c) => c.length), [6, 6]);
  assert.deepEqual(chunks.flat(), list);
  assert.equal(plan.mode, "single-batch");
});

test("planBatch multi-batch with demo chunk size", () => {
  const list = Array.from({ length: 250 }, (_, i) => `0x${i}`);
  const plan = planBatch(list, 50);
  assert.equal(plan.mode, "multi-batch");
  assert.equal(plan.chunkSize, 50);
  assert.deepEqual(plan.chunks, [50, 50, 50, 50, 50]);
  assert.equal(plan.chunks.reduce((a, b) => a + b, 0), 250);
});

test("chunk size larger than on-chain cap is rejected", () => {
  assert.throws(() => chunkRecipients(["a"], 201), /invalid chunk size/);
});

test("empty list rejected", () => {
  assert.throws(() => chunkRecipients([]), /empty recipient list/);
});
