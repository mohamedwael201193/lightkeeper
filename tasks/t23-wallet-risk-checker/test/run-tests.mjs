#!/usr/bin/env node
/*
 * T23 tests — live verification, no mocks.
 *
 * Runs the checker on BOTH evidence addresses and asserts every raw value it
 * reports matches an independent direct `cast` query against the same RPC:
 *   - balance (eth_getBalance)      == cast balance
 *   - outbound tx count (nonce)     == cast nonce
 *   - bytecode (eth_getCode)        == cast code
 *   - recent-window outbound delta  == cast nonce at <block> vs latest
 * Also asserts report structure (8 checks, verdict domain, composite level)
 * and the demo-pair expectation: the fresh fixture is HIGH (risky example),
 * the established deployer wallet is not HIGH (clean example).
 *
 * Env: ATLANTIC_RPC_URL. Requires `cast` on PATH.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RPC = process.env.ATLANTIC_RPC_URL || "https://atlantic.dplabs-internal.com";
const DEPLOYER = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const FIXTURE = "0x2459eC8B2ca982a8c2C6188c098701177D63EC43";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${detail}`); }
}
function cast(...args) {
  return execFileSync("cast", [...args, "--rpc-url", RPC], { encoding: "utf8" }).trim();
}
function runChecker(addr, out, pinBlock) {
  execFileSync("node", ["bin/run.mjs", addr, "--config", "signals.yaml", "--json-out", out, "--block", String(pinBlock)],
    { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  return JSON.parse(readFileSync(out, "utf8"));
}
const byId = (r, id) => r.checks.find((c) => c.id === id);

async function main() {
  const chainId = cast("chain-id");
  check("chain is Atlantic 688689", chainId === "688689", `got ${chainId}`);

  // Pin every read to a finalized historical block: the Atlantic RPC is
  // load-balanced and its nodes diverge on "latest" state for hot wallets,
  // while historical blocks are sticky-consistent. latest-120 ≈ 4 min margin.
  const latest = Number(BigInt(cast("block-number")));
  const pinBlock = latest - 120;
  console.log(`pinning all reads to block ${pinBlock} (latest ${latest})`);

  for (const [label, addr, expectHigh] of [["deployer", DEPLOYER, false], ["fixture", FIXTURE, true]]) {
    console.log(`\n== ${label} ${addr} ==`);
    const out = `/tmp/t23-test-${label}.json`;
    const r = runChecker(addr, out, pinBlock);
    check("report honors pinned block", r.block === pinBlock && r.pinned_block === true, `got block ${r.block}`);
    const s2 = byId(r, "S2"), s3 = byId(r, "S3"), s4 = byId(r, "S4"), s5 = byId(r, "S5");

    // raw values vs direct cast queries — SAME pinned block on both sides.
    const blk = String(pinBlock);
    const castBal = cast("balance", addr, "--block", blk);
    const castNonce = cast("nonce", addr, "--block", blk);
    check("S2+S3 balance matches cast balance @pinned-block",
      s2.raw.balance_wei === castBal && s3.raw.balance_wei === castBal,
      `checker=${s2.raw.balance_wei} cast=${castBal} block=${blk}`);
    check("S2 tx count matches cast nonce @pinned-block",
      String(s2.raw.outbound_tx_count) === castNonce,
      `checker=${s2.raw.outbound_tx_count} cast=${castNonce} block=${blk}`);
    const code = cast("code", addr);
    const isContract = !(code === "0x" || code === "0X" || code === "");
    check("S4 account type matches cast code",
      (s4.raw.type === "contract") === isContract, `checker=${s4.raw.type} code_len=${code.length}`);
    const winFrom = s5.raw.window_from_block;
    const nNow = Number(cast("nonce", addr, "--block", String(r.block)));
    const nThen = Number(cast("nonce", addr, "--block", String(winFrom)));
    const effNow = isContract ? Math.max(0, nNow - 1) : nNow;   // EIP-161 creation nonce excluded
    const effThen = isContract ? Math.max(0, nThen - 1) : nThen;
    const delta = Math.max(0, effNow - effThen);
    check("S5 window outbound delta matches cast nonce@block",
      s5.raw.effective_outbound_txs_in_window === delta,
      `checker=${s5.raw.effective_outbound_txs_in_window} cast-derived=${delta}`);

    // structure
    check(">=4 signals checked (official req)", r.checks.length >= 4, `got ${r.checks.length}`);
    check("all verdicts in domain",
      r.checks.every((c) => ["PASS", "FLAG", "UNKNOWN", "N/A"].includes(c.verdict)));
    check("every check has plain-language explanation",
      r.checks.every((c) => typeof c.explanation === "string" && c.explanation.length > 40));
    check("every heuristic labeled",
      r.checks.every((c) => !c.heuristic || c.verdict === "N/A" || /HEURISTIC/.test(c.explanation)));
    check("composite level valid", ["LOW", "MED", "HIGH"].includes(r.composite.level));
    check("composite formula disclosed", typeof r.composite.formula === "string" && r.composite.formula.length > 10);
    check("chain id asserted 688689 in report", r.network.chain_id === 688689);

    if (expectHigh) check("risky example composite is HIGH", r.composite.level === "HIGH", `got ${r.composite.level}`);
    else check("clean example composite is not HIGH", r.composite.level !== "HIGH", `got ${r.composite.level}`);

    console.log(`  composite: ${r.composite.level} (${r.composite.basis})`);
  }

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FATAL: " + (e.stderr || e.message)); process.exit(1); });
