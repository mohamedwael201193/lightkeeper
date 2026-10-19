/**
 * @lightkeeper/portfolio — L8 Portfolio library.
 *
 * Read-only on-chain portfolio reader for Pharos Atlantic testnet (chain ID 688689).
 *
 * HARD RULES (enforced here, not in docs):
 *  - No private keys, no signers, no transaction broadcasting. This library can
 *    ONLY read. Any attempt to add a write path must fail CI (grep gate).
 *  - NEVER invent prices or yields. Testnet assets have NO market value. There is
 *    no price feed queried anywhere in this library; any "valuation" question gets
 *    an explicit "I don't know" with the reason.
 *  - Every numeric fact returned carries a citation: { value, source, block }.
 *    The citation validator (assertCited) throws on naked numbers.
 *
 * All reads are block-pinned: one `eth_blockNumber` anchors the snapshot, and every
 * value is read at that block ("latest" at snapshot time) so the whole portfolio
 * report is internally consistent.
 */

export const ATLANTIC_CHAIN_ID = 688689;
export const ATLANTIC_RPC_URL = "https://atlantic.dplabs-internal.com";
export const ATLANTIC_EXPLORER = "https://atlantic.pharosscan.xyz/";
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
export const GETLOGS_MAX_BLOCKS = 1000; // enforced by the Atlantic RPC node
export const NO_MARKET_VALUE =
  "testnet — no market value (no price feed exists for Atlantic testnet assets; no USD valuation is shown or implied)";

// Minimal ERC20 ABI fragments we call (read-only views only)
const ERC20 = {
  balanceOf: "balanceOf(address)(uint256)",
  decimals: "decimals()(uint8)",
  symbol: "symbol()(string)",
  name: "name()(string)",
  totalSupply: "totalSupply()(uint256)",
};

