/**
 * t09-trend-watcher — live chain reads via the REAL Pharos Chain MCP.
 *
 * EVERY read is a named Chain MCP tool call (src/mcp.mjs):
 *   chain gate     -> get_chain_info
 *   block number   -> get_block_number
 *   gas spot       -> get_gas_price
 *   fee series     -> get_block (one call per block; baseFeePerGas field)
 * There is NO `cast`, NO eth_* JSON-RPC, NO RPC URL anywhere in this task:
 * rawRpcCalls is 0 by construction (see mcpStats in src/mcp.mjs).
 *
 * The hosted Chain MCP serves Pharos mainnet ONLY (chain 1672), so the
 * chain-ID assertion aborts unless the MCP reports chainId == 1672.
 * Read-only: no signing, no broadcasting, no private key needed.
 */
import { mcpCall, mcpStats } from "./mcp.mjs";

export const EXPECTED_CHAIN_ID = 1672; // Pharos mainnet — the only chain the Chain MCP serves

function toInt(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") return v.startsWith("0x") ? parseInt(v, 16) : Number(v);
  throw new Error(`cannot parse integer from ${JSON.stringify(v)}`);
}

function toBigInt(v) {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v); // handles 0x-prefixed and decimal
  throw new Error(`cannot parse BigInt from ${JSON.stringify(v)}`);
}

/** Assert chain ID first (Chain MCP get_chain_info) — aborts on mismatch. */
export async function assertChainId() {
  const info = await mcpCall("get_chain_info", {});
  const n = toInt(info.chainId ?? info.chain_id);
  if (n !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `CHAIN-ID MISMATCH: expected ${EXPECTED_CHAIN_ID} (Pharos mainnet via Chain MCP), got ${n}. Aborting.`
    );
  }
  return n;
}

/** Latest block number via Chain MCP get_block_number. */
export async function getBlockNumber() {
  const r = await mcpCall("get_block_number", {});
  return toInt(r.blockNumber ?? r.blockNumberHex);
}

/** Live spot gas price via Chain MCP get_gas_price, wei as BigInt. */
export async function getGasPriceWei() {
  const r = await mcpCall("get_gas_price", {});
  return toBigInt(r.gasPriceWei ?? r.gasPriceHex);
}

/** One block via Chain MCP get_block; asserts the returned number matches. */
export async function getBlock(blockNumber) {
  const blk = await mcpCall("get_block", { block: blockNumber });
  const n = toInt(blk.number);
  if (n !== blockNumber) {
    throw new Error(`get_block(${blockNumber}) returned block ${n} — refusing mismatched data`);
  }
  return blk;
}

/**
 * Per-block baseFeePerGas series via Chain MCP get_block (one named MCP
 * call per block — the MCP exposes no feeHistory tool; each point is a
 * REAL on-chain value read from that block's header).
 * Returns { oldestBlock:number, samples:[{blockNumber, baseFeeWei:bigint, ts}] }.
 */
export async function getFeeHistory(blocks) {
  const latest = await getBlockNumber();
  const oldest = latest - blocks + 1;
  const samples = [];
  for (let n = oldest; n <= latest; n++) {
    const blk = await getBlock(n);
    if (blk.baseFeePerGas === undefined || blk.baseFeePerGas === null) {
      throw new Error(`block ${n} from Chain MCP has no baseFeePerGas field`);
    }
    samples.push({
      blockNumber: n,
      baseFeeWei: toBigInt(blk.baseFeePerGas),
      ts: toInt(blk.timestamp),
    });
  }
  return { oldestBlock: oldest, samples };
}

/** Block timestamp via Chain MCP get_block (for report context). */
export async function getBlockTimestamp(blockNumber) {
  const blk = await getBlock(blockNumber);
  return toInt(blk.timestamp);
}

/** Transport accounting for reports/evidence: MCP calls made, raw RPC = 0. */
export function transportStats() {
  return {
    endpoint: mcpStats.endpoint,
    mcpCalls: mcpStats.mcpCalls,
    toolsCalled: [...mcpStats.toolsCalled].sort(),
    rawRpcCalls: mcpStats.rawRpcCalls,
  };
}
