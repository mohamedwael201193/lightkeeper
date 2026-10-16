# T09 Trend Watcher (Swell Line) — Evidence

**Chain:** Atlantic testnet · chainId **688689** (asserted before every run; abort on mismatch)
**Metric:** `baseFeePerGas` per block via `eth_feeHistory` — every data point below is a real
on-chain value at its block number. Live `eth_gasPrice` spot polls are recorded as context
in each report and kept out of the MA math.
**Trend rule:** fastMA(5) / slowMA(15) crossover + raw-reading-above-threshold, 0.5% band,
FIRE after 3 consecutive confirmations, streak resets on any miss, 20-block cooldown.
All math in BigInt wei. **Gas spent: 0** (read-only; no signing, no broadcast).

## Run 1 — live observation cycle (2026-10-16 ~07:13 EEST)

Command: `node bin/run.mjs observe` — 30-block `eth_feeHistory` window + 5 live `eth_gasPrice` spot polls.

```text
t09-trend-watcher :: observe — chain 688689 (Atlantic), metric baseFeePerGas

--- SIGNAL REPORT ---
window:      blocks 31481567..31481596 (30 real baseFeePerGas samples)
last sample: block 31481596 value 1.000 gwei
fastMA(5):   1.000 gwei | slowMA(15): 1.000 gwei | trend FLAT
streak:      0/3 confirmations | decision HOLD (FLAT_INSIDE_BAND_STREAK_RESET)
gas spot:    10 gwei@31481599, 10 gwei@31481612, 10 gwei@31481623, 10 gwei@31481636, 10 gwei@31481650 (context only)
signal:      NO SIGNAL — market flat inside the 0.5% band

Persisted 30 observations -> state/observations.jsonl | priors -> state/runtime.json
```

Sample persisted observation row (block 31481586, computed MAs visible):

```json
{"ts":1792123983,"metric":"baseFeePerGas","chainId":688689,"mode":"LIVE",
 "blockNumber":31481586,"valueWei":"1000000000",
 "fastMAWei":"1000000000","slowMAWei":"1000000000",
 "trend":"FLAT","above":false,"streak":0,"decision":"HOLD",
 "reason":"FLAT_INSIDE_BAND_STREAK_RESET"}
```

## Run 2 — live observation cycle, priors loaded (official reqs 1–2)

A second `observe` minutes later loaded `runtime.json` priors and appended 30 more
observations (blocks 31481649–31481678). `samplesTotal` went 30 → 60 — proof that
observations persist between runs and priors are honored, not recomputed.

```text
window:      blocks 31481649..31481678 (30 real baseFeePerGas samples)
last sample: block 31481678 value 1.000 gwei
fastMA(5):   1.000 gwei | slowMA(15): 1.000 gwei | trend FLAT
streak:      0/3 confirmations | decision HOLD (FLAT_INSIDE_BAND_STREAK_RESET)
gas spot:    10 gwei@31481680, 10 gwei@31481692, 10 gwei@31481704, 10 gwei@31481716, 10 gwei@31481724 (context only)
signal:      NO SIGNAL — market flat inside the 0.5% band
```

Atlantic's base fee was flat at 1 gwei (10 gwei `eth_gasPrice`) across both windows:
the honest live signal is HOLD, and the report says exactly why. Flat markets do not
produce manufactured signals here.

## Controlled demo A — single spike does NOT fire (official req 4)

`node bin/run.mjs spike-demo` — **MODE=SYNTHETIC-CONTROLLED** (same `evaluateSeries()`
math; synthetic 99xxxxxx block space; never mixed into the live log):

```text
block      value    fastMA   slowMA   trend    streak decision reason
99000013  10.000  10.000     n/a    WARMUP      0     HOLD WARMUP_INSUFFICIENT_SAMPLES
99000014  50.000  18.000  12.666   BULLISH      1     HOLD STREAK_1_OF_3
99000015  10.000  18.000  12.666   BULLISH      0     HOLD READING_BELOW_BAND_STREAK_RESET
99000016  10.000  18.000  12.666   BULLISH      0     HOLD READING_BELOW_BAND_STREAK_RESET
99000017  10.000  18.000  12.666   BULLISH      0     HOLD READING_BELOW_BAND_STREAK_RESET
99000018  10.000  18.000  12.666   BULLISH      0     HOLD READING_BELOW_BAND_STREAK_RESET
99000019  10.000  10.000  12.666   BEARISH      0     HOLD BEARISH_TREND_STREAK_RESET

Result: NO FIRE — HOLD (end streak 0)
```

Note blocks 99000015–99000018: the crossover stays BULLISH (the spike echoes inside
the 5-sample fast MA) but the raw reading is back at baseline, so the confirmation
condition fails and the streak resets. This is the anti-spike mechanism working as designed.

## Controlled demo B — sustained exceedance FIRES (official req 3)

`node bin/run.mjs sustained-demo` — **MODE=SYNTHETIC-CONTROLLED**:

```text
99000014  11.200  10.240  10.080   BULLISH      1     HOLD STREAK_1_OF_3
99000015  12.544  10.748  10.249   BULLISH      2     HOLD STREAK_2_OF_3
99000016  14.049  11.558  10.519   BULLISH      0     FIRE CONFIRMED_3X_ABOVE_BAND
99000017  15.735  12.705  10.901   BULLISH      1     HOLD STREAK_1_OF_3
99000019  19.738  15.938  12.059   BULLISH      0     HOLD CONFIRMED_BUT_COOLDOWN_17_BLOCKS_LEFT
...
Result: FIRED at block(s) 99000016
```

FIRE lands on exactly the 3rd consecutive confirmation; the streak resets and the
20-block cooldown suppresses immediate re-fire (`CONFIRMED_BUT_COOLDOWN_*` holds).

## Unit tests — 12/12 pass (synthetic series, math only)

`npm test` (node --test): moving-average exactness, band-boundary precision (BigInt,
no floats), flat-never-fires, single-spike-no-fire, fire-at-exactly-3rd-confirmation,
dip-after-2-resets, cooldown-suppresses-second-fire, warmup, fail-closed observer
error (streak preserved), BEARISH reset, echo-contamination rejection.

## Audit trail

`state/audit.jsonl` (gitignored, on the operator's machine) records every cycle's
decision with its reason; `state/runtime.json` carries the priors forward.

## Verification links

- Explorer (sampled window): https://atlantic.pharosscan.xyz/block/31481567
  through https://atlantic.pharosscan.xyz/block/31481678 (see LINKS.md, curl-verified)
- Repo: pinned tree link in SUBMISSION.md
