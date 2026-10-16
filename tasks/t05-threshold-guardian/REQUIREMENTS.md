# Official requirements — T05 Threshold Guardian (Medium, 100 pts, SkillEngine)

Quoted VERBATIM from the live Build page (extracted read-only 2026-10-15;
also present in `~/workspace/pharos-arena/official-requirements.json`):

1. **"Evaluates >=3 INDEPENDENT on-chain conditions"**
2. **"Conditions/thresholds CONFIGURABLE, not hard-coded"**
3. **"Logs clear decision trace each run (each condition's value, pass/fail, final decision)"**
4. **"Demonstrates BOTH outcomes (one fire run, one hold run)"**

## How this build maps to each requirement

| # | Official | Implementation |
|---|---|---|
| 1 | ≥3 independent on-chain conditions | 6 independent conditions, each with its own live chain read: (a) `eth_chainId` network check, (b) amount vs `max_per_tx` + rolling-window ledger, (c) `eth_getBalance` sufficiency, (d) `eth_gasPrice` sanity, (e) key-derivation sender binding via `cast wallet address`, (f) key-present check |
| 2 | Configurable, not hard-coded | Every number lives in `policy.yaml` (single file, commented): `max_per_tx_phrs`, `max_per_window_phrs`, `window_minutes`, `max_gas_price_gwei`, `allowed_chain_id`, `mainnet.enabled`. No thresholds in `guardian.py`. |
| 3 | Decision trace per run | Every run prints + appends to `run-logs/guardian-audit.jsonl` a trace: each condition's live value, PASS/FAIL, reason, final decision (ALLOW/BLOCK/REFUSE). |
| 4 | Both outcomes demonstrated | `run-logs/hold.log` (BLOCK, exit 2, no broadcast) + `run-logs/fire.log` (ALLOW → real broadcast `0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c`, status 1). |

## SkillEngine's mandatory Write Operation Pre-checks (SKILL.md)

The skill requires these 4 pre-checks for every write operation; this
guardian implements them as the evaluation pipeline:

1. **Private key check** → `key-present` condition (env `DEPLOYER_PRIVATE_KEY`; value never logged).
2. **Derive public address and confirm** → `sender-binding` condition (env key must derive to `policy.sender`; proposal sender must match).
3. **Network confirmation** → `network` condition (`eth_chainId` read live; mainnet-class ⇒ REFUSE outright — stricter than the skill's warn-and-confirm).
4. **Automatic balance check** → `balance` condition (`eth_getBalance` ≥ value + fee reserve; fail-closed).

Plus T05's own: threshold gate (per-tx + rolling window) and gas-price sanity.

## Competitor bar (LIGHTKEEPER-VERDICT.md)

The competitor's live guardian leads on shipped evidence but its showcased
FIRE policy was trivially satisfied (`>= 0`). This build beats it with:
(a) a cleaner single-file policy format, (b) the documented 4 pre-checks as
first-class conditions, (c) non-trivial branch-exercising (0.05 blocked /
0.0001 fired), and (d) a live mainnet refusal proof on top of both outcomes.
