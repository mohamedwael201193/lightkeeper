<div style="background:#1414c8;padding:48px 32px;text-align:center;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:44px;letter-spacing:10px;">SWELL LINE</div>
  <div style="color:#f4f6ff;font-size:13px;letter-spacing:3px;margin-top:10px;">T09 — TREND WATCHER · HARD · 200 PTS · SKILLENGINE</div>
  <div style="color:#b9c2f5;font-size:14px;font-style:italic;margin-top:18px;">"The sea never lies about its direction — only about its timing."</div>
</div>

## 1. Verdict in 30 seconds

Swell Line watches Atlantic's fee market and answers one question honestly:
**is gas trending up, or is that just a wave?** It samples real `baseFeePerGas`
per block, runs a 5/15 moving-average crossover with a 0.5% confirmation band,
and FIRES only after **3 consecutive above-band readings** — a single spike
can never trigger it (the streak resets, proven by demo and by test).

**Live state:** 60 real observations across blocks 31481567–31481678, all HOLD —
Atlantic's base fee sat flat at 1 gwei. The FIRE path is proven on the
controlled synthetic harness (`sustained-demo`) and in 12/12 unit tests.

**Try it:** `node bin/run.mjs observe` (one live cycle, ~40s) ·
`node bin/run.mjs report` · `node bin/run.mjs spike-demo`

## 2. How the trend math works

All money math is **BigInt wei** — no floats, ever. Parameters live in `config.yaml`:

| Parameter | Value | Meaning |
|---|---|---|
| `fastWindow` | 5 samples | fast moving average |
| `slowWindow` | 15 samples | slow moving average (the trend anchor) |
| `bandBps` | 50 (0.5%) | deadband: fastMA must exceed slowMA × 1.005 to be "above threshold" |
| `confirmations` | 3 | consecutive above-band readings required to FIRE |
| `cooldownBlocks` | 20 | no second FIRE within 20 blocks of the last |

A sample **confirms** only when BOTH hold:
1. **Crossover:** `fastMA > slowMA × (1 + band)` — the trend direction, and
2. **Reading above threshold:** the RAW sample value `> slowMA × (1 + band)` — the present reading, not an echo.

Condition (2) is the anti-spike mechanism: a one-sample spike contaminates the
fast-MA window for 5 samples, but the raw reading falls back to baseline on the
very next sample, so the streak can never reach 3. Any non-confirming sample
**resets the streak to 0** — including BEARISH crossovers and flat readings.
After a FIRE the streak resets and a 20-block cooldown begins.
Failed RPC reads are **fail-closed**: recorded as `OBSERVER_ERROR`, decision
HOLD, streak untouched.

See `src/trend.mjs` (`movingAverage`, `classifyTrend`, `decide`, `evaluateSeries`).

## 3. Run it

```bash
cd tasks/t09-trend-watcher
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ../../.env; set +a   # ATLANTIC_RPC_URL only; no private key needed (read-only)

node bin/run.mjs observe          # live cycle: Chain MCP get_block fee window + get_gas_price spot polls -> evaluate -> persist -> report
node bin/run.mjs report           # summary of observations + why acted/not (official req 5)
node bin/run.mjs spike-demo       # CONTROLLED SYNTHETIC: single spike -> proves NO fire (official req 4)
node bin/run.mjs sustained-demo  # CONTROLLED SYNTHETIC: sustained rise -> proves confirmed FIRE
npm test                          # 15 tests: trend math (synthetic series only) + SIGKILL atomic-store crash test
```

Every chain-touching command **asserts chain ID 1672 (Pharos mainnet) first** — read live via the Chain MCP `get_chain_info` — and aborts on mismatch. All chain reads are named Chain MCP tool calls (get_chain_info / get_block_number / get_block / get_gas_price); there is no `cast` and no raw-RPC path (rawRpcCalls = 0). Read-only: no signing, no broadcasting, 0 gas spent.

## 4. Evidence & verification

### Requirements → evidence (official Arena requirements, verbatim)

