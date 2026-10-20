<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:8px;">

# <span style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;letter-spacing:0.35em;">DOCS&nbsp;MCP&nbsp;ONBOARDING</span>

<span style="color:#f4f6ff;font-style:italic;">"One lighthouse. Thirty lamps — and the keeper reads the manual first."</span>

<span style="color:#b9c2f5;">T03 · Pharos Season of AI Agent Arena · Easy · 50 pts · Developer Docs MCP</span>

</div>

---

> **Resubmission note (2026-10-19):** the first submission was returned with
> *"The onboarding queries weren't made through the Developer Docs MCP. Redo the log using the
> Docs MCP and resubmit."* That verdict was correct: the original log used the GitBook `?ask=`
> page endpoint, not the real Docs MCP. This build redoes the entire onboarding log through the
> actual Developer Docs MCP — the public GitBook MCP endpoint
> `https://docs.pharos.xyz/~gitbook/mcp` (MCP Streamable HTTP, no auth), tool `askQuestion`.
> 9 queries, 9 verbatim answers, machine-checked quotes, stamped proof.

## 1. What this is

A **feedback-task deliverable** built with ONLY the Developer Docs MCP: a verbatim step-by-step log of
queries asked → answers received through the real Docs MCP, **5 confirmed gaps** each with the EXACT
query and a suggested fix, and a runnable query-log runner plus a "First 5 Queries" onboarding
quickstart derived solely from real MCP answers. No mocks, no invented answers — where the docs
couldn't answer, the MCP said so and the log says so.

**Claim boundary:** this is the public GitBook Docs MCP endpoint
(`docs.pharos.xyz/~gitbook/mcp`, server v0.27.2) — NOT the login-gated ai.pharos.xyz portal
session. It is docs-only: no chain-tool access is claimed through it, and `askQuestion` answers
are GitBook's answer engine over the docs corpus, quoted verbatim.

## 2. Official requirements → evidence

| # | Official requirement (REQUIREMENTS.md, verbatim) | Evidence |
|---|---|---|
| (1) | Step-by-step log: tried → asked → received | `evidence.md` §1 · `evidence/runs/run-mcp-20261019T200816Z.json` (exact JSON-RPC payloads + verbatim answers) · `evidence/transcripts/transcript-20261019T200816Z.md` (rendered) |
| (2) | ≥3 concrete gaps, each with the EXACT query | `evidence.md` §2 (G1–G5, all Docs-MCP-derived) |
| (3) | Suggested fix per gap | Same table, "what the docs should have said" column |
| (4) | What you built / ran | `QUICKSTART.md` + `scripts/query_log.py` v2.0 (§5) |
| CONSTRAINT | ONLY Docs MCP — no external docs, search engines, or community help | `evidence.md` provenance + §3 quarantine; the endpoint itself *is* the Docs MCP |

Reproduce the evidence: `python3 scripts/query_log.py run` → new run JSON + transcript + proof JSON.

## 3. The log (summary — 9 queries, 9 answered, all via Docs MCP `askQuestion`)

Run `20261019T200816Z` · endpoint `https://docs.pharos.xyz/~gitbook/mcp` · server v0.27.2 ·
p50 19.5 s / p90 76.21 s · proof: `evidence/runs/proof-20261019T200816Z.json`

| Query | Docs MCP answer (verbatim excerpt) |
|---|---|
| Sign-in to ai.pharos.xyz | "cannot find" — Arena absent from docs |
| Atlantic network identity | 688689 · `atlantic.dplabs-internal.com` · PHRS ✅ |
| Official faucet URL | "doesn't provide the faucet's URL" — gap |
| Chain MCP tools | Hosted `mcp.pharos.xyz/mcp`, no key, targets 1672 — network unlabeled |
| get_logs limits | 100 blocks (rate-limited) / 10,000 fallback — vs 1,000 observed |
| SkillEngine install | Full build→publish flow via Anvita Flow ✅ |
| Arena submission | "cannot find" — gap |
| Chain-ID ambiguity (688689 vs 1672) | 688689/PHRS = Atlantic, 1672/PROS = Pacific ✅ (ambiguity resolved) |
| Share session links | "cannot find" — gap |

Full verbatim answers with source-link lists: `evidence/transcripts/transcript-20261019T200816Z.md`.
Every `>` quote in `evidence.md` is machine-verified against the raw transcript
(`python3 scripts/quote_check.py` → ALL QUOTES VERIFIED).

## 4. The five gaps

