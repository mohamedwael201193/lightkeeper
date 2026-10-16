<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:12px;">
<h1 style="font-family:Georgia,serif;color:#d9a821;letter-spacing:0.35em;">LIGHTKEEPER</h1>
<p style="font-family:Georgia,serif;color:#e8c766;font-style:italic;">One lighthouse. Twenty-eight lamps. One octopus to tend them.</p>
<p style="color:#b9c2f5;">T02 · Event/Log Monitor · the second lamp is lit</p>
</div>

# T02 — Event/Log Monitor

**Live on Atlantic testnet (chain 688689).** A persistent, reorg-tolerant event monitor
for a purpose-deployed emitter contract — it polls chunked `eth_getLogs`, decodes every
event into readable fields, never duplicates, and survives a `kill -9` without re-emission.

---

## 1. What it is

A Python monitor (`monitor.py`) watching the on-chain `LogEmitter` contract at
`0x2C1dB0C436B72D94a4112f321DFbD13a976D8831`. It scans block ranges with `cast logs`
(chunked ≤1,000 blocks per call), filters by address + topic0 (computed from the event
signature at runtime — never hardcoded), decodes indexed topics and ABI data into
readable fields (`from`, `value`, `note` …), and appends alerts to `alerts.jsonl` with
block number, tx hash, and log index.

## 2. The contract

`src/LogEmitter.sol` — minimal, dust-only emitter, deployed 2026-10-16 on Atlantic:

| Event | Fields |
|---|---|
| `Ping(address indexed from, uint256 value, string note)` | keepalive pings |
| `Zap(address indexed sender, address indexed target, uint256 amount)` | double-indexed signal |
| `Marker(uint256 indexed id, bytes32 tag, bytes payload)` | tagged payloads |

Deploy tx: `0x5ee42464c060dc4e23f270ead85128516454fbbc3bf64c3b0b78c565049044cf`
(block 31481148).
Explorer: https://atlantic.pharosscan.xyz/address/0x2C1dB0C436B72D94a4112f321DFbD13a976D8831

## 3. How to run

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a   # ATLANTIC_RPC_URL only
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t02-event-log-monitor

# print the three topic0 signatures (computed, not hardcoded)
LOGEMITTER_ADDR=0x2C1dB0C436B72D94a4112f321DFbD13a976D8831 python3 monitor.py topics

# continuous poller (8s cycles; cursor persists in state.json)
LOGEMITTER_ADDR=0x2C1dB0C436B72D94a4112f321DFbD13a976D8831 python3 monitor.py run

# deterministic test: scan a known range, assert exact events found
LOGEMITTER_ADDR=0x2C1dB0C436B72D94a4112f321DFbD13a976D8831 \
  python3 monitor.py test --from-block=31481148 --to-block=<tip> --expect=Ping,Ping,Zap,Marker
```

State files: `state.json` (cursor + seen set), `poll.log` (per-cycle log),
`alerts.jsonl` (decoded alerts).

## 4. Sample output (real run)

```
scanned blocks 31481148..31481473: found 4 event(s): ['Marker', 'Ping', 'Ping', 'Zap']
  Ping block=31481161 tx=0x8822cc471760334c130856774f5e89c266600e4567e77dce1d51232fc2cba1ba logIndex=0x0 decoded=['0xf76e6b0920e9332ff4410f6dd53f01722abc71a3', '42', '"t02-keepalive"']
  Ping block=31481324 tx=0x37f245ef74863d46ea6faf05ff4bfc94c561b9c2f65b34e041584568aba8fd9c logIndex=0x0 decoded=['0xf76e6b0920e9332ff4410f6dd53f01722abc71a3', '2718', '"t02-live-catch"']
  Zap  block=31481165 tx=0xa84422575f2a92344c72fa7a289df378616b297d5df62f33b78aab5401838893 logIndex=0x0 decoded=['0xf76e6b0920e9332ff4410f6dd53f01722abc71a3', '0xf76e6b0920e9332ff4410f6dd53f01722abc71a3', '7']
  Marker block=31481176 tx=0x802e1cc1012ee67ededaccfb48889cf5453abcd92134248f23ebc318d4d54186 logIndex=0x0 decoded=['9001', '0x4c4b32303236544f326d00000000000000000000000000000000000000000000', '0xdeadbeef']
