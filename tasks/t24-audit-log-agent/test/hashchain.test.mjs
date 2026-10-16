import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  GENESIS_PREV, canonical, sha256hex, entryHash, makeEntry,
  appendEntry, loadEntries, verifyLog, weiToPhrs,
} from "../src/lib.mjs";

function freshLog() {
  const dir = mkdtempSync(join(tmpdir(), "t24-test-"));
  return join(dir, "audit.jsonl");
}

describe("hash chain", () => {
  it("genesis entry links to the fixed genesis prev hash", () => {
    const log = freshLog();
    const e = appendEntry(log, { actor: "tester", action: "read:chain-id", params: { chainId: 688689 } });
    assert.equal(e.index, 0);
    assert.equal(e.prevHash, GENESIS_PREV);
    assert.equal(e.entryHash, entryHash(e));
  });

  it("each entry links to its predecessor; verify passes on a valid log", () => {
    const log = freshLog();
    appendEntry(log, { actor: "tester", action: "read:chain-id" });
    appendEntry(log, { actor: "tester", action: "tx:send", params: { value: "0.0001" }, txHash: "0xabc" });
    appendEntry(log, { actor: "tester", action: "read:receipt", params: { status: 1 }, txHash: "0xabc" });
    const entries = loadEntries(log);
    assert.equal(entries.length, 3);
    assert.equal(entries[1].prevHash, entries[0].entryHash);
    assert.equal(entries[2].prevHash, entries[1].entryHash);
    const v = verifyLog(log);
    assert.equal(v.ok, true);
    assert.equal(v.checked, 3);
    assert.deepEqual(v.failures, []);
  });

  it("verify FAILS after tampering an entry's params on a copy", () => {
    const log = freshLog();
    appendEntry(log, { actor: "tester", action: "read:balance" });
    appendEntry(log, { actor: "tester", action: "tx:send", params: { value: "0.0001" }, txHash: "0xabc" });
    // tamper the COPY: rewrite line 1 with altered params, keep hashes
    const lines = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    lines[1].params = { value: "999999.0" }; // attacker edits content
    const tampered = log + ".tampered.jsonl";
    writeFileSync(tampered, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    const v = verifyLog(tampered);
    assert.equal(v.ok, false);
    assert.ok(v.failures.some((f) => f.index === 1 && /entryHash mismatch/.test(f.reason)));
    // original untouched: still verifies
    const v2 = verifyLog(log);
    assert.equal(v2.ok, true);
  });

  it("verify FAILS when a prevHash link is broken (entry replaced)", () => {
    const log = freshLog();
    appendEntry(log, { actor: "tester", action: "a" });
    appendEntry(log, { actor: "tester", action: "b" });
    const lines = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    lines[1].prevHash = "f".repeat(64); // forged link
    const tampered = log + ".link.jsonl";
    writeFileSync(tampered, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    const v = verifyLog(tampered);
    assert.equal(v.ok, false);
    assert.ok(v.failures.some((f) => f.index === 1 && /prevHash/.test(f.reason)));
  });

  it("verify FAILS on empty/missing required fields", () => {
    const log = freshLog();
    appendEntry(log, { actor: "tester", action: "a" });
    const lines = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    delete lines[0].actor;
    const tampered = log + ".fields.jsonl";
    writeFileSync(tampered, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    const v = verifyLog(tampered);
    assert.equal(v.ok, false);
  });

  it("canonical hashing is key-order independent and deterministic", () => {
    const a = { b: 1, a: { y: 2, x: 1 } };
    const b = { a: { x: 1, y: 2 }, b: 1 };
    assert.equal(canonical(a), canonical(b));
    assert.equal(sha256hex(canonical(a)).length, 64);
    assert.equal(weiToPhrs("0xde0b6b3a7640000"), "1.0");
  });

  it("empty log verifies as ok with zero entries", () => {
    const log = freshLog();
    writeFileSync(log, "");
    const v = verifyLog(log);
    assert.equal(v.ok, true);
    assert.equal(v.checked, 0);
  });
});