1. **G1 — The Agent Arena is entirely absent from the developer docs.** Three separate Docs-MCP
   queries (sign-in, submission, share links) all return "cannot find". *Fix: an "Agent Arena"
   docs section (sign-in, submission mechanics, share links).*
2. **G2 — No official faucet URL in the docs corpus.** The MCP admits it directly. *Fix: Live-Data
   entry + URL + drip limits.*
3. **G3 — `eth_getLogs` limits: docs text vs. observed behavior.** Docs say 100/10,000; live Atlantic
   enforces 1,000. *Fix: state the effective per-network limit explicitly.*
4. **G4 — No reliability contract for the Docs MCP endpoint.** ~30–40% of calls dropped mid-stream
   during this run (recovered by retry); no rate-limit/retry guidance published. *Fix: publish the
   budget, retry policy, and latency bands.*
5. **G5 — Chain-identity labeling (residual).** The MCP says the hosted Chain MCP "targets chain ID
   1672" without naming the network; only a separate query reveals 1672 = Pacific Mainnet.
   *Fix: one banner sentence on the MCP docs page.*

Full table with exact queries and verbatim returns: `evidence.md` §2.

## 5. What got built

- **`scripts/query_log.py` v2.0** (stdlib only) — a minimal MCP Streamable-HTTP client:
  `initialize` → `tools/call askQuestion` with retry-with-backoff (the endpoint drops ~30–40% of
  connections; it is stateless, so retry is safe). Stores exact JSON-RPC payloads, verbatim answers,
  per-query latency, git commit + dirty flag in `evidence/runs/`; writes a raw JSONL transcript, a
  rendered markdown transcript, and a stamped `proof-<ts>.json`. `check` gates on ≥7 documented
  queries; `links` curl-tests every URL in `LINKS.md`. Run: `python3 scripts/query_log.py run`
  (~6 min, 6 s between queries). `sendFeedback` is never invoked (it would file a real report).
- **`scripts/quote_check.py`** — asserts every `>` quote in `evidence.md` appears
  (whitespace-normalized) in the verbatim transcript. Exit 0 = all verified.
- **`QUICKSTART.md`** — "First 5 Queries": chain identity, Chain MCP tools, get_logs paging (with the
  G3 discrepancy stated), the faucet gap, the arena gap — each answer Docs-MCP-derived, dated
  2026-10-19, with source links.
- **`queries.json`** — the 9 exact queries, reusable as regression probes for docs changes.

## 6. Firewall & honesty

- The evidence section contains **only Docs-MCP-derived material** (`askQuestion` answers, labeled).
- Endpoint discovery (my own `tools/list` probe) and pre-seeded hypotheses are quarantined in
  `evidence.md` §3 (non-evidence appendix) — they informed the queries but are not evidence.
- The 2026-10-16 `?ask=`-era log is superseded; retained in `evidence.json` (legacy) for the record.
- The login-gated ai.pharos.xyz portal session is **unrepresented** here; a logged-in follow-up
  session could strengthen G1. Stated, not hidden.
- Dropped connections during the run are logged as observed behavior (G4), not papered over.

## 7. Files

```
tasks/t03-docs-mcp-onboarding/
├── README.md            # this file
├── REQUIREMENTS.md      # official requirements, quoted verbatim
├── QUICKSTART.md        # onboarding artifact derived from real MCP answers
├── task.yaml            # machine-readable task record
├── queries.json         # the 9 exact queries
├── evidence.md          # §1 MCP log · §2 gap table · §3 non-evidence appendix
├── evidence.json        # LEGACY 2026-10-16 ?ask=-era log (superseded, retained)
├── evidence/runs/       # per-run JSON + stamped proof-<ts>.json
├── evidence/transcripts/# verbatim transcript-<ts>.jsonl + .md
├── evidence/link_check.json  # curl-test results for LINKS.md
├── LINKS.md             # every link, curl-verified
├── SUBMISSION.md        # copy-paste Arena pack
└── scripts/
    ├── query_log.py     # v2.0 — real Docs MCP runner
    └── quote_check.py   # machine quote verification
```

## 8. Reproduce

```bash
cd ~/workspace/lightkeeper/tasks/t03-docs-mcp-onboarding
python3 scripts/query_log.py run          # 9 queries via Docs MCP → evidence/runs/<ts>.json + transcript + proof
python3 scripts/query_log.py check        # verify ≥7 documented queries
python3 scripts/query_log.py links        # curl-test every link in LINKS.md
python3 scripts/quote_check.py            # verify every evidence.md quote against the transcript
```

Zero PHRS spent. Atlantic testnet untouched (read-only research task).
