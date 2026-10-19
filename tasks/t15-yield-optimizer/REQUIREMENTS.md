# T15 — Yield Optimizer — Official Requirements (quoted VERBATIM)

Source: `~/workspace/your_files/pharos-arena-MEGA.md` § "T15 — Yield Optimizer (Hard, 200 · DeFi)".

## OFFICIAL

> **OFFICIAL:** (1) Compares ≥3 yield sources on LIVE on-chain data. (2) Accounts for gas + entry/exit fees + minimum holding period. (3) Outputs clear recommendation with expected net gain, or 'stay put' with reason. (4) If executing: prepares txs for USER SIGNATURE ONLY — agent never holds keys.

## Implementation (per MEGA, adapted with radical honesty)

> **Implementation:** discovery-gated: ≥3 live rate views verified before any comparison (candidates: vault/lending contracts verified as live-callable — never assumed). Net-yield math: per-second→APY, friction amortization over holding period, stay-put default. Execution path: unsigned `prepareDepositTx` (no signature fields, no keys), dry-run-gated, key-hygiene CI grep. If the network lacks 3 live rate views, the run fails loudly.

**How T15 meets each bullet:**

| # | Requirement | T15 evidence |
|---|---|---|
| 1 | ≥3 yield sources, LIVE on-chain | `runs/scan.json`: OctopusVault A + OctopusVault B + stay-put baseline — every rate/fee/hold view read via `eth_call` at a PINNED block, with explorer block link |
| 2 | gas + entry/exit fees + min holding period | `optimizer/optimize.py`: `net(H) = gross − entryFee − exitFee(H) − gas`, live `eth_gasPrice`, `eth_estimateGas`, measured (never assumed) block time |
| 3 | recommendation w/ expected net gain, or 'stay put' | `runs/recommendation.json`: ALLOCATE→winner+net, or STAY PUT with reason; fee-sensitivity run at two horizons shows the flip |
| 4 | user-signature-only execution | `optimizer/prepare.py` builds unsigned tx (`signed: false`, no v/r/s); key-hygiene CI grep in `tests/test_optimizer.py` |

**Honest adaptation (documented, not hidden):** Atlantic testnet has ZERO third-party
yield venues (discovery finding, `runs/discovery.json` — the empty result IS the finding).
The 3 live sources are therefore: two builder-deployed, fully-disclosed OctopusVaults with
immutable on-chain rate cards (real, funded, claimable testnet rewards — all math auditable
on-chain), plus the honest 0% "stay put" wallet baseline. Every surface is labeled
**"testnet mechanics demonstration"** — testnet PHRS rewards are never presented as real yield.

## Risks (per MEGA) → mitigations

- *Venue availability is the critical path* → discovery runs FIRST; builder-deployed
  fixtures are disclosed, not disguised.
- *Fee-sensitivity flips* → both horizons tested (short: STAY PUT wins; long: rate wins).
