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
   test trigger), sent 2026-10-16T04:19:24Z. The alert body contains: condition,
   watched address, amount (0.001 PHRS), tx hash, full explorer link, block
   number, timestamp.
   (Telegram DMs have no public URL — message_id is the delivery receipt.)
   Two further genuine events on the shared key were each alerted exactly once
   (message_ids 718, 719, 720, 722) — observed, not staged.
4. **No-repeat-spam:** the watcher was restarted after delivery and re-scanned
   hundreds of blocks; `state/alerts.log` shows exactly one SENDING + one SENT
   per txhash — no event was ever alerted twice, including the original trigger.

## How to run it yourself

```bash
set -a; source .env; set +a          # TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t20-onchain-alert-bot
bash test/match_test.sh              # 16 unit tests, ~1s
bash src/watch.sh --once             # scans from saved cursor, alerts on hits
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
- `contract-interaction` is config-supported and unit-tested; the live trigger
  exercised `incoming-transfer` (the honest, minimal real event).

## Requirement coverage

1. ≥1 configurable alert condition — **3 in `config.yaml`** ✓
2. Real channel (Telegram) — **message_id 717** ✓
3. Alert has what + value + tx/explorer link — **yes, all fields** ✓
4. No repeat spam — **dedupe + write-ahead marker + restart run with zero re-emission** ✓
