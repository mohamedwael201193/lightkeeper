# T28 — Multi-Protocol Aggregator: Official Requirements

Quoted VERBATIM from the Pharos Season of AI Agent Arena Build page for T28
(Hard, 200 pts, toolkit: Cross-tool / Advanced), via
`~/workspace/your_files/pharos-arena-MEGA.md` §4 (extracted read-only 2026-10-15
from the live Build pages).

> **OFFICIAL:** (1) Integrates ≥2 protocols/vaults behind ONE interface.
> (2) Supports queries (positions/rates) AND actions (deposit/withdraw prepared
> for signature). (3) Routes each request to best venue + EXPLAINS WHY.
> (4) Handles one protocol down without breaking others.
> (5) Architecture write-up + demo video STRONGLY encouraged at this tier.

## How this submission maps to each requirement

| # | Requirement | Where it is proven |
|---|-------------|--------------------|
| 1 | ≥2 protocols/vaults, one interface | `registry.json` + `aggregate.py run`: 3 live on-chain venues (2 vaults + 1 lending pool), one CLI facade, one pinned block |
| 2 | Queries AND actions prepared for signature | Queries: `run` (positions/rates). Actions: `prepare --venue … --action deposit` → unsigned tx JSON + eth_call dry-run revert gate; NEVER broadcast |
| 3 | Routes to best venue + explains why | `route --intent deposit|borrow --amount-wei N`: ranked explanations, every figure traced to a live quote row at a named block |
| 4 | One protocol down doesn't break others | `chaos`: T28-VAULT-B forced to a dead address → marked UNREACHABLE with reason; other venues aggregate and re-rank normally |
| 5 | Architecture write-up + demo video | `ARCHITECTURE.md`; `VIDEO-GUIDE.md` (video slot: PENDING-VIDEO) |

## Task-specific build contract (from the coordinator brief)

- Protocol REGISTRY as local JSON, seeded with the REAL contracts deployed by
  sibling LIGHTKEEPER tasks where they exist — **sweep result 2026-10-16:
  T02/T07/T10/T15/T16 had deployed nothing on-chain yet** (zero addresses in
  their evidence.json/src/broadcast dirs), so they are recorded as PENDING and
  T28 deployed its own minimal venue set. Coverage stays honest.
- Aggregator reads live state from ≥3 protocols in one run (balances, reserves,
  positions, health factors → here: TVL, APYs, share price, utilization,
  borrows) normalized into one report.
- Comparison view (capital efficiency / risk across venues) computed from the
  real reads.
- Evidence: registry + one full aggregation run with real values, block number,
  and tx hashes of setup deploys. UNREACHABLE marking, never zero-filled.
- Tests: normalization unit tests + the live aggregation run.
