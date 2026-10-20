# T12 v3 — "Grounded Portfolio Action" (WS3 bet B: composed agents)

Tasks that call tasks, through one uniform contract
(`@lightkeeper/skill-adapter` `composed.py`): every stage is a subprocess
CLI (`--in/--out` JSON), every handoff is schema-checked, and every
sub-call carries an x402 payment-intent ledger entry (per-sub-call pricing;
settlement is recorded as an intent, never claimed on-chain).

## Pipeline

    T14 PROPOSE      stages/propose_t14.py  — real Chain MCP reads at a pinned
                       block (USDC balanceOf + decimals of the watched holder).
    T13+T04 GROUND   stages/ground_docs.py  — live Docs MCP grounding verdict
                       (needs a citation with a verbatim quote, else BLOCK).
    T11 GATE         stages/policy_gate.py  — fail-closed policy evaluation;
                       BLOCK/REFUSE halts the pipeline HERE.
    T08 DRY-RUN      stages/dryrun_t08.py   — real Chain MCP estimate_gas +
                       Tier-B sign-yourself unsigned tx for the user's wallet.

No private keys anywhere. Nothing broadcasts. The dry-run stage refuses
to execute unless the gate's ALLOW is in its schema-checked handoff.

## Run it

    python3 composed_agent.py --amount-usdc 5 --label flagship-1
    # exit 0 = completed, exit 2 = halted (the record is the proof)

## Kill-test (mandatory)

    python3 kill_test.py            # K1: saved deny-all record + K2: schema halt (offline)
    python3 kill_test.py --live     # also re-runs the deny-all pipeline live

- K1: `policy-deny-all.json` (deny_all=true) → the pipeline HALTS at the
  T11 gate ("blocked by: DENY-ALL"); the T08 dry-run stage NEVER executes.
  Proof: `run-logs/v3-kill-deny-all.json` (real failed run, saved).
- K2: a stage returning a handoff that violates the out-schema enum aborts
  the run before the next stage; x402 ledger stops at the halted stage.

## Records

- `run-logs/v3-flagship-1.json` — the flagship happy-path run: 4/4 stages
  OK, gate ALLOW (all 5 rules PASS on live values), estimate_gas = 58353,
  Tier-B unsigned transfer tx for the user's own wallet.
- `run-logs/v3-kill-deny-all.json` — the kill-test failure run: halted at
  gate, dry-run never executed.
