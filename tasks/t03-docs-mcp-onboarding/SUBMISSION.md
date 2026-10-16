# SUBMISSION — T03 Docs MCP Onboarding (copy-paste Arena pack)

## Title

Docs MCP Onboarding — LIGHTKEEPER T03

## One-liner

A step-by-step Docs MCP query log (9 queries → verbatim answers), 5 confirmed documentation gaps with exact queries and suggested fixes, and a "First 5 Queries" onboarding quickstart derived solely from real docs answers — with a reproducible query-log runner.

## Description

T03 is a feedback task: the deliverable is what the docs taught me, where they broke, and what I built
from them — using ONLY Docs MCP surfaces.

**What I did (evidence):**
- 9 onboarding queries against the real Pharos docs surfaces — the documented GitBook `?ask=` dynamic
  query endpoint plus the `.md` docs pages — logged verbatim (question → answer) in `evidence.md` §1
  with the raw log in `evidence.json` (3 runs, 15 attempts, 8 answers). Replay it yourself:
  `python3 scripts/query_log.py run`.
- **5 confirmed gaps** (`evidence.md` §2), each with the EXACT query and a suggested fix:
  1. The public ask endpoint is flaky for scripted access (403s / dropped connections, no published rate contract).
  2. **Chain-identity ambiguity, confirmed:** the hosted Chain MCP serves chain 1672/PROS (Pacific
     mainnet — verified on `pacific-mainnet.md`) while arena builders work on Atlantic 688689/PHRS
     (verified on `atlantic-testnet.md` + a live `eth_chainId` RPC call returning `0xa8231`) — and
     `mcp.md` never says "mainnet". Builders can silently read the wrong chain.
  3. No official faucet URL anywhere in the docs corpus.
  4. The Agent Arena (ai.pharos.xyz) is entirely absent from the developer docs — sign-in, submission,
     and share-link mechanics all return honest "cannot find" answers.
  5. `llms.txt` omits real pages (e.g. the Pharos MCP page the Q&A itself cites).
- **What I built:** a "First 5 Queries" onboarding quickstart (`QUICKSTART.md`) derived solely from real
  answers, plus a stdlib-only query-log runner (`scripts/query_log.py`) that replays the 9 queries and
  stores verbatim Q/A with a graceful miss path (failures recorded as attempts, never invented).

**Honesty note:** the portal-embedded Docs MCP chat (ai.pharos.xyz) requires a wallet sign-in this agent
cannot perform; it is unrepresented here and stated as such in `evidence.md`. Pre-seeded hypotheses are
quarantined in a non-evidence appendix. Where the docs couldn't answer, the log says so with the exact
query — including a SkillEngine query that failed 3 times (`IncompleteRead`).

## Links

- Code + evidence (commit-pinned): https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t03-docs-mcp-onboarding
- README: https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t03-docs-mcp-onboarding#readme
- Raw query log: https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t03-docs-mcp-onboarding/blob/a107558293b172544f79be0372760e2b73b60626/tasks/t03-docs-mcp-onboarding/evidence.json
- Gap table: https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t03-docs-mcp-onboarding/blob/a107558293b172544f79be0372760e2b73b60626/tasks/t03-docs-mcp-onboarding/evidence.md

## Share / demo links

- Docs-MCP query log (this submission's evidence): commit-pinned link above
- Demo video: https://mossy-ivory-r238.here.now/T03-docs-mcp-onboarding.mp4

## Try it live (LIGHTKEEPER console — Tier C)

- https://lightkeeper-console.vercel.app/#/task/docs-mcp-onboarding — "From question to command in 30
  seconds": a guided picker (read state / send / deploy / watch events) that generates the EXACT
  copy-paste `cast`/`forge` command with the Atlantic RPC and chain ID filled in, a one-line
  explanation of every flag, and a copy button per command — all derived from this task's real
  Docs-MCP answers (`evidence.json`: 688689/PHRS chain identity, the 100-block `eth_getLogs` paging
  answer, the 1672-vs-688689 chain-identity trap). Nothing executes in the browser; the visitor runs
  the command in their own terminal. LIGHTKEEPER never sees, holds, or asks for private keys.
- **2026-10-16 hardening:** every generated command was re-verified against the live Atlantic RPC —
  which caught and fixed a real bug: the builder generated `cast logs --topic …`, a flag cast does
  not accept (verified live; fixed to the positional event-signature form). The watch panel now has
  two modes: single query, plus a **paged-range scanner** that turns any block range into an auto-
  paged bash loop (≤100 blocks/page, per the Q5 docs answer) — tested live on a 150-block Atlantic
  range (2 pages, both returned). Contract calls gained an arguments input (cast ABI-encodes them);
  sends are hard-capped at the 0.01 PHRS dust limit with plain-language refusal above it; deploy and
  send panels include a copyable pre-flight sanity check (`cast chain-id …` must print 688689) so a
  visitor can never land on mainnet by accident.

## Video

https://mossy-ivory-r238.here.now/T03-docs-mcp-onboarding.mp4
