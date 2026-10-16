/**
 * t09-trend-watcher — live chain reads via `cast` (Foundry).
 *
 * Read-only. No signing, no broadcasting, no private key needed.
 * Chain-ID assertion runs before ANY read: abort unless chainId == 688689 (Atlantic).
 */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";
import { existsSync } from "node:fs";

const EXPECTED_CHAIN_ID = 688689;

/**
 * Foundry installs to ~/.foundry/bin by default, which is often absent from a
 * non-interactive PATH. Add it before spawning so `cast` resolves without the
 * caller having to pre-export PATH (the video guide did that manually).
 */
function envWithFoundry() {
  const foundryBin = join(homedir(), ".foundry", "bin");
  if (existsSync(join(foundryBin, "cast")) && !(process.env.PATH ?? "").split(delimiter).includes(foundryBin)) {
    return { ...process.env, PATH: `${foundryBin}${delimiter}${process.env.PATH}` };
  }
  return process.env;
}

function rpcUrl() {
  const url = process.env.ATLANTIC_RPC_URL;
  if (!url) throw new Error("ATLANTIC_RPC_URL is not set in the environment");
  return url;
}

function cast(...args) {
  try {
    const out = execFileSync("cast", [...args, "--rpc-url", rpcUrl()], {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
      env: envWithFoundry(),
    });
    return out.trim();
  } catch (err) {
    if (err.code === "ENOENT" || (err.message ?? "").includes("spawnSync cast ENOENT")) {
      throw new Error(
        "Foundry 'cast' is not installed or not on PATH. Install it (https://book.getfoundry.sh/getting-started/installation) or add ~/.foundry/bin to PATH, then retry."
      );
    }
    throw err;
  }
}

/** Assert chain ID first — aborts with a loud error on mismatch. */
export function assertChainId() {
  const id = cast("chain-id");
  const n = Number(id);
  if (n !== EXPECTED_CHAIN_ID) {
    throw new Error(`CHAIN-ID MISMATCH: expected ${EXPECTED_CHAIN_ID} (Atlantic), got ${n}. Aborting.`);
  }
  return n;
}

export function getBlockNumber() {
  return Number(cast("block-number"));
}

/** Live spot gas price (eth_gasPrice), wei as BigInt. */
export function getGasPriceWei() {
  return BigInt(cast("gas-price"));
}

/**
 * Per-block baseFeePerGas series via eth_feeHistory.
 * Returns { oldestBlock:number, samples:[{blockNumber, baseFeeWei:bigint}] }.
 * Each point is a REAL on-chain value at its block number.
 */
export function getFeeHistory(blocks) {
  let raw;
  try {
    raw = execFileSync(
      "cast",
      ["rpc", "eth_feeHistory", String(blocks), "latest", "--rpc-url", rpcUrl()],
      { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"], env: envWithFoundry() }
    );
  } catch (err) {
    if (err.code === "ENOENT" || (err.message ?? "").includes("spawnSync cast ENOENT")) {
      throw new Error(
        "Foundry 'cast' is not installed or not on PATH. Install it (https://book.getfoundry.sh/getting-started/installation) or add ~/.foundry/bin to PATH, then retry."
      );
    }
    throw err;
  }
  const d = JSON.parse(raw);
  const oldest = Number(d.oldestBlock); // hex string -> number
  const fees = d.baseFeePerGas; // hex strings, length = blocks + 1 (includes pending)
  const samples = fees.slice(0, blocks).map((hex, i) => ({
    blockNumber: oldest + i,
    baseFeeWei: BigInt(hex),
    ts: Math.floor(Date.now() / 1000),
  }));
  return { oldestBlock: oldest, samples };
}

/** Block timestamp (for report context). */
export function getBlockTimestamp(blockNumber) {
  return Number(cast("block", String(blockNumber), "--field", "timestamp"));
}
