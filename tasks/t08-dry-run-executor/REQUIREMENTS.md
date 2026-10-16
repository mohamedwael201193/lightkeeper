# T08 — Dry-Run Executor: Official Requirements (quoted verbatim)

Source: `~/workspace/your_files/pharos-arena-MEGA.md`, § "T08 — Dry-Run Executor (Medium, 100 · SkillEngine)".

## OFFICIAL (verbatim)

> **OFFICIAL:** (1) Simulates via call/gas estimation WITHOUT broadcasting. (2) Reports predicted success/revert + revert reason + gas cost. (3) Shows expected before/after state. (4) BLOCKS execution automatically if simulation fails.

## Implementation guidance from the build matrix (verbatim)

> **Implementation:** gate architecture — the dry-run module structurally cannot broadcast (no signer import; separate broadcast module requires a PASS SimulationReceipt ticket). Layered: validation → `eth_call` → `estimateGas` → state-diff projection. Revert decoding (Error/Panic/custom; never invented reasons); before/after snapshots marked "chain unmodified".

## Evidence requirement (verbatim)

> **Evidence:** simulation receipts (pass + blocked cases), blocked-execution log proving the gate fired, share link.

## Video requirement (verbatim)

> **Video:** good tx → PASS simulation → blocked tx → revert reason → execution refused.

## Risks (verbatim)

> **Risks:** simulation/reality drift (disclose); estimateGas availability in portal (VERIFY LIVE).

## Cross-references (verbatim, for context)

- MEGA §248: "dry-run is a 1:1 fit for T08 (`cast estimate` surfaces revert reasons without broadcasting; `forge script` without `--broadcast`; 1.2× gas safety factor)"
- MEGA §256: "SkillEngine (T05–T11) — dry-run before write"
- MEGA §340: "Build T08 first as T07's safety harness."

## Coverage map (how this build meets each official requirement)

| # | Official requirement | Where it is met |
|---|---|---|
| 1 | Simulates via call/gas estimation WITHOUT broadcasting | `src/dryrun.py` — `cast call` + `cast estimate`, no signer, no broadcast path |
| 2 | Reports predicted success/revert + revert reason + gas cost | `SimulationReceipt` JSON: `status` PASS/FAIL, `revertReason`, `gasEstimate`, `gasLimit` (1.2×), `predictedCostPHRS`; `src/revert_decode.py` |
| 3 | Shows expected before/after state | `stateBefore` / `stateAfterProjected` in receipt, marked "chain unmodified" |
| 4 | BLOCKS execution automatically if simulation fails | `src/broadcast.py` refuses non-PASS tickets (exit 2) + `runs/blocked-execution.log`; proven live in Scenario A |
