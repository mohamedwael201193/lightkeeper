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
