/**
 * T14 — Portfolio Assistant "try it live" (Tier A: live reads, no wallet, no signature).
 *
 * The first thing a connected visitor sees is THEIR OWN Atlantic portfolio, read
 * live across three views: Balances (block-pinned eth_getBalance + balanceOf),
 * Activity (real ERC20 Transfer events scanned from eth_getLogs), and Gas
 * headroom (eth_gasPrice × balance, in token units — no USD anywhere).
 * Paste any address to read any portfolio. Below, the keeper's reference — the
 * LIGHTKEEPER operator wallet's block-pinned evidence snapshot — is shown as a
 * historical record, not live data.
 *
 * LIGHTKEEPER never sees, holds, or asks for private keys. Testnet only (688689).
 */
import { useMemo, useState } from "react";
import type { Lamp } from "../../types";
import { useWallet } from "../WalletContext";
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  isValidAddress,
  rpcCall,
  useAtlanticRead,
} from "../../hooks/useAtlantic";

/** Verified token registry — mirrors tasks/t14-portfolio-assistant/sources.yaml. */
interface TokenDef {
  symbol: string;
  decimals: number;
  /** Contract address; null = native PHRS. */
  address: string | null;
  note: string;
}

const TOKENS: TokenDef[] = [
  { symbol: "PHRS", decimals: 18, address: null, note: "native — eth_getBalance" },
  { symbol: "USDC", decimals: 6, address: "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B", note: "Pharos Token Registry, code-verified" },
  { symbol: "USDT", decimals: 6, address: "0xE7E84B8B4f39C507499c40B4ac199B050e2882d5", note: "Pharos Token Registry, code-verified" },
  { symbol: "WBTC", decimals: 18, address: "0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4", note: "Pharos Token Registry, code-verified" },
  { symbol: "WETH", decimals: 18, address: "0x7d211F77525ea39A0592794f793cC1036eEaccD5", note: "Pharos Token Registry, code-verified" },
  { symbol: "WPHRS", decimals: 18, address: "0x838800b758277CC111B2d48Ab01e5E164f8E9471", note: "Pharos Token Registry, code-verified" },
  { symbol: "LPK", decimals: 18, address: "0x7d9C06353DdfeBC078A3a834A672CBF10aa06Ab9", note: "KeeperToken, deployed by T14 (tx 0xbf309a96…10cc59b02e54ba0578a310b555dc23)" },
];

const TOKEN_BY_ADDRESS: Record<string, TokenDef> = Object.fromEntries(
  TOKENS.filter((t) => t.address !== null).map((t) => [t.address!.toLowerCase(), t])
);
const ERC20_ADDRESSES = Object.keys(TOKEN_BY_ADDRESS);

/** Keeper's reference: LIGHTKEEPER operator wallet, evidence.json snapshot, block 31483013. */
const REFERENCE = {
  address: "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
  block: 31483013,
  rows: [
    { symbol: "PHRS", formatted: "5.865657109313757106" },
    { symbol: "USDC", formatted: "18.5" },
    { symbol: "USDT", formatted: "0" },
    { symbol: "WBTC", formatted: "0" },
    { symbol: "WETH", formatted: "0" },
    { symbol: "WPHRS", formatted: "0.0025" },
    { symbol: "LPK", formatted: "1,000,000" },
  ] as { symbol: string; formatted: string }[],
  txs: 139,
};

const ATLANTIC_CHAIN_ID = 688689;
const BALANCE_OF = "0x70a08231";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
const GETLOGS_MAX_BLOCKS = 1000; // enforced by the Atlantic node
const ACTIVITY_WINDOW_BLOCKS = 5000; // last 5,000 blocks (5 pages × 2 dirs = 10 getLogs calls)
const MAX_EVENTS = 12;

function balanceOfData(address: string): string {
  return BALANCE_OF + address.replace(/^0x/, "").padStart(64, "0");
}

