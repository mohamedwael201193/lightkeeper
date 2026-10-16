# T12 — Skill + Chain MCP Flow · Evidence

Atlantic testnet (chain 688689) only. Two real broadcast transactions; every
hash below resolves on the Atlantic explorer. All links curl-verified.

## Broadcast transactions

| # | Run | Purpose | Tx hash | Block | Status | Gas used | Fee (PHRS) | Value (PHRS) |
|---|---|---------|---------|-------|--------|----------|------------|--------------|
| 1 | deploy | Deploy `KeeperPing` (composition target) | [`0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3`](https://atlantic.pharosscan.xyz/tx/0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3) | 31481433 | success | 268305 | 0.0002683053 | 0 |
| 2 | allow-3 | Skill verdict **ALLOW** → `ping()` dust execute | [`0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349`](https://atlantic.pharosscan.xyz/tx/0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349) | 31482141 | success | 67898 | 0.0000678987 | 0.0001 |

Deployed contract: `0xFc9fe952036bFe00F8BC5d9D2860c3750B834Ad1`

## Spend log (budget ≤ 0.15 PHRS)

| Entry | Tx | Fee (PHRS) | Value (PHRS) |
|---|---|------------|--------------|
| deploy KeeperPing | `0x842022…6b4aa3` | 0.0002683053 | 0 |
| allow-3 `ping()` dust execute | `0xbdc80f…6d4349` | 0.0000678987 | 0.0001 |
| block-1 (skill BLOCKED → no broadcast) | — | 0 | 0 |
| **Total** | | **0.0004362040** | well under budget |

## Contrast runs (live data → different verdicts)

**allow-3** (`--amount-phrs 0.0001`), run `allow-3-1792124501`:
- READ @block 31482069: chainId 688689, balance 5.91989842331639842 PHRS, gas 10.0 gwei,
  `pingCount()` = 0, `keeper()` = `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`
- SKILL: all 6 rules PASS → **ALLOW**
- EXECUTE: broadcast `0xbdc80ff0…`, status 1, block 31482141
- VERIFY: `pingCount()` 0 → **1** (expected 1) → OK

**block-1** (`--amount-phrs 0.1`), run `block-1-1792124655`:
- READ @block 31482181: chainId 688689, balance 5.868857845315957842 PHRS, gas 10.0 gwei,
  `pingCount()` = 1, `keeper()` = `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`
- SKILL: RULE-AMOUNT **FAIL** (proposed 100000000000000000 wei > max 5000000000000000 wei = 0.005 PHRS) → **BLOCK**
- EXECUTE: skipped — no broadcast
- VERIFY: `pingCount()` 1 → **1** (unchanged, expected 1) → OK

Full machine-readable transcripts: `run-logs/flow-transcript.jsonl` (READ/SKILL/EXECUTE/VERIFY
records for every run, with real values).

## Honest run history (not hidden)

Two earlier runs did not complete as designed and are preserved in the transcript:
- `allow-1-1792124095`: skill **BLOCKED** on `RULE-FRESHNESS` — the 10-block staleness window was
  too tight for Atlantic's ~1s blocks (sequential RPC reads span ~20+ blocks). The policy window
  was corrected to 120 blocks *before* any execution. Verify step confirmed `pingCount` 0→0.
- `allow-1-1792124145`: skill **ALLOW**ed, but the broadcast crashed on a `cast send --value`
  encoding bug (ether-decimal passed where a wei-integer is required). **No transaction was
  broadcast.** The encoding was fixed and the design re-ran as `allow-3`.

## Links (curl-verified)

- Deploy tx: https://atlantic.pharosscan.xyz/tx/0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3
- Execute tx: https://atlantic.pharosscan.xyz/tx/0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349
- Contract: https://atlantic.pharosscan.xyz/address/0xFc9fe952036bFe00F8BC5d9D2860c3750B834Ad1
- Sender: https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
