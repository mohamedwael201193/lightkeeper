<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:12px;">
<h1 style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;letter-spacing:0.35em;font-size:40px;margin:0;">T26 · WEEKLY DIGEST</h1>
<p style="color:#f4f6ff;font-style:italic;font-size:18px;margin:16px 0 0;">The keeper counts the week's ripples before the tide takes them.</p>
<p style="color:#b9c2f5;font-size:13px;margin:12px 0 0;">LIGHTKEEPER · Lamp 26 of 28 · Pharos Agent Arena · Medium · 100 pts · Atlantic testnet</p>
</div>

## 1 · The 30-second verdict

A weekly digest agent that compiles **real on-chain activity** for a watched
address over a real 7-day block window — tx count, native volume in/out, gas
spent, ERC20 Transfer events via chain-direct `eth_getLogs` — diffs it against
a persisted previous-period snapshot, ranks a deterministic **TOP 3** of notable
events, and delivers the digest to a **real Telegram channel** with the returned
`message_id` as the delivery receipt.

**Live evidence (2026-10-16):** digest built over blocks 31186577–31482619
(2026-10-09 → 2026-10-16): **110 txs** (109 sent /
1 received), **0.05 PHRS in / 0.139866667 PHRS out**,
**0.022912577 PHRS gas**, 25 contract creations, 7 failed,
31 token-transfer events — delivered to Telegram, `message_id`
**723**. Previous window (2026-09-29 → 2026-10-09): 0 txs —
every delta in the digest is real data vs real data.

## 2 · How it works

```
--backfill → --run → --deliver
```

1. **`--backfill`** — builds the *previous* window digest from real chain
   history and persists it as the baseline snapshot in `state/state.json`.
   This is the honest first-run bootstrap: the comparison is real data, not a
   fabricated baseline.
2. **`--run`** — measures the chain head, anchors a true calendar 7-day
   window on real block timestamps, collects metrics, diffs against the
   baseline, renders `digests/digest-<date>.md` + the Telegram short version.
   Renders only the `T26_SECTIONS` blocks (default: all six —
   `top3,volume,gas,whales,tokens,failed`); the same env var the console's
   section picker writes.
3. **`--deliver`** — validates the bot token with `getMe`, sends **one**
   `sendMessage`, records the returned `message_id` in `state.json` and
   `evidence.json`. That id is the delivery receipt.

No mocks, no placeholders, no fake success anywhere: if a data source fails,
the run fails loudly.

## 3 · Data sources & honesty

| Source | What it provides | How |
|---|---|---|
| Chain-direct `eth_getLogs` | ERC20 `Transfer` events involving the address | Chunked to ≤1000 blocks (the RPC itself enforces this limit), from-side + to-side topic filters, parallel workers, deduped by (blockHash, logIndex) |
| Explorer indexer API (`api.socialscan.io/…/v1/explorer`) | Address tx list: hash, from/to, value, fee, gas, method, receipt status, timestamps | Paginated fetch, filtered to the window by real block timestamps — the same data the PharosScan frontend shows |
| `eth_getBlockByNumber` | Honest window boundaries | The window is anchored on real timestamps (block rate varies; a pure block-count window drifts off-calendar) |
| `state/state.json` | Previous-period snapshot | Explicit current-vs-previous deltas with Δ and %; empty baseline renders as "prev 0", never a division trick |

Token amounts are decoded with `decimals()`/`symbol()` read from the token
contract itself via `eth_call`. Chain id is asserted `688689` (Atlantic) on
every run — the agent refuses to run anywhere else.

## 4 · Scheduling (external — no SkillEngine cron)

Pharos SkillEngine exposes **no cron primitive** (verified; see
`LIGHTKEEPER-VERDICT.md` precision patches). This skill does not schedule
itself. Two operator-run options are provided; the builder installs **neither**:

- `cron/install-weekly-cron.sh` — installs a Monday-08:00-local crontab entry
  (`--run` then `--deliver`, logs to `cron/digest-cron.log`). Interactive by
  default; `--remove` to uninstall.
- `cron/weekly-digest.github.yml` — copy to `.github/workflows/` for a
  GitHub Actions schedule (same Monday cadence, secrets via repo settings).

`WINDOW_DAYS` env makes the cadence configurable (weekly default).

## 5 · Usage

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a   # never commit .env
cd ~/workspace/lightkeeper/tasks/t26-weekly-digest-agent

python3 src/digest.py --backfill   # once: real previous-window baseline -> state.json
python3 src/digest.py --run        # weekly: current digest + deltas -> digests/
python3 src/digest.py --deliver    # weekly: ONE Telegram sendMessage -> message_id receipt

python3 -m unittest tests.test_digest   # 13 offline tests, recorded REAL fixture
```

Read-only: the agent broadcasts **zero** transactions. Chain spend: 0 PHRS.

## 6 · Configuration

| Env | Required | Default |
|---|---|---|
| `WATCH_ADDRESS` | no | `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` |
| `ATLANTIC_RPC_URL` | no | `https://atlantic.dplabs-internal.com` |
| `WINDOW_DAYS` | no | `7` |
| `T26_SECTIONS` | no | all of `top3,volume,gas,whales,tokens,failed` — the agent renders only the listed blocks (unknown ids fail loudly) |
| `T26_LOG_WORKERS` | no | `16` (parallel log-chunk fetchers) |
| `TELEGRAM_BOT_TOKEN` | yes, for `--deliver` | — (env only, never in repo/logs) |
| `TELEGRAM_CHAT_ID` | yes, for `--deliver` | — |

Secrets are read from the environment only. They never appear in code,
README, logs, evidence, or git history.

## 7 · Evidence

- `digests/digest-previous-baseline.md` — previous-window digest (real backfill).
- `digests/digest-2026-10-16.md` — current digest with previous-period deltas + TOP 3.
- `digests/digest-2026-10-16.telegram.txt` — the exact text delivered.
- `evidence.md` / `evidence.json` — full digest text, block range, Telegram
  `message_id` **723**, all links curl-verified.
- `state/state.json` — persisted baseline snapshot + delivery history.
- `tests/fixtures/recorded_window_2026-10-16.json` — real recorded chain data
  backing the 13 unit tests (labeled).

Spend: **0 PHRS** (read-only; no transactions broadcast).

## 8 · Limits & risks

- **Scheduler reliability** (per official risks): the skill runs when the
  external scheduler runs it. Monitor the cron log / Actions runs; a missed
  Monday means a missed digest, surfaced honestly by the absent artifact.
- **First-run baseline**: the very first digest has no previous period — the
  `--backfill` step exists precisely so the comparison is real history, and
  until it runs the digest labels deltas "baseline".
- **RPC log-scan speed**: a 7-day window is ~300k blocks; the ≤1000-block
  chunk rule means ~600 chunked `eth_getLogs` calls (~5–10 min with 16
  workers). Slow but honest and RPC-friendly (read-only).
- **Quiet weeks**: an inactive address yields an honest "quiet week" digest —
  zeros and "no notable events", never invented activity.
- **Explorer indexer**: the tx list comes from the SocialScan indexer (same
  source as the explorer UI); the log scan is chain-direct. If the indexer
  lags, the digest says which source each figure came from.
