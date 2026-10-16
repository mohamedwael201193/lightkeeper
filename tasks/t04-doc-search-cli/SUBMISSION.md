# T04 — Doc-Search CLI: Arena Submission Pack

Copy-paste ready. Do NOT submit on the user's behalf — the user copies and submits himself.

---

**Title:** Doc-Search CLI — Pharos docs Q&A with citation discipline

**One-liner:** A stdlib-only CLI that answers Pharos developer questions from a local index of the live docs, with every answer labeled DOC-GROUNDED / INFERENCE / UNVERIFIED — and a graceful, never-invent refusal when the docs don't cover the question.

**Description:**

`pharos-docs` answers Pharos developer questions with citations, not improvisation. It fetches
the live Pharos docs (`llms.txt`, the full GitBook corpus, `sitemap.md` — retrieved 2026-10-16),
builds a local BM25 passage index (438 passages, 74 pages), and answers only from that index.

Every technical answer carries exactly one label: DOC-GROUNDED (verbatim quote + doc URL +
retrieval date), INFERENCE (explicitly marked synthesis), or UNVERIFIED (exit code 2 — the tool
refuses to answer rather than invent). It is deliberately NOT a thin HTTP wrapper around the
GitBook `?ask=` endpoint (undocumented, previously 403'd, no citation schema): the CLI makes
zero network calls at answer time and contains no HTTP client (asserted by test).

Evidence: 9 real query transcripts against the live docs (7 grounded, 2 honest misses), a
machine-readable `evidence/evidence.json`, and 14 passing stdlib tests — including tests that
the CLI refuses (UNVERIFIED, exit 2) when the index has no covering passage, and that every
quoted excerpt is traceable verbatim to the fetched corpus. README includes install/usage and 4
live-pasted example Q&As plus a miss-path demo. Zero chain interaction, 0 PHRS spent (read-only).

**Code (commit-pinned):** https://github.com/mohamedwael201193/lightkeeper/tree/9ec5f2169a1cf97da891a0055156e6d51a185651/tasks/t04-doc-search-cli

**Share/demo links:**
- README (install, usage, 4 live examples): `tasks/t04-doc-search-cli/README.md`
- Evidence (9 real transcripts): `tasks/t04-doc-search-cli/evidence.md`
- Machine-readable log: `tasks/t04-doc-search-cli/evidence/evidence.json`
- Reviewer notes (architecture, `?ask=` investigation, threshold tuning): `tasks/t04-doc-search-cli/REVIEWER_NOTES.md`
- Link verification: `tasks/t04-doc-search-cli/LINKS.md` (all URLs curl-verified 2026-10-16)

**Video:** PENDING-VIDEO — shot-by-shot guide in `tasks/t04-doc-search-cli/VIDEO-GUIDE.md` (ask → cited answer → miss → graceful refusal, ~80s, real terminal output only).

---

*Built 2026-10-16 by the LIGHTKEEPER build op (task builder T04). Toolkit: Developer Docs MCP
(public docs surfaces; no portal sign-in performed or required).*
