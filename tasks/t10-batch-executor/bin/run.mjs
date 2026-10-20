#!/usr/bin/env node
// Flotilla runner — mode planning + dry-run orchestration for T10.
// Broadcasts (when enabled) go through the shared nonce lock; this file
// defaults to DRY-RUN: it prints the exact cast commands without executing.

import { readFileSync } from "node:fs";
import { planBatch, selectMode } from "./mode.mjs";

const ATLANTIC_CHAIN_ID = 688689;

function loadRecipients(path) {
  const rows = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  return rows.map((line, i) => {
    const [address, amountWei] = line.split(",").map((s) => s.trim());
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error(`row ${i + 1}: bad address ${address}`);
    }
    if (!/^\d+$/.test(amountWei)) {
      throw new Error(`row ${i + 1}: amount must be integer wei, got ${amountWei}`);
    }
    return { address, amountWei };
  });
}

function plan(path, demoChunkSize) {
  const recipients = loadRecipients(path);
  const seen = new Set();
  for (const r of recipients) {
    if (seen.has(r.address.toLowerCase())) {
      throw new Error(`duplicate recipient rejected: ${r.address}`);
    }
    seen.add(r.address.toLowerCase());
  }
  const plan = planBatch(recipients, demoChunkSize);
  const total = recipients.reduce((a, r) => a + BigInt(r.amountWei), 0n);
  console.log(JSON.stringify({ file: path, totalWei: total.toString(), ...plan }, null, 2));

  // Dry-run: show what WOULD be broadcast.
  if (plan.mode === "simple") {
    console.log("\n# DRY-RUN — simple mode: one `cast send` per recipient");
    for (const r of recipients) {
      console.log(
        `flock /tmp/lk-nonce.lock cast send --rpc-url "$ATLANTIC_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" ${r.address} --value ${r.amountWei}  # chain ${ATLANTIC_CHAIN_ID}`
      );
    }
  } else {
    const dist = process.env.DISTRIBUTOR || "<DISTRIBUTOR_ADDRESS>";
    console.log(`\n# DRY-RUN — ${plan.mode}: ${plan.chunks.length} distributor call(s)`);
    for (const chunk of plan.chunks) {
      const addrs = "[" + chunk.map((r) => r.address).join(",") + "]";
      const amts = "[" + chunk.map((r) => r.amountWei).join(",") + "]";
      const value = chunk.reduce((a, r) => a + BigInt(r.amountWei), 0n);
      console.log(
        `flock /tmp/lk-nonce.lock cast send --rpc-url "$ATLANTIC_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" ${dist} "distributeNative(address[],uint256[])" "${addrs}" "${amts}" --value ${value}  # chain ${ATLANTIC_CHAIN_ID}`
      );
    }
  }
}

const [cmd, file, chunkArg] = process.argv.slice(2);
if (cmd === "plan" && file) {
  plan(file, chunkArg ? Number(chunkArg) : null);
} else if (cmd === "mode" && file) {
  console.log(selectMode(Number(file)));
} else if (cmd === "verify" && file) {
  // Per-action on-chain readback lives in bin/verify.mjs (self-executing):
  // for every Distributed receipt event it re-checks the recipient's live
  // balance at the receipt block vs the block before -> APPLIED /
  // NOT APPLIED (reverted) / MISMATCH, tied 1:1 to receipt logs.
  const { spawnSync } = await import("node:child_process");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const r = spawnSync(process.execPath,
    [join(here, "verify.mjs"), file, ...process.argv.slice(4)],
    { stdio: "inherit" });
  process.exit(r.status ?? 1);
} else {
  console.log("usage:");
  console.log("  node bin/run.mjs plan <recipients.csv> [demoChunkSize]  # DRY-RUN plan");
  console.log("  node bin/run.mjs mode <count>                           # mode for a count");
  console.log("  node bin/run.mjs verify <txhash> [--out report.json]    # post-batch on-chain readback");
  process.exit(1);
}
