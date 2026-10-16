/**
 * T28 Multi-Protocol Aggregator — Tier A (live reads, no wallet, costs nothing).
 *
 * "One view, every venue": the console reads all three real T28 venues on
 * Atlantic (two SimpleVaults + one SimpleLending) at one pinned block via
 * plain JSON-RPC, normalizes TVL / APYs / share price / utilization /
 * liquidity depth into ONE quote board, and ranks the venues for a deposit
 * or borrow intent the visitor configures. A venue whose read fails — or
 * whose address holds no bytecode — is marked UNREACHABLE, never zero-filled.
 *
 * Quotes only. No execution happens in this page; the run command stays in
 * the CLI (panel at the bottom).
 *
 * Addresses copied character-for-character from
 * tasks/t28-multi-protocol-aggregator/evidence.json. Selectors are the
 * 4-byte function selectors of src/SimpleVault.sol and src/SimpleLending.sol
 * (all 11 verified live against Atlantic on 2026-10-16).
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import { EXPLORER_ADDRESS, rpcCall, useAtlanticRead } from "../../hooks/useAtlantic";

const WEI = 10n ** 18n;

/* Function selectors (cast sig on the two venue contracts). */
const SEL = {
  totalAssets: "0x01e1d114", // totalAssets()
  supplyApyBps: "0xa0592dad", // supplyApyBps()
  sharePrice: "0x87269729", // sharePrice()
  utilizationBps: "0x975e900e", // utilizationBps()
  borrowApyBps: "0x2301f13f", // borrowApyBps()
  availableLiquidity: "0x74375359", // availableLiquidity()
  totalSupplied: "0x630fd0ac", // totalSupplied()
} as const;

interface VenueDef {
  id: string;
  name: string;
  kind: "vault" | "lending";
  address: string;
  note: string;
}

const VENUES: VenueDef[] = [
  {
    id: "T28-VAULT-A",
    name: "MeridianVault",
    kind: "vault",
    address: "0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9",
    note: "2.5% target-APY vault",
  },
  {
    id: "T28-VAULT-B",
    name: "HalcyonVault",
    kind: "vault",
    address: "0x6F34a6f94f529Bf10313bA77cc34314389Dd204E",
    note: "5.2% target-APY vault",
  },
  {
    id: "T28-LEND",
    name: "TidepoolLending",
    kind: "lending",
    address: "0x95a16e1898B09CcE5e03765Baa55C8C112cb80C2",
    note: "utilization-rate lending pool",
  },
];

interface VenueQuote {
  def: VenueDef;
  ok: boolean;
  error?: string;
  supplyApyBps: number;
  borrowApyBps: number | null;
  tvlWei: bigint;
  liquidityWei: bigint;
  sharePriceWei: bigint | null;
  utilizationBps: number | null;
}

interface Snapshot {
  block: number;
  at: string;
  quotes: VenueQuote[];
}

function unreachable(def: VenueDef, error: string): VenueQuote {
  return {
    def,
    ok: false,
    error,
    supplyApyBps: 0,
    borrowApyBps: null,
    tvlWei: 0n,
    liquidityWei: 0n,
    sharePriceWei: null,
    utilizationBps: null,
  };
}

async function ethCall(to: string, data: string, block: string): Promise<bigint> {
  const hex = (await rpcCall("eth_call", [{ to, data }, block])) as string;
  if (typeof hex !== "string" || !hex.startsWith("0x")) {
    throw new Error(`unexpected eth_call result from ${to}`);
  }
  return BigInt(hex);
}

