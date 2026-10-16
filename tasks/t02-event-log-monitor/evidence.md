# T02 Evidence Log

Chain: Pharos Atlantic testnet · chain ID 688689 · native PHRS
Wallet (public): `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`
Emitter contract: `0x2C1dB0C436B72D94a4112f321DFbD13a976D8831`
All explorer links curl-tested 2026-10-16 (HTTP 200).

## On-chain actions

| # | Action | Tx hash | Block | Gas used | Cost (PHRS @10 gwei) |
|---|--------|---------|-------|----------|----------------------|
| 0 | Deploy `LogEmitter` | [`0x5ee42464…49cf`](https://atlantic.pharosscan.xyz/tx/0x5ee42464c060dc4e23f270ead85128516454fbbc3bf64c3b0b78c565049044cf) | 31481148 | 359,010 | 0.00359010 |
| 1 | `ping(42,"t02-keepalive")` → Ping | [`0x8822cc47…c2cba1ba`](https://atlantic.pharosscan.xyz/tx/0x8822cc471760334c130856774f5e89c266600e4567e77dce1d51232fc2cba1ba) | 31481161 | 25,054 | 0.00025054 |
| 2 | `zap(wallet,7)` → Zap | [`0xa8442257…5401838893`](https://atlantic.pharosscan.xyz/tx/0xa84422575f2a92344c72fa7a289df378616b297d5df62f33b78aab5401838893) | 31481165 | 24,125 | 0.00024125 |
| 3 | `mark(9001,tag,0xdeadbeef)` → Marker | [`0x802e1cc1…4d54186`](https://atlantic.pharosscan.xyz/tx/0x802e1cc1012ee67ededaccfb48889cf5453abcd92134248f23ebc318d4d54186) | 31481176 | 25,397 | 0.00025397 |
| 4 | `ping(2718,"t02-live-catch")` → Ping (fired while poller running) | [`0x37f245ef…b8fd9c`](https://atlantic.pharosscan.xyz/tx/0x37f245ef74863d46ea6faf05ff4bfc94c561b9c2f65b34e041584568aba8fd9c) | 31481324 | 25,078 | 0.00025078 |

**Total spend: 458,664 gas = 0.00458664 PHRS** (budget ≤ 0.15 PHRS — 3.1% used).
Contract: [0x2C1dB0C436B72D94a4112f321DFbD13a976D8831](https://atlantic.pharosscan.xyz/address/0x2C1dB0C436B72D94a4112f321DFbD13a976D8831)

## Monitor evidence

- `poll.log` — continuous 8s cycles from 04:08 UTC 2026-10-16; every cycle logs blocks
  scanned and events found (or `[]`).
- `alerts.jsonl` — 1 alert: Ping caught live while polling (block 31481324,
  tx 0x37f245ef…b8fd9c, fields from=0xf76e6B09…AbC71a3, value=2718, note="t02-live-catch").
- `state.json` — persistent cursor + seen-set; atomic write before every alert.
- Kill-9 restart test: poller killed with `kill -9`, restarted → cursor restored at
  31481379, **0 re-emissions** (alerts 1 → 1).
- Deterministic test: `monitor.py test --from-block=31481148 --to-block=<tip>
  --expect=Ping,Ping,Zap,Marker` → **TEST PASS: exactly the expected events found**
  (all 4 with block numbers, tx hashes, decoded fields).

## Live capture (real poller output)

```
2026-10-16T04:09:16+0000 ALERT Ping block=31481324 tx=0x37f245ef74863d46ea6faf05ff4bfc94c561b9c2f65b34e041584568aba8fd9c fields={'from': '0xf76e6b0920e9332ff4410f6dd53f01722abc71a3', 'value': '2718', 'note': '"t02-live-catch"'}
2026-10-16T04:10:07+0000 monitor started: addr=0x2C1dB0C436B72D94a4112f321DFbD13a976D8831 confirm_lag=2 interval=8s cursor=31481379
2026-10-16T04:10:15+0000 cycle done: scanned to 31481402, [] new event(s) this cycle
2026-10-16T04:10:32+0000 cycle done: scanned to 31481421, [] new event(s) this cycle
```