| # | Official requirement | How it is met | Evidence artifact |
|---|---|---|---|
| 1 | Persists observations to memory/DB between runs | Append-only `state/observations.jsonl` (one JSON object per sample) + `state/audit.jsonl` + `state/runtime.json` priors snapshot. `state/` is gitignored — the operator's machine holds the memory. | `sample-output/observations-head-live.jsonl`, `observations-tail-live.jsonl` |
| 2 | Loads priors and checks threshold rule | Every `observe` cycle loads `runtime.json` priors (streak, lastFireBlock, counters), then evaluates: fastMA(5) vs slowMA(15) with 0.5% band — the raw reading must ALSO sit above the slow-MA threshold. | `src/store.mjs` (`loadPriors`), `src/trend.mjs` (`decide`), `sample-output/live-report.txt` |
| 3 | Fires only after MULTIPLE confirmations (N times above threshold) | FIRE requires 3 CONSECUTIVE above-band samples; any miss resets the streak to 0; 20-block cooldown after each FIRE. All math in BigInt wei. | `test/trend.test.mjs` (fires at exactly the 3rd confirmation), `sample-output/sustained-demo-synthetic.txt` |
| 4 | Must DEMONSTRATE single spike does NOT trigger | Controlled synthetic harness (labeled `SYNTHETIC-CONTROLLED`) runs the identical `evaluateSeries()` math on a single 5x spike: streak reaches 1, resets on the dip — HOLD throughout. | `node bin/run.mjs spike-demo` → `sample-output/spike-demo-synthetic.txt`; unit test "single spike does NOT trigger" |
| 5 | Summary of observations + why acted/not | `node bin/run.mjs report` prints totals, block range, FIRE/HOLD counts, current priors, and the last 10 decisions each with its reason. | `sample-output/live-report.txt`, `evidence.md` |

- `evidence.md` — the full run narrative with block numbers, computed MAs, and the signal.
- `evidence.json` — machine-readable evidence packet (L10-style).
- `sample-output/` — real artifacts: `live-observe-cycle1.txt`, `live-report.txt`,
  `observations-head-live.jsonl`, `observations-tail-live.jsonl`, and both demo transcripts.
- `LINKS.md` — curl-verified explorer links for the sampled block window.

Reproduce the live evidence: run `observe` twice; `runtime.json` priors (`samplesTotal`)
prove observations persist between runs (official req 1–2).

## 5. State & persistence (SkillEngine has no native state — this is the builder pattern)

```
state/observations.jsonl   append-only memory: one JSON object per evaluated sample
state/runtime.json         priors snapshot: streak, lastFireBlock, counters, params hash
state/audit.jsonl          decision audit trail: every FIRE/HOLD with its reason
```

`state/` is **gitignored and never committed** — the repo documents the pattern
(this section), the operator's machine holds the memory. A fresh machine starts
at streak 0 / warmup and rebuilds state from live reads; nothing is fabricated to
fill the gap.

## 6. Scheduling (SkillEngine has no native cron — external operator pattern)

SkillEngine provides no scheduling primitive, so Swell Line is driven by the
operator's own scheduler. It is idempotent per cycle and safe to run every few
minutes (one cycle ≈ 42 Chain MCP tool calls: 30 get_block + spot polls).

Example system cron (provided for the operator — **not installed by this build**):

```cron
# Swell Line — sample Pharos mainnet fee market (via Chain MCP) every 5 minutes
*/5 * * * * cd /path/to/lightkeeper/tasks/t09-trend-watcher && /usr/bin/env node bin/run.mjs observe >> logs/cron.log 2>&1
```

Or as a GitHub Actions scheduled workflow hitting a self-hosted runner with
`ATLANTIC_RPC_URL` in repo secrets. Either way: the schedule lives with the
operator, never claimed as a SkillEngine feature.

## 7. Honest limits

- **FIRE is an off-chain signal**, not a transaction. Swell Line observes and reports;
  any action on the signal belongs to the operator (or a downstream skill like T05/T06).
- **Flat markets stay silent.** On a quiet testnet the honest output is HOLD with a reason,
  not a manufactured signal. The FIRE path is exercised on the controlled harness.
- **No price feeds, no predictions.** The only series is on-chain base fee; no invented data.
- **Synthetic is labeled.** Every non-chain artifact carries `SYNTHETIC-CONTROLLED` /
  `mode: synthetic` and is never mixed into the live observation log.

## 8. Submission pointers

- Arena pack: `SUBMISSION.md` (copy-paste ready; video slot marked for the new recording).
- Verbatim official requirements: `REQUIREMENTS.md`.
- Reviewer fast path: `SUBMISSION.md` → "Reviewer notes" (30-second test, no internal docs needed).
