# T03 — Links (curl-verified 2026-10-19)

Every URL referenced in the evidence, fetched with `curl` in this session.
Verification log: `evidence/link_check.json` (`python3 scripts/query_log.py links`).

**Transience note:** docs.pharos.xyz intermittently drops connections (`RemoteDisconnected`) for
scripted clients — different URLs fail on different runs while succeeding on others. Every docs URL
below returned HTTP 200 at least once in this session; the checker log records the latest run's
snapshot. The Docs MCP endpoint itself drops ~30–40% of calls (stateless — retry recovers);
see `evidence.md` G4.

## Docs corpus & indexes

- https://www.pharos.xyz/llms.txt — docs navigation index (HTTP 200, 16,089 B)
- https://docs.pharos.xyz/llms.txt — same index on docs host (HTTP 200)
- https://docs.pharos.xyz/llms-full.txt — full documentation bundle (HTTP 200, 403,670 B)
- https://docs.pharos.xyz/sitemap.md — full site index (HTTP 200, 8,465 B)

## Network pages (Live Data)

- https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md — Atlantic Testnet: chain ID 688689, RPC `https://atlantic.dplabs-internal.com`, PHRS, 500 req/5m (HTTP 200)
- https://docs.pharos.xyz/getting-started/network/pacific-mainnet.md — Pacific Mainnet: chain ID 1672, coin PROS (HTTP 200)
- https://docs.pharos.xyz/getting-started/network.md — network overview (HTTP 200)
- https://docs.pharos.xyz/getting-started/gas-model.md — gas model (HTTP 200)
- https://docs.pharos.xyz/getting-started/faqs.md — FAQs (HTTP 200; zero mentions of faucet/arena/sign-in/share, grep-verified)

## Agent / tooling docs

- https://docs.pharos.xyz/tooling-and-infrastructure/mcp.md — Pharos MCP: hosted `https://mcp.pharos.xyz/mcp`, chain 1672 (0x688), native PROS (HTTP 200; **not** listed in llms.txt)
- https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide.md — Skill Engine guide (HTTP 200, 23,909 B)
- https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide.md — Piggy Bank tutorial (HTTP 200)
- https://docs.pharos.xyz/tooling-and-infrastructure/overview.md — Anvita Flow overview (HTTP 200)
- https://docs.pharos.xyz/tooling-and-infrastructure/overview/publish-skill-af.md — Publish Service Agent (HTTP 200)
- https://docs.pharos.xyz/tooling-and-infrastructure/indexing.md — indexing options (HTTP 200)
- https://docs.pharos.xyz/api-and-sdk/json-rpc-methods.md — JSON-RPC methods; documents `eth_getLogs` 100-block (rate-limited) / 10,000-block (fallback) limits verbatim (HTTP 200)
- https://docs.pharos.xyz/introduction/readme.md — About Pharos (HTTP 200)

## Live network surfaces

- https://atlantic.pharosscan.xyz/ — Atlantic testnet explorer (HTTP 200)
- https://atlantic.dplabs-internal.com — official Atlantic RPC (documented endpoint). Plain HEAD times out;
  `POST {"method":"eth_chainId"}` → HTTP 200, `{"result":"0xa8231"}` = **688689** — live-verified 2026-10-16.
- https://mcp.pharos.xyz/mcp — hosted Chain MCP endpoint. Plain GET → HTTP 404 (31 B). **Expected:** it is a Streamable-HTTP MCP endpoint, not a web page; it only answers MCP handshakes. Not a broken link.

## Developer Docs MCP (the query surface — 2026-10-19)

- `POST https://docs.pharos.xyz/~gitbook/mcp` — the real Developer Docs MCP: public GitBook MCP
  endpoint, MCP Streamable HTTP (JSON-RPC 2.0 over POST, SSE frames), no auth, server v0.27.2.
  Tools: `searchDocumentation`, `getPage`, `askQuestion` (`sendFeedback` never invoked).
  All 9 onboarding queries in this build went through `askQuestion` here.
  **No CORS headers** — browsers cannot call it directly (verified 2026-10-19).
  Plain GET/HEAD times out — expected: it is a POST-only MCP endpoint, not a web page
  (same as the Chain MCP's 404 on GET below). Not a broken link.
- ~~`GET https://docs.pharos.xyz/<page>.md?ask=<question>&goal=<goal>` — the documented GitBook
  ask page endpoint used by the superseded 2026-10-16 log. NOT the Docs MCP; do not use.~~