async function readVenue(def: VenueDef, block: string): Promise<VenueQuote> {
  try {
    /* Same gate as aggregate.py's venue_reachable: an address with no
       bytecode must be UNREACHABLE — an eth_call would return 0x and the
       venue would look alive with 0.00% APY. Never zero-filled. */
    const code = (await rpcCall("eth_getCode", [def.address, block])) as string;
    if (typeof code !== "string" || code === "0x" || code === "0x0") {
      return unreachable(def, "no bytecode at address (get_code empty)");
    }
    if (def.kind === "vault") {
      const [totalAssets, supplyApyBps, sharePrice] = await Promise.all([
        ethCall(def.address, SEL.totalAssets, block),
        ethCall(def.address, SEL.supplyApyBps, block),
        ethCall(def.address, SEL.sharePrice, block),
      ]);
      return {
        def,
        ok: true,
        supplyApyBps: Number(supplyApyBps),
        borrowApyBps: null,
        tvlWei: totalAssets,
        liquidityWei: totalAssets,
        sharePriceWei: sharePrice,
        utilizationBps: null,
      };
    }
    const [totalSupplied, utilizationBps, borrowApyBps, supplyApyBps, availableLiquidity] =
      await Promise.all([
        ethCall(def.address, SEL.totalSupplied, block),
        ethCall(def.address, SEL.utilizationBps, block),
        ethCall(def.address, SEL.borrowApyBps, block),
        ethCall(def.address, SEL.supplyApyBps, block),
        ethCall(def.address, SEL.availableLiquidity, block),
      ]);
    return {
      def,
      ok: true,
      supplyApyBps: Number(supplyApyBps),
      borrowApyBps: Number(borrowApyBps),
      tvlWei: totalSupplied,
      liquidityWei: availableLiquidity,
      sharePriceWei: null,
      utilizationBps: Number(utilizationBps),
    };
  } catch (e) {
    /* A venue that fails is UNREACHABLE — never zero-filled. */
    return unreachable(def, e instanceof Error ? e.message : "read failed");
  }
}

async function fetchSnapshot(): Promise<Snapshot> {
  const blockHex = (await rpcCall("eth_blockNumber", [])) as string;
  const block = parseInt(blockHex, 16);
  const quotes = await Promise.all(VENUES.map((v) => readVenue(v, blockHex)));
  return { block, at: new Date().toLocaleTimeString(), quotes };
}