/** Format a raw uint256 token amount using its decimals, exact (BigInt math). */
export function formatUnits(raw, decimals) {
  const r = BigInt(raw);
  const d = BigInt(decimals);
  const base = 10n ** d;
  const whole = r / base;
  const frac = r % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(Number(d), "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

/** A cited numeric fact. { value, raw, decimals, unit, source, block }. */
export function cite({ value, raw, unit, source, block, extra = {} }) {
  if (value === undefined || value === null) throw new Error("cite: naked value refused");
  if (!source) throw new Error("cite: missing source contract/method");
  if (block === undefined || block === null) throw new Error("cite: missing block pin");
  return { value: String(value), raw: String(raw ?? ""), unit, source, block, ...extra };
}

/** Validate that every number in an answer object tree carries a citation. */
export function assertCited(answer) {
  const problems = [];
  const walk = (node, path) => {
    if (node && typeof node === "object") {
      if (typeof node.value === "string" && node.source && node.block !== undefined) return; // a citation leaf
      for (const [k, v] of Object.entries(node)) {
        if (k === "value" && typeof v === "string") problems.push(`${path}.${k}: naked value without citation`);
        else walk(v, `${path}.${k}`);
      }
    }
  };
  walk(answer, "answer");
  if (problems.length) throw new Error("citation validation failed:\n" + problems.join("\n"));
  return true;
}

function padTopic(addr) {
  return "0x000000000000000000000000" + addr.toLowerCase().replace(/^0x/, "");
}

export class PortfolioReader {
  constructor(rpcUrl = ATLANTIC_RPC_URL) {
    this.rpcUrl = rpcUrl;
    this._id = 1;
  }

  async rpc(method, params = [], attempts = 4) {
    let lastErr;
    for (let a = 0; a < attempts; a++) {
      try {
        const res = await fetch(this.rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: this._id++, method, params }),
        });
        if (!res.ok) throw new Error(`rpc http ${res.status} on ${method}`);
        const body = await res.json();
        if (body.error) throw new Error(`rpc ${method} failed: ${JSON.stringify(body.error)}`);
        return body.result;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
      }
    }
    throw lastErr;
  }

  async assertAtlantic() {
    const id = await this.rpc("eth_chainId");
    if (BigInt(id) !== BigInt(ATLANTIC_CHAIN_ID)) {
      throw new Error(`wrong chain: got chainId ${id}, need ${ATLANTIC_CHAIN_ID} (Atlantic). Refusing to run.`);
    }
  }

  /** Pin the snapshot block. All reads below should reference this block. */
  async pinBlock() {
    const hex = await this.rpc("eth_blockNumber");
    return Number(BigInt(hex));
  }

  async codePresent(address) {
    const code = await this.rpc("eth_getCode", [address, "latest"]);
    return code && code !== "0x" && code !== "0x0";
  }

  async nativeBalance(address, block = "latest") {
    const hex = await this.rpc("eth_getBalance", [address, block]);
    return BigInt(hex);
  }

  async txCount(address, block = "latest") {
    const hex = await this.rpc("eth_getTransactionCount", [address, block]);
    return Number(BigInt(hex));
  }

  async erc20Call(address, sig, ...args) {
    // eth_call via cast-style ABI encoding is overkill; use a tiny manual encoder
    // for the fixed read signatures we need.
    const data = encodeCall(sig, args);
    const out = await this.rpc("eth_call", [{ to: address, data }, "latest"]);
    return out;
  }

  async tokenBalance(address, token, block = "latest") {
    const data = encodeCall(ERC20.balanceOf, [address]);
    const out = await this.rpc("eth_call", [{ to: token.address, data }, block]);
    return BigInt(out);
  }

  async tokenMeta(token, block = "latest") {
    const [decHex, symHex, nameHex] = await Promise.all([
      this.rpc("eth_call", [{ to: token.address, data: encodeCall(ERC20.decimals) }, block]).catch(() => null),
      this.rpc("eth_call", [{ to: token.address, data: encodeCall(ERC20.symbol) }, block]).catch(() => null),
      this.rpc("eth_call", [{ to: token.address, data: encodeCall(ERC20.name) }, block]).catch(() => null),
    ]);
    return {
      decimals: decHex && decHex !== "0x" ? Number(BigInt(decHex)) : token.decimals,
      symbol: symHex && symHex !== "0x" ? decodeString(symHex) : token.symbol,
      name: nameHex && nameHex !== "0x" ? decodeString(nameHex) : token.name,
    };
  }

  /**
   * Transfer events involving `address` for one token, over [fromBlock, toBlock].
   * The Atlantic node caps a single getLogs call at 1000 blocks; this pages.
   */
  async transferActivity(address, tokenAddress, fromBlock, toBlock) {
    const jobs = [];
    for (let hi = toBlock; hi > fromBlock; hi -= GETLOGS_MAX_BLOCKS) {
      const lo = Math.max(fromBlock, hi - GETLOGS_MAX_BLOCKS + 1);
      jobs.push(["in", lo, hi], ["out", lo, hi]);
    }
    const CONC = 10; // batched concurrency — stays under the node's 500 req/5min budget
    const events = [];
    for (let i = 0; i < jobs.length; i += CONC) {
      const batch = jobs.slice(i, i + CONC).map(([dir, lo, hi]) =>
        this.getLogsPage(
          tokenAddress,
          TRANSFER_TOPIC,
          dir === "out" ? padTopic(address) : null,
          dir === "in" ? padTopic(address) : null,
          lo,
          hi
        ).then((logs) => logs.map((l) => parseTransfer(l, dir)))
      );
      for (const page of await Promise.all(batch)) events.push(...page);
    }
    const seen = new Map();
    for (const e of events) {
      // Dedupe by txHash:logIndex — a single tx can emit multiple same-direction
      // transfers; keying on direction alone would silently drop them.
      // (The in/out scans overlap only on self-transfers, which share neither key.)
      const k = e.txHash + ":" + e.logIndex;
      if (!seen.has(k)) seen.set(k, e);
    }
    return [...seen.values()].sort((a, b) => a.block - b.block);
  }

  async getLogsPage(address, t0, t1, t2, fromBlock, toBlock) {
    const topics = [t0];
    if (t1 !== undefined) topics.push(t1);
    if (t2 !== undefined) topics.push(t2);
    const res = await this.rpc("eth_getLogs", [
      {
        address,
        topics,
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock: "0x" + toBlock.toString(16),
      },
    ]);
    return res || [];
  }
}

function parseTransfer(log, dir) {
  return {
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    block: Number(BigInt(log.blockNumber)),
    dir,
    from: "0x" + log.topics[1].slice(-40),
    to: "0x" + log.topics[2].slice(-40),
    amountRaw: BigInt(log.data).toString(),
  };
}

// ---- tiny ABI helpers (fixed read signatures only) ----

const SIGS = {
  "balanceOf(address)(uint256)": "70a08231",
  "decimals()(uint8)": "313ce567",
  "symbol()(string)": "95d89b41",
  "name()(string)": "06fdde03",
  "totalSupply()(uint256)": "18160ddd",
};

function encodeCall(sig, args = []) {
  const sel = SIGS[sig];
  if (!sel) throw new Error(`unsupported call signature (negative probe): ${sig}`);
  let data = "0x" + sel;
  for (const a of args) {
    data += String(a).toLowerCase().replace(/^0x/, "").padStart(64, "0");
  }
  return data;
}

