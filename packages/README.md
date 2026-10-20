# `@lightkeeper/*` — the 10 shared libraries

One monorepo, ten shared libraries, twenty-eight task modules. Every library
below is **implemented** (not spec'd) and has **at least one real runtime
consumer** — a task or console module that imports it. Status is verifiable:
each package ships its own tests, and consumers are listed per package.

## Import mechanism (documented, the same everywhere)

**Python tasks** add the package's `py/` dir to `sys.path`:

```python
REPO_ROOT = os.path.dirname(os.path.dirname(TASK_DIR))  # the lightkeeper/ root
sys.path.insert(0, os.path.join(REPO_ROOT, "packages", "chain-data", "py"))
from lightkeeper_chain_data import ChainMCP
```

**Console (TypeScript)** imports the package source directly (bundled by Vite,
type-checked by `tsc -p tsconfig.app.json`):

```ts
import { parseDecimalToBigint } from "../../../../packages/value-format/src/index";
```

**Task JS (`.mjs`)** imports the package file relatively:

```js
import { PortfolioReader } from "../../../packages/portfolio/src/portfolio.mjs";
```

## The ten

| # | Package | Lang | Owns | Real consumers |
|---|---------|------|------|----------------|
| L1 | `chain-data` | Python (`lightkeeper_chain_data`) | Canonical Chain MCP client; network-identity table; fail-on-mismatch chain assertions; ≤1,000-block log chunking | T01 `bin/read-contract-state.py`, T02 `monitor.py`, T12 `flow.py` |
| L2 | `docs-grounding` | Python (`lightkeeper_docs_grounding`) | Citation objects; `grounded/partial/unknown` verdicts; refuses to improvise; quote-block extraction + verbatim verification | T03 `scripts/quote_check.py` |
| L3 | `skill-adapter` | Python (`lightkeeper_skill_adapter`) | Typed skill-invocation boundary; errors captured, never masked; write paths need a confirmation token | T12 `flow.py` (SKILL phase) |
| L4 | `value-format` | TypeScript (`@lightkeeper/value-format`) | Bigint-only amount math; decimals are a parameter; every formatted value keeps its raw form | console `src/hooks/useAtlantic.ts` |
| L5 | `policy` | Python (`lightkeeper_policy`) | Default-deny pre-execution gate (`evaluate_rules` → `Decision`); missing policy ⇒ REFUSE; hash-chained audit log | T12 `flow.py` (`evaluate`) |
| L6 | `workflow` | Python (`lightkeeper_workflow`) | Saga state machine; failure taxonomy (transient/permanent/gate); retry policy; idempotent resume; honest forward compensation | T06 `scripts/saga.py` |
| L7 | `persistence` | Python (`lightkeeper_persistence`) | Atomic JSON document store; SQLite backend (cursors, dedup sets, kv); restart-safe | T02 `monitor.py` (state.json) |
| L8 | `portfolio` | JavaScript (`@lightkeeper/portfolio`) | Read-only on-chain portfolio reader; every number cited (contract + block); never invents prices | T14 `src/index.mjs`, `bin/run.mjs` |
| L9 | `notifications` | Python (`lightkeeper_notifications`) | Alert = what+value+link+action; file-backed dedup; real Telegram delivery (fails loudly without creds); write-ahead dedup notifier | T02 `monitor.py` (`emit_alert`) |
| L10 | `evidence` | Python (`lightkeeper_evidence`) | Proof records; **refuses records without source identifiers**; secrets-redaction scan; evidence.md rendered from records | T04 `evidence/run_evidence.py` |

## Tests

Each package has `tests/` and they all pass offline:

```bash
for p in chain-data docs-grounding skill-adapter policy workflow persistence notifications evidence; do
  python3 packages/$p/tests/test_*.py
done
# value-format (TypeScript): compile with the console's tsc, then run under node
cd apps/console && npx tsc ../../packages/value-format/src/index.ts \
  --outDir ../../packages/value-format/dist-test --module nodenext \
  --target es2020 --moduleResolution nodenext --skipLibCheck
node ../../packages/value-format/tests/test_value_format.mjs
# portfolio: node --test against the package (unit describes; live describes hit Atlantic)
cd tasks/t14-portfolio-assistant && node --test test/portfolio.test.mjs
```

Honesty note: the per-task `src/mcp_client.py` copies (T01, T12) and the old
`tasks/t14-portfolio-assistant/src/lib/portfolio.mjs` were the pre-promotion
duplicates; the packages above are now the canonical homes.
