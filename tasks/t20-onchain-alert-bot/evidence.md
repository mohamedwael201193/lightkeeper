# T20 On-Chain Alert Bot — Evidence

**Task:** T20 "On-Chain Alert Bot" (Easy, 50 pts, Trading / Monitoring) · **Network:** Atlantic testnet (chain ID 688689, native PHRS) · **Date:** 2026-10-16

Everything below is real: a genuine on-chain dust transfer I fired myself, a real watcher detection, and a real Telegram delivery. No mocks, no fabricated triggers.

## 1. The trigger — a REAL on-chain event

I fired a disclosed self-test dust transfer from the deployer wallet to itself
(the watched address):

- **Tx hash:** `0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084`
- **Explorer:** https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084 (curl-verified HTTP 200)
- **Block:** 31481424 · **Status:** 0x1 (success)
- **From → To:** `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` → itself
- **Value:** 0.001 PHRS (1,000,000,000,000,000 wei) — dust
- **Gas:** 21,000 @ 1,000,000,001 wei → **0.000021000000021 PHRS** total spend (≤ 0.15 budget)

One honest wrinkle, documented: the first `cast send` used `--json`, which for
`cast send` only formats *log lines* as JSON (no machine-readable receipt), so the
hash had to be recovered by scanning blocks — the transaction itself broadcast
fine and mined at block 31481424. `src/trigger.sh` now parses cast's real output.

## 2. The detection — watcher log

`src/watch.sh --once --from-block 31481424 --to-block 31481430` (chain-ID asserted
688689 via live `eth_chainId` before any work):

```
[2026-10-16T04:19:01Z] scan pass: blocks 31481424..31481430
[2026-10-16T04:19:24Z] ALERT SENT cond=incoming-transfer tx=0xe6c9f52c... block=31481424 amount=0.001PHRS message_id=717
[2026-10-16T04:20:02Z] scan pass done; cursor=31481431
```

The matcher (`src/match.sh`) classified the transaction as `incoming-transfer`
(native PHRS into a watched address, value > 0). It correctly did NOT fire
`large-transfer` (0.001 < 0.5 PHRS threshold) — the threshold logic from the unit
tests held on the live event.

## 3. The delivery — real Telegram alerts

- **Channel:** Telegram `sendMessage` (bot `OctaneShift_Bot`, token validated via `getMe`, env-only)
- **Chat:** `1434154285`
- **My disclosed test trigger** → **message_id 717**, delivered 2026-10-16T04:19:24Z
- **Alert body** (HTML, clickable explorer link):

> 🚨 **LIGHTKEEPER · T20 On-Chain Alert**
> **Condition:** INCOMING TRANSFER
> **Watched:** `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`
> **Amount:** 0.001 PHRS
> **Tx:** `0xe6c9f52c…`
> **Explorer:** https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084
> **Block:** 31481424
> **Time:** 2026-10-16T04:19:24Z
> Atlantic testnet · chain 688689 · disclosed self-test dust transfer

Exactly ONE alert was sent per event — no spam, no duplicates.

**Honest footnote:** the restart scan caught four *additional* genuine events —
`0xc9270686…` (block 31481475, 0.001 PHRS, message_id 718) and `0xeec25b53…`
(block 31481497, 0.0005 PHRS, message_id 719) and `0xcff6be41…` (block 31481530, 0.001 PHRS, message_id 720) and `0x1c9d62c6…` (block 31481582, 0.00001 PHRS, message_id 722). Both are real self-transfers by
*other workers* sharing the deployer key (verified via `cast tx`/`cast receipt`:
from = to = watched address, status 0x1). The watcher alerted on each exactly
once, as designed — it does not know or care who fired the transaction. These
are documented as observed genuine events, not as my test trigger.

## 4. No-repeat-spam — restart dedup (requirement 4)

Design (per the QA fix): dedupe store `state/seen` keyed `<condition>:<txhash>`;
a **write-ahead `SENDING` marker is persisted to `state/alerts.log` BEFORE the
Telegram send**; a crash between send and the `SENT` write is recovered at
startup by treating the event as delivered (never re-sent — `sendMessage` has no
idempotency key, so the safe direction is "never duplicate").

Live proof: the watcher was restarted (fresh process, cursor 31481431) and
scanned hundreds of newer blocks. Result: **no event was ever alerted twice** —
`state/alerts.log` shows exactly one SENDING + one SENT per txhash, including
for the original trigger `0xe6c9f52c…` which was *not* re-emitted. The three extra
alerts (718, 719, 720, 722) were for genuinely new events, each alerted exactly once.

## 5. Tests

- **Unit:** `test/match_test.sh` — 16/16 PASS. Covers incoming detection,
  large-transfer threshold (above / at / below), unrelated address, watched
  contract interaction, contract creation (`to` empty), zero-value exclusion,
  checksum-case matching, 256-bit-safe `ge_wei`, and `config.yaml` parsing.
  These use synthetic fixtures only — they verify logic, they are not live evidence.
- **Live:** trigger → detection → Telegram alert (this document).

## 6. Spend log

| Item | PHRS |
|---|---|
| Dust trigger tx `0xe6c9f52c…` (21,000 gas @ 1,000,000,001 wei) | 0.000021000000021 |
| **Total** | **0.000021000000021** (budget ≤ 0.15 ✓) |

All values from the live receipt; nonce safety via `flock /tmp/lk-nonce.lock` on
every broadcast (28 workers share one key).