function padTopic(address: string): string {
  return "0x" + "0".repeat(24) + address.toLowerCase().replace(/^0x/, "");
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatUnits(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const int = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0");
  if (frac.length > 6) frac = frac.slice(0, 6); // display precision cap; full value on hover
  frac = frac.replace(/0+$/, "");
  const out = frac ? `${int}.${frac}` : int.toString();
  return (neg ? "-" : "") + out;
}

function hexToNumber(hex: string): number {
  return Number(BigInt(hex));
}

let atlanticVerified = false;
/** The RPC endpoint only serves Atlantic, but verify chain ID before any read. */
async function ensureAtlantic(): Promise<void> {
  if (atlanticVerified) return;
  const id = (await rpcCall("eth_chainId", [])) as string;
  if (BigInt(id) !== BigInt(ATLANTIC_CHAIN_ID)) {
    throw new Error(
      `Wrong network: the endpoint answered chain ${id}, this surface reads Atlantic (688689) only.`
    );
  }
  atlanticVerified = true;
}

interface RowResult {
  token: TokenDef;
  status: "ok" | "unknown";
  balance: string; // human-formatted, or "—"
  full: string | null; // full-precision value for hover
}

interface PortfolioResult {
  block: number;
  rows: RowResult[];
  txCount: number | null;
}

async function readPortfolio(address: string): Promise<PortfolioResult> {
  await ensureAtlantic();
  const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
  const block = hexToNumber(blockHex);

  const reads: Promise<RowResult>[] = TOKENS.map(async (token): Promise<RowResult> => {
    try {
      let raw: bigint;
      if (token.address === null) {
        const hex = (await rpcCall("eth_getBalance", [address, blockHex])) as string;
        raw = BigInt(hex);
      } else {
        const hex = (await rpcCall("eth_call", [
          { to: token.address, data: balanceOfData(address) },
          blockHex,
        ])) as string;
        raw = BigInt(hex);
      }
      return {
        token,
        status: "ok",
        balance: formatUnits(raw, token.decimals),
        full: `full precision: ${raw.toString()} base units`,
      };
    } catch {
      // No code at address, non-standard token, RPC hiccup — report as unknown, never zero.
      return { token, status: "unknown", balance: "—", full: null };
    }
  });

  const rows = await Promise.all(reads);
  let txCount: number | null = null;
  try {
    const n = (await rpcCall("eth_getTransactionCount", [address, blockHex])) as string;
    txCount = hexToNumber(n);
  } catch {
    txCount = null;
  }
  return { block, rows, txCount };
}

interface ActivityEvent {
  txHash: string;
  block: number;
  dir: "in" | "out" | "self";
  from: string;
  to: string;
  symbol: string;
  amount: string;
  tokenAddress: string;
}

interface ActivityResult {
  from: number;
  to: number;
  events: ActivityEvent[];
}

async function readActivity(address: string): Promise<ActivityResult> {
  await ensureAtlantic();
  const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
  const to = hexToNumber(blockHex);
  const from = Math.max(0, to - ACTIVITY_WINDOW_BLOCKS + 1);
  const self = padTopic(address);

  const calls: Promise<unknown[]>[] = [];
  for (let hi = to; hi >= from; hi -= GETLOGS_MAX_BLOCKS) {
    const lo = Math.max(from, hi - GETLOGS_MAX_BLOCKS + 1);
    const range = {
      address: ERC20_ADDRESSES,
      fromBlock: "0x" + lo.toString(16),
      toBlock: "0x" + hi.toString(16),
    };
    // sent (from == wallet) and received (to == wallet) — one call each per page,
    // since the address filter covers all six registry tokens at once.
    calls.push(rpcCall("eth_getLogs", [{ ...range, topics: [TRANSFER_TOPIC, self] }]) as Promise<unknown[]>);
    calls.push(rpcCall("eth_getLogs", [{ ...range, topics: [TRANSFER_TOPIC, null, self] }]) as Promise<unknown[]>);
  }
  const pages = await Promise.all(calls);

  const seen = new Set<string>();
  const events: ActivityEvent[] = [];
  for (const page of pages) {
    for (const l of page as Array<{
      address: string; blockNumber: string; transactionHash: string; topics: string[]; data: string;
    }>) {
      if (seen.has(l.transactionHash)) continue;
      seen.add(l.transactionHash);
      const token = TOKEN_BY_ADDRESS[l.address.toLowerCase()];
      if (!token) continue;
      const fromAddr = "0x" + l.topics[1].slice(-40);
      const toAddr = "0x" + l.topics[2].slice(-40);
      const dir: ActivityEvent["dir"] =
        fromAddr.toLowerCase() === address.toLowerCase() && toAddr.toLowerCase() === address.toLowerCase()
          ? "self"
          : fromAddr.toLowerCase() === address.toLowerCase()
            ? "out"
            : "in";
      events.push({
        txHash: l.transactionHash,
        block: hexToNumber(l.blockNumber),
        dir,
        from: fromAddr,
        to: toAddr,
        symbol: token.symbol,
        amount: formatUnits(BigInt(l.data), token.decimals),
        tokenAddress: l.address,
      });
    }
  }
  events.sort((a, b) => b.block - a.block);
  return { from, to, events: events.slice(0, MAX_EVENTS) };
}

interface GasResult {
  block: number;
  gasPriceGwei: string;
  balance: string;
  simpleTransfers: number;
}

async function readGas(address: string): Promise<GasResult> {
  await ensureAtlantic();
  const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
  const [gpHex, balHex] = (await Promise.all([
    rpcCall("eth_gasPrice", []),
    rpcCall("eth_getBalance", [address, blockHex]),
  ])) as string[];
  const gasPrice = BigInt(gpHex);
  const balance = BigInt(balHex);
  const perTx = 21000n * gasPrice;
  return {
    block: hexToNumber(blockHex),
    gasPriceGwei: formatUnits(gasPrice, 9),
    balance: formatUnits(balance, 18),
    simpleTransfers: perTx > 0n ? Number(balance / perTx) : 0,
  };
}

type TabId = "balances" | "activity" | "gas";

export default function TryPortfolio({ lamp }: { lamp: Lamp }) {
  const { state: wallet, connect } = useWallet();
  const connectedAddress =
    wallet.status === "connected" || wallet.status === "wrong-network"
      ? wallet.address
      : null;

  const [pasted, setPasted] = useState("");
  const pastedValid = isValidAddress(pasted);
  const target = connectedAddress ?? (pastedValid ? pasted.trim() : null);

  const [tab, setTab] = useState<TabId>("balances");

  const balances = useAtlanticRead<PortfolioResult>(
    () => {
      if (!target) throw new Error("no address");
      return readPortfolio(target);
    },
    [target],
    { auto: !!target }
  );

  const activity = useAtlanticRead<ActivityResult>(
    () => {
      if (!target) throw new Error("no address");
      return readActivity(target);
    },
    [target, tab],
    { auto: !!target && tab === "activity" }
  );

  const gas = useAtlanticRead<GasResult>(
    () => {
      if (!target) throw new Error("no address");
      return readGas(target);
    },
    [target, tab],
    { auto: !!target && tab === "gas" }
  );

  const referenceRows = useMemo(() => REFERENCE.rows, []);

  const tabButton = (id: TabId, label: string) => (
    <button
      key={id}
      className={tab === id ? "btn-primary" : "btn-outline"}
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* ---- Visitor's own portfolio ---- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">
            {connectedAddress ? "Your Atlantic portfolio" : "Any Atlantic portfolio"}
          </h3>
          <span className="chip chip-lit">live reads</span>
        </div>

        {!connectedAddress && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={connect}>
              Connect wallet — see your own portfolio
            </button>
            <span className="text-xs text-slate">…or paste an address below:</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-full min-w-0 flex-1 rounded-lg border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink"
            placeholder="0x… address"
            value={connectedAddress ?? pasted}
            readOnly={!!connectedAddress}
            onChange={(e) => setPasted(e.target.value)}
            aria-label="Atlantic address to inspect"
          />
          {!connectedAddress && (
            <button
              className="btn-outline"
              disabled={!pastedValid}
              onClick={() => setPasted(pasted.trim())}
            >
              Read portfolio
            </button>
          )}
        </div>
        {!connectedAddress && pasted.length > 0 && !pastedValid && (
          <p className="mt-1 text-xs text-fail">That is not a valid 0x address (0x + 40 hex).</p>
        )}

        {target && (
          <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Portfolio views">
            {tabButton("balances", "Balances")}
            {tabButton("activity", "Activity")}
            {tabButton("gas", "Gas headroom")}
          </div>
        )}

        <div className="mt-4">
          {!target && (
            <div className="empty-panel px-5 py-6 text-sm text-slate">
              Connect your wallet to see <strong className="text-ink">your own</strong> Atlantic
              portfolio live — PHRS, USDC, USDT, WBTC, WETH, WPHRS and LPK — or paste any
              address above. Reading is free and never needs a signature.
            </div>
          )}

          {/* ---------- Balances tab ---------- */}
          {target && tab === "balances" && (
            <>
              {balances.loading && (
                <p className="text-sm text-slate">
                  Reading from Atlantic… block-pinned, one eth_blockNumber plus live
                  balanceOf calls.
                </p>
              )}
              {!balances.loading && balances.error && (
                <div className="empty-panel px-5 py-6">
                  <p className="text-sm text-fail">{balances.error}</p>
                  <button className="btn-outline mt-3" onClick={balances.refetch}>
                    Retry
                  </button>
                </div>
              )}
              {!balances.loading && !balances.error && balances.data && (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th className="text-right">Balance</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balances.data.rows.map((r) => (
                        <tr key={r.token.symbol}>
                          <td className="font-semibold text-ink">{r.token.symbol}</td>
                          <td
                            className="text-right font-mono text-ink"
                            title={r.full ?? undefined}
                          >
                            {r.status === "unknown" ? (
                              <span className="text-slate">unknown</span>
                            ) : (
                              r.balance
                            )}
                          </td>
                          <td className="text-xs text-slate">
                            {r.token.address === null ? (
                              "eth_getBalance"
                            ) : (
                              <a
                                className="font-mono hover:underline"
                                href={`${EXPLORER_ADDRESS}${r.token.address}`}
                                target="_blank"
                                rel="noreferrer"
                                title={r.token.note}
                              >
                                {r.token.address.slice(0, 10)}…
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate">
                    <span>
                      Address{" "}
                      <a
                        className="font-mono text-accent hover:underline"
                        href={`${EXPLORER_ADDRESS}${target}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {target.slice(0, 10)}…
                      </a>
                    </span>
                    <span>read at block {balances.data.block.toLocaleString()}</span>
                    {balances.data.txCount !== null && (
                      <span>{balances.data.txCount} outgoing transactions (eth_getTransactionCount)</span>
                    )}
                    <button className="btn-outline" onClick={balances.refetch} disabled={balances.loading}>
                      Refresh
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate">
                    Token units only — Atlantic testnet assets have no market value and no
                    price feed exists, so no USD valuation is shown or implied. Balances
                    marked "unknown" failed to read (no code, non-standard token, or RPC
                    hiccup) and are never reported as zero. Hover a balance for its full
                    raw precision.
                  </p>
                </>
              )}
            </>
          )}

          {/* ---------- Activity tab ---------- */}
          {target && tab === "activity" && (
            <>
              {activity.loading && (
                <p className="text-sm text-slate">
                  Scanning Transfer events on Atlantic… 10 block-paged eth_getLogs calls
                  over the last {ACTIVITY_WINDOW_BLOCKS.toLocaleString()} blocks. This is
                  the slow read; balances never wait on it.
                </p>
              )}
              {!activity.loading && activity.error && (
                <div className="empty-panel px-5 py-6">
                  <p className="text-sm text-fail">{activity.error}</p>
                  <button className="btn-outline mt-3" onClick={activity.refetch}>
                    Retry
                  </button>
                </div>
              )}
              {!activity.loading && !activity.error && activity.data && (
                <>
                  {activity.data.events.length === 0 ? (
                    <div className="empty-panel px-5 py-6 text-sm text-slate">
                      No ERC20 Transfer events involving this address in the scanned
                      window (blocks {activity.data.from.toLocaleString()}–
                      {activity.data.to.toLocaleString()}). Older activity is out of scope —
                      stated, not hidden.
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tx</th>
                          <th>Move</th>
                          <th className="text-right">Amount</th>
                          <th>Block</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activity.data.events.map((e) => (
                          <tr key={e.txHash}>
                            <td>
                              <a
                                className="font-mono text-accent hover:underline"
                                href={`${EXPLORER_TX}${e.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {e.txHash.slice(0, 10)}…
                              </a>
                            </td>
                            <td className="text-xs">
                              {e.dir === "in" && <span className="chip chip-lit">received</span>}
                              {e.dir === "out" && <span className="chip chip-dim">sent</span>}
                              {e.dir === "self" && <span className="chip chip-dim">self-transfer</span>}
                            </td>
                            <td className="text-right font-mono text-ink">
                              {e.amount} {e.symbol}
                              <div className="text-xs text-slate">
                                {e.dir === "out" ? `to ${shortAddr(e.to)}` : `from ${shortAddr(e.from)}`}
                              </div>
                            </td>
                            <td className="font-mono text-xs text-slate">{e.block.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate">
                    <span>
                      Scanned blocks {activity.data.from.toLocaleString()}–
                      {activity.data.to.toLocaleString()} · source: eth_getLogs Transfer events
                      across the 6-token registry
                    </span>
                    <button className="btn-outline" onClick={activity.refetch} disabled={activity.loading}>
                      Rescan
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate">
                    What the keeper can't see, it says: native PHRS transfers emit no
                    events, so this scan only covers ERC20 Transfers. Events older than
                    the window aren't claimed.
                  </p>
                </>
              )}
            </>
          )}

          {/* ---------- Gas headroom tab ---------- */}
          {target && tab === "gas" && (
            <>
              {gas.loading && (
                <p className="text-sm text-slate">
                  Reading eth_gasPrice and the PHRS balance…
                </p>
              )}
              {!gas.loading && gas.error && (
                <div className="empty-panel px-5 py-6">
                  <p className="text-sm text-fail">{gas.error}</p>
                  <button className="btn-outline mt-3" onClick={gas.refetch}>
                    Retry
                  </button>
                </div>
              )}
              {!gas.loading && !gas.error && gas.data && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="empty-panel px-5 py-4">
                      <p className="text-xs text-slate">Gas price</p>
                      <p className="font-mono text-lg text-ink">{gas.data.gasPriceGwei} Gwei</p>
                      <p className="text-xs text-slate">eth_gasPrice, block {gas.data.block.toLocaleString()}</p>
                    </div>
                    <div className="empty-panel px-5 py-4">
                      <p className="text-xs text-slate">PHRS balance</p>
                      <p className="font-mono text-lg text-ink">{gas.data.balance} PHRS</p>
                      <p className="text-xs text-slate">eth_getBalance, block {gas.data.block.toLocaleString()}</p>
                    </div>
                    <div className="empty-panel px-5 py-4">
                      <p className="text-xs text-slate">Covers roughly</p>
                      <p className="font-mono text-lg text-ink">
                        {gas.data.simpleTransfers.toLocaleString()} simple transfers
                      </p>
                      <p className="text-xs text-slate">21,000 gas each, token units only</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <button className="btn-outline" onClick={gas.refetch} disabled={gas.loading}>
                      Refresh
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate">
                    This is a rough estimate at the pinned block — it assumes simple
                    transfers at the current gas price. Contract calls cost more. No fiat
                    conversion: testnet assets have no market value.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </section>

      {/* ---- Keeper's reference ---- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">Keeper's reference</h3>
          <span className="chip chip-dim">historical snapshot</span>
        </div>
        <p className="mb-3 text-xs text-slate">
          The LIGHTKEEPER operator wallet's portfolio as captured for the task's evidence
          ledger — pinned at block {REFERENCE.block.toLocaleString()}, not live data.
          Your own portfolio above is the live one.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Token</th>
              <th className="text-right">Balance (block {REFERENCE.block.toLocaleString()})</th>
            </tr>
          </thead>
          <tbody>
            {referenceRows.map((r) => (
              <tr key={r.symbol}>
                <td className="font-semibold text-ink">{r.symbol}</td>
                <td className="text-right font-mono text-ink">{r.formatted}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate">
          <span>
            Wallet{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_ADDRESS}${REFERENCE.address}`}
              target="_blank"
              rel="noreferrer"
            >
              {REFERENCE.address.slice(0, 10)}…
            </a>
          </span>
          <span>{REFERENCE.txs} outgoing transactions at the snapshot block</span>
          <span>
            LPK deployment{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_TX}0xbf309a965b0546c9464189a976d81fa77010cc59b02e54ba0578a310b555dc23`}
              target="_blank"
              rel="noreferrer"
            >
              0xbf309a96…
            </a>
          </span>
        </div>
      </section>

      <p className="text-xs text-slate">
        Read-only by construction: {lamp.name} has no key, no signer, no broadcast path.
        LIGHTKEEPER never sees, holds, or asks for private keys.
      </p>
    </div>
  );
}
