/**
 * T16 · Liquidation Watchdog — "Your position, live risk".
 *
 * Tier A surface: paste any address → live health-factor check against the real
 * MiniLend contract on Atlantic via eth_call (no wallet, no signature, free).
 * Shows collateral, debt, oracle price and the on-chain health factor, a
 * PASS/AT-RISK chip, the exact price that would trigger liquidation, and the
 * concrete repay-or-top-up amounts that restore HF ≥ 1.5 — the same math the
 * Telegram watcher fires with.
 */
import { useState } from "react";
import type { Lamp } from "../../types";
import {
  EXPLORER_ADDRESS,
  isValidAddress,
  rpcCall,
  useAtlanticRead,
} from "../../hooks/useAtlantic";

// MiniLend from tasks/t16-liquidation-watchdog/evidence.json (deployed, verified on-chain)
const MINILEND = "0x108989a165a446e1d89CEe3C9936344ea7ADbf4a";
// The dust position from the live run — a working demo address for visitors.
const DEMO_ACCOUNT = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";

const SEL = {
  getUserAccountData: "0xbf92857c", // getUserAccountData(address)
  healthFactor: "0x6ad9f9df", // healthFactor(address)
} as const;

const HF_SCALE = 10n ** 18n;
const WARN_HF = 13n * 10n ** 17n; // 1.3 — matches watcher/config.yaml
const CRIT_HF = 11n * 10n ** 17n; // 1.1

interface AccountData {
  collateralUsd8: bigint; // USD, 8 decimals
  debtUsd8: bigint; // USD, 8 decimals
  hf: bigint; // 1e18 == 1.0
  price8: bigint; // USD per PHRS, 8 decimals (int256, always positive here)
  thresholdBps: bigint;
}

async function readAccount(address: string): Promise<AccountData> {
  const padded = "0x" + SEL.getUserAccountData + address.slice(2).padStart(64, "0");
  const hex = (await rpcCall("eth_call", [{ to: MINILEND, data: padded }, "latest"])) as string;
  const words = hex.slice(2).match(/.{1,64}/g) ?? [];
  if (words.length < 5) throw new Error("Unexpected response from MiniLend — try again.");
  const [c, d, h, p, t] = words.map((w) => BigInt("0x" + w));
  return { collateralUsd8: c, debtUsd8: d, hf: h, price8: p, thresholdBps: t };
}

/** Format a fixed-decimal bigint (dp decimals) as a trimmed decimal string. */
function fixed(u: bigint, dp: number, maxDp = 4): string {
  const base = 10n ** BigInt(dp);
  const int = u / base;
  let frac = (u % base).toString().padStart(dp, "0").slice(0, maxDp).replace(/0+$/, "");
  return frac ? `${int.toString()}.${frac}` : int.toString();
}

type RiskZone = "none" | "healthy" | "warning" | "critical" | "liquidatable";

function zoneOf(hf: bigint, hasDebt: boolean): RiskZone {
  if (!hasDebt) return "none";
  if (hf < HF_SCALE) return "liquidatable";
  if (hf < CRIT_HF) return "critical";
  if (hf < WARN_HF) return "warning";
  return "healthy";
}

const ZONE_COPY: Record<Exclude<RiskZone, "none">, { chip: string; chipClass: string; label: string }> = {
  healthy: { chip: "PASS", chipClass: "chip chip-pass", label: "Healthy" },
  warning: { chip: "AT RISK", chipClass: "chip chip-info", label: "Warning" },
  critical: { chip: "AT RISK", chipClass: "chip chip-fail", label: "Critical" },
  liquidatable: { chip: "LIQUIDATABLE", chipClass: "chip chip-fail", label: "Liquidatable" },
};

