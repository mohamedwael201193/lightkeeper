# T09 Trend Watcher (Swell Line) — Reviewer Notes

## What this is

A trend watcher over Atlantic testnet that answers "is gas trending up, or is that
just a wave?" Real per-block `baseFeePerGas` samples → 5/15 moving-average crossover
with a 0.5% confirmation band → **FIRE only after 3 consecutive above-band readings**.
A single spike provably cannot trigger it. Read-only: 0 gas spent, no keys, no broadcast.

## The 30-second test

```bash
cd tasks/t09-trend-watcher
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ../../.env; set +a

node bin/run.mjs spike-demo      # single 5x spike -> NO FIRE (official req 4), ~5s
node bin/run.mjs sustained-demo  # sustained rise -> FIRE at exactly the 3rd confirmation, ~5s
node bin/run.mjs report          # 60 live observations + why acted/not (official req 5)
npm test                         # 12/12 unit tests (synthetic, math-only)
```

`node bin/run.mjs observe` runs a full live cycle (~40s): 30-block `eth_feeHistory`
window, per-sample MA math, signal report, persistence to `state/`.

## Where each official requirement is proven

1. **Persists observations between runs** — `state/observations.jsonl` (gitignored, on the
   operator's machine); `sample-output/observations-head-live.jsonl` /
   `observations-tail-live.jsonl` show real persisted rows. Two live cycles took
   `samplesTotal` 30 → 60.
2. **Loads priors + threshold rule** — `src/store.mjs:loadPriors`, `src/trend.mjs:decide`.
3. **Multiple confirmations** — `sustained-demo` fires at exactly the 3rd consecutive
   confirmation; unit test asserts it.
4. **Single spike does NOT trigger** — `spike-demo` transcript: streak 1 at the spike,
   reset to 0 on the dip, HOLD throughout. The raw-reading condition kills the fast-MA echo.
5. **Summary + why acted/not** — `node bin/run.mjs report` → `sample-output/live-report.txt`.

## Things to poke at

- **Chain-ID assertion first:** every command aborts unless the RPC reports 688689.
  Try pointing `ATLANTIC_RPC_URL` at another chain — it refuses loudly.
- **Fail-closed:** `evaluateSeries` records `OBSERVER_ERROR` rows as HOLD without touching
  the streak (unit-tested).
- **No float money:** all math is BigInt wei; the band boundary is exact
  (`classifyTrend(edge) == FLAT`, `edge+1 == BULLISH` — unit-tested).
- **Synthetic is labeled:** every non-chain artifact says `SYNTHETIC-CONTROLLED`;
  `state/observations.jsonl` contains only `mode: "LIVE"` rows.

## Honest disclosures

- Live Atlantic was flat (1 gwei base fee) during the evidence window, so the live
  signal is HOLD with a stated reason — no manufactured signal. The FIRE path is
  proven on the controlled harness and in tests.
- SkillEngine has no native cron or durable state: scheduling is an external-operator
  pattern (example cron in README §6, **not installed**); persistence is local JSONL
  (`state/`, gitignored, documented — never claimed as a platform feature).
- FIRE is an off-chain signal, not a transaction. Any action on it is the operator's.
