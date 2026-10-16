/**
 * T15 · Yield Optimizer — "Net math, not APY theater."
 *
 * Tier A surface: reads the two builder-deployed OctopusVault contracts on
 * Atlantic (Kelp + Kraken) plus the live gas price with plain eth_call /
 * eth_gasPrice — no wallet, no signature, costs nothing. Re-runs the
 * optimizer's actual decision rule live:
 *   net(H) = runway-capped gross − entry fee − exit fee(H) − gas
 * against an honest stay-put (0%) baseline, over a holding period and stake
 * size the visitor picks. The raw-rate ranking (Kraken's 2.5×) loses to the
 * runway cap at long horizons and to friction at short ones — the winner is
 * computed from live chain state, not from a screenshot of a past run.
 *
 * Honesty label (stated on the page): testnet mechanics demonstration —
 * rewards are valueless testnet PHRS, never real yield.
 */
import { useMemo, useState } from "react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  EXPLORER_TX,
  rpcCall,
  useAtlanticRead,
} from "../../hooks/useAtlantic";

// Vaults from tasks/t15-yield-optimizer/evidence.json (deploys are on-chain, verified)
const KELP = "0xe3212234B17A90cCBC36b0B44845394b62838b08";
const KRAKEN = "0xDC3D4a3f47BB479692239ECC362a16CE3485B283";

// Proof txs (evidence.json) — every number on this page is checkable on the explorer.
const PROOF = {
  kelpDeploy:
    "0x91c13f9cb3e4df65c7d7b23218bb04241ee0cc66a8b0180a16db617b1240feb9",
  krakenDeploy:
    "0x1d01194b335186295860624f6f94f6d6af19c856a9ffcd29d009deaa2601edbd",
  // 141 blocks × 1e13 wei, exact to the wei — the math on screen is the math on chain.
  kelpClaim:
    "0x6452e916d88b5eb7ace2513f0cc49d61df927bfb342344e22f8565f198ea44e2",
} as const;

const SEL = {
  rewardPerBlock: "0x8ae39cac", // rewardPerBlock()
  entryFeeBps: "0x578334ee", // entryFeeBps()
  exitFeeBps: "0x57b17a52", // exitFeeBps()
  minHoldBlocks: "0x13ea58db", // minHoldBlocks()
  totalStaked: "0x817b1cd2", // totalStaked()
  rewardPool: "0x66666aa9", // rewardPool()
  runwayBlocks: "0x2e5939f1", // runwayBlocks()
} as const;

// Measured gas for a full stake → claim → withdraw round-trip, per vault, from
// the live run (evidence.json). Honest constants: REAL measured values, priced
// at the LIVE gas price read below — never assumed.
const MEASURED_GAS: Record<string, bigint> = {
  Kelp: 102375n + 89777n + 53605n,
  Kraken: 105175n + 89777n + 53980n,
};

interface VaultLive {
  address: string;
  name: string;
  rewardPerBlockWei: bigint;
  entryFeeBps: bigint;
  exitFeeBps: bigint;
  minHoldBlocks: bigint;
  totalStakedWei: bigint;
  rewardPoolWei: bigint;
  runwayBlocks: bigint;
  gasTotal: bigint;
}

interface LiveState {
  vaults: VaultLive[];
  gasPriceWei: bigint;
}

async function ethCallUint(address: string, data: string): Promise<bigint> {
  const hex = (await rpcCall("eth_call", [{ to: address, data }, "latest"])) as string;
  return BigInt(hex);
}

async function readVault(address: string, name: string): Promise<VaultLive> {
  const [rewardPerBlockWei, entryFeeBps, exitFeeBps, minHoldBlocks, totalStakedWei, rewardPoolWei, runwayBlocks] =
    await Promise.all(
      (
        [
          SEL.rewardPerBlock,
          SEL.entryFeeBps,
          SEL.exitFeeBps,
          SEL.minHoldBlocks,
          SEL.totalStaked,
          SEL.rewardPool,
          SEL.runwayBlocks,
        ] as const
      ).map((sel) => ethCallUint(address, sel))
    );
  return {
    address,
    name,
    rewardPerBlockWei,
    entryFeeBps,
    exitFeeBps,
    minHoldBlocks,
    totalStakedWei,
    rewardPoolWei,
    runwayBlocks,
    gasTotal: MEASURED_GAS[name] ?? 250000n,
  };
}

