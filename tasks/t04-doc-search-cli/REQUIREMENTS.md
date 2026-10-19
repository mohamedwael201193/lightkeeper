# T04 — Doc-Search CLI: Official Requirements

Quoted VERBATIM from `~/workspace/your_files/pharos-arena-MEGA.md` §"T04 — Doc-Search CLI (Easy, 50 · Docs MCP)":

> **OFFICIAL:** (1) Accepts NL question as input (e.g. `pharos-docs "how do I deploy a contract?"`). (2) Returns concise answer + links/references to source doc sections. (3) Handles 'no good answer found' gracefully instead of inventing. (4) README with install/usage + 3 example queries with outputs.

> ~~**Implementation (honest two-stage, QA-fixed):** there is NO public Docs-MCP API (verified: portal-embedded only; GitBook ask endpoint 403s plain GETs). Stage A: capture real Q&A pairs from the portal into `kb/seed.json` (the T03 session seeds it — run T03 first). Stage B: stdlib-only CLI with scored retrieval, threshold, source-linked answer cards, and a miss path that exits gracefully (never invents). No `--live` mode reverse-engineering private APIs (QA fix — deleted).~~
>
> **SUPERSEDED 2026-10-19 (v2 resubmission):** the premise above was wrong. A public,
> callable Developer Docs MCP exists at `https://docs.pharos.xyz/~gitbook/mcp`
> (GitBook's MCP endpoint — the 403 was on the wrong `?ask=` page path, which was
> never the MCP path). The CLI is now a thin, honest wrapper around the real Docs
> MCP: question → `searchDocumentation` → ranked answer cards with doc links →
> `getPage` for full context → graceful miss path. The `llms-full.txt` index is deleted.

> **Evidence:** CLI repo, README with 3 live-pasted example Q&As, miss-path demo, share link to the seeding session.

> **Video:** ask → answer card with sources → a miss query → graceful "no good answer".

> **Risks:** thin KB (seed more from T03); retrieval misses (threshold tuning, honestly reported).

Related standing rules (MEGA §228, §230):

> **Citation discipline (scores in T04/T13/T27):** every technical answer carries DOC-GROUNDED (doc URL + date + excerpt) / INFERENCE / UNVERIFIED labels. T27's coverage gate: if docs don't cover it, the agent must SAY SO — never improvise.

> **Verified limits:** GitBook `?ask=&goal=` rejects plain HTTP GETs (403) — a T04 CLI cannot be a thin HTTP wrapper; use llms.txt + page fetch, or a portal-session wrapper that says so honestly. No public Docs-MCP repo/endpoint/schema exists.

Per-task bar (LIGHTKEEPER-VERDICT.md): **TOSS-UP** — "Honest seeded-KB + citation objects + documented graceful no-answer + 3-query README + video. First verified honest shipment takes it."

## How this build maps to the requirements (rebuilt 2026-10-19)

| # | Official requirement | Where it is met |
|---|---|---|
| 1 | Accepts NL question as input (`pharos-docs "how do I deploy a contract?"`) | `./pharos-docs` executable — every query is a live `searchDocumentation` tools/call to the Docs MCP; see README §4 |
| 2 | Concise answer + links/references to source doc sections | Answer cards: verbatim MCP excerpts + `Source: <doc URL> (via Docs MCP, retrieved <date>)`; see `evidence/evidence.json` citations |
| 3 | 'No good answer found' handled gracefully, never invents | UNVERIFIED miss path, exit code 2; relevance gate over MCP results; closest-pages browse hints; see `evidence/evidence.json` M1–M2 |
| 4 | README with install/usage + 3 example queries with outputs | README.md §2 (install), §3 (usage), §5 (real MCP outputs, 2026-10-19) |

**Resubmission note (2026-10-19, addresses the reviewer's verdict):** the first
submission was rejected — "Answers come from an index built from llms-full.txt,
not the Developer Docs MCP. Wrap the Docs MCP directly and resubmit." This
rebuild deletes the index approach outright (no corpus, no BM25, no
`--rebuild-index`) and wraps the real public Docs MCP endpoint
`https://docs.pharos.xyz/~gitbook/mcp` directly: `searchDocumentation` for
answers, `getPage` for full pages, `askQuestion` for synthesized answers.
`sendFeedback` is never invoked. Honest claim boundary: this is the public
GitBook Docs MCP (docs-only), not the login-gated ai.pharos.xyz portal session.

## Previous mapping (superseded 2026-10-19 — the llms-full.txt index build)

**Implementation note (documented deviation, QA-honest):** Stage A of the MEGA implementation
(port­al-seeded `kb/seed.json` from a T03 Docs-MCP session) was not available — T03's session log
exists but this builder could not perform the wallet sign-in the portal requires, and T03's own
evidence came from the public docs surfaces. The build uses the verdict-sanctioned alternative
design (a): **crawl `llms.txt` + full-corpus pages → local retrieval**. This is strictly stronger
than a portal-seeded KB for citation discipline (438 passages, 74 pages, every quote traceable to
a fetched URL + date), and the `?ask=` endpoint is reachable-but-undocumented and has 403'd
before — depending on it would violate the "no thin HTTP wrapper" rule either way.
*(Note 2026-10-19: this entire index-based design was superseded — the CLI now wraps the real
Docs MCP directly. Retained as history only.)*
