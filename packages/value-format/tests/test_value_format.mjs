// Tests for @lightkeeper/value-format. Run: compile src with tsc, then node this file.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const { parseDecimalToBigint, formatAmount, isAddress, shortAddress } = await import(
  join(HERE, "..", "dist-test", "index.js")
);

// parseDecimalToBigint — exact, never float
assert.equal(parseDecimalToBigint("1.5", 18), 1500000000000000000n);
assert.equal(parseDecimalToBigint("0.1", 6), 100000n);
assert.equal(parseDecimalToBigint("42", 18), 42000000000000000000n);
assert.equal(parseDecimalToBigint("0.000000000000000001", 18), 1n);
assert.equal(parseDecimalToBigint("  2.25  ", 2), 225n); // trims
assert.throws(() => parseDecimalToBigint("abc", 18), /not a valid decimal amount/);
assert.throws(() => parseDecimalToBigint("1.123", 2), /more than 2 decimal places/);
assert.throws(() => parseDecimalToBigint("-1", 18), /not a valid decimal amount/);
assert.throws(() => parseDecimalToBigint("", 18), /not a valid decimal amount/);

// formatAmount — keeps raw alongside, decimals are a parameter
let f = formatAmount(1500000000000000000n, 18, "PHRS");
assert.equal(f.text, "1.5 PHRS");
assert.equal(f.raw, "1500000000000000000");
f = formatAmount("1000000", 6, "USDC");
assert.equal(f.text, "1 USDC");
assert.equal(f.raw, "1000000");
f = formatAmount(1000001n, 6);
assert.equal(f.text, "1.000001");
assert.equal(f.raw, "1000001");
f = formatAmount(0n, 18, "PHRS");
assert.equal(f.text, "0 PHRS");
f = formatAmount(-1500000000000000000n, 18);
assert.equal(f.text, "-1.5");
// no trailing-zero noise
assert.equal(formatAmount(1200000000000000000n, 18).text, "1.2");

// isAddress / shortAddress
assert.equal(isAddress("0xc879c018db60520f4355c26ed1a6d572cdac1815"), true);
assert.equal(isAddress("0xZZZ"), false);
assert.equal(isAddress("c879c018db60520f4355c26ed1a6d572cdac1815"), false);
assert.equal(shortAddress("0xc879c018db60520f4355c26ed1a6d572cdac1815"), "0xc879…1815");
assert.throws(() => shortAddress("nope"), /not an Ethereum address/);

console.log("value-format: all assertions passed");
