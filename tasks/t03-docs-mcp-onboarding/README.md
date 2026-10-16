<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:8px;">

# <span style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;letter-spacing:0.35em;">DOCS&nbsp;MCP&nbsp;ONBOARDING</span>

<span style="color:#f4f6ff;font-style:italic;">"One lighthouse. Twenty-eight lamps — and the keeper reads the manual first."</span>

<span style="color:#b9c2f5;">T03 · Pharos Season of AI Agent Arena · Easy · 50 pts · Developer Docs MCP</span>

</div>

---

## 1. What this is

A **feedback-task deliverable** built with ONLY Docs MCP surfaces: a verbatim step-by-step log of
queries asked → answers received, **5 confirmed gaps** each with the EXACT query and a suggested fix,
and a runnable query-log runner plus a "First 5 Queries" onboarding quickstart derived solely from
real answers. No mocks, no invented answers — where the docs couldn't answer, the log says so.

## 2. Official requirements → where they live

| Official requirement (MEGA §3.2, quoted in `REQUIREMENTS.md`) | Location |
|---|---|
| (1) Step-by-step log: tried → asked → received | `evidence.md` §1 · `evidence.json` (raw verbatim) |
| (2) ≥3 concrete gaps, each with the EXACT query | `evidence.md` §2 (G1–G5) |
| (3) Suggested fix per gap | Same table, "what the docs should have said" |
| (4) What you built / ran | `QUICKSTART.md` + `scripts/query_log.py` (§5 below) |
| CONSTRAINT: ONLY Docs MCP | `evidence.md` §3 firewall + §6 below |

## 3. The log (summary — 3 runs, 15 attempts, 8 answers)

Nine onboarding queries against the documented ask endpoint
`GET https://docs.pharos.xyz/<page>.md?ask=<q>&goal=<g>` (2026-10-16, verbatim in `evidence.json`):

| Query | Verdict |
|---|---|
| Sign-in to ai.pharos.xyz | "Cannot find" — arena absent from docs |
| Atlantic network identity | 688689 · `atlantic.dplabs-internal.com` · PHRS ✅ |
| Official faucet URL | "Docs don't provide a direct URL" — gap |
| Chain MCP tools | 14 tools, hosted `mcp.pharos.xyz`, **chain 1672/PROS** — ambiguity confirmed |
| get_logs limits | 100 blocks (rate-limited) / 10,000 fallback ✅ |
| SkillEngine install | **Failed 3×** (`IncompleteRead`) — genuine breakdown, logged |
| Arena submission | "Cannot find" — gap |
| Chain-ID ambiguity (688689 vs 1672) | 403 ×2, then confirmed 688689/PHRS |
| Share session links | "Cannot find" — gap |

Notable: the verdict team recorded HTTP **403** first-hand on this endpoint; this session got 200 on
most queries but 403s, `IncompleteRead`s and one stalled connection — reachability is client/rate
dependent. Both observations are recorded in `evidence.md`.

## 4. The five gaps

1. **G1 — Flaky scripted access.** The documented ask endpoint 403s / drops connections unpredictably; no rate-limit contract is published. *Fix: publish the contract; long-term, a real public Docs-MCP API.*
2. **G2 — Chain-identity ambiguity, confirmed.** Hosted Chain MCP = chain 1672/PROS = **Pacific mainnet**, never labeled as such; arena builders on Atlantic (688689/PHRS) can silently read the wrong chain. *Fix: one banner sentence on `mcp.md`.*
3. **G3 — No official faucet URL in the docs corpus.** *Fix: Live-Data entry + URL + drip limits.*
4. **G4 — The Agent Arena is entirely absent from the developer docs** (sign-in, submission, share links). *Fix: an "Agent Arena" docs section.*
5. **G5 — `llms.txt` omits real pages** (e.g. the Pharos MCP page the Q&A itself cites). *Fix: regenerate from the sitemap in CI.*

Full table with exact queries and verbatim returns: `evidence.md` §2.

## 5. What got built

- **`scripts/query_log.py`** (stdlib only) — replays `queries.json` against the live ask endpoint,
  stores every response verbatim (or the failure) in `evidence/runs/` + cumulative `evidence.json`;
  `check` gates on ≥7 documented queries; `links` curl-tests every URL in `LINKS.md`.
  Run: `python3 scripts/query_log.py run` (~3 min, 6 s between queries).
- **`QUICKSTART.md`** — "First 5 Queries": chain identity (+ the 1672 trap), Chain MCP tools,
  get_logs paging, the faucet gap, the arena gap — each answer Docs-MCP-derived with source links.
- **`queries.json`** — the 9 exact queries, reusable as regression probes for docs changes.

## 6. Firewall & honesty

- Evidence section contains **only Docs-MCP-derived material** (ask-endpoint answers + fetched `.md` pages, labeled).
- Hypotheses, inferences, and unrun probes are quarantined in `evidence.md` §3 (non-evidence appendix).
- The portal-embedded Docs MCP chat (ai.pharos.xyz) needs a wallet sign-in this agent cannot perform —
  it is **unrepresented** here; a logged-in follow-up session would strengthen G4. Stated, not hidden.
- Q6's three `IncompleteRead` failures are logged as failures. Nothing was reconstructed.

## 7. Files

```
tasks/t03-docs-mcp-onboarding/
├── README.md            # this file
├── REQUIREMENTS.md      # official requirements, quoted verbatim
├── QUICKSTART.md        # onboarding artifact derived from real answers
├── task.yaml            # machine-readable task record
├── queries.json         # the 9 exact queries
├── evidence.md          # §1 log · §2 gap table · §3 non-evidence appendix
├── evidence.json        # raw verbatim Q/A log (3 runs)
├── evidence/runs/       # per-run JSON
├── evidence/link_check.json  # curl-test results for LINKS.md
├── REVIEWER_NOTES.md    # for the judge
├── LINKS.md             # every link, curl-verified
├── SUBMISSION.md        # copy-paste Arena pack
├── VIDEO-GUIDE.md       # 45–90 s filming guide
└── scripts/query_log.py # reproducible query-log runner
```

## 8. Reproduce

```bash
cd ~/workspace/lightkeeper/tasks/t03-docs-mcp-onboarding
python3 scripts/query_log.py run    # replay all queries → evidence/runs/<ts>.json
python3 scripts/query_log.py check  # verify ≥7 documented queries
python3 scripts/query_log.py links   # curl-test every link in LINKS.md
```

Zero PHRS spent. Atlantic testnet untouched (read-only research task).
