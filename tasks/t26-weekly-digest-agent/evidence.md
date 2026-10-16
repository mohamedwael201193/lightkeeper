# T26 — Evidence (real, 2026-10-16)

All figures below come from real chain reads on Pharos Atlantic testnet
(chain ID 688689). Nothing is mocked, estimated, or fabricated.

## The delivered digest (markdown)

```markdown
# Weekly Digest — 0xf76e…71a3

**Chain:** Pharos Atlantic testnet (688689) · **Window:** 2026-10-09 → 2026-10-16 (7d, blocks 31186577–31482619)
**Generated:** 2026-10-16T04:41:28.381171+00:00 · all figures from real chain reads

## Key metrics

| Metric | This week | Prev week | Δ |
|---|---|---|---|
| Transactions (total) | 110 | 0 | +110 (prev 0) |
|   ↳ sent | 109 | 0 | +109 (prev 0) |
|   ↳ received | 1 | 0 | +1 (prev 0) |
| Native in (PHRS) | 0.05 | 0 | +0.05 (prev 0) |
| Native out (PHRS) | 0.139866667 | 0 | +0.139867 (prev 0) |
| Gas spent (PHRS) | 0.022912577 | 0 | +0.0229126 (prev 0) |
| Contract creations | 25 | 0 | +25 (prev 0) |
| Failed txs | 7 | 0 | +7 (prev 0) |
| Token transfer events | 31 | 0 | +31 (prev 0) |

## TOP 3 notable events

_Deterministic rule-based ranking: failed tx (100) > contract creation (50) > large native ≥0.05 PHRS (40) > token transfer (25) > contract interaction (10) > plain transfer (5); ties → newest block._

1. **[FAILED TX]** tx 0x91f7e02125… reverted/failed (receipt_status=0) in block 31482534
2. **[FAILED TX]** tx 0x31993dc871… reverted/failed (receipt_status=0) in block 31482265
3. **[FAILED TX]** tx 0x1a968603d0… reverted/failed (receipt_status=0) in block 31482202

## Method breakdown (sent txs)

- Contract Creation: 25
- Transfer: 24
- Approve: 11
- Deposit: 8
- 0x6246a83c: 6
- Lock: 4
- Distribute Native: 4
- Execute: 3
- Burn: 3
- Refund: 2
- Ping: 2
- Swap: 2
- Boom: 2
- Borrow: 2
- Mint: 2
- 0xcba2a316: 2
- Supply: 1
- Repay: 1
- 0x: 1
- Set Price: 1
- Settle: 1
- 0xfc291d0f: 1
- Zap: 1

_Sources: chain-direct eth_getLogs (≤1000-block chunks) + explorer indexer API. State: state.json._
```

## The delivered Telegram message (exact text sent)

```
📊 Weekly Digest — 0xf76e…71a3
Atlantic testnet · 2026-10-09 → 2026-10-16

Txs: 110 (+110 (prev 0))
Sent: 109 · Received: 1
Native in/out: 0.05/0.139866667 PHRS
Gas spent: 0.022912577 PHRS
Creations: 25 · Failed: 7 · Token xfers: 31

TOP 3 notable:
1. [FAILED TX] tx 0x91f7e02125… reverted/failed (receipt_status=0) in block 31482534
2. [FAILED TX] tx 0x31993dc871… reverted/failed (receipt_status=0) in block 31482265
3. [FAILED TX] tx 0x1a968603d0… reverted/failed (receipt_status=0) in block 31482202

Full digest: see LIGHTKEEPER t26 deliverable.
```

## Delivery receipt

- **Channel:** Telegram, chat `1434154285`, bot `@OctaneShift_Bot` (validated via `getMe`)
- **Telegram `message_id`: `723`**
- Delivered at 2026-10-16T04:42:11Z — exactly ONE `sendMessage` was sent.
  The bot has an active webhook; `setWebhook`/`deleteWebhook`/`getUpdates`
  were never called.
- Machine-readable: `evidence.json` (digest text, block range, message_id,
  all 110 tx hashes, deltas, spend).

## Two consecutive digests with deltas (official evidence)

1. **Previous window** `digests/digest-previous-baseline.md` — 2026-09-29 →
   2026-10-09, blocks 30787947–31180502: **0 txs, 0 token events** (honest
   quiet baseline from real chain history via `--backfill`).
2. **Current window** `digests/digest-2026-10-16.md` — 2026-10-09 →
   2026-10-16, blocks 31186577–31482619: **110 txs** with every metric
   delta'd against the real baseline above.

## How the numbers were produced

- Window anchored on real block timestamps (`eth_getBlockByNumber`), not
  block counts — a true calendar 7-day window.
- Tx list: paginated explorer indexer API (131 txs fetched, 110 inside the
  window by timestamp).
- Token events: chain-direct `eth_getLogs`, ≤1000-block chunks (RPC-enforced),
  786 chunks (previous window) + ~604 chunks (current), from/to topic filters,
  deduped — 31 unique `Transfer` events; amounts decoded with on-chain
  `decimals()`/`symbol()`.
- Chain id asserted 688689 on every run.

## Spend

**0 PHRS.** Read-only: zero transactions broadcast. Only RPC reads, explorer
API calls, and one Telegram `sendMessage`. (Budget was ≤0.15 PHRS.)

## Links (all curl-verified 2026-10-16)

- Explorer address page: https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
- Failed tx #1: https://atlantic.pharosscan.xyz/tx/0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05
- Deliverable (commit-pinned after commit): see SUBMISSION.md
