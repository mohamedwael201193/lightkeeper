# T02 — Event/Log Monitor — Arena Submission Pack

(Copy-paste ready. Paste into the Pharos Agent Arena submission form.)

## Title

LIGHTKEEPER · T02 Event/Log Monitor

## One-liner

A persistent, reorg-tolerant on-chain event monitor for a purpose-deployed emitter —
chunked log scans, runtime-computed signatures, full decode, zero duplicates, survives kill -9.

## Description

T02 submission: `LogEmitter` (Ping / Zap / Marker) deployed on Pharos Atlantic testnet
(`0x2C1dB0C436B72D94a4112f321DFbD13a976D8831`, tx
`0x5ee42464c060dc4e23f270ead85128516454fbbc3bf64c3b0b78c565049044cf`, block 31481148)
plus a Python poller (`monitor.py`) that runs continuously (8s cycles), queries
`eth_getLogs` filtered by contract address + topic0 (keccak256 of the event signature,
computed in code — never hardcoded), chunks ranges at ≤1,000 blocks per call, dedupes
by `blockNumber:logIndex`, writes state atomically before every alert
(persist-before-emit), and scans with a 2-block confirmation lag for reorg tolerance.
Decodes indexed topics + ABI data into readable fields (`from`, `value`, `note`, …)
with block number, tx hash, and log index on every alert. Four real emitter txs on
Atlantic; one was fired WHILE the poller ran and caught in the next cycle.
Kill-9 test: poller killed mid-run, restarted — cursor restored, 0 re-emissions.
Deterministic test over the known range asserts exactly the 5 emitted events
(`monitor.py test --from-block=31481148 --to-block=<tip> --expect=Marker,Ping,Ping,Ping,Zap`
→ TEST PASS, 5,359 blocks / 6 chunks). Total spend 0.00461173 PHRS (budget 0.15).
Poller left running with live `poll.log`. Honest gaps: confirmation-lag reorg tolerance
(no reorg detector); alerts go to local `alerts.jsonl` (no webhook sink yet).

## Commit-pinned code

https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t02-event-log-monitor

## Share / demo links

- Contract: https://atlantic.pharosscan.xyz/address/0x2C1dB0C436B72D94a4112f321DFbD13a976D8831
- Deploy: https://atlantic.pharosscan.xyz/tx/0x5ee42464c060dc4e23f270ead85128516454fbbc3bf64c3b0b78c565049044cf
- Live catch (fired while polling): https://atlantic.pharosscan.xyz/tx/0x37f245ef74863d46ea6faf05ff4bfc94c561b9c2f65b34e041584568aba8fd9c

## Transaction hashes

- Deploy: `0x5ee42464c060dc4e23f270ead85128516454fbbc3bf64c3b0b78c565049044cf`
- Ping(42): `0x8822cc471760334c130856774f5e89c266600e4567e77dce1d51232fc2cba1ba`
- Zap(7): `0xa84422575f2a92344c72fa7a289df378616b297d5df62f33b78aab5401838893`
- Marker(9001): `0x802e1cc1012ee67ededaccfb48889cf5453abcd92134248f23ebc318d4d54186`
- Ping(2718, live catch #1): `0x37f245ef74863d46ea6faf05ff4bfc94c561b9c2f65b34e041584568aba8fd9c`
- Ping(9002, live catch #2, HARDEN op): `0x94e293342120ec9a44468413fe881af50f0b90c0278cb3b03594b9b85f8a70ff` (block 31486465, fired while the poller was running, ALERT with full decode in the next confirmed cycle)

## Interactive console demo (new)

LIGHTKEEPER console "Try it live — with your own wallet": `apps/console/src/components/try/event-log-monitor.tsx`
(Tier A — live reads only, no wallet, costs nothing). "Watch any contract live": contract
address + event signature inputs with presets (LogEmitter · Ping/Zap/Marker, ERC-20
Transfer/Approval, custom signature); topic0 computed at runtime via a dependency-free
keccak256 (`try/keccak256.ts`, verified byte-equal against `cast keccak` for all 5
signatures); chunked `eth_getLogs` (≤1,000 blocks/call, auto-chunked); decoded rows = tx
hash (explorer link), block, decoded fields; the watch session splits results into
"Caught after you started watching" (CAUGHT LIVE badge) vs "Historical context";
2-block reorg-buffer toggle (mirrors the monitor, on by default); every failure is a
plain-language message with a Retry button; auto-refresh self-pauses after 3 failed
attempts with a resume affordance (never silent). Watch now starts a fresh watch;
Refresh keeps the session going.

## Video

https://jade-drift-z3sa.here.now/T02-event-log-monitor.mp4

## Video guide update

Shot 8 (new): console interactive demo — open the LIGHTKEEPER console → T02 →
"Try it live": preset "LogEmitter · Ping" → Watch now → decoded rows appear with
explorer links; a live-fired event gets the CAUGHT LIVE badge above "Historical
context" → hit Refresh (watch session continues) → toggle the 2-block reorg buffer
→ auto-refresh on/off. Every row is a real mined log on Atlantic.
