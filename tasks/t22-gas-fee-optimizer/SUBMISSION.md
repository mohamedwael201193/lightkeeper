# Arena submission pack — T22 Gas Fee Optimizer

(Copy-paste into the Arena "My Work" form. Do NOT submit from the agent —
the user copies and submits himself.)

---

**Title:** T22 — Gas Fee Optimizer

**One-liner:** Real fee-data polling, explicit slow/standard/fast tiers, and two
mined dust transactions proving both the favorable-window and the
deadline-forced paths, with receipt-verified savings math.

**Description:**

A gas-fee optimizer for Pharos Atlantic testnet (chain 688689). It polls
`eth_gasPrice` across 12 block-pinned samples (blocks 31481423–31481529),
computes speed tiers with an explicit percentile methodology (slow=p25,
standard=p50, fast=p75), and recommends a price per urgency (low→slow,
medium→standard, high→fast). It then executes three REAL dust transactions:
Job A (deadline 45s) submitted on a favorable reading at t+3.9s; Job B
(deadline 30s, threshold deliberately below market to force the path)
submitted at deadline−SUBMIT_MARGIN at t+24.9s — the deadline was never
missed, and a missing-data failure aborts loudly instead of holding silently
(proven by Job D's dead-RPC drill, exit code 2); Job C (~2.5h later) proved
the quoted-vs-settled gap persists.
Both receipts show `effectiveGasPrice` 1,000,000,001 wei (~1 gwei) against the
requested 10-gwei standard — real savings of 188,999,999,979,000 wei
(≈0.000189 PHRS) per tx vs the fast tier. Flat testnet gas is reported
honestly; nothing was manufactured. Unit tests: 18/18 pass on a labeled real
snapshot + synthetic boundary cases. Total spend ≈0.000062 PHRS of the
0.15 budget.

**Repo (commit-pinned):**
https://github.com/mohamedwael201193/lightkeeper/tree/d9ef4d7f02542483734fef43cb58b20c6fcc6cbc/tasks/t22-gas-fee-optimizer

**Proof links:**
- Job A (favorable window): https://atlantic.pharosscan.xyz/tx/0x1c9d62c6496e626ff10ffab8157b587908b0faca92dd71517095de61ba1d3050
- Job B (deadline-forced): https://atlantic.pharosscan.xyz/tx/0x1c8c65374bc2210b221604a64c6190f6145da30a9416e9181f7f85b267ce2366

**Reviewer notes:** see `REVIEWER_NOTES.md` in the task folder (5-minute
re-verification path, flat-gas caveat, deadline guarantee).

**Interactive demo:** the console's "Try it live" surface for this lamp
(`apps/console/src/components/try/gas-fee-optimizer.tsx`) reads the CURRENT
Atlantic gas price (`eth_gasPrice` + `eth_maxPriorityFeePerGas`) and the latest
block's utilization on demand, then recomputes slow/standard/fast tiers from
those live samples (p25/p50/p75, same method as `evidence/tier-table.json`).
Visitors pick a tx type (transfer / contract call) and an urgency and see the
estimated PHRS cost per tier — the recommendation comes from the chain seconds
ago, not a static table. Tier A: no wallet, no signature, costs nothing. Both
real job receipts are linked on the page.

**Video:** PENDING-VIDEO (see `VIDEO-GUIDE.md` for the shot plan).

---

