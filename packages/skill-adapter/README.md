# @lightkeeper/skill-adapter (L3)

Typed boundary for invoking skills. `invoke_skill(name, args, runner)` runs
the skill and captures tool errors into a typed `SkillResult` — recorded,
never masked. Write paths additionally need a confirmation token
(`WriteGate`); simulation paths can never broadcast.

## API (`lightkeeper_skill_adapter`)

- `invoke_skill(name, args, runner) -> SkillResult` (`ok`, `result`, `error`, `duration_s`; `.unwrap()`)
- `SkillFailed`, `ConfirmationMissing`
- `WriteGate.new_token()`, `WriteGate.require_confirmation(provided, expected)`

## Consumers

- `tasks/t12-skill-chain-flow/flow.py` — the SKILL (preflight) phase is invoked through `invoke_skill`

## Test

`python3 tests/test_skill_adapter.py` — 9 tests, offline.

## Composed agents (WS3 bet B) — `lightkeeper_skill_adapter.composed`

Tasks that call tasks: every stage is a subprocess CLI (`--in/--out` JSON),
every handoff is schema-checked (`check_handoff`, stdlib validator), and
every sub-call records an x402 payment-intent ledger entry (settlement is
labelled `intent-recorded`, never claimed on-chain). A stage declaring
`halt` (e.g. a policy BLOCK) stops the pipeline — see the flagship consumer:

- `tasks/t12-skill-chain-flow/v3/` — "Grounded Portfolio Action": T14
  propose → T13/T04 ground → T11 gate → T08 dry-run + Tier-B sign-yourself.
  Deny-all kill-test halts at the gate; the failure run is the proof.

`python3 tests/test_composed.py` — 9 tests, offline.
