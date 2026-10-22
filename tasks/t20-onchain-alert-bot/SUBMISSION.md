# SUBMISSION PACK — T20 On-Chain Alert Bot (copy-paste ready)

## Title

LIGHTKEEPER · T20 On-Chain Alert Bot — real Telegram alerts for Atlantic testnet transfers

## One-liner

A config-driven watcher that polls Pharos Atlantic block-by-block and delivers
each matching transfer to Telegram with tx hash + explorer link — exactly once
per event, proven on real self-fired transfers (dust + a 0.5 PHRS threshold trip).

## Description

T20 "On-Chain Alert Bot" (Easy, 50 pts) from the LIGHTKEEPER monorepo
("One lighthouse. Thirty lamps.").

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
- Threshold proven live: a second disclosed self-transfer of 0.5 PHRS —
  https://atlantic.pharosscan.xyz/tx/0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a
  (block 31486611, status 0x1) — tripped `large-transfer` for the first time
  on-chain. The watcher matched both `incoming-transfer` and `large-transfer`
  and sent exactly one alert per condition (message_ids 727, 728). Dedupe is
  per `<condition>:<txhash>`; the condition is printed in the alert body.
- Restart re-scan: no event alerted twice. Seven further genuine transfers on
  the shared key were each alerted exactly once (message_ids 718, 719, 720,
  722, 724, 725, 726).
- Self-verifying ledger: `src/audit.sh` replays every SENT alert against the
  live chain (recipient, value, block, matcher re-verdict) — latest run
  **210 PASS, 0 FAIL** (2026-10-16T07:27:32Z). Every alert carries its own receipt.
- Unit tests: `test/match_test.sh` 16/16 PASS.
- Total spend: 0.000042000000042 PHRS (two txs, gas only; budget ≤ 0.15).

## Repo link (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/bd2b759ee66c8240778d6a7052d914c99759ba6f/tasks/t20-onchain-alert-bot

## Proof link

https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084

## Video link

PENDING-VIDEO

## Console try surface (Tier C builder)

The LIGHTKEEPER console ships an interactive rule builder for this task:
`apps/console/src/components/try/onchain-alert-bot.tsx`, live at
`https://lightkeeper-console.vercel.app/#/task/onchain-alert-bot`.

"Alerts in 60 seconds": toggle the three alert conditions, set the
large-transfer threshold, point at a watched address — the page generates the
exact `config.yaml` + the `test/match_test.sh` → `watch.sh --once` →
`watch.sh --daemon` → `src/audit.sh` run commands, copy-paste ready. The same
panel explains the delivery guarantee (write-ahead SENDING ledger, crash-safe
never-duplicate, per-`condition:txhash` dedupe), shows the real threshold-trip
alert verbatim (message_ids 727/728, tx `0x157dc990…` block 31486611), and the
ledger audit result (210 PASS, 0 FAIL). Differentiator: from rule to running
watcher in one copy-paste — and every alert carries its own on-chain receipt.
Tier C honest: the console never signs and never sends Telegram messages —
config only, run in your own terminal with your own bot token.

## Notes for the reviewer

Reviewer notes — paste the following verbatim:

---
A config-driven on-chain alert bot for Pharos Atlantic testnet: `src/watch.sh`
polls block-by-block (2-block confirmation lag), `src/match.sh` classifies each
transaction against three configurable conditions in `config.yaml`
(`incoming-transfer`, `large-transfer` ≥ 0.5 PHRS, `contract-interaction`), and
`src/alert.sh` delivers hits to a real Telegram channel via `sendMessage`.

Verify: (1) trigger tx https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084
(0.001 PHRS self-transfer, block 31481424, status 0x1); (1b) threshold trigger
https://atlantic.pharosscan.xyz/tx/0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a
(0.5 PHRS self-transfer, block 31486611, status 0x1 — first live large-transfer);
(2) repo folder above — `evidence.md`/`evidence.json`; (3) Telegram chat 1434154285,
message_ids 717 (dust trigger), 727 + 728 (threshold trigger, one per condition),
2026-10-16, alerts carry condition + amount + tx hash + explorer link + block +
timestamp (DMs have no public URL; message_id is the receipt); (4) `bash src/audit.sh`
— latest run 210 PASS, 0 FAIL across all 35 alerts (recipient, value, block,
matcher re-verified on the live chain); (5) `state/alerts.log`: one SENDING +
one SENT per txhash, no event alerted twice.

Run it: `set -a; source .env; set +a`, `bash test/match_test.sh` (16 tests),
`bash src/watch.sh --once`, `bash src/audit.sh`. Chain-ID 688689 asserted before any RPC work;
broadcasts via `flock /tmp/lk-nonce.lock`.

Honest notes: first `cast send` used `--json` (log-format only for cast send) —
tx broadcast fine, hash recovered by block scan; `src/trigger.sh` later had a
blockHash-vs-transactionHash parsing bug (recorded the block hash as the tx) —
fixed to parse the `transactionHash` line. Telegram has no idempotency key —
write-ahead marker covers the crash case; documented in README §7.
`contract-interaction` is config-supported + unit-tested; live triggers
exercised `incoming-transfer` and `large-transfer`.
---
