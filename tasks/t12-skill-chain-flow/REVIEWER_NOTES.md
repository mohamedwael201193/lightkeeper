# T12 — Reviewer Notes (30-second test)

**The one thing to check:** the skill verdict genuinely depends on live chain
data — not on the requester's intention.

1. Open `run-logs/flow-transcript.jsonl`. It is append-only JSONL, one record
   per phase (READ → SKILL → EXECUTE → VERIFY) for every run, with real values.
2. Find the `allow-3` run: SKILL `verdict: "ALLOW"`, EXECUTE has a real
   `tx_hash`; VERIFY shows `pingCount_after` = `pingCount_before` + 1.
3. Find the `block-1` run: SKILL `verdict: "BLOCK"`, `blocked_by:
   ["RULE-AMOUNT"]` — the rule detail quotes the live balance read in the same
   run (5.868857845315957842 PHRS). EXECUTE has `broadcast: false`; VERIFY shows
   `pingCount` unchanged. Same flow, same contract, same session shape —
   different live-data verdict.
4. Click the two explorer links in `evidence.md` (curl-verified 200): the
   deploy tx and the `ping()` execute tx, both mined, both on Atlantic (688689).
5. Honest-failure rows are in the transcript, not deleted: one freshness-BLOCK
   (window too tight for ~1s blocks) and one ALLOW whose broadcast crashed on a
   value-encoding bug before any tx was sent.

**What this is not:** a demo with canned outputs. `flow.py` hits the live
Atlantic RPC for every read and broadcast; `tests/test_policy.py` (8/8) covers
the skill engine's ALLOW/BLOCK logic off-chain so reviewers can see exactly
what the on-chain values decide.

**Boundary the reviewer should know:** the portal's hosted Chain MCP endpoint
is mainnet-only, so this task reproduces the portal pattern locally with
`cast` against Atlantic — the same boundaries (read → skill on that data →
verify), per MEGA §240.

**Budget:** 0.0004362040 PHRS of the 0.15 cap. Every spend is in `evidence.json`.
