# Fleet Grounding Scorecard

- Generated: 2026-10-20T04:19:51.621990+00:00 (by run_fleet_audit.py @ 49c1f13)
- Score: **92.9%** — 13/14 scored checks passed (14 total, errors reported separately)
- Honest rule: scores are published as measured; failed checks and their fixes are listed, never dropped from the battery

## Per task

- **fleet**: 5 PASS / 1 FAIL / 0 ERROR
- **t04**: 2 PASS / 0 FAIL / 0 ERROR
- **t13**: 6 PASS / 0 FAIL / 0 ERROR

## Checks

- [PASS] t04/Q1 (quotes): quote still appears verbatim in the live page
- [PASS] t04/Q2 (quotes): quote still appears verbatim in the live page
- [PASS] t13/Q3 (quotes): quote still appears verbatim in the live page
- [PASS] t13/Q4 (quotes): quote still appears verbatim in the live page
- [PASS] t13/Q5 (quotes): quote still appears verbatim in the live page
- [FAIL] fleet/BAIT-1 (bait): the Docs MCP answer supplied content for an invented topic instead of refusing — hallucination risk, transcript below
- [PASS] fleet/BAIT-2 (bait): the Docs MCP answer acknowledges the topic is not covered (honest refusal)
- [PASS] fleet/BAIT-3 (bait): the Docs MCP answer acknowledges the topic is not covered (honest refusal)
- [PASS] fleet/BAIT-4 (bait): the Docs MCP answer acknowledges the topic is not covered (honest refusal)
- [PASS] fleet/BAIT-5 (bait): the Docs MCP answer acknowledges the topic is not covered (honest refusal)
- [PASS] fleet/BAIT-6 (bait): the Docs MCP answer acknowledges the topic is not covered (honest refusal)
- [PASS] t13/C1 (onchain): fresh read at the pinned block matches the recorded read
- [PASS] t13/C2 (onchain): fresh read at the pinned block matches the recorded read
- [PASS] t13/C3 (onchain): fresh read at the pinned block matches the recorded read

## Fix list

- [fleet/BAIT-1] treat answers on this topic as UNVERIFIED in every task; add an explicit 'not in the docs' guard to the task's prompting
