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
[2026-10-16T04:19:24Z] ALERT SENT cond=incoming-transfer tx=0xe6c9f52c... block=31481424 amount=0.001000000000000000PHRS message_id=717
[2026-10-16T04:20:02Z] scan pass done; cursor=31481431
```

(Verbatim from `logs/watch.log` — note the unstripped `0.001000000000000000`
amount; the trailing-zero strip was silently broken at the time and is fixed
in §7, so newer alerts render as `0.5 PHRS`.)

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
> **Amount:** 0.001 PHRS *(the real delivered message showed the unstripped
> `0.001000000000000000` — formatting fixed in §7; the large-transfer alert
> below renders the clean form)*
> **Tx:** `0xe6c9f52c…`
> **Explorer:** https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084
> **Block:** 31481424
> **Time:** 2026-10-16T04:19:24Z
> Atlantic testnet · chain 688689 · disclosed self-test dust transfer

Exactly ONE alert was sent per event — no spam, no duplicates.

The large-transfer alert (message_id 728, verbatim body modulo timestamp):

> 🚨 **LIGHTKEEPER · T20 On-Chain Alert**
> **Condition:** LARGE TRANSFER
> **Watched:** `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`
> **Amount:** 0.5 PHRS
> **Tx:** `0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a`
> **Explorer:** https://atlantic.pharosscan.xyz/tx/0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a
> **Block:** 31486611
> **Time:** 2026-10-16T06:51:50Z
> Atlantic testnet · chain 688689 · disclosed self-test transfer

**Honest footnote:** the restart scan caught seven *additional* genuine events —
`0xc9270686…` (block 31481475, 0.001 PHRS, message_id 718) and `0xeec25b53…`
(block 31481497, 0.0005 PHRS, message_id 719) and `0xcff6be41…` (block 31481530, 0.001 PHRS, message_id 720) and `0x1c9d62c6…` (block 31481582, 0.00001 PHRS, message_id 722), `0x1c8c6537…` (block 31481636, 0.00001 PHRS, message_id 724), `0xe6ca0c8e…` (block 31481647, 0.0001 PHRS, message_id 725) and `0x587ed9d3…` (block 31481673, 0.0001 PHRS, message_id 726). Both are real self-transfers by
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
for the original trigger `0xe6c9f52c…` which was *not* re-emitted. The further
alerts (718, 719, 720, 722, 724, 725, 726) were for genuinely new events, each alerted exactly once.

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
| Large-transfer trigger tx `0x157dc990…` (21,000 gas @ 1,000,000,001 wei) | 0.000021000000021 |
| **Total** | **0.000042000000042** (budget ≤ 0.15 ✓) |

Both transfers were self-transfers (funds returned to the same wallet); only
gas was spent. All values from the live receipts; nonce safety via
`flock /tmp/lk-nonce.lock` on every broadcast (28 workers share one key).

## 7. Second live run — large-transfer proven on-chain (2026-10-16)

The unit tests covered the `large-transfer` threshold, but the live trigger had
only ever exercised `incoming-transfer`. Closed that gap with a second real run:

- **Trigger:** `bash src/trigger.sh --amount-phrs 0.5` → tx
  [`0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a`](https://atlantic.pharosscan.xyz/tx/0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a)
  — 0.5 PHRS self-transfer, block **31486611**, status 0x1.
- **Detection:** `bash src/watch.sh --once --from-block 31486611 --to-block 31486611`
  (targeted scan) matched **two** conditions for the one tx:
  `incoming-transfer` (0.5 > 0) and `large-transfer` (0.5 ≥ 0.5 threshold).
- **Delivery:** two real Telegram `sendMessage` calls —
  `incoming-transfer` → **message_id 727**, `large-transfer` → **message_id 728**
  (2026-10-16T06:51:49Z/50Z), each alerted exactly once. One tx firing two
  conditions is by design, not spam: dedupe is per `<condition>:<txhash>` and
  the condition is printed in the alert body itself.
- **Formatting fix along the way:** alerts previously rendered amounts as
  `0.001000000000000000` — the trailing-zero strip used `\(...\)` grouping
  inside `sed -E` (where parens must be unescaped), so it silently never fired.
  Fixed in `src/watch.sh`; the new alerts render cleanly as `0.5 PHRS`.
- **Trigger-hash parsing fix:** `src/trigger.sh` used to take the first
  `0x{64}` in cast's output as the tx hash — but cast prints `blockHash`
  first, so it recorded the *block* hash. It now parses the `transactionHash`
  line specifically. (The tx itself always broadcast fine.)

## 8. The self-verifying ledger — `src/audit.sh` (the differentiator)

Every alert the bot ever sent is re-checkable against the live chain:

```bash
bash src/audit.sh
```

For each SENT alert it verifies: (1) exactly one SENDING marker precedes the
SENT (write-ahead ordering, no duplicates); (2) the dedupe key is in
`state/seen`; (3) the tx exists on-chain with receipt status 0x1; (4) the
recipient and block match the claim; (5) the value satisfies the condition's
semantics; (6) the live matcher (`src/match.sh`) re-confirms the condition from
the on-chain fields.

Latest run: **210 PASS, 0 FAIL** (2026-10-16T07:27:32Z) across all 35 alerts
(717–728 plus 25 gap/live-scan alerts, message_ids up to 753). Any mismatch
fails loudly and exits non-zero — the alert ledger is an append-only receipt
book, not a log.

**Honest footnote:** the audit itself had a real flake — piping `match_tx`
straight into `grep -q` is a SIGPIPE race (grep exits on the first match and
closes the pipe while the matcher is still writing; under `pipefail` the check
fails). It failed two full runs on the same entry before the cause was found
via exit code 141. Fixed by capturing the matcher output first, then grepping
the variable; the `grep | head -1` line-number lookups became `grep -m1` for
the same reason.

## 9. Catchup mode — fast resume after an outage

`bash src/watch.sh --catchup` scans a gap with batched
`eth_getBlockByNumber` fetches (25 blocks per request, `src/batchscan.py`)
instead of one `cast block` per block (~2s each). Same matching, same dedupe,
same write-ahead alerting — only the fetch is batched. Used to backfill the
31482005..31486610 gap after the ~7h watcher outage: 4,606 blocks in ~8
minutes, 18 genuine gap events found and each alerted exactly once
(message_ids 729–746), zero duplicate keys. A second catchup covered
31486939..31488130 in ~80 seconds (the per-block `--once` path would have
needed ~40 minutes for the same range). Cursor advances per block and only
a final `done` sentinel marks the pass complete.
