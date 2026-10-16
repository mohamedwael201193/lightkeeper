# Reviewer notes — T22 Gas Fee Optimizer

**Verdict-first:** this task meets all four official requirements with real
on-chain evidence. Two mined dust transactions prove both paths: favorable-window
submission and deadline-forced submission (deadline never missed). Savings math
uses real receipt numbers.

## How to re-verify in 5 minutes

1. **Fee data is real:** open `evidence/fee-snapshot.json` — 12 `eth_gasPrice`
   samples with block numbers 31481423–31481529. Re-run any block:
   `cast block <n> --rpc-url https://atlantic.dplabs-internal.com` exists.
2. **Tiers are computed, not invented:** `python3 tests/test_tiers.py` (18/18
   pass) runs the same `compute_tiers` code the demo used, against a labeled
   REAL snapshot recorded at build time.
3. **Receipts are real:** both tx links in LINKS.md return HTTP 200 and show
   `effectiveGasPrice` 1,000,000,001 wei on the explorer. Re-check independently:
   `cast receipt 0x1c9d62c6496e626ff10ffab8157b587908b0faca92dd71517095de61ba1d3050 --rpc-url "$ATLANTIC_RPC_URL"`.

## The flat-gas caveat (we don't hide it)

Atlantic's `eth_gasPrice` was flat at 10 gwei across the whole observation
window, so all three tiers compute to 10 gwei. We reported that flatness and
did not manufacture variance. The value the optimizer actually delivered came
from the receipt: the chain settled both txs at ~1 gwei — so the conservative
standard recommendation over-provisioned by ~10×, and the optimizer reports
that truthfully as ~0.000189 PHRS saved vs the fast tier.

## The deadline guarantee

Job B used a 1-wei favorable threshold (deliberately below any real market
price) to force the never-favorable path. It held, then submitted at
deadline−SUBMIT_MARGIN on the freshest sample (t+24.9s of a 30s deadline).
A missing-data failure would abort loudly — it can never silently hold past
the deadline. That fail-safe is the QA fix baked into the plan.

## Budget

Total T22 spend ≈ 0.000062 PHRS of the 0.15 PHRS budget. All broadcasts went
through the shared `flock /tmp/lk-nonce.lock` nonce wrapper.