async function readLive(): Promise<LiveState> {
  const [kelp, kraken, gasPriceHex] = await Promise.all([
    readVault(KELP, "Kelp"),
    readVault(KRAKEN, "Kraken"),
    rpcCall("eth_gasPrice", []) as Promise<string>,
  ]);
  return { vaults: [kelp, kraken], gasPriceWei: BigInt(gasPriceHex) };
}

/** Format wei as a trimmed PHRS string. */
function weiPhrs(wei: bigint, dp = 6): string {
  const base = 10n ** 18n;
  const int = wei / base;
  const frac = (wei % base).toString().padStart(18, "0").slice(0, dp).replace(/0+$/, "");
  return frac ? `${int.toString()}.${frac}` : int.toString();
}

/** Signed net figure: "+0.001542" / "-0.000387" / "+0". */
function fmtNet(wei: bigint, dp = 6): string {
  if (wei < 0n) return `-${weiPhrs(-wei, dp)}`;
  return `+${weiPhrs(wei, dp)}`;
}

/** bps → "0.5%" / "1%" / "0%" (integer division would print 50bps as "0%"). */
function fmtBps(bps: bigint): string {
  const whole = bps / 100n;
  const rem = bps % 100n;
  if (rem === 0n) return `${whole.toString()}%`;
  return `${whole.toString()}.${rem.toString().padStart(2, "0").replace(/0+$/, "")}%`;
}

function fmtGwei(wei: bigint): string {
  const g = Number(wei) / 1e9;
  if (g >= 100) return g.toFixed(0);
  if (g >= 10) return g.toFixed(1);
  return g.toFixed(2);
}

/** num/den as a percent with 1 decimal. */
function fmtShare(num: bigint, den: bigint): string {
  if (den <= 0n) return "100.0";
  return (Number((num * 1000n) / den) / 10).toFixed(1);
}

const PRINCIPALS = [0.01, 0.02, 0.05] as const;
const HORIZONS = [100, 400, 1000] as const;

interface NetRow {
  v: VaultLive;
  entryFee: bigint;
  exitFee: bigint;
  gasCost: bigint;
  grossRaw: bigint;
  capped: bigint;
  netGain: bigint;
  sharePct: string;
}

