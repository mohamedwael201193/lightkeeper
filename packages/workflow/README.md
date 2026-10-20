# @lightkeeper/workflow (L6)

Durable multi-step saga state machine: failure taxonomy
(`TransientFailure`/`PermanentFailure`/`GateFailure`), a pure `RetryPolicy`
(backoff schedule + gas-bump multiplier + decision table), an append-only
`SagaLedger` with idempotent resume (completed steps never re-run), and
`Saga`, which runs steps with retry and — on permanent failure — honest
forward compensation in reverse order (never a fake rollback).

## API (`lightkeeper_workflow`)

- `RetryPolicy(max_retries, backoff_s, gas_bump)` — `.delay_for(a)`, `.gas_multiplier(a)`, `.decide(kind, attempt)`
- `Saga(run_id, ledger_path, retry)` — `.add_step(name, fn, compensate=None)`, `.run()`
- `SagaLedger(path)` — `.append()`, `.completed_steps()`

## Consumers

- `tasks/t06-saga-executor/scripts/saga.py` — failure taxonomy + `RetryPolicy` drive `retry_decision` and the retry loop (`--selftest`: 25 PASS)

## Test

`python3 tests/test_workflow.py` — 13 tests, offline.
