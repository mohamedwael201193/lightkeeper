# SUBMISSION — T03 Docs MCP Onboarding (copy-paste Arena pack)

> **Resubmission (2026-10-19):** the first review returned *"The onboarding queries weren't made
> through the Developer Docs MCP. Redo the log using the Docs MCP and resubmit."* — correct.
> The entire log below is redone through the real Developer Docs MCP: the public GitBook MCP
> endpoint `https://docs.pharos.xyz/~gitbook/mcp` (MCP Streamable HTTP, no auth, server v0.27.2),
> tool `askQuestion`. 9 queries → 9 verbatim answers (p50 19.5 s), machine-checked quotes,
> stamped proof. Claim boundary: public GitBook endpoint, NOT the login-gated ai.pharos.xyz
> portal session; docs-only, no chain-tool access claimed.

## Title

Docs MCP Onboarding — LIGHTKEEPER T03

## One-liner

A step-by-step Developer Docs MCP query log (9 queries → 9 verbatim answers via the real Docs MCP),
5 confirmed documentation gaps with exact queries and suggested fixes, and a "First 5 Queries"
onboarding quickstart derived solely from real MCP answers — with a reproducible MCP query-log
runner and machine-verified quotes.

## Description

T03 is a feedback task: the deliverable is what the docs taught me, where they broke, and what I built
from them — using ONLY the Developer Docs MCP.

**What I did (evidence):**
- 9 onboarding queries through the real Developer Docs MCP — `askQuestion` at
  `https://docs.pharos.xyz/~gitbook/mcp` — logged verbatim (question → answer, exact JSON-RPC
  payloads, timestamps) in `evidence.md` §1, raw log in `evidence/runs/run-mcp-20261019T200816Z.json`,
  rendered transcript in `evidence/transcripts/`, stamped proof in
  `evidence/runs/proof-20261019T200816Z.json`. Replay it yourself:
  `python3 scripts/query_log.py run`. Every `>` quote in `evidence.md` is machine-verified against
  the raw transcript (`python3 scripts/quote_check.py` → ALL QUOTES VERIFIED).
- **5 confirmed gaps** (`evidence.md` §2), each with the EXACT query and a suggested fix:
  1. **The Agent Arena (ai.pharos.xyz) is entirely absent from the developer docs** — sign-in,
     submission, and share-link mechanics all return honest "cannot find" answers from the Docs
     MCP itself (3 separate queries).
  2. **No official faucet URL anywhere in the docs corpus** — the MCP admits it directly.
  3. **`eth_getLogs` limits: docs text vs. observed behavior** — docs say 100 blocks (rate-limited)
     / 10,000 fallback; live Atlantic enforces 1,000.
  4. **No reliability contract for the Docs MCP endpoint** — ~30–40% of calls dropped mid-stream
     during the run (recovered by retry); no rate-limit/retry guidance published.
  5. **Chain-identity labeling (residual)** — the MCP says the hosted Chain MCP "targets chain ID
     1672" without naming the network; only a separate query reveals 1672 = Pacific Mainnet.
     (The 2026-10-16 "ambiguity" gap was re-tested and now resolves explicitly — stated as a
     correction in `evidence.md`.)
- **What I built:** a "First 5 Queries" onboarding quickstart (`QUICKSTART.md`) derived solely from
  real MCP answers, plus a stdlib-only MCP query-log runner (`scripts/query_log.py` v2.0:
  `initialize` → `tools/call askQuestion` with retry-with-backoff; `sendFeedback` never invoked)
  that stores verbatim Q/A, latency stats, git commit + dirty flag, and a stamped proof JSON.

**Honesty note:** the public GitBook Docs MCP endpoint is the surface used — the login-gated
ai.pharos.xyz portal session is unrepresented here and stated as such in `evidence.md`.
Endpoint discovery (my own `tools/list` probe) and pre-seeded hypotheses are quarantined in a
non-evidence appendix. Where the docs couldn't answer, the log says so with the exact query.

## Links

- Code + evidence (commit-pinned): https://github.com/mohamedwael201193/lightkeeper/tree/9eca5c9b167b633259850a7623347fa2fe499c70/tasks/t03-docs-mcp-onboarding
- README: https://github.com/mohamedwael201193/lightkeeper/tree/9eca5c9b167b633259850a7623347fa2fe499c70/tasks/t03-docs-mcp-onboarding#readme
- Raw query log: https://github.com/mohamedwael201193/lightkeeper/blob/9eca5c9/tasks/t03-docs-mcp-onboarding/evidence/runs/run-mcp-20261019T200816Z.json
- Gap table: https://github.com/mohamedwael201193/lightkeeper/blob/9eca5c9/tasks/t03-docs-mcp-onboarding/evidence.md

## Share / demo links

- Docs-MCP query log (this submission's evidence): commit-pinned link above
- Demo video: REPLACE_WITH_NEW_VIDEO_LINK

## Try it live (LIGHTKEEPER console — Tier C)

- https://lightkeeper-console.vercel.app/#/task/docs-mcp-onboarding — "From question to command in 30
  seconds": a guided picker (read state / send / deploy / watch events) that generates the EXACT
  copy-paste `cast`/`forge` command with the Atlantic RPC and chain ID filled in, a one-line
  explanation of every flag, and a copy button per command — all derived from this task's real
  Docs-MCP answers (`evidence/runs/run-mcp-20261019T200816Z.json` + `evidence/transcripts/transcript-20261019T200816Z.md`: 688689/PHRS chain identity, the 100-block `eth_getLogs` paging
  answer, the 1672-vs-688689 chain-identity trap — a second confirming 10-query rerun is at `evidence/runs/run-mcp-20261020T042645Z.json`; legacy 2026-10-16 `?ask=`-endpoint runs live in `evidence.json` and are labeled legacy, not evidence). Nothing executes in the browser; the visitor runs
  the command in their own terminal. LIGHTKEEPER never sees, holds, or asks for private keys.
- **2026-10-16 hardening:** every generated command was re-verified against the live Atlantic RPC —
  which caught and fixed a real bug: the builder generated `cast logs --topic …`, a flag cast does
  not accept (verified live; fixed to the positional event-signature form). The watch panel now has
  two modes: single query, plus a **paged-range scanner** that turns any block range into an auto-
  paged bash loop (≤100 blocks/page — inside the documented rate-limited regime) — tested live on a
  150-block Atlantic range (2 pages, both returned). Contract calls gained an arguments input (cast
  ABI-encodes them); sends are hard-capped at the 0.01 PHRS dust limit with plain-language refusal
  above it; deploy and send panels include a copyable pre-flight sanity check (`cast chain-id …`
  must print 688689) so a visitor can never land on mainnet by accident.
- **2026-10-19 resubmission:** the Docs-MCP answers behind the command builder were re-derived
  from the real Docs MCP (`askQuestion` at `docs.pharos.xyz/~gitbook/mcp`): 688689/PHRS chain
  identity, the Chain MCP tool list, the 1672-vs-688689 chain-identity note, and the `eth_getLogs`
  paging answer (docs: 100 blocks rate-limited / 10,000 fallback; observed Atlantic: 1,000 — see
  `evidence.md` G3). Full verbatim log: `evidence/transcripts/transcript-20261019T200816Z.md`.
  Note: the browser cannot call the Docs MCP directly (no CORS headers on the endpoint — verified
  2026-10-19), so the console module keeps its command-builder form; the underlying answers are
  the fresh MCP ones.

## Video

REPLACE_WITH_NEW_VIDEO_LINK
