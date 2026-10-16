# T11 — Reviewer notes (60-second verification)

## Fastest path
1. Open the tx: https://atlantic.pharosscan.xyz/tx/0xc471c8f7aa4d8cb0963f80335d190607a883ab749d2058f0d047d476678159bb
   → 0.001 PHRS from `0xf76e…bC71a3` to `0x0000…dEaD`, status success, block 31481699.
2. `python3 gatekeeper.py audit-verify` → chain intact, 5 entries.
3. Read entry 1 of `audit/check-log.jsonl` → the DENY with named rule
   `destination_allowlist` (the required BLOCK case).
4. Read entry 4 → `REFUSED_MAINNET` (mainnet re-confirmation proof).
5. `python3 tests/test_policy_engine.py` → 22/22.

## Requirement coverage

| Official requirement | Where |
|---|---|
| (1) Clear policy (allowlists/limits/denylists) | `policy.json` — action, selector, token, destination allowlists; per-action caps; denylist-by-absence (`deploy` not listed) |
| (2) Intercepts action pre-execution and checks | `evaluate` runs 8 named rules before anything else; `execute` re-validates the stamp |
| (3) Blocks violations WITH explanation | RUN A: DENY + named rule + per-rule detail in `run-logs/deny.log` and audit entry 1 |
| (4) Allows valid with check log | RUN B: APPROVE, all-8-PASS trace, real tx, audit entries 2+5 |
| 4 mandatory Write Operation Pre-checks | P1–P4 (+C1 gas sanity) printed on the execute path, `run-logs/approve-execute.log`; mainnet re-confirmation → refusal |
| policy.json evidence | committed, hash `403e6395…159bb`, stamped into every audit entry |
| check log (PASS + BLOCK) | `audit/check-log.jsonl` |
| no-bypass demo | `run-logs/nobypass.log` + audit entry 3 |

## Things a skeptical reviewer might poke

- **"The deny destination is a made-up address."** Yes — deliberately: a
  non-allowlisted stranger address is exactly what the rule must catch.
  Nothing was broadcast, nothing is claimed.
- **"Only one real tx."** Correct and within the dust budget (0.00102 of
  0.15 PHRS). The deny path must never produce a tx by design.
- **"Cooldown didn't fire live."** True — we waited it out honestly
  (65 s sleep between evaluate and execute). The deny path is unit-tested.
- **"Time window is convenient."** The 02:00–08:00 UTC window covered the
  evidence runs; out-of-window denial is unit-tested (`test_time_window_denies_outside`).
- **"Stamp isn't a real signature."** Stated openly in README §8. It is a
  hash-bound, audit-backed freshness token for the agent's own executor —
  the no-bypass claim is scoped to that path.
