# @lightkeeper/policy (L5)

Pre-execution gate. Fail-closed: missing policy sections ⇒ REFUSE, a policy
with no rules ⇒ BLOCK (default-deny), any failing rule ⇒ BLOCK with per-rule
reasons. `evaluate_rules(policy, live, rules, require_sections=...)` returns
a `Decision` (`ALLOW`/`BLOCK`/`REFUSE` + per-rule verdicts + blocked list).
`AuditLog` is the append-only, hash-chained JSONL trail of every decision.

## API (`lightkeeper_policy`)

- `Rule(name, check, detail)`, `RuleResult`, `Decision` (`.to_legacy()` → `(verdict, [dicts], blocked)`)
- `evaluate_rules(policy, live, rules, require_sections=())`
- `AuditLog(path)` — `.append(entry)`, `.verify()`

## Consumers

- `tasks/t12-skill-chain-flow/flow.py` — `evaluate()` delegates to `evaluate_rules`; historical return shape preserved (see `tasks/t12-skill-chain-flow/tests/test_policy.py`)

## Test

`python3 tests/test_policy.py` — 9 tests, offline.
