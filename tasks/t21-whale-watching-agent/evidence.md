# T21 — Evidence (live run, Atlantic testnet · 2026-10-16)

Machine-readable: [`evidence.json`](evidence.json). All explorer links curl-verified
(HTTP 200) on 2026-10-16 — see [`LINKS.md`](LINKS.md).

## Scan transcript

| Item | Value |
|---|---|
| Chain | Atlantic testnet, chain ID 688689 (`cast chain-id` verified), native PHRS |
| RPC | `https://atlantic.dplabs-internal.com` |
| Scanned blocks | **31481900 → 31482539** (640 blocks) |
| Method | `eth_getBlockByNumber` with full transactions, JSON-RPC batches of 25 (native transfers emit no logs — blocks read directly) |
| Transactions inspected | **62** |
| Whale threshold | **≥ 0.05 PHRS** (5× the max transfer in a 100-block traffic sample: max 0.01 PHRS) |
| Whale events found | **3** (2 organic + 1 self-seeded) |
| Scan JSON | `reports/scan-31481900-31482539-20261016T045247Z.json` |
| Watch report | `reports/watch-report-31481900-31482539-20261016T045247Z.md` |
| Dedupe state | `state/seen.json` (3 event keys committed) |

## Ranked matches

### #1 — 0.05 PHRS · ORGANIC
- Block **31482112** · `0x2062fecfb99803e7f323a064489f20c6c0122e72` → `0xe0722d771278acd24a672f41c303108483ffa99d`
- Tx: https://atlantic.pharosscan.xyz/tx/0x5025f6a86ad873b6a8a3eb72a3f4c0a9081e86d29347cd51bc2dc756175be470
- Both parties unlabeled — shown shortened, no identities invented.

### #2 — 0.05 PHRS · **[SELF-SEEDED — disclosed test transfer, not organic]**
- Block **31482165** · deployer `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` → sink `0x7D5Bbc5E294896860278134Da3898171043B2a5e`
- Tx: https://atlantic.pharosscan.xyz/tx/0xf566e34c25ca3c32dc4f6c687b7345501ea8da065398d71e9b87bc246371ba70
- Executed by the builder via `cast send` (0.05 PHRS, gas 21000 @ 1000000001 wei).
  Real on-chain transfer, explicitly marked — never presented as organic.

### #3 — 0.05 PHRS · ORGANIC
- Block **31482185** · `0xd8616214c63fa832efc7cb934f273fa0ccff1ed7` → `0x20c10229f2259cf9a868695c187dc855b35e1190`
- Tx: https://atlantic.pharosscan.xyz/tx/0x6b9e96a814cc7b0dd8ef2e6e0617351c883ecfb439f0573dd23380535b7fb237
- Both parties unlabeled — shown shortened, no identities invented.

## Summary view

Rendered for all 6 watched addresses (in/out counts, totals, last whale block);
quiet addresses show honest zeros. See the watch report.

## Spend (budget ≤ 0.15 PHRS)

| Item | PHRS |
|---|---|
| Self-seeded transfer value | 0.05 |
| Gas (21000 @ 1000000001 wei) | 0.000021000000021 |
| Agent operation (read-only) | 0.0 |
| **Total** | **0.050021000000021** ✅ within budget |

## Tests

- **Unit:** 19 passed (`tests/test_thresholds.py`) — threshold boundaries, dedupe,
  ranking, config validation, label honesty, Transfer-log decode, YAML-int regression,
  self-seed marking. Run: `python3 -m pytest tests/ -q` (0.23s, no network).
- **Live:** the scan above — real blocks, real transactions, real report.
- **Bug caught during development:** `hashlib.sha3_256` ≠ keccak-256 (wrong Transfer
  topic `0xc17a9d92…`); fixed with `Crypto.Hash.keccak` → `0xddf252ad…` (verified).
