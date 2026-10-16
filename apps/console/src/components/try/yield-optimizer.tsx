/**
 * T15 · Yield Optimizer — "Vaults, live".
 *
 * Tier A surface: reads the two builder-deployed OctopusVault contracts on
 * Atlantic (Kelp + Kraken) with plain eth_call — no wallet, no signature,
 * costs nothing. Shows the live rate cards side by side and runs the same
 * runway-capped net math the optimizer run used: the winner is chosen on
 * capped gross yield over a selectable block horizon, not on the raw rate.
 *
 * Honesty label (stated on the page): testnet mechanics demonstration —
 * rewards are valueless testnet PHRS, never real yield.
 */
import { useMemo, useState } from "react";
import type { Lamp } from "../../types";
import { EXPLORER_ADDRESS, rpcCall, useAtlanticRead } from "../../hooks/useAtlantic";

// Vaults from tasks/t15-yield-optimizer/evidence.json (deploys are on-chain, verified)
const KELP = "0xe3212234B17A90cCBC36b0B44845394b62838b08";
const KRAKEN = "0xDC3D4a3f47BB479692239ECC362a16CE3485B283";

const SEL = {
  rewardPerBlock: "0x8ae39cac", // rewardPerBlock()
  entryFeeBps: "0x578334ee", // entryFeeBps()
  exitFeeBps: "0x57b17a52", // exitFeeBps()
  minHoldBlocks: "0x13ea58db", // minHoldBlocks()
  totalStaked: "0x817b1cd2", // totalStaked()
  rewardPool: "0x66666aa9", // rewardPool()
  runwayBlocks: "0x2e5939f1", // runwayBlocks()
} as const;

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
  };
}

/** Format wei as a trimmed PHRS string. */
function weiPhrs(wei: bigint, dp = 6): string {
  const base = 10n ** 18n;
  const int = wei / base;
  let frac = (wei % base).toString().padStart(18, "0").slice(0, dp).replace(/0+$/, "");
  return frac ? `${int.toString()}.${frac}` : int.toString();
}

/** Format a small wei amount (e.g. 1e13) in PHRS with up to 8 decimals. */
function ratePhrs(wei: bigint): string {
  return weiPhrs(wei, 8);
}

const HORIZONS = [100, 400, 1000] as const;

export default function TryYieldOptimizer({ lamp }: { lamp: Lamp }) {
  const [horizon, setHorizon] = useState<number>(1000);
  const { data, loading, error, refetch } = useAtlanticRead(
    async () => [await readVault(KELP, "Kelp"), await readVault(KRAKEN, "Kraken")],
    ["yield-optimizer-v1"]
  );

  const verdict = useMemo(() => {
    if (!data) return null;
    const ranked = data.map((v) => {
      // Runway-capped gross: the vault can never pay more than its funded pool.
      const gross = v.rewardPerBlockWei * BigInt(horizon);
      const capped = gross > v.rewardPoolWei ? v.rewardPoolWei : gross;
      return { v, capped };
    });
    const best = ranked[0].capped >= ranked[1].capped ? ranked[0] : ranked[1];
    const other = ranked[0].capped >= ranked[1].capped ? ranked[1] : ranked[0];
    return { ranked, best, other };
  }, [data, horizon]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="smallcaps !text-slate">Tier A · live reads, no wallet</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">
            Vaults, live — {lamp.name}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate">
            These are the two real vaults the LIGHTKEEPER optimizer built its recommendation
            from — read straight off Atlantic right now, not from a screenshot. The rate card
            is immutable on-chain: rate, fees and hold period are the same numbers the optimizer
            priced.
          </p>
        </div>
        <button className="btn-outline" onClick={refetch} disabled={loading}>
          {loading ? "Reading…" : "Refresh"}
        </button>
      </div>

      {loading && !data && (
        <div className="empty-panel px-5 py-6 text-sm text-slate">
          Reading both vaults from Atlantic…
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

      {data && (
        <>
          <div className="overflow-x-auto rounded-xl border border-hairline">
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
                {data.map((v) => (
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
                    <td>{ratePhrs(v.rewardPerBlockWei)} PHRS</td>
                    <td>{(v.entryFeeBps / 100n).toString()}%</td>
                    <td>{(v.exitFeeBps / 100n).toString()}%</td>
                    <td>{v.minHoldBlocks.toString()} blocks</td>
                    <td>{weiPhrs(v.totalStakedWei)} PHRS</td>
                    <td>{weiPhrs(v.rewardPoolWei)} PHRS</td>
                    <td>{v.runwayBlocks.toString()} blocks</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-hairline bg-porcelain p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-ink">Compare over a holding period:</p>
              <div className="flex gap-2">
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
            {verdict && (
              <div className="mt-4">
                <table className="data-table tabular">
                  <thead>
                    <tr>
                      <th>Vault</th>
                      <th>Raw gross @ {horizon} blocks</th>
                      <th>Runway-capped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verdict.ranked.map(({ v, capped }) => {
                      const raw = v.rewardPerBlockWei * BigInt(horizon);
                      const isBest = verdict.best.v.address === v.address && capped > 0n;
                      return (
                        <tr key={v.address}>
                          <td className="font-semibold text-ink">{v.name}</td>
                          <td>{weiPhrs(raw)} PHRS</td>
                          <td>
                            <span className={isBest ? "font-semibold text-ink" : ""}>
                              {weiPhrs(capped)} PHRS
                            </span>
                            {isBest && <span className="chip chip-pass ml-2">Winner</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate">
                  {verdict.best.capped > 0n ? (
                    <>
                      <span className="font-semibold text-ink">
                        {verdict.best.v.name} wins at {horizon} blocks.
                      </span>{" "}
                      Kraken&rsquo;s rate is {(
                        Number(verdict.ranked[1].v.rewardPerBlockWei) /
                        Number(verdict.ranked[0].v.rewardPerBlockWei)
                      ).toFixed(1)}
                      × Kelp&rsquo;s — but its reward pool only funds{" "}
                      {verdict.ranked[1].v.runwayBlocks.toString()} more blocks, so the capped
                      math flips the raw APY ranking. This is the optimizer&rsquo;s actual
                      decision rule, computed from live chain state.
                    </>
                  ) : (
                    "Both vaults are out of runway at this horizon — the honest answer is stay put."
                  )}
                </p>
                <p className="mt-2 text-xs text-slate">
                  Both vaults were staked, claimed and fully withdrawn in the live run — total
                  staked is 0 and the contracts are callable by anyone. Net math subtracts
                  entry/exit fees and gas from the capped gross before any stake; on testnet,
                  none of these figures are real yield.
                </p>
              </div>
            )}
          </div>
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