export default function TryYieldOptimizer({ lamp }: { lamp: Lamp }) {
  const [horizon, setHorizon] = useState<number>(1000);
  const [principal, setPrincipal] = useState<number>(0.02);
  const { data, loading, error, refetch } = useAtlanticRead(readLive, ["yield-optimizer-v2"]);

  const verdict = useMemo(() => {
    if (!data) return null;
    const principalWei = BigInt(Math.round(principal * 1e18));
    const rows: NetRow[] = data.vaults.map((v) => {
      const entryFee = (principalWei * v.entryFeeBps) / 10000n;
      const netStake = principalWei - entryFee;
      const denom = v.totalStakedWei + netStake;
      // Marginal pro-rata share, computed in integer wei like the contract does.
      const grossRaw = denom > 0n ? (v.rewardPerBlockWei * BigInt(horizon) * netStake) / denom : 0n;
      // Runway cap: the vault can never pay more than its funded pool.
      const capped = grossRaw > v.rewardPoolWei ? v.rewardPoolWei : grossRaw;
      const exitFee = BigInt(horizon) < v.minHoldBlocks ? (netStake * v.exitFeeBps) / 10000n : 0n;
      const gasCost = v.gasTotal * data.gasPriceWei;
      const netGain = capped - entryFee - exitFee - gasCost;
      return { v, entryFee, exitFee, gasCost, grossRaw, capped, netGain, sharePct: fmtShare(netStake, denom) };
    });
    const naive = rows.reduce((a, b) => (b.v.rewardPerBlockWei > a.v.rewardPerBlockWei ? b : a));
    const winner = rows.reduce((a, b) => (b.netGain > a.netGain ? b : a));
    const stayPutWins = winner.netGain <= 0n;
    const other = rows.find((r) => r !== naive) ?? rows[0];
    const rateRatio =
      Number(naive.v.rewardPerBlockWei) / Math.max(1, Number(other.v.rewardPerBlockWei));
    const poolsEmpty = data.vaults.every((v) => v.totalStakedWei === 0n);
    return { rows, naive, winner, stayPutWins, rateRatio, poolsEmpty, gasGwei: fmtGwei(data.gasPriceWei) };
  }, [data, horizon, principal]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="smallcaps !text-slate">Tier A · live reads, no wallet</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">
            Vaults, live — net math, not APY theater · {lamp.name}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate">
            The LIGHTKEEPER optimizer reads both live vault rate cards off Atlantic and
            prices them with its real decision rule — runway-capped gross, minus entry
            and exit fees, minus gas — against an honest stay-put baseline. The raw
            rate lies; the net doesn&rsquo;t.
          </p>
        </div>
        <button className="btn-outline" onClick={refetch} disabled={loading}>
          {loading ? "Reading…" : "Refresh"}
        </button>
      </div>

      {loading && !data && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          Reading both vaults and the live gas price from Atlantic…
        </div>
      )}

      {error && (
        <div className="empty-panel px-5 py-6">
          <p className="text-sm text-fail">{error}</p>
          <button className="btn-outline mt-3" onClick={refetch}>
            Retry
          </button>
        </div>
      )}

      {data && verdict && (
        <>
          <section>
            <p className="smallcaps !text-slate">01 · Live rate cards</p>
            <div className="mt-2 overflow-x-auto rounded-xl border border-hairline">
              <table className="data-table tabular">
                <thead>
                  <tr>
                    <th>Vault</th>
                    <th>Rate / block</th>
                    <th>Entry fee</th>
                    <th>Exit fee (early)</th>
                    <th>Min hold</th>
                    <th>Total staked</th>
                    <th>Reward pool</th>
                    <th>Runway</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vaults.map((v) => (
                    <tr key={v.address}>
                      <td>
                        <a
                          className="font-semibold text-accent hover:underline"
                          href={`${EXPLORER_ADDRESS}${v.address}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {v.name}
                        </a>
                        <p className="mt-0.5 font-mono text-[11px] text-slate">
                          {v.address.slice(0, 10)}…{v.address.slice(-8)}
                        </p>
                      </td>
                      <td>{weiPhrs(v.rewardPerBlockWei, 8)} PHRS</td>
                      <td>{fmtBps(v.entryFeeBps)}</td>
                      <td>{fmtBps(v.exitFeeBps)}</td>
                      <td>{v.minHoldBlocks.toString()} blocks</td>
                      <td>{weiPhrs(v.totalStakedWei)} PHRS</td>
                      <td>{weiPhrs(v.rewardPoolWei)} PHRS</td>
                      <td>{v.runwayBlocks.toString()} blocks</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate">
              Immutable on-chain rate cards — the same numbers the optimizer priced. Read at
              the latest block; hit Refresh to re-read.
            </p>
          </section>

          <section className="rounded-xl border border-hairline bg-porcelain p-5">
            <p className="smallcaps !text-slate">02 · Net recommendation</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">Stake size:</p>
                {PRINCIPALS.map((p) => (
                  <button
                    key={p}
                    className={principal === p ? "btn-primary" : "btn-outline"}
                    onClick={() => setPrincipal(p)}
                  >
                    {p} PHRS
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">Holding period:</p>
                {HORIZONS.map((h) => (
                  <button
                    key={h}
                    className={horizon === h ? "btn-primary" : "btn-outline"}
                    onClick={() => setHorizon(h)}
                  >
                    {h} blocks
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-hairline bg-white">
              <table className="data-table tabular">
                <thead>
                  <tr>
                    <th>Venue</th>
                    <th>Gross</th>
                    <th>Runway-capped</th>
                    <th>− Entry</th>
                    <th>− Exit</th>
                    <th>− Gas</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {verdict.rows.map((r) => {
                    const isBest = !verdict.stayPutWins && verdict.winner.v.address === r.v.address;
                    return (
                      <tr key={r.v.address}>
                        <td className="font-semibold text-ink">{r.v.name}</td>
                        <td>{weiPhrs(r.grossRaw)} PHRS</td>
                        <td>{weiPhrs(r.capped)} PHRS</td>
                        <td>{weiPhrs(r.entryFee)} PHRS</td>
                        <td>{weiPhrs(r.exitFee)} PHRS</td>
                        <td>{weiPhrs(r.gasCost)} PHRS</td>
                        <td>
                          <span className={isBest ? "font-semibold text-ink" : ""}>
                            {fmtNet(r.netGain)} PHRS
                          </span>
                          {isBest && <span className="chip chip-pass ml-2">Winner</span>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="font-semibold text-ink">Stay put</td>
                    <td colSpan={5} className="text-slate">
                      Wallet baseline — 0% yield, costs nothing
                    </td>
                    <td>
                      <span className={verdict.stayPutWins ? "font-semibold text-ink" : ""}>
                        +0 PHRS
                      </span>
                      {verdict.stayPutWins && <span className="chip chip-pass ml-2">Winner</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              {verdict.stayPutWins ? (
                <p className="max-w-2xl text-sm leading-relaxed text-slate">
                  <span className="font-semibold text-ink">
                    STAY PUT at {horizon} blocks.
                  </span>{" "}
                  Every venue nets negative: a full stake → claim → withdraw round-trip
                  costs real gas at today&rsquo;s {verdict.gasGwei} gwei, and{" "}
                  {verdict.naive.v.name}&rsquo;s {verdict.rateRatio.toFixed(1)}× headline rate
                  can&rsquo;t clear it. Its pool only funds{" "}
                  {verdict.naive.v.runwayBlocks.toString()} more blocks anyway — the raw APY
                  is theater twice over. This is the optimizer&rsquo;s honest default, computed
                  from live chain state.
                </p>
              ) : (
                <p className="max-w-2xl text-sm leading-relaxed text-slate">
                  <span className="font-semibold text-ink">
                    {verdict.winner.v.name} wins at {horizon} blocks: net{" "}
                    {fmtNet(verdict.winner.netGain)} PHRS
                  </span>{" "}
                  after entry/exit fees and gas.{" "}
                  {verdict.naive.v.address !== verdict.winner.v.address ? (
                    <>
                      The naive APY ranking crowns {verdict.naive.v.name} (
                      {verdict.rateRatio.toFixed(1)}× the rate) — but its reward pool only
                      funds {verdict.naive.v.runwayBlocks.toString()} more blocks, so the
                      runway cap flips the ranking. This is the optimizer&rsquo;s actual
                      decision rule, computed from live chain state.
                    </>
                  ) : (
                    <>
                      The raw APY ranking agrees here — but the cap still bounds the upside:
                      the pool only funds {verdict.winner.v.runwayBlocks.toString()} more
                      blocks, so the gross is capped at what the vault actually holds, never
                      projected.
                    </>
                  )}
                </p>
              )}
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate">
                Gas per venue = measured live-run txs (stake + claim + withdraw) × live gas
                price {verdict.gasGwei} gwei. Marginal share at {principal} PHRS:{" "}
                {verdict.rows.map((r) => `${r.v.name} ${r.sharePct}%`).join(" · ")}
                {verdict.poolsEmpty
                  ? " — both pools are empty right now, so a new staker takes the whole reward stream; that share dilutes the moment anyone else stakes."
                  : " — share falls as total staked rises."}{" "}
                Exit fee applies only below the min hold ({verdict.rows.map((r) => `${r.v.name} ${r.v.minHoldBlocks.toString()}`).join(", ")} blocks).
              </p>
            </div>
          </section>

          <section>
            <p className="smallcaps !text-slate">03 · On-chain proof</p>
            <p className="mt-2 text-sm text-slate">
              Every number above is checkable on the explorer:{" "}
              <a className="font-semibold text-accent hover:underline" href={`${EXPLORER_TX}${PROOF.kelpDeploy}`} target="_blank" rel="noreferrer">
                Kelp deploy
              </a>
              {" · "}
              <a className="font-semibold text-accent hover:underline" href={`${EXPLORER_TX}${PROOF.krakenDeploy}`} target="_blank" rel="noreferrer">
                Kraken deploy
              </a>
              {" · "}
              <a className="font-semibold text-accent hover:underline" href={`${EXPLORER_TX}${PROOF.kelpClaim}`} target="_blank" rel="noreferrer">
                Kelp claim — 141 blocks × 1e13, exact to the wei
              </a>
              . The full stake → claim → withdraw ledger lives in the task&rsquo;s evidence.
            </p>
          </section>
        </>
      )}

      <p className="text-xs text-slate">
        Honesty label: testnet mechanics demonstration — rewards are valueless testnet PHRS,
        never real yield. Discovery note: the Atlantic scan found zero third-party yield
        venues, so these two builder-deployed vaults are the entire live venue set.
      </p>
    </div>
  );
}
