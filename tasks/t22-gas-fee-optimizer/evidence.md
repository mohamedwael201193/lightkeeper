# T22 Gas Fee Optimizer — Evidence

Chain: **Atlantic testnet, chain ID 688689** · Wallet:
`0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` · Run: 2026-10-16 ~07:10–07:15 EEST.

## Fee snapshot (official req 1 — tracks gas price over time)

12 agent-side `eth_gasPrice` polls, each block-pinned (full data:
`evidence/fee-snapshot.json`):

| # | block | gas price |
|---|---|---|
| 1 | 31481423 | 10,000,000,000 wei (10 gwei) |
| … | … | 10,000,000,000 wei (10 gwei) — flat all 12 |
| 12 | 31481529 | 10,000,000,000 wei (10 gwei) |

Corroborating context (raw RPC `eth_feeHistory`, 5 blocks): baseFee flat
`0x3b9aca00` = 1,000,000,000 wei, priority rewards all `0x0`.

## Tier table (explicit methodology: slow=p25, standard=p50, fast=p75)

| tier | wei | gwei |
|---|---|---|
| slow | 10,000,000,000 | 10 |
| standard | 10,000,000,000 | 10 |
| fast | 10,000,000,000 | 10 |

Flat testnet gas → all tiers equal. Reported honestly (see README §2). Full
computation output: `evidence/tier-table.json`.

## Executed jobs (official reqs 2, 3, 4)

**Job A — favorable window.** Deadline 45s, threshold = slow tier (10 gwei).
Favorable reading at t+3.9s → broadcast at the recommended standard 10 gwei.

- tx: https://atlantic.pharosscan.xyz/tx/0x1c9d62c6496e626ff10ffab8157b587908b0faca92dd71517095de61ba1d3050
- block 31481582 · status 1 (success) · gasUsed 21,000
- **effectiveGasPrice 1,000,000,001 wei** (~1.000000001 gwei)

**Job B — deadline-forced.** Deadline 30s, threshold = 1 wei (deliberately below
any real market price, simulating a never-favorable market). Held; at
deadline−SUBMIT_MARGIN (t+24.9s) submitted on the freshest sample at standard
10 gwei. **Deadline never missed; nothing held silently past it.**

- tx: https://atlantic.pharosscan.xyz/tx/0x1c8c65374bc2210b221604a64c6190f6145da30a9416e9181f7f85b267ce2366
- block 31481636 · status 1 (success) · gasUsed 21,000
- **effectiveGasPrice 1,000,000,001 wei** (~1.000000001 gwei)

## Paid vs requested (official req 3)

- Price at request time (both jobs): 10,000,000,000 wei.
- Submitted at (standard tier): 10,000,000,000 wei.
- **Actually paid (receipt): 1,000,000,001 wei** — ~1 gwei base fee + 1 wei,
  roughly 10× below what we submitted at.

## Savings math (real numbers only)

Savings vs the fast tier (10 gwei), per tx:
8,999,999,999 wei/gas × 21,000 gas = **188,999,999,979,000 wei ≈ 0.000189 PHRS**.

## Spend log

| item | amount |
|---|---|
| gas, Job A (21,000 × 1,000,000,001 wei) | 21,000,000,021,000 wei |
| gas, Job B (21,000 × 1,000,000,001 wei) | 21,000,000,021,000 wei |
| dust values (2 × 0.00001 PHRS self-transfers) | 20,000,000,000,000 wei |
| **total T22 spend** | **62,000,000,042,000 wei ≈ 0.000062 PHRS** (budget ≤ 0.15 PHRS) |

All broadcasts wrapped in `flock /tmp/lk-nonce.lock` (shared-key nonce safety).
No secrets in any evidence file (run log contains only variable names + public hashes).