function weiToPhrs(wei: bigint): string {
  const whole = wei / WEI;
  const rem = wei % WEI;
  if (rem === 0n) return whole.toString();
  const frac = rem
    .toString()
    .padStart(18, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return frac === "" ? whole.toString() : `${whole}.${frac}`;
}

function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function parseAmountToWei(amount: string): bigint | null {
  const s = amount.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return null;
  const [intPart, fracPart = ""] = s.split(".");
  return BigInt(intPart) * WEI + BigInt((fracPart + "0".repeat(18)).slice(0, 18));
}

function shortAddr(a: string): string {
  return `${a.slice(0, 10)}…${a.slice(-7)}`;
}

/** Capital efficiency, exactly as aggregate.py's comparison(): utilization
 *  share for lending, 100% for vaults (all TVL deployed in strategy). */
function capitalEfficiencyPct(q: VenueQuote): number {
  if (!q.ok) return 0;
  return q.def.kind === "lending" ? (q.utilizationBps ?? 0) / 100 : 100;
}

/** Risk flags, same thresholds as aggregate.py risk_flags(). Pure, from the
 *  same live read — no second data source. */
function riskFlags(q: VenueQuote): string[] {
  if (!q.ok) return ["UNREACHABLE"];
  const flags: string[] = [];
  const tvlPhrs = Number(q.tvlWei) / 1e18;
  if ((q.utilizationBps ?? 0) > 8000) {
    flags.push("ELEVATED: utilization >80% — withdrawal liquidity thin");
  }
  if (tvlPhrs < 0.0005) {
    flags.push("THIN: TVL < 0.0005 PHRS — dust-scale venue");
  }
  if (q.def.kind === "vault" && tvlPhrs < 0.001) {
    flags.push("NOTE: small vault TVL — slippage not modeled");
  }
  return flags;
}

const CLI_CMD = `export ATLANTIC_RPC_URL="https://atlantic.dplabs-internal.com"   # your own RPC endpoint
export PATH="$HOME/.foundry/bin:$PATH"
cd ~/workspace/lightkeeper/tasks/t28-multi-protocol-aggregator

# full aggregation: pins one block, reads every venue, prints the ranking
python3 aggregate.py run

# explained routing: deposit and borrow intents, per-venue verdict lines
python3 aggregate.py route --intent deposit --amount-wei 1000000000000000
python3 aggregate.py route --intent borrow  --amount-wei 100000000000000

# degraded mode: one venue forced down, the rest must still aggregate
python3 aggregate.py chaos`;

type Intent = "deposit" | "borrow";

export default function TryAggregator({ lamp }: { lamp: Lamp }) {
  const [intent, setIntent] = useState<Intent>("deposit");
  const [amount, setAmount] = useState("0.001");
  const [copied, setCopied] = useState(false);

  const { data, loading, error, refetch } = useAtlanticRead(fetchSnapshot, []);

  const inputWei = parseAmountToWei(amount);
  const okQuotes = data?.quotes.filter((q) => q.ok) ?? [];
  const badQuotes = data?.quotes.filter((q) => !q.ok) ?? [];

  const depositRanking = [...okQuotes].sort((a, b) => b.supplyApyBps - a.supplyApyBps);
  const lendQuote = okQuotes.find((q) => q.def.id === "T28-LEND") ?? null;
  const winner: VenueQuote | null =
    intent === "deposit" ? depositRanking[0] ?? null : lendQuote;

  /** Estimated 1-year output for a deposit of `inputWei` at the venue's
   *  supply APY (simple interest, honest estimate). */
  const estDepositOut = (q: VenueQuote): string =>
    inputWei === null
      ? "—"
      : weiToPhrs(inputWei + (inputWei * BigInt(q.supplyApyBps)) / 10000n);

  /** Estimated 1-year interest cost for borrowing `inputWei` from the lending venue. */
  const estBorrowCost = (q: VenueQuote): string =>
    inputWei === null || q.borrowApyBps === null
      ? "—"
      : weiToPhrs((inputWei * BigInt(q.borrowApyBps)) / 10000n);

  /** Gap behind the winner in percentage points — the comparison a trader wants. */
  const gapVsWinner = (q: VenueQuote): string | null => {
    if (!q.ok || !winner || q.def.id === winner.def.id) return null;
    if (intent !== "deposit") return null;
    const gapPp = (winner.supplyApyBps - q.supplyApyBps) / 100;
    return `−${gapPp.toFixed(2)}pp vs ${winner.def.name}`;
  };

  const verdictFor = (q: VenueQuote): { chip: string; tone: string; text: string } => {
    if (!q.ok) {
      return { chip: "unavailable", tone: "chip-fail", text: "" };
    }
    if (intent === "deposit") {
      if (q.def.id === winner?.def.id) {
        return {
          chip: "SELECTED",
          tone: "chip-pass",
          text: `supply APY ${bpsToPct(q.supplyApyBps)} (block ${data?.block}), TVL ${weiToPhrs(q.tvlWei)} PHRS — highest live supply APY on the board`,
        };
      }
      return {
        chip: "passed-over",
        tone: "chip-info",
        text: `supply APY ${bpsToPct(q.supplyApyBps)} (block ${data?.block}), TVL ${weiToPhrs(q.tvlWei)} PHRS — ${gapVsWinner(q)}`,
      };
    }
    if (q.def.kind === "lending") {
      return {
        chip: "SELECTED",
        tone: "chip-pass",
        text: `borrow APY ${bpsToPct(q.borrowApyBps ?? 0)} (block ${data?.block}), ${weiToPhrs(q.liquidityWei)} PHRS liquidity available — the only borrow market`,
      };
    }
    return {
      chip: "passed-over",
      tone: "chip-info",
      text: "no borrow market — vaults accept deposits only",
    };
  };

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(CLI_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the text is still visible in the code block */
    }
  };

  return (
    <div className="space-y-5">
      {/* Tier A honesty header */}
      <div className="rounded-xl border border-hairline bg-porcelain p-4">
        <p className="smallcaps mb-2">Tier A — live reads, no wallet, costs nothing</p>
        <p className="text-sm text-ink">
          <strong>{lamp.name}</strong>: one view over every venue. The board
          below reads the <strong>three real T28 venues on Pharos Atlantic</strong>{" "}
          (two vaults + one lending pool) at one pinned block with plain
          JSON-RPC calls — TVL, APYs, share price, utilization, liquidity
          depth — normalized into one table and ranked for the intent you pick.
        </p>
        <p className="mt-2 text-xs text-slate">
          No wallet, no signature, no gas — LIGHTKEEPER never sees, holds, or
          asks for private keys. The venues are minimal purpose-built contracts
          at dust scale; every figure is real on-chain state, every verdict
          traced to the block above the table.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="smallcaps mb-1">Intent</p>
          <div className="flex gap-2">
            {(["deposit", "borrow"] as Intent[]).map((i) => (
              <button
                key={i}
                className={intent === i ? "btn-primary" : "btn-outline"}
                onClick={() => setIntent(i)}
              >
                {i === "deposit" ? "Deposit" : "Borrow"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="smallcaps mb-1">Input amount (PHRS)</p>
          <input
            className="rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-ink"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.001"
            aria-label="Input amount in PHRS"
          />
        </div>
        <button className="btn-outline" onClick={refetch} disabled={loading}>
          {loading ? "Reading Atlantic…" : "Refresh quotes"}
        </button>
      </div>

      {loading && !data && (
        <p className="text-sm text-slate">
          Reading live venue state from Atlantic — the RPC is slow, this takes
          a few seconds…
        </p>
      )}
      {error && (
        <div className="rounded-xl border border-fail/40 bg-white p-4">
          <p className="text-sm font-semibold text-fail">
            Couldn't read the venues — the Atlantic RPC didn't answer in time.
          </p>
          <p className="mt-1 font-mono text-xs text-slate">{error}</p>
          <button className="btn-outline mt-2" onClick={refetch}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          <p className="text-xs text-slate">
            Quoted at block <span className="font-mono">{data.block}</span> ·
            read {data.at} · {okQuotes.length}/{VENUES.length} venues reachable
          </p>

          {/* Aggregated quote board */}
          <div className="overflow-x-auto rounded-xl border border-hairline bg-white">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Type</th>
                  <th>Supply APY</th>
                  <th>Borrow APY</th>
                  <th>TVL (PHRS)</th>
                  <th>Liquidity depth (PHRS)</th>
                  <th>Share price</th>
                  <th>Cap. efficiency</th>
                  <th>
                    {intent === "deposit" ? "Est. 1-yr output" : "Est. 1-yr cost"}
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.quotes.map((q) => {
                  const isWinner = q.ok && winner?.def.id === q.def.id;
                  return (
                    <tr key={q.def.id} className={isWinner ? "bg-pass/40" : undefined}>
                      <td>
                        <a
                          className="font-mono font-semibold text-accent hover:underline"
                          href={`${EXPLORER_ADDRESS}${q.def.address}`}
                          target="_blank"
                          rel="noreferrer"
                          title={q.def.address}
                        >
                          {q.def.name}
                        </a>
                        <span className="block font-mono text-xs text-slate">
                          {shortAddr(q.def.address)}
                        </span>
                      </td>
                      <td className="text-xs text-slate">{q.def.note}</td>
                      <td className="font-mono font-semibold text-ink">
                        {q.ok ? bpsToPct(q.supplyApyBps) : "—"}
                      </td>
                      <td className="font-mono text-ink">
                        {q.ok ? (q.borrowApyBps === null ? "—" : bpsToPct(q.borrowApyBps)) : "—"}
                      </td>
                      <td className="font-mono text-ink">{q.ok ? weiToPhrs(q.tvlWei) : "—"}</td>
                      <td className="font-mono text-ink">
                        {q.ok ? weiToPhrs(q.liquidityWei) : "—"}
                      </td>
                      <td className="font-mono text-ink">
                        {q.ok && q.sharePriceWei !== null
                          ? `${weiToPhrs(q.sharePriceWei)} PHRS/share`
                          : "—"}
                      </td>
                      <td className="font-mono text-ink" title={q.def.kind === "lending"
                        ? "capital efficiency = utilization share of supplied capital earning"
                        : "vault: all TVL deployed in strategy"}>
                        {q.ok ? `${capitalEfficiencyPct(q).toFixed(2)}%` : "—"}
                      </td>
                      <td className="font-mono text-ink">
                        {q.ok
                          ? intent === "deposit"
                            ? estDepositOut(q)
                            : estBorrowCost(q)
                          : "—"}
                      </td>
                      <td>
                        {q.ok ? (
                          isWinner ? (
                            <span className="chip chip-pass">BEST VENUE</span>
                          ) : (
                            <span className="chip chip-info">OK</span>
                          )
                        ) : (
                          <span className="chip chip-fail" title={q.error}>
                            UNREACHABLE
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Explained routing */}
          <div>
            <h3 className="mb-2 text-base font-bold text-ink">
              Explained routing — intent: {intent}{" "}
              {winner && <span className="chip chip-pass ml-1">winner: {winner.def.name}</span>}
            </h3>
            {okQuotes.length === 0 && (
              <p className="rounded-xl border border-hairline bg-porcelain p-3 text-sm text-slate">
                No venue answered on this read — the RPC is likely just slow.
                Press <strong>Refresh quotes</strong> to retry; nothing here is
                invented.
              </p>
            )}
            {intent === "borrow" && !winner && okQuotes.length > 0 && (
              <p className="rounded-xl border border-hairline bg-porcelain p-3 text-sm text-slate">
                No venue can fill a borrow intent right now — TidepoolLending is
                unreachable and vaults accept deposits only. Try the Deposit
                intent, or press <strong>Refresh quotes</strong>.
              </p>
            )}
            <div className="mt-2 space-y-2">
              {data.quotes.map((q) => {
                const v = verdictFor(q);
                const flags = riskFlags(q);
                return (
                  <div
                    key={q.def.id}
                    className="rounded-xl border border-hairline bg-white px-4 py-3"
                  >
                    <p className="text-sm">
                      <span className={`chip ${v.tone} mr-2`}>{v.chip}</span>
                      <span className="font-mono font-semibold text-ink">{q.def.id}</span>
                      {!q.ok && (
                        <span className="ml-2 text-xs text-slate">
                          UNREACHABLE — {q.error ?? "read failed"} (excluded from
                          ranking, never zero-filled)
                        </span>
                      )}
                    </p>
                    {q.ok && <p className="mt-1 pl-1 text-xs text-slate">{v.text}</p>}
                    {q.ok && flags.length > 0 && (
                      <p className="mt-1 pl-1 text-xs text-slate">
                        risk: {flags.join(" · ")}
                      </p>
                    )}
                    {q.def.id === "T28-LEND" && q.utilizationBps !== null && q.ok && (
                      <p className="mt-1 pl-1 text-xs text-slate">
                        utilization {(q.utilizationBps / 100).toFixed(2)}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {inputWei === null && (
              <p className="mt-2 text-xs text-fail">
                The amount input is not a valid PHRS value — estimates are hidden until it parses.
              </p>
            )}
          </div>

          {badQuotes.length > 0 && (
            <p className="text-xs text-slate">
              {badQuotes.length} venue{badQuotes.length > 1 ? "s" : ""} unreachable this
              read — the rest of the board still aggregates and re-ranks. That
              degraded mode is the point of the aggregator (see `aggregate.py
              chaos` in the repo).
            </p>
          )}
        </>
      )}

      {/* The run command stays CLI */}
      <div>
        <h3 className="mb-2 text-base font-bold text-ink">
          The run command stays in the CLI — your terminal, your key
        </h3>
        <p className="mb-2 text-xs text-slate">
          Full aggregation pins one block and runs the explained router,
          unsigned-tx preparation with an eth_call dry-run gate, and the
          chaos/unreachable demo. Reads cost nothing; writes are dust-only and
          never happen from this page.
        </p>
        <div className="code-block whitespace-pre">{CLI_CMD}</div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button className="btn-outline" onClick={copyCmd}>
            {copied ? "Copied ✓" : "Copy commands"}
          </button>
          <p className="text-xs text-slate">
            Spend so far: 0.00212 PHRS gas of a 0.15 PHRS budget (evidence.json)
            — every broadcast went through flock with dust amounts.
          </p>
        </div>
      </div>

      <p className="text-xs text-slate">
        The board above is live Atlantic state — every verdict is traced to the
        pinned block at the top of the table. The task's real transactions are
        in the on-chain proof section below.
      </p>
    </div>
  );
}
