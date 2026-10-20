/**
 * t09-trend-watcher — crash-safety tests for src/store.mjs.
 *
 * The runtime snapshot is written with atomicWriteFile (tmp + fsync +
 * rename). These tests prove the property the hard way: a writer child
 * process is SIGKILLed at a random instant mid-loop, and the snapshot on
 * disk must afterwards be either the complete OLD generation or the
 * complete NEW one — parseable JSON whose checksum matches its content.
 * A torn write (half old / half new, truncated JSON, checksum mismatch)
 * fails the test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteFile, saveRuntime, loadPriors, statePaths } from "../src/store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE_URL = new URL("../src/store.mjs", import.meta.url).href;

function checksumOf(gen, filler) {
  return createHash("sha256").update(JSON.stringify({ gen, filler })).digest("hex");
}

function assertSnapshotIntact(file, label) {
  const raw = readFileSync(file, "utf8");
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(raw);
  }, `${label}: snapshot is not parseable JSON (torn write?) — first 120 chars: ${raw.slice(0, 120)}`);
  assert.equal(
    parsed.check,
    checksumOf(parsed.gen, parsed.filler),
    `${label}: checksum mismatch at generation ${parsed.gen} (torn write)`
  );
  return parsed.gen;
}

test("atomicWriteFile: content round-trips exactly", () => {
  const dir = mkdtempSync(join(tmpdir(), "t09-atomic-"));
  const file = join(dir, "runtime.json");
  atomicWriteFile(file, '{"a":1}\n');
  assert.equal(readFileSync(file, "utf8"), '{"a":1}\n');
  atomicWriteFile(file, '{"a":2,"b":"x"}\n');
  assert.equal(readFileSync(file, "utf8"), '{"a":2,"b":"x"}\n');
  // no stray tmp files left behind
  assert.deepEqual(readdirSync(dir), ["runtime.json"]);
});

test("saveRuntime/loadPriors: round-trip via the atomic path", () => {
  const dir = mkdtempSync(join(tmpdir(), "t09-store-"));
  const paths = statePaths({ state: { dir, observations: "o.jsonl", runtime: "runtime.json", audit: "a.jsonl" } });
  saveRuntime(paths, { streak: 2, lastFireBlock: 42, samplesTotal: 7, firesTotal: 1 });
  const priors = loadPriors(paths);
  assert.equal(priors.streak, 2);
  assert.equal(priors.lastFireBlock, 42);
  assert.equal(priors.samplesTotal, 7);
});

test("SIGKILL mid-write never tears the runtime snapshot", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "t09-crash-"));
  const target = join(dir, "runtime.json");
  // seed a complete generation-0 snapshot
  const filler0 = "g0:" + "x".repeat(4096);
  writeFileSync(target, JSON.stringify({ gen: 0, filler: filler0, check: checksumOf(0, filler0) }));

  // writer child: hammer the snapshot with ever-larger generations via the
  // REAL store.atomicWriteFile — each payload ~256 KB so a write takes long
  // enough for SIGKILL to land mid-write with high probability.
  const childScript = join(dir, "writer-child.mjs");
  writeFileSync(
    childScript,
    `import { atomicWriteFile } from ${JSON.stringify(STORE_URL)};\n` +
      `import { createHash } from "node:crypto";\n` +
      `const target = process.argv[2];\n` +
      `let gen = 0;\n` +
      `while (true) {\n` +
      `  gen += 1;\n` +
      `  const filler = "g" + gen + ":" + "y".repeat(256 * 1024);\n` +
      `  const check = createHash("sha256").update(JSON.stringify({ gen, filler })).digest("hex");\n` +
      `  atomicWriteFile(target, JSON.stringify({ gen, filler, check }));\n` +
      `}\n`
  );

  const ROUNDS = 6;
  let maxGenSeen = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const child = spawn(process.execPath, [childScript, target], { stdio: "ignore" });
    // Wait until the writer is PROVEN to be mid-stream (gen >= 3 visible on
    // disk) before killing — this kills the child while it is hammering the
    // snapshot at full speed, not during Node startup.
    const t0 = Date.now();
    let genNow = 0;
    while (Date.now() - t0 < 10000) {
      try {
        genNow = JSON.parse(readFileSync(target, "utf8")).gen ?? 0;
      } catch {
        genNow = 0;
      }
      if (genNow >= 3) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(genNow >= 3, `round ${round}: writer never reached gen 3 within 10s`);
    // random extra delay so the SIGKILL lands at an unpredictable point in
    // the write loop (mid tmp-write, mid fsync, or mid rename)
    await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 350)));
    child.kill("SIGKILL");
    await new Promise((r) => child.once("exit", r));
    assert.ok(existsSync(target), `round ${round}: snapshot file must exist after SIGKILL`);
    const gen = assertSnapshotIntact(target, `round ${round} (killed mid-stream)`);
    if (gen > maxGenSeen) maxGenSeen = gen;
  }
  t.diagnostic(`SIGKILL rounds=${ROUNDS}, highest complete generation observed=${maxGenSeen}, torn writes=0`);
  assert.ok(maxGenSeen >= 1, "writer must have completed at least one full generation across rounds");
});
