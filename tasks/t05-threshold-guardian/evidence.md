# Evidence — T05 Threshold Guardian

Built 2026-10-16 ~07:10 EEST on the Atlantic testnet (chain 688689).
Guardian wallet: `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`.

## Run 1 — HOLD (above threshold) → BLOCKED, no broadcast

Proposal: send **0.05 PHRS** (policy `max_per_tx` = 0.005 PHRS).
Trace: `run-logs/hold.log`. Exit code **2**. Nothing broadcast, nothing spent.

```
[FAIL] Threshold check (per-tx + rolling window)
       note  : BLOCK: 0.050000 PHRS > max_per_tx 0.005 PHRS
DECISION: BLOCK
```

## Run 2 — FIRE (below threshold) → APPROVED and broadcast (REAL tx)

Proposal: send **0.0001 PHRS** self-transfer. Trace: `run-logs/fire.log`.
All six conditions PASS → ALLOW → one broadcast under the nonce lock.

- **Tx:** `0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c`
- **Explorer:** https://atlantic.pharosscan.xyz/tx/0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c
- Block 31481282, status 1 (success), gas 21000 @ 10 gwei.

## Run 3 — mainnet-class action → REFUSED (live refusal proof)

`guardian.py propose --network mainnet …` reads `eth_chainId` from the real
Pharos mainnet RPC → returns **1672** → REFUSE, exit code **3**, no key use,
no broadcast. Trace: `run-logs/mainnet-refusal.log`.

A second variant passes `--confirm-mainnet "I UNDERSTAND THIS IS MAINNET"`:
refused anyway — `policy.mainnet.enabled=false` is a hard firewall with no
override flag.

## Unit tests

`python3 tests/test_policy_engine.py` — **13/13 pass**, offline (mocked chain).
Covers: exact boundary at threshold, above/below threshold, rolling window,
insufficient balance, gas spike, stale-data fail-closed, wrong-chain refuse,
mainnet refuse with and without re-confirmation, missing key.

## Spend

| Item | PHRS |
|---|---|
| FIRE broadcast value | 0.000100 |
| FIRE broadcast gas (21000 @ 10 gwei) | 0.000210 |
| **TOTAL** | **0.000310** |

Budget 0.15 PHRS → remaining 0.14969. HOLD/REFUSE runs spent 0.

## Honesty

Thresholds were chosen up front to exercise both branches (0.005 cap;
0.05 blocked; 0.0001 fired) — symmetric disclosure, never post-hoc rigging.
BLOCK/REFUSE runs are logged honestly as blocked/refused, never as successes.
