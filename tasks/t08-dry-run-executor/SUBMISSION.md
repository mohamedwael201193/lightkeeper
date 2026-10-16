# SUBMISSION.md — T08 Dry-Run Executor (copy-paste Arena pack)

## Title

`Dry-Run Executor — simulate before you sign (T08)`

## One-liner

A SkillEngine dry-run gate for Pharos Atlantic: `cast estimate` + `forge script`
(without `--broadcast`) predict PASS/FAIL, decode the exact revert reason, apply
a 1.2× gas safety factor — and a separate broadcaster that only replays PASS
tickets, refusing FAILs automatically. The executor keeps score of itself: a
**prediction ledger** records every gated broadcast's predicted gas beside the
chain's actual gas, so the simulation/reality drift is public data, not a
handwave.

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
- **Scenario C — the prediction holds a second time.** Fresh dry-run of
  `ping()` → PASS (37,379 gas → 44,855 limit, predicted cost 0.00044855 PHRS,
  block 31486270) → gated broadcast →
  [tx 0xd294bb…4fb03](https://atlantic.pharosscan.xyz/tx/0xd294bb5c03c55d7ffdd750b0a20384aa393e490da11fe3d7f67845d34d34fb03):
  status success, gas used 28,370 (within the 44,855 limit), `Pinged` event
  with count 2 (probe was at 1, exactly as projected). The gate was re-tested
  against the fresh FAIL ticket → refused (exit 2) again.
- **Prediction ledger** (`runs/prediction-ledger.jsonl`, auto-appended by
  `broadcast.py` via `tools/ledger.py`): both predictions held — status
  success, gas inside the 1.2× limit, state exactly as projected. The honest
  read: estimates over-predict by ~30% on Atlantic (58,219→45,470 and
  37,379→28,370); the 1.2× factor covers that drift with margin.

**Contracts / transactions (Atlantic 688689):**

- `DryRunProbe` `0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f`
  ([explorer](https://atlantic.pharosscan.xyz/address/0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f))
- Deploy: [0xbb5fac…4748e44](https://atlantic.pharosscan.xyz/tx/0xbb5facf81cd46d97cdb706ef2ecf6ecda70cd7cb32133b2ba5ed1a08b4748e44)
- Real broadcast 1: [0x639f87…012ee](https://atlantic.pharosscan.xyz/tx/0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee)
- Real broadcast 2 (repeatability): [0xd294bb…4fb03](https://atlantic.pharosscan.xyz/tx/0xd294bb5c03c55d7ffdd750b0a20384aa393e490da11fe3d7f67845d34d34fb03)

**Spend:** 0.00032640 PHRS of the 0.15 budget (dry-runs are read-only; only the
deploy + two broadcasts cost gas).

**Tests:** 17/17 unit tests pass (`tests/test_estimation_parsing.py`) — estimation
parsing, revert decoding, 1.2× gas math, gate rules, no-signer structural check.

**Honest limits:** estimates **over-predict by ~30%** on Atlantic — measured,
not assumed: the prediction ledger (`runs/prediction-ledger.jsonl`) records
58,219→45,470 and 37,379→28,370 across the two gated broadcasts; the 1.2×
factor absorbs that drift with margin. The Atlantic RPC rejects some Foundry
request shapes (disclosed root-cause in `REVIEWER_NOTES.md`; worked around with
a local request normalizer, all data still live from Atlantic).

## Live interactive demo (LIGHTKEEPER console)

The task ships a wallet-interactive "try it live" surface in the LIGHTKEEPER
console (`apps/console/src/components/try/dry-run-executor.tsx`, Tier B —
propose + sign in the visitor's own wallet):

- **"See the outcome before your wallet opens."** The visitor builds a tx
  (to / value / data — with one-click presets for the live probe's `ping()`
  and `boom()`), then **Dry-run** runs `eth_call` + `eth_estimateGas` against
  Atlantic: no wallet, no signature, nothing broadcast. The outcome preview is
  the product — PASS (gas estimate, 1.2× safety limit, predicted cost, block
  height) or FAIL (exact revert reason decoded from the chain's error payload:
  `Error(string)` / `Panic(uint256)` / custom).
- **FAIL blocks the sign path with the reason stated** — the disabled button
  reads "Sign — blocked: would revert: …" and the plain-language revert reason
  is shown beside it. Never a dead button.
- **PASS unlocks propose → mandatory review** (to / value / gas / predicted
  cost, dust warning rendered AMBER) → the visitor approves and signs in
  **their own wallet** with **their testnet PHRS** → receipt + explorer link
  labeled "Your tx — signed in your wallet." LIGHTKEEPER never holds keys.
- The honest simulation/reality drift is stated on the page (the 1.2× factor
  exists because estimates have drifted ~30% on this network), backed by a
  **prediction track record** strip showing both real gated broadcasts with
  their predicted-vs-actual gas and explorer links, and the review
  step names the block the simulation ran at.

New filming shots for the console demo are in `VIDEO-GUIDE.md` (§ Shot 4).

## Repo link (commit-pinned)

`https://github.com/mohamedwael201193/lightkeeper/tree/4fd33e2facdb1d3cc975efabc6776fbc2ace3db3/tasks/t08-dry-run-executor`

*(Commit 4fd33e2 = T08 harden: scenario C broadcast, prediction ledger, console track-record strip.)*

## Share / demo links

PENDING — the logged-in arena portal surface is unverified; will be added once a
share link can be generated from a real session.

## Video

PENDING-VIDEO — filming guide: `VIDEO-GUIDE.md` in the repo (45–90s, real
terminal + real explorer pages only, no staged fakes).