TEST PASS: exactly the expected events were found
```

## 5. Continuous-operation evidence

- The poller ran continuous 8-second cycles from 04:08 UTC 2026-10-16, logging every
  cycle to `poll.log` (blocks scanned, events found or `[]`).
- A 4th real event (`Ping`, value 2718, note `"t02-live-catch"`, tx
  `0x37f245ef74863d46ea6faf05ff4bfc94c561b9c2f65b34e041584568aba8fd9c`, block
  31481324) was fired **while the poller was running** and was caught in the next
  cycle with fully decoded fields.
- **HARDEN op (2026-10-16):** a 5th real event (`Ping`, value 9002, note
  `"t02-harden-live"`, tx
  `0x94e293342120ec9a44468413fe881af50f0b90c0278cb3b03594b9b85f8a70ff`, block
  31486465, cost 0.00002509 PHRS at 1 gwei) was fired **while the poller was
  running** and was caught in the next confirmed cycle (`ALERT Ping block=31486465`,
  alerts 1 → 2) with fully decoded fields.
- **Kill-9 test:** the poller was killed with `kill -9` mid-run and restarted. Cursor
  and seen-set were restored from `state.json` (atomic write before every alert):
  **0 re-emissions**, alerts stayed at 1, polling resumed from block 31481379.
- The deterministic test now asserts exactly the 5 events over the full range
  (`--expect=Marker,Ping,Ping,Ping,Zap`, 5,359 blocks scanned in 6 chunked calls):
  TEST PASS.
- The poller was left running; `poll.log` continues to grow.

## 6. Design decisions

- **Chunked get_logs (≤1,000 blocks/call)** — respects the node range cap.
- **Dedupe by `blockNumber:logIndex`** — survives overlapping scans and restarts.
- **Persist-before-emit** — state.json is written (atomically, via tmp+rename) before
  any alert is emitted; a crash can never cause a duplicate alert or a skipped block.
- **2-block confirmation lag** — reorg tolerance; only confirmed blocks are scanned.
- **topic0 computed in code** (`cast keccak`) — no hardcoded hashes to drift.
- **Nonce safety** — all broadcasts used `flock /tmp/lk-nonce.lock` (28-worker key).

## 7. Requirements traceability

| Official requirement | Where it is proven |
|---|---|
| (1) log queries filtered by address + event signature | `get_logs()` — `--address` + positional topic0 per event; see `monitor.py` |
| (2) runs continuously, reports only NEW events | `cmd_run()` — 8s poll loop; seen-set dedupe; `poll.log` cycles; kill-9 zero-re-emission test |
| (3) decodes into readable fields | `decode()` — indexed topics + ABI data → named fields; sample output in §4 |
| (4) demonstrated catching ≥1 live/test event | 4 real txs + live catch of `t02-live-catch` while polling (§5) |

## 8. Interactive console (Tier A — live reads)

`apps/console/src/components/try/event-log-monitor.tsx` — "Watch any contract live":
contract + event-signature inputs with presets (LogEmitter · Ping/Zap/Marker, ERC-20
Transfer/Approval, custom), topic0 computed at runtime (`try/keccak256.ts`,
verified byte-equal against `cast keccak` for all 5 signatures), chunked
`eth_getLogs` (≤1,000 blocks/call), decoded rows with explorer links. Its sharp
differentiator: the watch session splits results into **"Caught after you started
watching"** (CAUGHT LIVE badge) vs **"Historical context"** — the live-catch proof
made interactive. 2-block reorg-buffer toggle (mirrors the monitor, on by default).
Every failure is a plain-language message with a Retry button; auto-refresh
self-pauses after 3 failed attempts with a resume affordance (never silent); the
interval is cleaned up on unmount. `tsc --noEmit` + `vite build` clean.

## 9. Honest gaps

- Poll history is a continuous session log, not yet a multi-day archive — the cursor
  and seen-set are durable; long-term retention is a deployment choice, not a code gap.
- Alerts go to a local `alerts.jsonl`; there is no webhook/notification sink yet
  (the arena requirement is "reports", not "notifies").
- Reorg handling is a 2-block confirmation lag — sufficient on Atlantic, not a
  full reorg-proof reorg-detector.

---

*Built for the Pharos Season of AI Agent Arena — T02 (Easy, 50 pts).*
*Deep royal blue `#1414c8`, gold `#d9a821` — the OCTOPUS art direction.*
