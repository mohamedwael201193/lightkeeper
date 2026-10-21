# T03 — Docs MCP Onboarding: Evidence

**Session:** 2026-10-19, ~20:00–20:10 UTC (canonical run) + 2026-10-20 confirming rerun. **Run:** 1 (MCP era), **queries:** 9, **answered:** 9 — plus a second 10-query rerun on 2026-10-20 (`evidence/runs/run-mcp-20261020T042645Z.json`), all 10 answered, confirming the same 5 gaps.
**MCP:** `https://docs.pharos.xyz/~gitbook/mcp` (public GitBook MCP, no auth), server v0.27.2, tool `askQuestion`.
**Latency:** p50 19.5 s, p90 76.21 s.
**Raw verbatim log:** `evidence/runs/run-mcp-20261019T200816Z.json` (exact JSON-RPC payloads + verbatim answers).
**Transcript:** `evidence/transcripts/transcript-20261019T200816Z.jsonl` + `.md`.
**Proof:** `evidence/runs/proof-20261019T200816Z.json` (endpoint, server, command, git commit, dirty flag).
**Replay:** `python3 scripts/query_log.py run` replays `queries.json` against the live Docs MCP.

> **Correction (2026-10-19):** the 2026-10-16 session concluded the Developer Docs MCP was
> "portal-embedded only" and queried the documented GitBook `?ask=` page endpoint instead —
> the exact practice the Arena reviewer rejected ("The onboarding queries weren't made through
> the Developer Docs MCP"). That conclusion was wrong: the real public Docs MCP endpoint
> (`/~gitbook/mcp`) was never probed. The 2026-10-16 `?ask=`-era material is superseded and
> retained only in `evidence.json` (legacy) and §3. Everything below is Docs-MCP-derived.

## Provenance statement (read this first)

Every query below was made through the **Developer Docs MCP** — the public GitBook MCP endpoint
at `https://docs.pharos.xyz/~gitbook/mcp` — via MCP Streamable HTTP (JSON-RPC 2.0 over POST,
SSE response frames), tool `askQuestion` (`question` + `goal` arguments), no authentication.
`sendFeedback` was never invoked (it files a real report to the docs team).

**Claim boundary:** this is the public GitBook Docs MCP endpoint. It is NOT the login-gated
ai.pharos.xyz portal session (a different surface composing Chain MCP + docs). Nothing here
claims chain-tool access through it — it is docs-only. `askQuestion` answers are GitBook's
answer engine over the docs corpus, quoted verbatim, never presented as a human reviewer's words.

Every answer below is an **MCP-ANSWER** (verbatim `askQuestion` result). Nothing else. Where the
MCP could not answer, the log says so with the exact query.

---

## §1 — Step-by-step log: what I tried → what I asked → what I received

### 1.0 Surface notes (before the queries)

| Step | What I tried | Result |
|---|---|---|
| S1 | `tools/list` on the Docs MCP (external probe — quarantined to §3, not evidence) | 4 tools: `searchDocumentation`, `getPage`, `askQuestion`, `sendFeedback` |
| S2 | `askQuestion` trial: *"What is the Pharos Atlantic testnet chain ID?"* | MCP-ANSWER: "The Pharos Atlantic testnet chain ID is **688689**." + source links — the surface is live |
| S3 | Reliability observation across the 9-query run | ~30–40% of calls dropped mid-stream (`RemoteDisconnected`/`IncompleteRead`); the server is stateless, so retry-with-backoff recovered every call. No rate-limit contract is published — see G4 |

### 1.1 The 10 onboarding queries (all via Docs MCP `askQuestion`, 2026-10-20 rerun)

**Q1 — sign-in** · MCP-ANSWER (10.39 s):
> "I cannot find sign-in or task-submission instructions for the Pharos AI Agent Arena in the docs."

**Q2 — network identity** · MCP-ANSWER (6.02 s):
> "* **Chain ID:** `688689` * **RPC URL:** `https://atlantic.dplabs-internal.com` * **Native currency:** PHRS (`PHRS`, 18 decimals)"

**Q3 — faucet** · MCP-ANSWER (12.16 s):
> "The docs mention the Pharos faucet as a source for Atlantic testnet PHRS, but they don’t provide its URL."

**Q4 — Chain MCP reads** · MCP-ANSWER (25.65 s):
> "The [Pharos MCP](/tooling-and-infrastructure/mcp) is a public Model Context Protocol server that lets AI agents query Pharos chain data through natural-language requests."

**Q5 — get_logs limits** · MCP-ANSWER (48.11 s):
> "For direct Pharos JSON-RPC `eth_getLogs`, the documented range is **100 blocks when rate limiting is enabled**, with a **10,000-block fallback cap**."

**Q6 — SkillEngine install** · MCP-ANSWER (21.39 s):
> "Install the Skill Engine locally, add your capability, then upload the Skill package to Anvita Flow for review."

**Q7 — submission mechanics** · MCP-ANSWER (39.33 s):
> "I cannot find information about submitting solutions to **Agent Arena** tasks in the docs."

**Q8 — chain-ID ambiguity** · MCP-ANSWER (8.75 s):
> "For **Pharos Atlantic Testnet**, use **chain ID `688689`** and native token symbol **`PHRS`**. The **`1672` / `PROS`** settings belong to **Pacific Mainnet**."

**Q9 — share links** · MCP-ANSWER (12.64 s):
> "I cannot find information about creating or sharing session links on **ai.pharos.xyz** in the docs."

**Q10 — explorer verification** · MCP-ANSWER (36.4 s):
> "Use the [Hemera SocialScan explorer](https://pharos.socialscan.io/), listed as Pharos’s official explorer in the [Hemera SocialScan](/tooling-and-infrastructure/block-explorer/hemera-socialscan)."

Full verbatim answers (with source-link lists): `evidence/transcripts/transcript-20261020T042645Z.md`.

---

## §2 — Gap table: 5 concrete gaps, each with the EXACT query + suggested fix

| # | Gap (wrong / missing / confusing) | EXACT query asked | What the Docs MCP returned (verbatim evidence) | Suggested fix — what the docs should have said |
|---|---|---|---|---|
| **G1** | **The Agent Arena (ai.pharos.xyz) is entirely absent from the developer docs.** Sign-in, task submission, and share-link mechanics — the three things every arena builder needs — return honest "cannot find" answers from the Docs MCP itself, across three separate queries. | `How do I sign in to the Pharos AI Agent Arena portal at ai.pharos.xyz to submit a task?` (also `How do I submit my solution for an Agent Arena task?` and `How do I create and share a session link for my agent work on ai.pharos.xyz?`) | "I cannot find information about signing in to the Pharos AI Agent Arena or submitting tasks at `ai.pharos.xyz` in the docs." / "I cannot find information about submitting solutions to **Agent Arena** tasks in the docs." / "I cannot find instructions in the docs for creating or sharing agent session links on [ai.pharos.xyz](https://ai.pharos.xyz/)." | Add an "Agent Arena" section to the docs: (a) how to sign in, (b) how to submit a task solution (what counts, where, deadlines), (c) how share links work (format, expiry, logged-out openability). The campaign's own portal is currently undocumented in the campaign's own docs. |
| **G2** | **No official faucet URL anywhere in the docs corpus.** A new builder cannot fund an Atlantic wallet from the docs alone — the Docs MCP admits this directly. | `Where can I get Atlantic testnet PHRS from the official faucet?` | "The setup guide says to get testnet PHRS from the **Pharos faucet** or directly from the team, but it doesn’t provide the faucet’s URL." | Add a Faucet entry under Live Data with the official URL and per-address drip limits, plus a one-paragraph faucet section on the Atlantic Testnet page. |
| **G3** | **`eth_getLogs` range limits: docs text is ambiguous.** The Docs MCP quotes "100 blocks when rate limiting is enabled, or 10,000 blocks as a fallback cap" — two regimes with no guidance on which one a scripted client actually lands in. A monitor built from the docs text alone cannot size its chunks with confidence. (The 1,000-block figure from a live node probe is quarantined in §3 — it is not Docs-MCP evidence.) | `What are the block range limits for eth_getLogs queries on Pharos?` | "For direct Pharos JSON-RPC `eth_getLogs`, the range limit is **100 blocks when rate limiting is enabled**, or **10,000 blocks as a fallback cap**." | State which rate-limit regime a scripted client actually lands in, with the effective per-network limit stated explicitly. |
| **G4** | **The Docs MCP endpoint has no published reliability contract.** During this 9-query run, ~30–40% of calls dropped mid-stream (`RemoteDisconnected` / `IncompleteRead`); every call eventually succeeded on retry with backoff (p50 19.5 s, p90 76.21 s). There is no documented rate-limit, retry, or timeout guidance for the programmatic audience this endpoint serves. | (observed across all 9 queries; worst case `What are the block range limits for eth_getLogs queries on Pharos?` — 76.21 s after retries) | Connection drops on ~30–40% of attempts; no rate-limit or retry documentation surfaced by any query. | Publish the endpoint's rate-limit budget, recommended retry/backoff policy, and expected latency bands — or a status page. Scripted agents are the stated audience; they need a contract, not just an endpoint. |
| **G5** | **Chain-identity labeling (residual).** Q4's answer says the hosted Chain MCP "targets chain ID `1672` (`0x688`)" without naming the network; only a separate question (Q8) reveals `1672` = **Pacific Mainnet**. An Atlantic-testnet builder reading Q4 alone cannot tell the hosted endpoint isn't their chain. | `What is the Pharos Chain MCP and which read tools does it expose for an AI agent?` | "targets chain ID `1672` (`0x688`)" — no network name. (Separately: "For **Pharos Atlantic Testnet**, use **chain ID `688689`** … **`1672`** and **`PROS`** are for **Pacific Mainnet**.") | One banner sentence on the MCP docs page: "The hosted endpoint serves **Pacific mainnet (1672/PROS)**. For Atlantic testnet (688689/PHRS), run the MCP server locally — [config here]." |

**Correction note (honest):** the 2026-10-16 session listed a "chain-identity ambiguity" gap based on the
`?ask=` endpoint. Re-tested through the real Docs MCP (Q8, 2026-10-19), the ambiguity query now
resolves explicitly (688689/PHRS = Atlantic, 1672/PROS = Pacific Mainnet). The residual gap is G5
above — weaker than originally stated, and stated as such.

---

## §3 — NON-EVIDENCE APPENDIX (quarantined: not Docs-MCP-derived)

Per the ONLY-Docs-MCP firewall, the following are hypotheses, inferences, and external probes.
They informed the queries but are **not** evidence.

- **Endpoint discovery (external probe, 2026-10-19):** the public endpoint
  `https://docs.pharos.xyz/~gitbook/mcp` was found by probing GitBook's native MCP path
  (`tools/list` → 4 tools) after the documented `?ask=` page endpoint kept 403ing plain GETs.
  This discovery is an external probe, not a Docs-MCP answer — hence quarantined here.
- **Pre-seeded hypotheses** (from MEGA §3.2): 688689/PHRS vs 1672/PROS ambiguity (→ re-tested,
  now resolves; residual G5); faucet absence (→ **confirmed, G2**); arena absence (→ **confirmed, G1**).
- **Superseded 2026-10-16 `?ask=`-era material:** retained in `evidence.json` (legacy cumulative log).
  Its "portal-embedded only" conclusion is disproven by the endpoint above. The old Q6
  `IncompleteRead` breakdown does not reproduce on the real MCP (Q6 answered in 71.18 s).
- **Node-probe note (external, quarantined):** a live Atlantic `eth_getLogs` probe observed a
  **1,000-block** cap, matching neither docs regime quoted in G3. This is an external
  observation, not a Docs-MCP answer — it motivates G3's suggested fix but is not evidence.
- **Not run:** `sendFeedback` (would file a real report to the docs team — deliberately excluded).
- **The login-gated ai.pharos.xyz portal session** remains unrepresented here; a logged-in
  follow-up could strengthen G1. Stated, not hidden.
