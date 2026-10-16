# Reviewer notes — T20 On-Chain Alert Bot (paste-ready)

## What was built

A config-driven on-chain alert bot for Pharos Atlantic testnet: `src/watch.sh`
polls block-by-block (2-block confirmation lag), `src/match.sh` classifies each
transaction against three configurable conditions in `config.yaml`
(`incoming-transfer`, `large-transfer` ≥ 0.5 PHRS, `contract-interaction`), and
`src/alert.sh` delivers hits to a real Telegram channel via `sendMessage`.

## How to verify (no login needed)

1. **Trigger tx (real, on-chain):**
   https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084
   — 0.001 PHRS self-transfer by `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`, block 31481424, status 0x1.
2. **Repo:** `https://github.com/mohamedwael201193/lightkeeper/tree/<commit>/tasks/t20-onchain-alert-bot`
   — read `evidence.md` (narrative) and `evidence.json` (machine-readable).
3. **Alert delivery:** Telegram chat `1434154285`, message_id **717** (my disclosed
   dust trigger), sent 2026-10-16T04:19:24Z. The alert body contains: condition,
   watched address, amount (0.001 PHRS), tx hash, full explorer link, block
   number, timestamp.
   (Telegram DMs have no public URL — message_id is the delivery receipt.)
   Seven further genuine events on the shared key were each alerted exactly once
   (message_ids 718, 719, 720, 722, 724, 725, 726) — observed, not staged.
4. **Threshold proven live:** a second disclosed self-transfer of 0.5 PHRS —
   https://atlantic.pharosscan.xyz/tx/0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a
   (block 31486611, status 0x1) — tripped `large-transfer` for the first time
   on-chain. The watcher matched both `incoming-transfer` and `large-transfer`
   and sent exactly one alert per condition (message_ids 727, 728). Dedupe is
   per `<condition>:<txhash>`; two conditions on one tx is by design, not spam.
5. **Self-verifying ledger:** `bash src/audit.sh` replays every SENT alert
   against the live chain (recipient, value, block, matcher re-verdict) —
   latest run **168 PASS, 0 FAIL** (2026-10-16T07:14:34Z) across all 28 alerts.
6. **No-repeat-spam:** the watcher was restarted after delivery and re-scanned
   hundreds of blocks; `state/alerts.log` shows exactly one SENDING + one SENT
   per txhash — no event was ever alerted twice, including the original trigger.

## How to run it yourself

```bash
set -a; source .env; set +a          # TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t20-onchain-alert-bot
bash test/match_test.sh              # 16 unit tests, ~1s
bash src/watch.sh --once             # scans from saved cursor, alerts on hits
bash src/watch.sh --catchup          # batched resume scan after an outage
bash src/audit.sh                    # replay the alert ledger against the chain
```

Chain-ID assertion (688689) runs before any RPC work; broadcasts use
`flock /tmp/lk-nonce.lock`.

## What broke / honest notes

- First `cast send` used `--json`, which for `cast send` only formats *log
  lines* as JSON (no machine-readable receipt) — the tx broadcast fine, but the
  hash had to be recovered by scanning blocks. `src/trigger.sh` now parses
  cast's real output. Documented in `evidence.md`.
- Telegram `sendMessage` has no idempotency key: the write-ahead SENDING marker
  covers the crash case (never re-send); a lost-success-response retry could
  theoretically double-send. Documented in README §7, not hidden.
- Two real bugs were found and fixed during the 2026-10-16 hardening pass:
  `src/trigger.sh` recorded cast's `blockHash` as the tx hash (now parses the
  `transactionHash` line), and alert amounts rendered `0.001000000000000000`
  (the trailing-zero strip used `\(...\)` inside `sed -E`, where grouping
  parens must be unescaped). Both documented in `evidence.md` §7.
- `contract-interaction` is config-supported and unit-tested; live runs
  exercised `incoming-transfer` + `large-transfer` (the honest real events).

## Requirement coverage

1. ≥1 configurable alert condition — **3 in `config.yaml`** ✓
2. Real channel (Telegram) — **message_id 717** ✓
3. Alert has what + value + tx/explorer link — **yes, all fields** ✓
4. No repeat spam — **dedupe + write-ahead marker + restart run with zero re-emission** ✓
