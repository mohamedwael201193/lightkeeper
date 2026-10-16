# T09 — Arena Submission Pack (copy-paste ready)

> Video slot: **PENDING-VIDEO** — record per VIDEO-GUIDE.md, then paste the link below.
> Pinned tree: `https://github.com/mohamedwael201193/lightkeeper/tree/<COMMIT>/tasks/t09-trend-watcher`

---

## Title

T09 — Trend Watcher (Swell Line)

## One-liner

Atlantic fee-market trend watcher: 5/15 MA crossover with a 0.5% confirmation band — FIRES only after 3 consecutive above-band readings; a single spike provably cannot trigger it.

## Description

Swell Line watches Atlantic's fee market and answers one question honestly: is gas
trending up, or is that just a wave? Each cycle it pulls a 30-block `baseFeePerGas`
window via `eth_feeHistory` (every point a real on-chain value at its block number),
computes fastMA(5)/slowMA(15) in BigInt wei, and confirms a trend only when BOTH the
crossover is BULLISH and the raw reading sits above the slow-MA threshold — 3 times
in a row. Any miss resets the streak; a 20-block cooldown follows each FIRE; failed
reads are fail-closed HOLD. Observations persist between runs in local JSONL
(`state/observations.jsonl` + `runtime.json` + `audit.jsonl`, gitignored — the
builder pattern for SkillEngine's missing durable state; scheduling is an
external-operator cron, documented, not claimed as a platform feature).

Evidence: two live observe cycles (60 real observations, blocks 31481567–31481678,
chain 688689 asserted) → honest HOLD (market flat at 1 gwei base fee); controlled
synthetic harness shows a single 5x spike NOT firing (streak 1 → reset) and a
sustained rise firing at exactly the 3rd confirmation; 12/12 unit tests green.
Read-only: 0 gas spent, no keys, no broadcast. FIRE is an off-chain signal.

## Links

- **Repo (pinned):** https://github.com/mohamedwael201193/lightkeeper/tree/<COMMIT>/tasks/t09-trend-watcher
- **Proof — explorer, sampled window (curl-verified 200):**
  https://atlantic.pharosscan.xyz/block/31481567 ·
  https://atlantic.pharosscan.xyz/block/31481678
- **Proof — transcripts:** `sample-output/live-observe-cycle1.txt`, `sample-output/live-report.txt`,
  `sample-output/spike-demo-synthetic.txt`, `sample-output/sustained-demo-synthetic.txt`
- **Demo / share link:** n/a — CLI tool; evidence is the transcript + explorer links above
- **Video:** PENDING-VIDEO

## Reviewer notes (paste)

See REVIEWER_NOTES.md in the task folder. 30-second test:
`node bin/run.mjs spike-demo` (single spike → NO FIRE) →
`node bin/run.mjs sustained-demo` (sustained rise → FIRE at 3rd confirmation) →
`node bin/run.mjs report` (60 live observations + why acted/not) → `npm test` (12/12).
Every command asserts chain ID 688689 first. All non-chain artifacts are labeled
SYNTHETIC-CONTROLLED and never mixed into the live observation log.
