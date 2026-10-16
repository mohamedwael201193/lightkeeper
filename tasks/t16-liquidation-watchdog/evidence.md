# Evidence — T16 Liquidation Watchdog

Every claim below is backed by a real on-chain transaction or a real
delivered message. All explorer links were curl-tested (HTTP 200).

## On-chain evidence (Pharos Atlantic, chain 688689)

| Step | Transaction | Block | What happened |
|---|---|---|---|
| 1 — deploy | [0xc4da78…2c0de](https://atlantic.pharosscan.xyz/tx/0xc4da78490b2b0b2b501b5d0eb944878ed1d9f5cf47d5a3813e2d46a263a2c0de) | 31481451 | `MiniLend` deployed, oracle price $2.00 |
| 2 — deposit | [0x3798b3…288d7](https://atlantic.pharosscan.xyz/tx/0x3798b3e3604a9c358fe6e8b8d271f2663b2814b4ab81c53c26a542df614288d7) | 31481508 | 0.002 PHRS collateral deposited |
| 3 — borrow | [0xfa4674…16c0d](https://atlantic.pharosscan.xyz/tx/0xfa4674f23632226406fc24f264be85d10c14eb5d59494595c8965e8e24116c0d) | 31481539 | $0.002 borrowed → HF **1.6** (healthy) |
| 4 — price drop | [0x6a9a22…484861](https://atlantic.pharosscan.xyz/tx/0x6a9a22d43b00eab59a6e26f007bce35249f7796a9688f716d47c49984d084861) | 31481741 | **Real state change:** `setPrice` $2.00 → $1.50 → HF **1.2** (WARNING) |
| 5 — repay | [0x434f9b…6bea4](https://atlantic.pharosscan.xyz/tx/0x434f9b5a75c7a6ff7ce83533d848748bdada393023c0b7ee1d72c20a2bb6bea4) | 31481869 | $0.0004 repaid → HF **1.5** (recovered) |

Contract: [0x108989a165a446e1d89CEe3C9936344ea7ADbf4a](https://atlantic.pharosscan.xyz/address/0x108989a165a446e1d89CEe3C9936344ea7ADbf4a)

## Telegram alert (exactly one, as mandated)

- **message_id: 716** — delivered to the live chat on the OK → WARNING transition.
- Content carried: health factor (1.2000), position address, block 31481762,
  concrete action (*"repay $0.000400 of debt OR add 0.000267 PHRS collateral
  to restore HF ≥ 1.5"*), and the contract explorer link.
- A second watcher run in WARNING sent **no duplicate** (transition-only).
- The recovery run logged `RECOVERED` and sent **no alert**.

## Watcher log (real run, UTC timestamps)

```
[2026-10-16T04:13:33Z] block=31481623 hf=1.6000 zone=OK (was UNKNOWN) ... no alert sent
[2026-10-16T04:15:51Z] block=31481762 hf=1.2000 zone=WARNING (was OK) ... collateral=$0.003000 debt=$0.002000 price=$1.50
[2026-10-16T04:15:53Z] ALERT SENT zone=WARNING telegram_message_id=716
[2026-10-16T04:16:18Z] block=31481788 hf=1.2000 zone=WARNING (was WARNING) ... no alert sent
[2026-10-16T04:18:32Z] block=31481892 hf=1.5000 zone=OK (was WARNING) ...
[2026-10-16T04:18:32Z] RECOVERED: position back to OK (hf=1.5000); no alert sent
```

Full log: `watcher/watcher.log`.

## Unit tests

`forge test`: **9 passed, 0 failed** — HF math for healthy/warning/critical
zones, debt-free infinity, borrow-guard revert, oracle access control, repay
restore, account snapshot, liquidation guard.

## Spend log

| Tx | Gas | Gas price | Cost (PHRS) |
|---|---|---|---|
| deploy | 1,476,456 | 1.000000001 gwei | 0.001476456 |
| deposit | 45,220 | 1.000000001 gwei | 0.000045220 |
| borrow | 59,838 | 1.000000001 gwei | 0.000059838 |
| setPrice | 30,848 | 1.000000001 gwei | 0.000030848 |
| repay | 31,182 | 1.000000001 gwei | 0.000031182 |
| **Total gas** | | | **0.001643544** |

Budget: 0.15 PHRS → spent 0.00164 PHRS (≈1.1% of budget).
Dust value in the position (not gas): 0.002 PHRS deposited, 0.001 PHRS
borrowed out, 0.000000267 PHRS repaid — net 0.001 PHRS collateral locked.

Machine-readable: `evidence.json`.
