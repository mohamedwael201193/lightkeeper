# SUBMISSION.md — T08 Dry-Run Executor (copy-paste Arena pack)

## Title

`Dry-Run Executor — simulate before you sign (T08)`

## One-liner

A SkillEngine dry-run gate for Pharos Atlantic: `cast estimate` + `forge script`
(without `--broadcast`) predict PASS/FAIL, decode the exact revert reason, apply
a 1.2× gas safety factor — and a separate broadcaster that only replays PASS
tickets, refusing FAILs automatically.

## Description (paste into the Arena submission form)

**What it does.** Before any transaction reaches the chain, the Dry-Run Executor
simulates it without broadcasting:

1. **Validate** — address/sig sanity; chain-id must be Atlantic (688689), anything else is refused.
2. **`eth_call`** — surfaces the revert reason with zero broadcast.
3. **`estimateGas`** — success yields a gas number; failure yields the exact revert reason
   (decoded from `Error(string)` / `Panic(uint256)` / custom-error payloads — never invented).
4. **Gas price + 1.2× safety factor** — predicted cost in PHRS.
5. **State-diff projection** — before/after snapshots marked "chain unmodified".

The output is a machine-readable **SimulationReceipt** (PASS/FAIL). The dry-run
module **structurally cannot broadcast** (no signer capability — enforced by a
runtime tripwire and unit tests). A separate `broadcast.py` replays only PASS
tickets with the receipt's exact parameters and 1.2× gas limit; FAIL tickets are
refused (exit 2) and logged to a blocked-execution log.

**Live proof on Atlantic testnet (all real, no mocks):**

- **Scenario A — predicts a revert, gate blocks execution.** Dry-run of
  `DryRunProbe.boom()` → `cast estimate` failed with the exact reason
  `DryRunProbe: forced boom`. The FAIL ticket was fed to the broadcaster →
  `EXECUTION REFUSED` (exit 2), logged. Nothing was broadcast.
- **Scenario B — predicts success, real broadcast matches.** Dry-run of
  `DryRunProbe.ping()` → PASS, estimate 58,219 gas → 1.2× limit 69,863 →
  predicted cost 0.00069863 PHRS. A `forge script` run *without* `--broadcast`
  confirmed `SIMULATION COMPLETE`. The PASS ticket was broadcast →
  [tx 0x639f87…012ee](https://atlantic.pharosscan.xyz/tx/0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee):
  status success, gas used 45,470 (within the 69,863 limit), `Pinged` event,
  probe `count` 0→1 exactly as projected.

**Contracts / transactions (Atlantic 688689):**

- `DryRunProbe` `0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f`
  ([explorer](https://atlantic.pharosscan.xyz/address/0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f))
- Deploy: [0xbb5fac…4748e44](https://atlantic.pharosscan.xyz/tx/0xbb5facf81cd46d97cdb706ef2ecf6ecda70cd7cb32133b2ba5ed1a08b4748e44)
- Real broadcast: [0x639f87…012ee](https://atlantic.pharosscan.xyz/tx/0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee)

**Spend:** 0.00029803 PHRS of the 0.15 budget (dry-runs are read-only; only the
deploy + one broadcast cost gas).

**Tests:** 17/17 unit tests pass (`tests/test_estimation_parsing.py`) — estimation
parsing, revert decoding, 1.2× gas math, gate rules, no-signer structural check.

**Honest limits:** `cast estimate` over-predicted gas by ~28% (58,219 vs 45,470
actual) — the documented simulation/reality drift the 1.2× factor absorbs; the
Atlantic RPC rejects some Foundry request shapes (disclosed root-cause in
`REVIEWER_NOTES.md`; worked around with a local request normalizer, all data
still live from Atlantic).

## Repo link (commit-pinned)

`https://github.com/mohamedwael201193/lightkeeper/tree/044af202580c2764e987de109a7ccd083f08b9c2/tasks/t08-dry-run-executor`

*(Replace `1c91003e035f7d62cd8bdf8749a331e51c425dcb` with the commit hash after committing; do not paste unpinned `main`.)*

## Share / demo links

PENDING — the logged-in arena portal surface is unverified; will be added once a
share link can be generated from a real session.

## Video

PENDING-VIDEO — filming guide: `VIDEO-GUIDE.md` in the repo (45–90s, real
terminal + real explorer pages only, no staged fakes).
