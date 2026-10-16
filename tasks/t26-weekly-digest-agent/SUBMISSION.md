# T26 — Arena Submission Pack (copy-paste ready)

## Title

Weekly Digest Agent — T26 (LIGHTKEEPER)

## One-liner

A weekly on-chain digest agent for Pharos Atlantic: real 7-day activity
(txs, volume, gas, token events) with previous-period deltas and a
deterministic TOP 3, delivered to a real Telegram channel.

## Description

T26 builds a weekly digest for a watched address on Pharos Atlantic testnet
(chain 688689) from REAL chain reads: tx count, native volume in/out, gas
spent, and ERC20 Transfer events via chain-direct `eth_getLogs` chunked to
≤1000 blocks (the RPC's own limit). The current 7-day window — anchored on
real block timestamps — is diffed against a persisted previous-period
snapshot (`state.json`, seeded by an honest historical `--backfill`), and a
deterministic rule-based ranker picks the TOP 3 notable events (failed tx >
contract creation > large transfer > token transfer > interaction).

Delivery is to a REAL Telegram channel: one `sendMessage`, with the returned
`message_id` 723 as the receipt. Live evidence (2026-10-16): 110 txs
(109 sent / 1 received), 0.05 PHRS in / 0.139866667 out, 0.022912577 PHRS gas,
25 contract creations, 7 failed txs, 31 token-transfer events — all delta'd
against a real quiet baseline week (0 txs). Read-only: 0 PHRS spent, zero
transactions broadcast. Scheduling is external (cron installer + GitHub
Actions workflow provided) — Pharos SkillEngine has no cron primitive, and
this is documented honestly rather than faked.

## Links

- Code (commit-pinned):
  https://github.com/mohamedwael201193/lightkeeper/tree/8f2fcf6d657a45aa1c851d0a05809e1b8ab1cff6/tasks/t26-weekly-digest-agent
- Live evidence: `evidence.md` + `evidence.json` in the folder above
  (digest text, block range 31186577–31482619, Telegram message_id 723)
- Explorer (watched address):
  https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
- Demo video: PENDING-VIDEO

## How to run (reviewer)

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a
cd tasks/t26-weekly-digest-agent
python3 src/digest.py --backfill   # previous-window baseline -> state.json
python3 src/digest.py --run        # current digest + deltas -> digests/
python3 src/digest.py --deliver    # ONE Telegram sendMessage
python3 -m unittest tests.test_digest
```
