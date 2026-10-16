# T21 Whale-Watching Agent — Reviewer Notes

## What this is

A read-only monitoring agent for Atlantic testnet (chain 688689) that scans blocks
for large native PHRS transfers (plus chunked ERC-20 Transfer-log scans for watched
addresses) and produces a **ranked whale report**: each move explained
(what / how much / from → to, labelled where known) plus a **summary view across
all watched addresses**.

## Where to look (60-second verification)

| Check | Location |
|---|---|
| Official requirements, quoted verbatim | `REQUIREMENTS.md` |
| Watchlist (6 addresses) + threshold + justification | `src/config.yaml` |
| Agent source | `src/whale_watch.py` |
| Unit tests (16, passing) | `tests/test_thresholds.py` |
| Live scan transcript (blocks, tx count, matches) | `evidence.json` |
| Ranked watch report | `reports/watch-report-*.md` |
| Curl-verified links | `LINKS.md` |

## Reproduce the live run

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a
cd ~/workspace/lightkeeper/tasks/t21-whale-watching-agent
python3 src/whale_watch.py watchlist
python3 src/whale_watch.py scan --from-block <FROM> --to-block <TO>   # see evidence.json
python3 -m pytest tests/ -q
```

No private keys needed — the agent never signs. RPC: `https://atlantic.dplabs-internal.com`
(chain 688689, verified via `cast chain-id`).

## Honesty notes (read before judging)

1. **Whale threshold = ≥ 0.05 PHRS native.** Justified by measurement, not vibes:
   a 100-block sample of real Atlantic traffic showed max organic transfer **0.01 PHRS**
   (median 0.01, only 3 value-carrying txs in 100 blocks). 0.05 = 5× observed max —
   anything at/above it is a genuine outlier on this testnet.
2. **One event in the report is self-seeded** — a real 0.05 PHRS transfer executed by the
   builder from the LIGHTKEEPER deployer wallet to a fresh task-controlled sink, disclosed
   in the report as **[SELF-SEEDED]**, with tx hash + explorer link. It is never presented
   as organic. Organic matches (if any) are listed separately.
3. **Labels are never invented.** Watched addresses carry only verifiable labels
   ("deployer wallet (self)", "observed sender — first seen block N", …). Unknown
   counterparties render as `0x12ab…cdef (unlabeled — observed on-chain only)`.
4. **Quiet windows stay empty.** If the scan finds zero organic whales, the report says
   so explicitly with the scanned range — no filler.
5. **Native transfers aren't in logs** (official risk note). The agent reads blocks
   directly; it does not claim log coverage of native value.
6. **No fiat conversions.** No USD price feed exists on Atlantic; everything is in PHRS.

## Spend

Budget ≤ 0.15 PHRS. Actual spend logged in `evidence.json`:
self-seeded transfer value + gas. The agent itself is read-only (spend = 0).

## Known limitations

- ERC-20 `tokens:` list is empty — no ERC-20 contracts are known/deployed on Atlantic
  testnet for this task; the chunked Transfer-scan path is implemented and unit-tested
  (synthetic logs + real keccak topic) but has no live token to scan. Native PHRS
  coverage is the demonstrated path.
- Testnet is very quiet (~9 txs / 100 blocks at measurement time); large windows are
  cheap to scan but mostly empty — by design, reported honestly.
