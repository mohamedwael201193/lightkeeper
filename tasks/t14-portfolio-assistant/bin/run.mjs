#!/usr/bin/env node
/**
 * T14 Portfolio Assistant — runner.
 * CHAIN-ID ASSERTION FIRST: refuses to run on anything but Atlantic (688689).
 * READ-ONLY: no keys, no signers, no broadcasts. Ever.
 */
import { PortfolioReader, ATLANTIC_CHAIN_ID, ATLANTIC_RPC_URL, summarizeSnapshot, routeIntent } from "../../../packages/portfolio/src/portfolio.mjs";
import { loadRegistry, snapshot, answer, negativeProbes } from "../src/index.mjs";

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const has = (n) => args.includes(n);

if (has("--help") || (!flag("--wallet") && !flag("--question") && !has("--snapshot") && !has("--demo") && !has("--probes"))) {
  console.log(`T14 Portfolio Assistant — Pharos Atlantic testnet (chain ${ATLANTIC_CHAIN_ID})

Usage:
  bin/run.mjs --wallet <address> --question "<natural language question>"
  bin/run.mjs --wallet <address> --snapshot          # full JSON portfolio snapshot
  bin/run.mjs --wallet <address> --demo              # 6 question types + summary
  bin/run.mjs --wallet <address> --probes            # negative-probe log (I-don't-know paths)

Supported question types: balance, holdings, transaction count, recent activity,
gas headroom, token info, protocol positions. Valuations are ALWAYS "${"testnet — no market value"}".
READ-ONLY: this tool cannot initiate transactions.`);
  process.exit(0);
}

const wallet = flag("--wallet");
if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
  console.error("error: --wallet <0x address> is required");
  process.exit(2);
}

const reader = new PortfolioReader(process.env.ATLANTIC_RPC_URL || ATLANTIC_RPC_URL);
// 1. CHAIN-ID ASSERTION FIRST — before any read.
await reader.assertAtlantic();
const registry = loadRegistry();
if (Number(registry.chain.chainId) !== ATLANTIC_CHAIN_ID) {
  console.error("error: sources.yaml chainId mismatch — refusing to run");
  process.exit(2);
}

if (has("--snapshot")) {
  const snap = await snapshot(wallet, reader, registry);
  console.log(JSON.stringify(snap, null, 2));
} else if (has("--demo")) {
  const snap = await snapshot(wallet, reader, registry);
  const questions = [
    "What is my PHRS balance?",
    "What tokens do I hold?",
    "How many transactions have I made?",
    "What is my recent activity?",
    "How much gas can I afford?",
    "What is USDC?",
    "What is my position in the MiniLend vault?",
  ];
  for (const q of questions) {
    const r = answer(q, snap, registry);
    console.log("Q:", q);
    console.log(r.text || r.answer);
    console.log("—");
  }
  console.log("SUMMARY:\n" + summarizeSnapshot(snap));
} else if (has("--probes")) {
  const snap = await snapshot(wallet, reader, registry);
  const probes = await negativeProbes(reader, registry, wallet, snap);
  console.log(JSON.stringify(probes, null, 2));
} else {
  const q = flag("--question");
  if (!q) { console.error("error: --question \"...\" is required"); process.exit(2); }
  const needsActivity = routeIntent(q) === "activity";
  const snap = await snapshot(wallet, reader, registry, { activity: needsActivity });
  const r = answer(q, snap, registry);
  console.log(r.text || r.answer);
  console.log(`\n[citations: block ${r.block}, chain ${r.chainId}]`);
}
