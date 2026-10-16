# T09 — Trend Watcher · Official Requirements

**Task:** T09 "Trend Watcher" · **Difficulty:** Hard · **Points:** 200 · **Toolkit:** SkillEngine
**Source:** Pharos Season of AI Agent Arena, official Build page (quoted verbatim below;
also recorded in `~/workspace/your_files/pharos-arena-MEGA.md` §T09).

## The five official requirements (verbatim)

> **OFFICIAL:** (1) Persists observations to memory/DB between runs. (2) Loads priors and checks threshold rule. (3) Fires only after MULTIPLE confirmations (N times above threshold). (4) Must DEMONSTRATE single spike does NOT trigger. (5) Summary of observations + why acted/not.

## How each requirement is met (requirement → implementation → proof)

| # | Requirement | Implementation | Proof artifact |
|---|---|---|---|
| 1 | Persists observations to memory/DB between runs | Append-only `state/observations.jsonl` (one JSON object per sample) + `state/audit.jsonl` + `state/runtime.json` snapshot. The community pattern for SkillEngine's missing durable state (campaign research §244). `state/` is gitignored — the repo documents the pattern, the operator's machine holds the memory. | `state/` (live, gitignored); `sample-output/observations-head-live.jsonl`, `observations-tail-live.jsonl` |
| 2 | Loads priors and checks threshold rule | Every `observe` cycle loads `runtime.json` priors (streak, lastFireBlock, counters), then evaluates the threshold rule: fastMA(5) vs slowMA(15) with a 0.5% band — the raw reading must ALSO sit above the slow-MA threshold to count as a confirmation. | `src/store.mjs` (`loadPriors`), `src/trend.mjs` (`decide`), `sample-output/live-report.txt` |
| 3 | Fires only after MULTIPLE confirmations (N times above threshold) | FIRE requires `confirmations: 3` CONSECUTIVE above-band samples. Streak resets on any non-confirming sample; 20-block cooldown after each FIRE. All math in BigInt wei — no floats. | `test/trend.test.mjs` (fires at exactly the 3rd confirmation), `sample-output/sustained-demo-synthetic.txt` |
| 4 | Must DEMONSTRATE single spike does NOT trigger | Controlled synthetic harness (labeled `SYNTHETIC-CONTROLLED`) runs the identical `evaluateSeries()` math on a single 5x spike: streak reaches 1, then resets on the dip — HOLD throughout. The reading-above-threshold condition kills the fast-MA echo of the spike. | `node bin/run.mjs spike-demo` → `sample-output/spike-demo-synthetic.txt`; unit test "single spike does NOT trigger" |
| 5 | Summary of observations + why acted/not | `node bin/run.mjs report` prints totals, block range, FIRE/HOLD counts, current priors, and the last 10 decisions each with its reason. | `sample-output/live-report.txt`, `evidence.md` |

## Notes the builders kept

- An earlier draft flagged a possible 6th requirement, "Accepts ≥3 independent actions" —
  **verified ABSENT** from the official requirements (5 only). It was a misread; do not build for it.
- SkillEngine has **no native cron and no durable state** (verified absence). Scheduling is
  documented as an external-operator concern (see README §6); persistence is local JSONL.
  Neither is claimed as a platform feature.
- Metric choice: `baseFeePerGas` per block via `eth_feeHistory` — one RPC call returns a whole
  real on-chain window (each point block-numbered); a live `eth_gasPrice` spot check is recorded
  as context in every report but kept out of the MA math (different metric, honest separation).
