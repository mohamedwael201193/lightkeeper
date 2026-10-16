# T04 — Doc-Search CLI: Official Requirements

Quoted VERBATIM from `~/workspace/your_files/pharos-arena-MEGA.md` §"T04 — Doc-Search CLI (Easy, 50 · Docs MCP)":

> **OFFICIAL:** (1) Accepts NL question as input (e.g. `pharos-docs "how do I deploy a contract?"`). (2) Returns concise answer + links/references to source doc sections. (3) Handles 'no good answer found' gracefully instead of inventing. (4) README with install/usage + 3 example queries with outputs.

> **Implementation (honest two-stage, QA-fixed):** there is NO public Docs-MCP API (verified: portal-embedded only; GitBook ask endpoint 403s plain GETs). Stage A: capture real Q&A pairs from the portal into `kb/seed.json` (the T03 session seeds it — run T03 first). Stage B: stdlib-only CLI with scored retrieval, threshold, source-linked answer cards, and a miss path that exits gracefully (never invents). No `--live` mode reverse-engineering private APIs (QA fix — deleted).

> **Evidence:** CLI repo, README with 3 live-pasted example Q&As, miss-path demo, share link to the seeding session.

> **Video:** ask → answer card with sources → a miss query → graceful "no good answer".

> **Risks:** thin KB (seed more from T03); retrieval misses (threshold tuning, honestly reported).

Related standing rules (MEGA §228, §230):

> **Citation discipline (scores in T04/T13/T27):** every technical answer carries DOC-GROUNDED (doc URL + date + excerpt) / INFERENCE / UNVERIFIED labels. T27's coverage gate: if docs don't cover it, the agent must SAY SO — never improvise.

> **Verified limits:** GitBook `?ask=&goal=` rejects plain HTTP GETs (403) — a T04 CLI cannot be a thin HTTP wrapper; use llms.txt + page fetch, or a portal-session wrapper that says so honestly. No public Docs-MCP repo/endpoint/schema exists.

Per-task bar (LIGHTKEEPER-VERDICT.md): **TOSS-UP** — "Honest seeded-KB + citation objects + documented graceful no-answer + 3-query README + video. First verified honest shipment takes it."

## How this build maps to the requirements

| # | Official requirement | Where it is met |
|---|---|---|
| 1 | Accepts NL question as input (`pharos-docs "how do I deploy a contract?"`) | `./pharos-docs` executable; see README §4 |
| 2 | Concise answer + links/references to source doc sections | Answer cards: verbatim quotes + `Source: <doc URL> (retrieved <date>)`; see evidence.md |
| 3 | 'No good answer found' handled gracefully, never invents | UNVERIFIED miss path, exit code 2; coverage gate (rare-term + 50% term overlap); see REVIEWER_NOTES.md |
| 4 | README with install/usage + 3 example queries with outputs | README.md §3, §4, §6 (7 live-pasted examples, all real terminal output) |

**Implementation note (documented deviation, QA-honest):** Stage A of the MEGA implementation
(port­al-seeded `kb/seed.json` from a T03 Docs-MCP session) was not available — T03's session log
exists but this builder could not perform the wallet sign-in the portal requires, and T03's own
evidence came from the public docs surfaces. The build uses the verdict-sanctioned alternative
design (a): **crawl `llms.txt` + full-corpus pages → local retrieval**. This is strictly stronger
than a portal-seeded KB for citation discipline (438 passages, 74 pages, every quote traceable to
a fetched URL + date), and the `?ask=` endpoint is reachable-but-undocumented and has 403'd
before — depending on it would violate the "no thin HTTP wrapper" rule either way. See
REVIEWER_NOTES.md §1.
