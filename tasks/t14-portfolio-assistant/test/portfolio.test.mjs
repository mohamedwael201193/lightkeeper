/**
 * T14 Portfolio Assistant — tests.
 *
 * Run: node --test test/
 * The live tests hit Pharos Atlantic testnet (chain 688689) and assert the
 * assistant's numbers match DIRECT cast queries — independent verification.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PortfolioReader,
  routeIntent,
  extractTokenMention,
  formatUnits,
  cite,
  assertCited,
  summarizeSnapshot,
  DONT_KNOW,
  ATLANTIC_CHAIN_ID,
} from "../../../packages/portfolio/src/portfolio.mjs";
import { loadRegistry, snapshot, answer } from "../src/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.ATLANTIC_RPC_URL || "https://atlantic.dplabs-internal.com";
const WALLET = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const LPK = "0x7d9C06353DdfeBC078A3a834A672CBF10aa06Ab9";
const USDC = "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B";

function cast(...args) {
  const castBin = process.env.HOME + "/.foundry/bin/cast";
  const out = execFileSync(castBin, [...args, "--rpc-url", RPC], { encoding: "utf8", timeout: 60000 }).trim();
  return out.split(/\s/)[0]; // cast appends "[1.85e7]"-style annotations; first token is the value
}

describe("unit: formatting and citations", () => {
  it("formatUnits handles 6- and 18-decimal tokens exactly", () => {
    assert.equal(formatUnits(18500000n, 6), "18.5");
    assert.equal(formatUnits(1000000000000000000000000n, 18), "1000000");
    assert.equal(formatUnits(0n, 18), "0");
  });

  it("cite refuses naked values, missing source, missing block", () => {
    assert.throws(() => cite({ value: "1", source: "x" }), /missing block/);
    assert.throws(() => cite({ value: "1", block: 5 }), /missing source/);
    assert.throws(() => cite({ source: "x", block: 5 }), /naked value/);
  });

  it("assertCited rejects answers with uncited numbers", () => {
    assert.doesNotThrow(() => assertCited({ txCount: { value: "3", source: "m", block: 1 } }));
    assert.throws(() => assertCited({ txCount: { value: "3" } }), /citation validation failed/);
  });

  it("routeIntent covers the 6 question types + unknown", () => {
    assert.equal(routeIntent("what is my PHRS balance?"), "balance");
    assert.equal(routeIntent("which tokens do I hold?"), "holdings");
    assert.equal(routeIntent("how many transactions have I made?"), "txcount");
    assert.equal(routeIntent("show my recent activity"), "activity");
    assert.equal(routeIntent("how much gas can I afford?"), "gas");
    assert.equal(routeIntent("what is USDC?"), "token_info");
    assert.equal(routeIntent("what is my portfolio worth in USD?"), "valuation");
    assert.equal(routeIntent("tell me a joke"), "unknown");
  });

  it("extractTokenMention finds registry tokens by symbol or address", () => {
    const reg = loadRegistry();
    assert.equal(extractTokenMention("my LPK balance", reg.assets).symbol, "LPK");
    assert.equal(extractTokenMention("balance at " + USDC, reg.assets).symbol, "USDC");
    assert.equal(extractTokenMention("my FOO balance", reg.assets), null);
  });
});

describe("unit: chain-ID assertion", () => {
  it("assertAtlantic refuses a non-Atlantic chainId", async () => {
    const r = new PortfolioReader("http://127.0.0.1:1");
    r.rpc = async () => "0x1"; // mainnet, stubbed — no network
    await assert.rejects(() => r.assertAtlantic(), /wrong chain/);
  });

  it("assertAtlantic accepts Atlantic", async () => {
    const r = new PortfolioReader("http://127.0.0.1:1");
    r.rpc = async () => "0xa8231"; // 688689 hex, stubbed
    await assert.doesNotReject(() => r.assertAtlantic());
  });
});

describe("live: Atlantic reads match direct cast queries", () => {
  it("assistant native + ERC20 balances equal cast at the same pinned block", async () => {
    const reader = new PortfolioReader(RPC);
    const registry = loadRegistry();
    const snap = await snapshot(WALLET, reader, registry, { activity: false });
    const blockHex = "0x" + snap.block.toString(16);

    const directNative = BigInt(cast("balance", WALLET, "--block", snap.block.toString()));
    const snapNative = BigInt(snap.balances.find((b) => b.symbol === "PHRS").raw);
    assert.equal(snapNative.toString(), directNative.toString(), "PHRS mismatch");

    for (const [sym, addr] of [["USDC", USDC], ["LPK", LPK]]) {
      const direct = BigInt(cast("call", addr, "balanceOf(address)(uint256)", WALLET, "--block", snap.block.toString()));
      const got = BigInt(snap.balances.find((b) => b.symbol === sym).raw);
      assert.equal(got.toString(), direct.toString(), `${sym} mismatch`);
    }

    const directNonce = Number(cast("nonce", WALLET, "--block", snap.block.toString()));
    assert.equal(Number(snap.txCount.value), directNonce, "txCount mismatch");
  }, { timeout: 120000 });

  it("every balance in the snapshot carries a source contract and block", async () => {
    const reader = new PortfolioReader(RPC);
    const registry = loadRegistry();
    const snap = await snapshot(WALLET, reader, registry, { activity: false });
    assertCited({ balances: snap.balances.filter((b) => !b.unknown).map((b) => ({ value: b.value, source: b.source, block: b.block })) });
  }, { timeout: 120000 });

  it("LPK registry entry has bytecode on-chain (verified source)", async () => {
    const reader = new PortfolioReader(RPC);
    assert.equal(await reader.codePresent(LPK), true);
  });
});

describe("live: honest I-don't-know paths", () => {
  it("valuation question refuses with no-market-value and invents no price", async () => {
    const reader = new PortfolioReader(RPC);
    const registry = loadRegistry();
    const snap = await snapshot(WALLET, reader, registry, { activity: false });
    const r = answer("what is my portfolio worth in USD?", snap, registry);
    assert.match(r.answer, /no market value/);
    assert.doesNotMatch(r.answer, /\$\d/);
    assert.match(r.answer, /don't know/i);
  }, { timeout: 120000 });

  it("untracked protocol question says it doesn't know", async () => {
    const reader = new PortfolioReader(RPC);
    const registry = loadRegistry();
    const snap = await snapshot(WALLET, reader, registry, { activity: false });
    const r = answer("what is my position in the AquaLend vault?", snap, registry);
    assert.match(r.answer, /don't know/i);
  }, { timeout: 120000 });

  it("unknown question type is refused, not guessed", async () => {
    const reader = new PortfolioReader(RPC);
    const registry = loadRegistry();
    const snap = await snapshot(WALLET, reader, registry, { activity: false });
    const r = answer("should I buy more?", snap, registry);
    assert.match(r.answer, /don't know/i);
  }, { timeout: 120000 });
});

describe("housekeeping", () => {
  it("no secrets or mock language in the task folder", () => {
    const files = ["src/index.mjs", "bin/run.mjs", "sources.yaml", "package.json"];
    // Dangerous PATTERNS (assignments, env reads, raw key material), not bare words —
    // explanatory comments about key hygiene must not trip this.
    const dangerous = [
      /\b(private_key|privkey)\s*[:=]/i,
      /\bmnemonic\s*[:=]/i,
      /process\.env\.\w*(PRIVATE|SECRET|MNEMONIC)/i,
      /(?<!0x)\b[0-9a-fA-F]{64}\b/, // a bare 64-hex-char private key would be a leak (0x-prefixed tx hashes excluded)
      /\bmock\b/i,
      /\bplaceholder\b/i,
      /\bfake\b/i,
      /demo-tx/i,
    ];
    for (const f of files) {
      const text = readFileSync(join(HERE, "..", f), "utf8");
      for (const re of dangerous) assert.doesNotMatch(text, re, `${f} matches ${re}`);
    }
  });

  it("NL summary labels testnet-no-market-value and cites the block", async () => {
    const reader = new PortfolioReader(RPC);
    const registry = loadRegistry();
    const snap = await snapshot(WALLET, reader, registry, { activity: false });
    const s = summarizeSnapshot({ ...snap, activityWindow: { from: 0, to: 0, windowBlocks: 0 }, activity: [] });
    assert.match(s, /no market value/);
    assert.match(s, new RegExp(`block ${snap.block}`));
  }, { timeout: 120000 });
});
