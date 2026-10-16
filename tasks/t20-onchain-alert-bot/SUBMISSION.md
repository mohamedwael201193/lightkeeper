# SUBMISSION PACK — T20 On-Chain Alert Bot (copy-paste ready)

## Title

LIGHTKEEPER · T20 On-Chain Alert Bot — real Telegram alerts for Atlantic testnet transfers

## One-liner

A config-driven watcher that polls Pharos Atlantic block-by-block and delivers
each matching transfer to Telegram with tx hash + explorer link — exactly once
per event, proven on a real self-fired dust transfer.

## Description

T20 "On-Chain Alert Bot" (Easy, 50 pts) from the LIGHTKEEPER monorepo
("One lighthouse. Twenty-eight lamps.").

What it does:
- Watches configurable addresses on Atlantic testnet (chain 688689) with three
  alert conditions: incoming-transfer, large-transfer (≥ 0.5 PHRS), contract-interaction.
- Polls block-by-block with a 2-block confirmation lag; classifies every
  transaction via `src/match.sh`.
- Delivers each hit to a REAL Telegram channel via `sendMessage`: condition,
  watched address, amount in PHRS, tx hash, full explorer link, block number, timestamp.
- Never double-alerts: dedupe store keyed `<condition>:<txhash>` plus a
  write-ahead SENDING marker persisted BEFORE the Telegram send (crash-safe;
  Telegram has no idempotency key, so the safe direction is "never duplicate").

Live proof (all real, 2026-10-16):
- Trigger: real disclosed dust self-transfer 0.001 PHRS —
  https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084
  (block 31481424, status 0x1).
- Detection → Telegram alert, chat 1434154285, message_id 717 (04:19:24Z).
- Restart re-scan: no event alerted twice. Two further genuine transfers on the
  shared key were each alerted exactly once (message_ids 718, 719, 720, 722, 724, 725, 726).
- Unit tests: `test/match_test.sh` 16/16 PASS.
- Total spend: 0.000021000000021 PHRS (one dust tx; budget ≤ 0.15).

## Repo link (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/<commit>/tasks/t20-onchain-alert-bot

## Proof link

https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084

## Video link

PENDING-VIDEO

## Notes for the reviewer

Paste `REVIEWER_NOTES.md` verbatim:

---
A config-driven on-chain alert bot for Pharos Atlantic testnet: `src/watch.sh`
polls block-by-block (2-block confirmation lag), `src/match.sh` classifies each
transaction against three configurable conditions in `config.yaml`
(`incoming-transfer`, `large-transfer` ≥ 0.5 PHRS, `contract-interaction`), and
`src/alert.sh` delivers hits to a real Telegram channel via `sendMessage`.

Verify: (1) trigger tx https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084
(0.001 PHRS self-transfer, block 31481424, status 0x1); (2) repo folder above —
`evidence.md`/`evidence.json`; (3) Telegram chat 1434154285, message_id 717,
2026-10-16T04:19:24Z, alert carries condition + amount + tx hash + explorer link
+ block + timestamp (DMs have no public URL; message_id is the receipt);
(4) `state/alerts.log`: one SENDING + one SENT per txhash, no event alerted twice.

Run it: `set -a; source .env; set +a`, `bash test/match_test.sh` (16 tests),
`bash src/watch.sh --once`. Chain-ID 688689 asserted before any RPC work;
broadcasts via `flock /tmp/lk-nonce.lock`.

Honest notes: first `cast send` used `--json` (log-format only for cast send) —
tx broadcast fine, hash recovered by block scan; `src/trigger.sh` fixed.
Telegram has no idempotency key — write-ahead marker covers the crash case;
documented in README §7. `contract-interaction` is config-supported +
unit-tested; the live trigger exercised `incoming-transfer`.
---
