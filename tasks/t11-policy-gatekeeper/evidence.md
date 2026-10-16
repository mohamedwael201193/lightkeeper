# T11 Policy Gatekeeper — Evidence

All links curl-tested (HTTP 200) on 2026-10-16. Network: **Atlantic testnet
only** (chain ID 688689). Sender: `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`.

## The broadcast (RUN B — compliant action, APPROVED then executed)

| Field | Value |
|---|---|
| Tx hash | `0xc471c8f7aa4d8cb0963f80335d190607a883ab749d2058f0d047d476678159bb` |
| Explorer | https://atlantic.pharosscan.xyz/tx/0xc471c8f7aa4d8cb0963f80335d190607a883ab749d2058f0d047d476678159bb |
| Block | 31481699 |
| Status | 0x1 (success) |
| Action | `native_transfer`, 0.001 PHRS → allowlisted dust sink `0x0000…dEaD` |
| Gas | 21000 × 1000000001 wei = 0.00002100021 PHRS |
| Total attributable spend | **0.00102100021 PHRS** (budget 0.15 PHRS) |

## The denial (RUN A — violating action, honestly logged, nothing broadcast)

`native_transfer` 0.001 PHRS → `0x1111…1111` (not allowlisted).
Decision **DENY**, named rule `destination_allowlist`, audit entry 1.
Full trace: `run-logs/deny.log`. No transaction was created — there is no
hash to show, and none is claimed.

## Mainnet refusal (proven, no broadcast path)

Proposal targeting `chain_id: 1672` (mainnet) → **REFUSED_MAINNET** at
evaluate time, audit entry 4, `run-logs/mainnet-refusal.log`. `evaluate` is
pure (no RPC, no subprocess) — proven by a unit test that replaces every
side-effecting callable with one that raises. The SkillEngine 4th
pre-check (mainnet re-confirmation) is therefore satisfied by refusal, not
by confirmation.

## No-bypass demo

`execute` with a tampered gate stamp → **REFUSE**
(`no-bypass: stamp signature mismatch (tampered)`), audit entry 3,
`run-logs/nobypass.log`. The real stamp then executed normally.

## Audit trail

`audit/check-log.jsonl` — 5 entries, hash chain verified intact by
`python3 gatekeeper.py audit-verify` (`run-logs/audit-verify.log`):

1. DENY (destination_allowlist) — 04:12:03 UTC
2. APPROVE (all 8 rules PASS, stamp minted) — 04:12:26 UTC
3. REFUSE (no-bypass, forged stamp) — 04:12:27 UTC
4. REFUSED_MAINNET — 04:12:48 UTC
5. EXECUTED — 04:14:40 UTC

## Tests

`python3 tests/test_policy_engine.py` → **22/22 pass**, covering: each of
the 8 rule types (allowlist hit/miss, selector, token, destination, caps,
time window in/out, cooldown), fail-closed on missing/corrupt/incomplete
policy, mainnet refusal + its purity (no side effects), stamp validity
(expired/tampered/wrong-action/no-audit-entry), and audit-chain tamper
detection.

## Spend note

The deployer wallet is shared by 28 build workers, so raw balance deltas
are not attributable to T11. The figure above (0.00102100021 PHRS) is
computed from T11's own receipt and is the only spend T11 claims.
