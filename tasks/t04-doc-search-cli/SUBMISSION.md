# T04 — Doc-Search CLI: Arena Submission Pack (RESUBMISSION)

Copy-paste ready. Do NOT submit on the user's behalf — the user copies and submits himself.

**Resubmission reason:** the first submission was returned with "Changes requested":
*"Answers come from an index built from llms-full.txt, not the Developer Docs MCP.
Wrap the Docs MCP directly and resubmit."* This rebuild does exactly that — the
index approach was deleted outright and the CLI now wraps the real public
Developer Docs MCP (`https://docs.pharos.xyz/~gitbook/mcp`) directly.

---

**Title:** Doc-Search CLI — Pharos docs Q&A, wrapped directly on the Developer Docs MCP

**One-liner:** A stdlib-only CLI that answers Pharos developer questions through live
Developer Docs MCP tool calls (`searchDocumentation` / `getPage` / `askQuestion`),
with every answer labeled DOC-GROUNDED (verbatim MCP excerpt + doc URL + date) or
UNVERIFIED (exit 2 — refuses rather than invents).

**Description:**

`pharos-docs` wraps the Developer Docs MCP directly — no local index, no scraping,
no invented content. Every query is a real `tools/call` round-trip against the
public GitBook MCP endpoint at `https://docs.pharos.xyz/~gitbook/mcp` (no auth).

Ask a question → the CLI calls the MCP's `searchDocumentation` tool → a relevance
gate checks that the question's distinctive terms actually appear in the returned
results (the MCP always returns results, so "no" is the CLI's honest decision) →
the top covering results become answer cards with verbatim excerpts, doc URLs and
retrieval dates. `--page` fetches full page text via the `getPage` tool;
`--ask` gets a synthesized answer via `askQuestion`. `sendFeedback` is never
invoked.

When no MCP result covers the question, the CLI exits 2 with an UNVERIFIED
refusal plus closest-page browse hints — it never improvises. Citation
discipline is machine-checked: the test suite asserts offline that every quoted
excerpt in the evidence battery is a verbatim substring of the raw MCP response
it came from.

Honest boundary: this is the public GitBook Docs MCP (docs-only), not the
login-gated portal session; it has no chain tools.

Evidence: a 7-query battery of real MCP round-trips (5 grounded, 2 honest
misses) with raw responses saved verbatim, a machine-readable
`evidence/evidence.json`, and passing stdlib tests. README includes install,
usage, and real MCP outputs. Zero chain interaction, 0 PHRS spent (read-only).

**Code (commit-pinned):** https://github.com/mohamedwael201193/lightkeeper/tree/<COMMIT>/tasks/t04-doc-search-cli

**Share/demo links:**
- README (install, usage, real MCP examples): `tasks/t04-doc-search-cli/README.md`
- Evidence (7 real MCP round-trips): `tasks/t04-doc-search-cli/evidence/evidence.json`
- Raw MCP responses: `tasks/t04-doc-search-cli/evidence/raw/`
- Link verification: `tasks/t04-doc-search-cli/LINKS.md`

*VIDEO: re-record against the rebuilt CLI (the previous video shows the retired
index build). Suggested shots: ask → grounded answer card with doc citation →
a miss query → graceful UNVERIFIED refusal (exit 2).*

## Video

REPLACE_WITH_NEW_VIDEO_LINK

## Try it live (LIGHTKEEPER console — Tier C)

- https://lightkeeper-console.vercel.app/#/task/doc-search-cli — "Search the docs, get the command":
  type a question, get the matched verbatim docs answer pattern with its doc-page
  citation plus the exact `./pharos-docs` CLI command that produces it via the live
  Docs MCP, copy-paste ready — with the same honest UNVERIFIED refusal when nothing
  matches. Nothing executes in the browser; the visitor runs the CLI in their own
  terminal, where every query is a real Docs MCP `tools/call`.

---

*Rebuilt 2026-10-19 by the LIGHTKEEPER resubmission op (task builder T04).
Toolkit: Developer Docs MCP — wrapped directly, per the reviewer's verdict.*
