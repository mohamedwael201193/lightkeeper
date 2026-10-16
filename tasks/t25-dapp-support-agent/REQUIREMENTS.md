# T25 — dApp Support Agent · Official Requirements (quoted VERBATIM)

Source: `~/workspace/your_files/pharos-arena-MEGA.md` § "T25 — dApp Support Agent (Easy, 50 · Support)" (read 2026-10-16).

## OFFICIAL

> **OFFICIAL:** (1) Accepts tx hash, fetches tx+receipt via Chain MCP. (2) Identifies failure cause (revert reason/out of gas/insufficient balance or allowance...). (3) Plain-language explanation + suggested fix. (4) Demonstrated on ≥3 DIFFERENT failure types.

## Implementation (per MEGA)

> **Implementation:** intake → `get_transaction` + `get_receipt` → cause branches: out-of-gas (gasUsed==gasLimit), revert-with-reason (`eth_call` replay at block−1 + revert-data decoding incl. Error/Panic/custom), insufficient balance/allowance (pre-condition reads at block−1), honest pending/not-found path → explanation + fix. 3 real distinct failures: organic PharosScan mainnet failures or self-generated real dust failures on Atlantic — labeled, never fabricated.

## Evidence (per MEGA)

> **Evidence:** 3 diagnosed failures (different types) with explanations + fixes, share link.

## Video (per MEGA)

> **Video:** tx hash → receipt → cause → plain-language explanation → fix.

## Risks (per MEGA)

> **Risks:** unknown revert selectors (report selector honestly); pending tx (honest path).

## Competitor bar (per MEGA §5.2 — shoupeorg "Harbor Master", coverage L1 L2 L10)

> | T25 | Harbor Master | L1 L2 L10 | 3 distinct failure types diagnosed |

To beat Harbor Master on T25: diagnose **3 distinct failure types** on real txs, with plain-language explanations + fixes. This build demonstrates **4** (revert-with-reason, out-of-gas, Solidity panic, organic third-party failure) plus a doc-grounded Q&A capability.

## Citation discipline (per MEGA §"Citation discipline")

> every technical answer carries DOC-GROUNDED (doc URL + date + excerpt) / INFERENCE / UNVERIFIED labels.

The agent enforces this on every answer it emits. The Docs-MCP `?ask=` endpoint 403s plain GETs (verified first-hand 2026-10-16 per LIGHTKEEPER-VERDICT.md), so doc-grounding is via a local KB built from real page fetches on 2026-10-16 (`src/kb.json`), with an honest say-so path when the docs don't cover a question.
