# T04 — Doc-Search CLI: Links

## The Docs MCP endpoint (verified live 2026-10-19)

| URL | What | Verified |
|---|---|---|
| https://docs.pharos.xyz/~gitbook/mcp | Developer Docs MCP — public GitBook MCP endpoint, no auth; Streamable HTTP JSON-RPC; server `docs.pharos.xyz MCP Server 0.27.2`; tools `searchDocumentation`, `getPage`, `askQuestion` (`sendFeedback` never invoked) | live `tools/list` + real `tools/call` round-trips 2026-10-19 |

## Citation URLs (appear in `evidence/evidence.json` answer cards)

Citation URLs are the doc pages returned by the MCP's `searchDocumentation`
tool for each evidence query. They are recorded verbatim per query in
`evidence/evidence.json` under `citations[].page_url`, and the raw MCP
responses that produced them are saved under `evidence/raw/`.

Re-verify any time: `python3 evidence/run_evidence.py` replays the full
10-query battery against the live MCP.

## Claim boundary

This endpoint is the **public GitBook Docs MCP** (docs-only). It is not the
login-gated `ai.pharos.xyz` portal session, and it has no chain tools —
see README §1.
