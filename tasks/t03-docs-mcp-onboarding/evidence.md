# T03 — Docs MCP Onboarding: Evidence

**Session:** 2026-10-16, ~04:00–04:20 UTC. **Runs:** 3, **attempts:** 15, **answered:** 8 (7 distinct queries).
**Raw verbatim log:** `evidence.json` (every response stored byte-for-byte; failures stored as attempts).
**Replay:** `python3 scripts/query_log.py run` replays `queries.json` against the live endpoint.

## Provenance statement (read this first)

The official Docs MCP is **portal-embedded** (chat inside ai.pharos.xyz after wallet sign-in).
This agent cannot perform a wallet sign-in and did not touch the logged-in portal. The
evidence below comes from the **publicly reachable docs surfaces** — the surfaces the
assigned task explicitly ordered me to attempt:

1. `https://www.pharos.xyz/llms.txt` — docs navigation index (HTTP 200, 16,089 bytes).
2. The `.md` docs pages on `https://docs.pharos.xyz/` (plain GET).
3. The **documented GitBook dynamic ask endpoint** `GET https://docs.pharos.xyz/<page>.md?ask=<q>&goal=<g>`
   (advertised in llms.txt lines 14–20 and on every docs page footer as "If the answer is not
   explicitly present on a retrieved page, you can query it dynamically").

Every answer below is either an **ASK-ANSWER** (verbatim from the ?ask= endpoint) or **PAGE-DERIVED**
(verbatim from a fetched .md page). Nothing else. Where a query could not be answered, the log
says so with the exact query — that honesty is the evidence.

---

## §1 — Step-by-step log: what I tried → what I asked → what I received

### 1.0 Surface reconnaissance (before any query)

| Step | What I tried | Result (verbatim) |
|---|---|---|
| S1 | `GET https://www.pharos.xyz/llms.txt` | HTTP 200, 16,089 bytes. The index documents the ask endpoint: ``GET https://docs.pharos.xyz/<page-path>.md?ask=<question>&goal=<endgoal>`` |
| S2 | Ask the endpoint a real question (page-scoped, plain curl GET): `…/introduction/readme.md?ask=What is the Atlantic testnet chain ID?&goal=connecting a wallet` | **HTTP 200**, markdown answer: "Atlantic Testnet's chain ID is **688689**. Its RPC endpoint is `https://atlantic.dplabs-internal.com`. See [Atlantic Testnet](/getting-started/network/atlantic-testnet.md)." + suggested follow-ups. |
| S3 | Root-domain form `https://docs.pharos.xyz?ask=…&goal=…` (the pattern in the follow-up links) | HTTP 200, 553 KB GitBook SPA HTML — the params are ignored, normal page served. No AI answer. |
| S4 | Empty params `…/introduction/readme.md?ask=&goal=` | HTTP 404, GitBook not-found page. |
| S5 | Re-ask with a browser User-Agent (rapid follow-up to S2) | **Connection stalled** (killed after ~60 s). First sign of per-client throttling. |

**Discrepancy note (honest):** the LIGHTKEEPER-VERDICT team recorded a FIRST-HAND **403** on plain
HTTP GET to the per-page ask form on 2026-10-16. My S2 probe (same day, hours later) returned
**HTTP 200**. Both observations are real; the difference is documented, not reconciled — see G1.

### 1.1 The 9 onboarding queries

**Q1 — sign-in** · page `getting-started/faqs` · ASK-ANSWER (HTTP 200):
> "I cannot find information about signing in to the Pharos AI Agent Arena or submitting tasks at `ai.pharos.xyz` in the docs. The available [Anvita Flow](/tooling-and-infrastructure/overview.md) covers a separate developer portal, not the Agent Arena."

**Q2 — network identity** · page `getting-started/network/atlantic-testnet` · ASK-ANSWER (HTTP 200):
> "Atlantic Testnet settings: Chain ID: `688689` · RPC URL: `https://atlantic.dplabs-internal.com` · Native currency: `PHRS`."

**Q3 — faucet** · page `getting-started/faqs` · ASK-ANSWER (HTTP 200):
> "The docs don't provide a direct URL for the official faucet. They say to get Atlantic testnet PHRS from the Pharos faucet or directly from the team; see [Piggy Bank Tutorial](/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide.md)."

**Q4 — Chain MCP reads** · page `tooling-and-infrastructure/overview` · ASK-ANSWER (HTTP 200):
> "The **Pharos Chain MCP** is a public Model Context Protocol server… Its hosted endpoint is `https://mcp.pharos.xyz/mcp`; it requires no API key and connects to chain ID `1672` (`0x688`). See [Pharos MCP](/tooling-and-infrastructure/mcp.md)." Tools listed: `get_chain_info`, `get_block_number`, `get_block`, `get_gas_price`, `get_balance` (native PROS), `get_transaction_count`, `get_transaction`, `get_transaction_receipt`, `eth_call`, `get_code`, `get_storage_at`, `get_logs`, `estimate_gas`, `send_raw_transaction`. "The hosted service allows 120 requests per minute per IP."

**Q5 — get_logs limits** · page `tooling-and-infrastructure/indexing` · ASK-ANSWER (HTTP 200):
> "Pharos documents an `eth_getLogs` block-range limit of **100 blocks when rate limiting is enabled**, with a **10,000-block fallback cap**. For a monitor, use batches of 100 blocks to stay within the rate-limited limit. See [JSON-RPC API Methods](/api-and-sdk/json-rpc-methods.md)."

**Q6 — SkillEngine install** · page `tooling-and-infrastructure/pharos-skill-engine-guide` · **NOT ANSWERED**.
Exact query: *"How do I install, build and publish a skill with the Pharos Skill Engine?"* — three attempts
(run 1, run 2 retry, run 3 narrowed variant *"What is the first step to install the Pharos Skill Engine?"*):
all failed with `IncompleteRead` (connection dropped mid-stream: 3295, 0, 2145 bytes read).
PAGE-DERIVED fallback: the `.md` page itself (23,909 bytes, fetched 200) documents the full install flow
(Part 3: install the skill package → install Foundry → configure wallet), but **the Docs-MCP ask
endpoint could not answer this query** — logged as a genuine breakdown, not papered over.

**Q7 — submission mechanics** · page `getting-started/faqs` · ASK-ANSWER (HTTP 200, run 2):
> "I cannot find Agent Arena task submission instructions in the docs. The available [Publish Service Agent](/tooling-and-infrastructure/overview/publish-skill-af.md) covers publishing a Pharos Skill to Anvita Flow, not submitting an Agent Arena solution."

**Q8 — chain-ID ambiguity** · page `getting-started/network` · run 1: HTTP **403 Forbidden** (×2 incl. retry).
Run 3 (narrowed: *"Is the Atlantic testnet chain ID 688689 and its token PHRS?"*): ASK-ANSWER (HTTP 200):
> "Yes. Atlantic Testnet uses **chain ID `688689`** and the native token symbol **`PHRS`**."

**Q9 — share links** · page `getting-started/faqs` · ASK-ANSWER (HTTP 200, run 2):
> "I cannot find information about creating or sharing agent session links on **ai.pharos.xyz** in the docs."

### 1.2 Direct page cross-checks (PAGE-DERIVED, verbatim)

- `getting-started/network/atlantic-testnet.md` (HTTP 200): ChainID **688689**, RPC `https://atlantic.dplabs-internal.com`, WSS same host, explorer `https://atlantic.pharosscan.xyz/`, ratelimit **500/5m**, max pending 64/addr.
- `tooling-and-infrastructure/mcp.md` (HTTP 200): hosted endpoint `https://mcp.pharos.xyz/mcp`, **Chain ID `1672` (`0x688`)**, **native token PROS**, auth "N…" (none), example `{"chainId":1672,"rpcUrl":"https://rpc.pharos.xyz"}`.
- `getting-started/network/pacific-mainnet.md` (HTTP 200): ChainID **1672**, Coin Symbol **PROS**.
- `getting-started/faqs.md` (HTTP 200): contains **zero** mentions of faucet, arena, sign-in, or share links (grep-verified).
- `llms.txt` (HTTP 200): contains **zero** mentions of "mcp" (grep-verified) — the Pharos MCP page is invisible to the navigation index.

---

## §2 — Gap table: ≥3 concrete gaps, each with the EXACT query + suggested fix

| # | Gap (wrong / missing / confusing) | EXACT query asked | What the docs surface returned (verbatim evidence) | Suggested fix — what the docs should have said |
|---|---|---|---|---|
| **G1** | The public ask endpoint is **unreliable for scripted access**: verdict team got HTTP 403 first-hand (2026-10-16); my session got HTTP 200 on 8 queries, HTTP 403 on Q8 (×2), `IncompleteRead` on Q6 (×3), and a stalled browser-UA request. Reachability is client/rate-dependent and undocumented. | `How do I install, build and publish a skill with the Pharos Skill Engine?` (also Q8: `Is the Pharos Atlantic testnet chain ID 688689 or 1672, and which token does it use, PHRS or PROS?`) | 403 Forbidden; `IncompleteRead(3295 bytes read)` — the query could not be answered at all. | Document the ask endpoint's bot-mitigation/rate-limit contract on the page footer that advertises it (retry policy, per-IP budget, UA rules). Long-term: ship a real public Docs-MCP API instead of a browser-gated GitBook widget — scripted agents are the stated audience ("published with GitBook… so that both humans and AI agents can read…"). |
| **G2** | **Chain-identity ambiguity is real and docs-confirmed.** The hosted Chain MCP serves chain **1672 / PROS** — i.e. **Pacific mainnet** (per `pacific-mainnet.md`) — but `mcp.md` never says "mainnet" and never tells an **Atlantic-testnet arena builder** how to point MCP at 688689/PHRS. The Docs-MCP answer itself presents 1672 as *the* Pharos chain. | `What is the Pharos Chain MCP and which read tools does it expose for an AI agent?` | "connects to chain ID `1672` (`0x688`)… `get_balance` (native PROS)". Cross-check: `mcp.md` = 1672/PROS; `pacific-mainnet.md` = 1672/PROS; `atlantic-testnet.md` = 688689/PHRS. | `mcp.md` should carry a banner: "The hosted endpoint `mcp.pharos.xyz` serves **Pacific mainnet (1672/PROS)**. For Atlantic testnet (688689/PHRS), run the MCP server locally against `https://atlantic.dplabs-internal.com` — [config here]." One sentence kills the #1 way an arena builder reads the wrong chain. |
| **G3** | **No official faucet URL anywhere in the docs corpus.** A new builder cannot fund an Atlantic wallet from the docs alone. | `Where can I get Atlantic testnet PHRS from the official faucet?` | "The docs don't provide a direct URL for the official faucet. They say to get Atlantic testnet PHRS from the Pharos faucet or directly from the team". `llms.txt`: zero "faucet" mentions (grep-verified). | Add a Faucet entry under Live Data in `llms.txt` + a one-paragraph faucet section on the Atlantic Testnet page with the official URL and per-address drip limits. |
| **G4** | **The Agent Arena (ai.pharos.xyz) is entirely absent from the developer docs.** Sign-in, task submission, and share-link mechanics — the three things every arena builder needs — return honest "cannot find" answers. | `How do I sign in to the Pharos AI Agent Arena portal at ai.pharos.xyz to submit a task?` (also Q7 submission, Q9 share links) | "I cannot find information about signing in to the Pharos AI Agent Arena or submitting tasks at `ai.pharos.xyz` in the docs." / "I cannot find Agent Arena task submission instructions in the docs." / "I cannot find information about creating or sharing agent session links on **ai.pharos.xyz** in the docs." `faqs.md`: zero mentions of arena/sign-in/share (grep-verified). | Add an "Agent Arena" section to the docs: (a) how to sign in, (b) how to submit a task solution (what counts, where, deadlines), (c) how share links work (format, expiry, logged-out openability). The campaign's own portal is currently undocumented in the campaign's own docs. |
| **G5** | **`llms.txt` — the "navigation index" — omits real docs pages.** The Pharos MCP page exists (`tooling-and-infrastructure/mcp.md`, 12 KB, fetched HTTP 200) and the Docs-MCP Q&A cites it as a source, yet `llms.txt` has zero "mcp" mentions. Agents that navigate by `llms.txt` (as instructed) can never discover the MCP docs. | `What is the Pharos Chain MCP and which read tools does it expose for an AI agent?` | Answer cites `[Pharos MCP](https://docs.pharos.xyz/tooling-and-infrastructure/mcp.md)` — a page missing from the index. | Regenerate `llms.txt` from the GitBook sitemap on every docs deploy (CI check: every page in `sitemap.md` must appear in `llms.txt`). |

**Gap honesty note:** all five gaps were confirmed against the live docs surfaces in this session (queries above + grep-verified page contents). G1 additionally records the verdict team's earlier first-hand 403, which I could not reproduce on the same endpoint pattern — both observations stand.

---

## §3 — NON-EVIDENCE APPENDIX (quarantined: not Docs-MCP-derived)

Per the ONLY-Docs-MCP firewall, the following are my hypotheses, inferences, and planned-but-unrun
probes. They informed the queries but are **not** evidence.

- **Pre-seeded hypotheses** (from MEGA §3.2, marked CANDIDATE until confirmed): portal-vs-standalone
  MCP conflation; 688689/PHRS vs 1672/PROS ambiguity (→ **confirmed, G2**); faucet absence (→ **confirmed, G3**);
  embedded-tool limits; SkillEngine prereqs. The 7-query plan (sign-in, network identity, faucet,
  Chain MCP reads, get_logs limits, SkillEngine install, submission mechanics) came from the MEGA.
- **Not run:** `tools/list` or any MCP-session probe — no MCP client/session was available to this agent,
  and the parent task did not authorize portal sign-in. The portal-embedded Docs MCP chat surface is
  therefore **unrepresented** in this evidence; a logged-in follow-up session could strengthen G4.
- **INFERENCE (not docs-stated):** the hosted Chain MCP at `mcp.pharos.xyz` serves Pacific mainnet.
  The docs never say this explicitly; the mapping 1672/PROS = `pacific-mainnet.md` is page-verified,
  the "hosted = mainnet" link is inference. Flagged in G2's suggested fix accordingly.
- **Q6 failure theory (unverified):** the `IncompleteRead` on the SkillEngine-guide query may be a
  streaming/truncation bug in the GitBook ask widget for long answers — or per-query throttling.
  Recorded as observed behavior only; no root cause claimed.
