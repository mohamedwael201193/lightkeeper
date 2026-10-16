# T27 — Official Requirements (quoted VERBATIM)

Source: `~/workspace/your_files/pharos-arena-MEGA.md`
Section: `### T27 — Doc-Grounded Builder Agent (Hard, 200 · Cross-tool)`

## OFFICIAL

> (1) Uses Docs MCP to PLAN with sources cited BEFORE acting. (2) Executes via Chain MCP and/or SkillEngine — anything moving funds PREPARED FOR SIGNATURE only. (3) Verifies outcome on-chain, reports success/failure vs plan. (4) Works for ≥3 different 'how do I…' requests. (5) Handles docs-not-covering by SAYING SO instead of improvising.

## Implementation (campaign plan)

> 5-stage pipeline: INTAKE → Docs-MCP research (sources captured) → cited PLAN rendered before acting → Chain MCP/SkillEngine execution (funds-mode lock: unsigned only) → on-chain VERIFY → verdict report. 4 scripted requests: R1 read ERC-20 balance; R2 approve prepared-for-signature (unsigned, never broadcast); R3 block+gas; R4 a deliberately docs-uncovered question (e.g. confidential contracts) proving the say-so path via a coverage gate.

## Evidence

> 4 plans with citations, execution logs, on-chain verifications, the R4 say-so demo, share link.

## Video

> question → cited plan → execution → on-chain verify → verdict; R4: "docs don't cover this" instead of improvising.

## Risks

> docs thinness (that's R4's feature); plan/execution drift (verify step catches it).

## Citation discipline — MEGA §228 (applies to T04/T13/T27)

> **Citation discipline (scores in T04/T13/T27):** every technical answer carries DOC-GROUNDED (doc URL + date + excerpt) / INFERENCE / UNVERIFIED labels. T27's coverage gate: if docs don't cover it, the agent must SAY SO — never improvise.

## How this build maps to the requirements

| # | Requirement | This build |
|---|---|---|
| 1 | Docs MCP to PLAN with sources cited BEFORE acting | Local corpus crawl of `pharos.xyz/llms.txt` + `.md` docs pages (Docs MCP `?ask=` 403s plain GETs — proven 2026-10-16, see LIGHTKEEPER-VERDICT.md P14; the verdict's honest design is local retrieval). Every plan step carries `doc_url + retrieved_at + excerpt` citations; the plan renders before any execution. |
| 2 | Executes via Chain MCP and/or SkillEngine — funds PREPARED FOR SIGNATURE only | Build/deploy steps execute for real (T27-specific order: "executes the covered plan for real"); the funds-moving request (R3 transfer) is PREPARED FOR SIGNATURE only — real unsigned tx (real calldata, gas estimate, nonce, chainId), never broadcast. See REVIEWER_NOTES.md for the requirement-mapping rationale. |
| 3 | Verifies outcome on-chain, reports success/failure vs plan | D9 on-chain confirmation (bytecode, name/symbol/totalSupply, balanceOf) + receipt status; verdict report per request. |
| 4 | Works for ≥3 different 'how do I…' requests | R1 deploy ERC-20 + verify (real), R2 read ERC-20 balance (real), R3 transfer (prepared-for-signature). |
| 5 | Docs-not-covering → SAY SO, never improvise | R4 "make my token confidential" → REFUSED with say-so; uncovered terms named (`confidential`, `shielded` — zero corpus hits). Coverage-gate unit tests pin this behavior. |
