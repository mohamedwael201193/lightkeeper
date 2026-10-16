/**
 * T14 — Portfolio Assistant "try it live" (Tier A: live reads, no wallet, no signature).
 *
 * The first thing a connected visitor sees is THEIR OWN Atlantic portfolio, read
 * live: native PHRS via eth_getBalance, ERC20 balances via eth_call balanceOf
 * against the task's verified token registry. Paste any address to read any
 * portfolio. Below, the keeper's reference — the LIGHTKEEPER operator wallet's
 * block-pinned evidence snapshot — is shown as a historical record, not live data.
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

const BALANCE_OF = "0x70a08231";

function balanceOfData(address: string): string {
  return BALANCE_OF + address.replace(/^0x/, "").padStart(64, "0");
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
  const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
  const block = Number(BigInt(blockHex));

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
        full: `${(raw / 10n ** BigInt(token.decimals)).toString()} units, raw ${raw} wei`,
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
    txCount = Number(BigInt(n));
  } catch {
    txCount = null;
  }
  return { block, rows, txCount };
}

export default function TryPortfolio({ lamp }: { lamp: Lamp }) {
  const { state: wallet, connect } = useWallet();
  const connectedAddress =
    wallet.status === "connected" || wallet.status === "wrong-network"
      ? wallet.address
      : null;

  const [pasted, setPasted] = useState("");
  const pastedValid = isValidAddress(pasted);
  const target = connectedAddress ?? (pastedValid ? pasted.trim() : null);

  const { data, loading, error, refetch } = useAtlanticRead<PortfolioResult>(
    () => {
      if (!target) throw new Error("no address");
      return readPortfolio(target);
    },
    [target],
    { auto: !!target }
  );

  const referenceRows = useMemo(() => REFERENCE.rows, []);

  return (
    <div className="space-y-6">
      {/* ---- Visitor's own portfolio ---- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">
            {connectedAddress ? "Your Atlantic portfolio" : "Any Atlantic portfolio"}
          </h3>
          <span className="chip chip-lit">live read</span>
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
            className="min-w-[20rem] flex-1 rounded-lg border border-hairline bg-porcelain px-3 py-2 font-mono text-sm text-ink"
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
          {data && (
            <button className="btn-outline" onClick={refetch} disabled={loading}>
              Refresh
            </button>
          )}
        </div>
        {!connectedAddress && pasted.length > 0 && !pastedValid && (
          <p className="mt-1 text-xs text-fail">That is not a valid 0x address (0x + 40 hex).</p>
        )}

        <div className="mt-4">
          {!target && (
            <div className="empty-panel px-5 py-6 text-sm text-slate">
              Connect your wallet to see <strong className="text-ink">your own</strong> Atlantic
              portfolio live — PHRS, USDC, USDT, WBTC, WETH, WPHRS and LPK — or paste any
              address above. Reading is free and never needs a signature.
            </div>
          )}

          {target && loading && (
            <p className="text-sm text-slate">
              Reading from Atlantic… block-pinned, one eth_blockNumber plus live balanceOf
              calls.
            </p>
          )}

          {target && !loading && error && (
            <div className="empty-panel px-5 py-6">
              <p className="text-sm text-fail">{error}</p>
              <button className="btn-outline mt-3" onClick={refetch}>
                Retry
              </button>
            </div>
          )}

          {target && !loading && !error && data && (
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
                  {data.rows.map((r) => (
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
                <span>read at block {data.block.toLocaleString()}</span>
                {data.txCount !== null && (
                  <span>{data.txCount} outgoing transactions (eth_getTransactionCount)</span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate">
                Token units only — Atlantic testnet assets have no market value and no price
                feed exists, so no USD valuation is shown or implied. Balances marked
                "unknown" failed to read (no code, non-standard token, or RPC hiccup) and
                are never reported as zero.
              </p>
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
