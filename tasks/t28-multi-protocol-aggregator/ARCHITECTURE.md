# T28 Multi-Protocol Aggregator — Architecture

## The idea in one paragraph

A single keeper's ledger over many venues. `aggregate.py` is a facade over
N fault-isolated venue adapters. A local `registry.json` binds each venue to
a real, bytecode-verified contract (verified by a discovery run, never
hard-coded from memory). One run pins a block, reads every venue at that
block, normalizes wei/bps into human units, ranks venues by live supply APY
with capital-efficiency and risk annotations, routes intents (deposit/borrow)
to the best venue with a written explanation for every decision, and prepares
deposit/withdraw actions as UNSIGNED transactions gated by an eth_call
dry-run. A dead venue is marked UNREACHABLE with a reason — never zero-filled —
and the rest of the run is unaffected.

## Component map

```
registry.json          # protocol registry: address, type, query sigs, action specs
aggregate.py
  ├─ discover          # get_code check per venue → REACHABLE / UNREACHABLE / PENDING
  ├─ run               # pin block → parallel fault-isolated reads → normalize → report
  ├─ route             # policy-weighted scoring → winner + per-venue explanations
  ├─ prepare           # unsigned tx JSON + gas estimate + eth_call dry-run gate
  ├─ health            # per-venue circuit breaker state
  └─ chaos             # degraded-mode demo: one venue forced to a dead address
src/SimpleVault.sol    # payable share vault, fixed target APY, honest share math
src/SimpleLending.sol  # supply/borrow pool, linear utilization-rate curve
tests/test_normalize.py# 10 unit tests over the pure normalize/risk/compare fns
runs/                  # every live artifact: discovery, reports, routes, chaos demo
```

## Why this shape

- **Pinned block.** All venue reads happen at one block B, so "TVL at block B"
  is a coherent snapshot, not a smear across blocks. The block number and an
  explorer link are printed on every run.
- **Fault isolation, twice.** Each venue read catches all exceptions and
  returns an UNREACHABLE record with a reason; venue reads also run in a
  thread pool so one slow venue cannot stall the run. The official
  "one protocol down" requirement is therefore structural, not aspirational —
  and the `chaos` command proves it live.
- **No invented integrations.** Sibling LIGHTKEEPER tasks (T02/T07/T10/T15/T16)
  had deployed nothing on-chain at build time (verified by sweeping their
  evidence/src/broadcast trees — zero addresses found). Rather than fake
  sibling integrations, the registry records them as PENDING and T28 deployed
  its own minimal venue set. Every aggregated number resolves to a real
  contract you can open in the explorer.
- **Actions never broadcast.** `prepare` builds calldata with `cast calldata`,
  estimates gas read-only, and dry-runs the exact payload via eth_call from
  the operator address. The output is an unsigned transaction object labeled
  for wallet signature. The script holds no private key and has no code path
  that broadcasts.
- **Explainability by construction.** The router scores `supply APY − risk
  penalty` for deposits and lowest borrow APY for borrows, and prints one line
  per venue: SELECTED/passed-over/REJECTED/UNAVAILABLE, the live metric, the
  block, the TVL. Every figure traces to a quote row.

## Venue economics (the comparison view)

| Venue | Type | Supply APY source | Capital efficiency | Risk signal |
|---|---|---|---|---|
| T28-VAULT-A (MeridianVault) | vault | fixed 250 bps target, share price accrues on-chain | 100% (all TVL in strategy) | thin-TVL flag < 0.0005 PHRS |
| T28-VAULT-B (HalcyonVault) | vault | fixed 520 bps target | 100% | same |
| T28-LEND (TidepoolLending) | lending | borrowApy × utilization × (1 − reserve), borrow curve = 300 + 1200×util bps | utilization % (share of supplied capital earning) | ELEVATED flag > 80% util |

## Trust boundaries

- Reads: `cast call`/`cast code` against the Atlantic RPC — no signer, no key.
- Writes: exactly 7 real transactions, all dust-scale, all operator-initiated
  via `cast send` under `flock /tmp/lk-nonce.lock` (3 deploys + 4 seed txs).
  The aggregator itself cannot write.
- Secrets: `.env` is sourced from the repo root, never committed, never
  printed, never embedded in code/README/logs/evidence.

## Failure modes (first-class, not footnotes)

| Failure | Behavior |
|---|---|
| Venue has no bytecode | UNREACHABLE, reason "no bytecode at address" |
| eth_call reverts / undecodable | UNREACHABLE, reason names the failing signature |
| RPC unreachable | run aborts loudly before any partial report ("could not fetch block number") |
| All venues down | comparison ranks empty list; router reports no winner; nothing is fabricated |
| Unknown venue type in registry | `normalize` raises ValueError (tested) — never silently normalized |
