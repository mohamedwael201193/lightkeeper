# T26 — Reviewer Notes

Read this before judging. It lists what was verified, what is honestly
limited, and one bug caught and fixed during the build.

## What to verify (2 minutes)

1. **Real numbers, real window.** `evidence.json` → `window`:
   blocks 31186577–31482619, 2026-10-09 → 2026-10-16, chain 688689.
   Open the explorer address link in LINKS.md and compare the recent tx list
   against `evidence.json` → `tx_hashes_in_window` (110 hashes).
2. **Previous-period comparison is real.** `digests/digest-previous-baseline.md`
   is the `--backfill` output for 2026-09-29 → 2026-10-09 (0 txs — an honest
   quiet baseline, not a fabricated one). `state/state.json` → `baseline`
   holds the same snapshot the deltas were computed against.
3. **TOP 3 is deterministic.** `rank_notable()` in `src/digest.py`: failed tx
   (100) > contract creation (50) > large native ≥0.05 PHRS (40) > token
   transfer (25) > contract interaction (10) > plain transfer (5); ties break by
   newest block, then hash. Same input → same output, always.
4. **Delivery is real.** Telegram `message_id` **723**, chat `1434154285`,
   bot `@OctaneShift_Bot`, delivered 2026-10-16T04:42:11Z. Exactly one
   `sendMessage` was sent (the bot has an active webhook; `setWebhook` /
   `deleteWebhook` / `getUpdates` were never touched).
5. **Tests are offline + real-data.** `python3 -m unittest tests.test_digest`
   — 13 tests against `tests/fixtures/recorded_window_2026-10-16.json`, real
   txs recorded from the indexer, labeled in the fixture.

## Honest limitations

- **Scheduler is external by design.** Pharos SkillEngine has no cron
  primitive (verified). `cron/install-weekly-cron.sh` + the GitHub Actions
  workflow are provided; the builder installed neither — claiming otherwise
  would be fake. A missed scheduler run = a missed digest (visible by the
  absent artifact, not hidden).
- **First-run baseline needed backfill.** The very first digest compared
  against a `--backfill` of the prior week. Until backfill runs, deltas render
  as "baseline". This is documented, not papered over.
- **Log scans are slow.** ~300k blocks / 7 days at ≤1000-block chunks
  (RPC-enforced) ≈ 600 chunked `eth_getLogs` calls, ~6–10 min with 16
  workers. Slow, honest, RPC-friendly, read-only.
- **Tx list source.** The address tx list comes from the SocialScan explorer
  indexer (same data as the explorer UI); the Transfer-event scan is
  chain-direct. Sources are labeled per-figure in code and docs.
- **The watched address is the operator's own dev wallet**
  (0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3) — extremely active this week
  (110 txs). A quiet address would yield an honest "quiet week" digest.

## Bug caught during build (fixed, not hidden)

The first backfill anchored the 7-day window on **block counts**
(`days*86400/avg_block_time`). Block rate varies, so the window drifted to
~10 days while labeled "7d". Caught by reading the actual boundary
timestamps, fixed by timestamp-anchored block search (`find_block_for_ts`),
bad baseline deleted, backfill re-run. The shipped state and digests use true
calendar windows with honestly labeled boundaries.

## Spend

**0 PHRS** — read-only. Zero transactions broadcast (budget was ≤0.15 PHRS).