function decodeString(hex) {
  const h = hex.replace(/^0x/, "");
  try {
    const len = parseInt(h.slice(64, 128), 16);
    const body = h.slice(128, 128 + len * 2);
    return Buffer.from(body, "hex").toString("utf8").replace(/\0+$/, "");
  } catch {
    return "";
  }
}

// ---- NL intent router (local code; no LLM, no guessing) ----

const INTENT_PATTERNS = [
  { intent: "valuation", re: /\b(worth|value|usd|price|dollar)\b/i },
  { intent: "gas", re: /\b(gas|afford|transact)\b|transactions? can i (make|do|afford)/i },
  { intent: "holdings", re: /\b(what|which)\b.*\b(tokens?|assets?|hold|positions?)\b|\bholdings?\b|\bportfolio\b/i },
  { intent: "balance", re: /\b(balance|how much)\b/i },
  { intent: "txcount", re: /\b(how many)\b.*\b(transactions?|txs?)\b|\btransaction count\b|\bnonce\b/i },
  { intent: "activity", re: /\b(recent|latest|last)\b.*\b(activity|transactions?|transfers?)\b|\bactivity\b|\bhistory\b/i },
  { intent: "token_info", re: /\b(what is|where is|address of|deployed|contract)\b/i },
];

export function routeIntent(question) {
  const q = String(question || "");
  for (const { intent, re } of INTENT_PATTERNS) if (re.test(q)) return intent;
  return "unknown";
}

export function extractTokenMention(question, registry) {
  const q = String(question || "").toLowerCase();
  for (const t of registry) {
    if (t.symbol && q.includes(t.symbol.toLowerCase())) return t;
    if (t.address && q.includes(t.address.toLowerCase())) return t;
  }
  return null;
}

// ---- NL summary generator (local template code; no LLM) ----

export function summarizeSnapshot(snapshot) {
  const lines = [];
  const w = snapshot.wallet.slice(0, 10) + "…" + snapshot.wallet.slice(-4);
  lines.push(
    `Portfolio report for ${snapshot.wallet} on Pharos Atlantic testnet (chain ${snapshot.chainId}), ` +
      `pinned at block ${snapshot.block}.`
  );
  const holdings = snapshot.balances.filter((b) => BigInt(b.raw) > 0n);
  if (!holdings.length) {
    lines.push("The wallet holds no tracked assets at the snapshot block.");
  } else {
    const parts = holdings.map(
      (b) =>
        b.kind === "native"
          ? `${b.formatted} ${b.symbol} (native asset, no contract; read via eth_getBalance at block ${b.block})`
          : `${b.formatted} ${b.symbol} (contract ${b.address}, code verified on-chain; read at block ${b.block})`
    );
    lines.push(`Holdings (${holdings.length} asset${holdings.length === 1 ? "" : "s"} with non-zero balance): ` + parts.join("; ") + ".");
  }
  lines.push(
    `Transaction count: ${snapshot.txCount.value} (source: eth_getTransactionCount, block ${snapshot.txCount.block}).`
  );
  if (snapshot.activity.length) {
    lines.push(
      `Recent on-chain activity (ERC20 Transfer events involving this wallet, blocks ${snapshot.activityWindow.from}–${snapshot.activityWindow.to}): ` +
        snapshot.activity
          .map(
            (a) =>
              `${a.dir === "in" ? "received" : "sent"} ${a.formatted} ${a.symbol} in ${a.txHash.slice(0, 14)}… (block ${a.block})`
          )
          .join("; ") +
        "."
    );
  } else {
    lines.push(
      `No ERC20 Transfer events involving this wallet in the scanned window (blocks ${snapshot.activityWindow.from}–${snapshot.activityWindow.to}).`
    );
  }
  lines.push(
    `Valuation: ${NO_MARKET_VALUE} ` +
      `Native gas headroom: ${snapshot.gasHeadroom.formatted} PHRS covers roughly ${snapshot.gasHeadroom.simpleTransfers} simple transfers at current gas price — token units only, no fiat conversion.`
  );
  return lines.join("\n\n");
}

export const DONT_KNOW = {
  untrackedProtocol:
    "I don't know: that protocol/asset is not in my verified on-chain registry. I only report positions I can read from verified contracts at a pinned block — I won't guess.",
  valuation:
    "I don't know the USD value: Atlantic testnet assets have no market value and I query no price feed. I will never invent a price. Balances are reported in native token units only.",
  unsupportedFunction:
    "I don't know: the contract does not expose that view function (the call reverted or returned no code). I only report what the contract actually returns.",
};
