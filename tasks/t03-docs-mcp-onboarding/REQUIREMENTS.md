# T03 — Docs MCP Onboarding: Official Requirements

Source: `~/workspace/your_files/pharos-arena-MEGA.md`, §3.2 (T03 block) and §232.
Quoted VERBATIM. Nothing added, nothing paraphrased.

## §3.2 — T03 — Docs MCP Onboarding (Easy, 50 · Docs MCP)

> **OFFICIAL:** (1) Step-by-step log of what you tried, questions asked to Docs MCP, answers received. (2) ≥3 CONCRETE gaps/breakdowns (wrong/missing/confusing) each with the EXACT query. (3) A suggested fix per gap (what docs should have said). (4) Ends with what you managed to build/run. **CONSTRAINT: use ONLY Docs MCP — no external docs, search engines, or community help.**

## §232 — T03 in one line

> **T03 in one line:** it is a *feedback* task. The deliverable is a step-by-step log (queries asked → answers received) + ≥3 concrete gaps with EXACT queries + a suggested fix per gap + what you built — using ONLY Docs MCP. Pre-seeded hypotheses and external probes (e.g. your own `tools/list`) must be quarantined to a non-evidence appendix: the evidence section may only contain Docs-MCP-derived material.

## Per-task bar (LIGHTKEEPER-VERDICT.md)

- T03 is Wave 1 (Days 1–4), Easy 6; T03's Docs-MCP log starts day one and seeds T04's KB.
- ONLY-Docs-MCP firewall: hypotheses/external probes quarantined to a non-evidence appendix.
- ~~Verified precision patch (2026-10-16, SUPERSEDED 2026-10-19): Developer Docs MCP is
  portal-embedded only; `?ask=&goal=` was reported 403 on plain GET (first-hand, verdict team,
  2026-10-16); no public Docs-MCP repo/endpoint/schema exists.~~
- **Verified precision patch (2026-10-19, live-verified):** the Developer Docs MCP is a PUBLIC
  endpoint — `https://docs.pharos.xyz/~gitbook/mcp` (GitBook MCP, Streamable HTTP, no auth,
  server v0.27.2), tools `askQuestion` / `searchDocumentation` / `getPage` (`sendFeedback`
  excluded). The 2026-10-16 "portal-embedded only" conclusion was wrong: the `?ask=` page path
  403s, but the real MCP path was never probed. All queries in this build go through
  `askQuestion` on that endpoint. Claim boundary: public GitBook endpoint, NOT the login-gated
  ai.pharos.xyz portal session; docs-only, no chain-tool access claimed.
- MEGA §3.2 implementation guidance: run 7 onboarding queries (sign-in, network identity, faucet, Chain MCP reads, get_logs limits, SkillEngine install, submission mechanics).

## How this build maps to the four official deliverables

| Official req | Where it lives |
|---|---|
| (1) Step-by-step log (tried → asked → received) | `evidence.md` §1 + `evidence/runs/run-mcp-*.json` (raw, verbatim) + `evidence/transcripts/` + `scripts/query_log.py` replays it |
| (2) ≥3 concrete gaps, each with the EXACT query | `evidence.md` §2 (Gap table G1–G5, all Docs-MCP-derived) |
| (3) Suggested fix per gap | Same table, "what the docs should have said" column |
| (4) What you built/ran | `README.md` §5 + `QUICKSTART.md` (onboarding artifact derived from real MCP answers) |
| CONSTRAINT (ONLY Docs MCP) | Firewall statement in `README.md` §6 + `evidence.md` §3 (non-evidence appendix) |