export default function TryLiquidationWatchdog({ lamp }: { lamp: Lamp }) {
  const [input, setInput] = useState(DEMO_ACCOUNT);
  const [checked, setChecked] = useState<string>(DEMO_ACCOUNT);
  const valid = isValidAddress(input);

  const { data, loading, error, refetch } = useAtlanticRead(
    async () => readAccount(checked),
    [checked]
  );

  const onCheck = () => {
    if (valid) setChecked(input.trim());
  };

  const hasDebt = !!data && data.debtUsd8 > 0n;
  const zone: RiskZone = data ? zoneOf(data.hf, hasDebt) : "none";
  const hasPosition = !!data && (data.collateralUsd8 > 0n || data.debtUsd8 > 0n);

  // Liquidation price: HF is linear in price, so p_liq = price / HF.
  const liquidationPrice8 = data && hasDebt ? (data.price8 * HF_SCALE) / data.hf : 0n;
  // Repay amount (USD 8dp) to reach HF 1.5: debt' = collatUsd * 0.8 / 1.5 = collatUsd * 8/15
  const repayUsd8 =
    data && hasDebt && data.collateralUsd8 > 0n
      ? data.debtUsd8 - (data.collateralUsd8 * 8n) / 15n
      : 0n;
  // Add-collateral amount (PHRS wei): collatUsd' = debt * 1.5 / 0.8 = debt * 15/8
  const addPhrsWei =
    data && hasDebt && data.price8 > 0n
      ? (((data.debtUsd8 * 15n) / 8n - data.collateralUsd8) * 10n ** 18n) / data.price8
      : 0n;

  return (
    <div className="space-y-5">
      <div>
        <p className="smallcaps !text-slate">Tier A · live reads, no wallet</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">
          Your position, live risk — {lamp.name}
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-slate">
          Paste any address and read its MiniLend position straight off Atlantic: collateral,
          debt, the oracle price and the on-chain health factor. The address below holds the
          dust position from the live run — try it, then try your own.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className="w-full rounded-xl border border-hairline bg-paper px-4 py-2.5 font-mono text-sm text-ink placeholder:text-slate"
          placeholder="0x… account address"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCheck();
          }}
          aria-label="Position address to check"
        />
        <div className="flex shrink-0 gap-2">
          <button className="btn-primary" onClick={onCheck} disabled={!valid || loading}>
            {loading ? "Reading…" : "Check risk"}
          </button>
          <button className="btn-outline" onClick={() => refetch()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>
      {!valid && input.trim().length > 0 && (
        <p className="text-sm text-fail">That is not a valid 0x address — 40 hex characters after 0x.</p>
      )}

      {error && (
        <div className="empty-panel px-5 py-6">
          <p className="text-sm text-fail">{error}</p>
          <button className="btn-outline mt-3" onClick={refetch}>
            Retry
          </button>
        </div>
      )}

      {data && !error && (
        <>
          {!hasPosition && (
            <div className="empty-panel px-5 py-6 text-sm text-slate">
              No position at this address on{" "}
              <a
                className="font-mono text-accent hover:underline"
                href={`${EXPLORER_ADDRESS}${MINILEND}`}
                target="_blank"
                rel="noreferrer"
              >
                MiniLend
              </a>{" "}
              — zero collateral and zero debt. Nothing to liquidate.
            </div>
          )}

          {hasPosition && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className={ZONE_COPY[zone as Exclude<RiskZone, "none">].chipClass}>
                  {ZONE_COPY[zone as Exclude<RiskZone, "none">].chip}
                </span>
                <p className="text-sm font-semibold text-ink">
                  {ZONE_COPY[zone as Exclude<RiskZone, "none">].label} — health factor{" "}
                  {data.hf === (1n << 256n) - 1n ? "∞" : fixed(data.hf, 18, 4)}
                </p>
                <span className="font-mono text-xs text-slate">{checked}</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-hairline">
                <table className="data-table tabular">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Live value</th>
                      <th>What it means</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Collateral</td>
                      <td>${fixed(data.collateralUsd8, 8)}</td>
                      <td className="text-slate">PHRS collateral valued at the oracle price</td>
                    </tr>
                    <tr>
                      <td>Debt</td>
                      <td>${fixed(data.debtUsd8, 8)}</td>
                      <td className="text-slate">USD-denominated, so price moves the risk</td>
                    </tr>
                    <tr>
                      <td>Oracle price</td>
                      <td>${fixed(data.price8, 8)}</td>
                      <td className="text-slate">Operator-updated on-chain; every move is an event</td>
                    </tr>
                    <tr>
                      <td>Liquidation threshold</td>
                      <td>{(Number(data.thresholdBps) / 100).toFixed(0)}%</td>
                      <td className="text-slate">Aave-style: HF = collateral × 80% ÷ debt</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {hasDebt && (
                <div className="rounded-xl border border-hairline bg-porcelain p-5">
                  <p className="text-sm font-semibold text-ink">What would trigger liquidation</p>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
                    Anyone may call{" "}
                    <span className="font-mono">liquidate()</span> the moment the health factor
                    drops below 1.0. With current debt, that happens if the oracle price falls
                    to <span className="font-semibold text-ink">${fixed(liquidationPrice8, 8)}</span>{" "}
                    (currently ${fixed(data.price8, 8)}). The watcher alerts at 1.3 (warning) and
                    1.1 (critical) — before the chain gets a vote.
                  </p>
                  {zone !== "healthy" && zone !== "none" && repayUsd8 > 0n && (
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate">
                      <span className="font-semibold text-ink">Concrete action to restore HF ≥ 1.5:</span>{" "}
                      repay ${fixed(repayUsd8, 8)} of debt,{" "}
                      <span className="font-semibold text-ink">or</span> add{" "}
                      {(Number(addPhrsWei) / 1e18).toFixed(6)} PHRS collateral.
                    </p>
                  )}
                  {zone === "healthy" && (
                    <p className="mt-3 text-sm text-slate">
                      Position is healthy — no action needed. If the price drops, the concrete
                      repay-or-top-up numbers will appear here.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <p className="text-xs text-slate">
            All numbers come from a single{" "}
            <span className="font-mono">getUserAccountData()</span> eth_call against{" "}
            <a
              className="font-mono text-accent hover:underline"
              href={`${EXPLORER_ADDRESS}${MINILEND}`}
              target="_blank"
              rel="noreferrer"
            >
              MiniLend
            </a>{" "}
            — the same call the watcher uses. LIGHTKEEPER never sees or asks for private keys.
          </p>
        </>
      )}
    </div>
  );
}
