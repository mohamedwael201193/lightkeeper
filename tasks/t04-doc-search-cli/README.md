<div align="center" style="background:#1414c8; padding:48px 24px; border-radius:8px;">
  <div style="font-family:Georgia,'Times New Roman',serif; color:#d9a821; font-size:42px; letter-spacing:8px; font-weight:bold;">T04 · DOC-SEARCH CLI</div>
  <div style="color:#f4f6ff; font-size:15px; margin-top:16px; font-style:italic;">One keeper, thirty lamps — this arm holds the one that asks the Docs MCP, and never invents.</div>
  <div style="color:#b9c2f5; font-size:12px; margin-top:8px; letter-spacing:2px;">LIGHTKEEPER · PHAROS AGENT ARENA · EASY · 50 PTS</div>
</div>

---

## 1. What this is

`pharos-docs` is a thin, honest command-line wrapper around the **real Pharos
Developer Docs MCP**:

```
https://docs.pharos.xyz/~gitbook/mcp          (public GitBook MCP, no auth)
```

Every query is a live MCP `tools/call` round-trip — `searchDocumentation` by
default (`getPage` / `askQuestion` in the matching modes). Nothing is answered
from a local index, nothing is scraped, nothing is invented. Stdlib Python only.
Read-only task: zero chain interaction, zero spend.

Every technical answer carries exactly one label:

- **DOC-GROUNDED** — verbatim excerpt(s) from MCP search results, with doc URL + retrieval date
- **UNVERIFIED** — no MCP result covers the question above the relevance gate; the tool refuses (exit code 2)

### Honest claim boundary

This wraps the **public GitBook Docs MCP endpoint** (`docs.pharos.xyz/~gitbook/mcp`,
server `0.27.2`). It is NOT the login-gated `ai.pharos.xyz` portal session (a
different surface that composes Chain MCP + docs). It is docs-only: it cannot
read chain state. The `sendFeedback` tool is deliberately never invoked (it files
a real report to the Pharos docs team).

### Requirements → evidence

| # | Official requirement (T04, Easy) | How it is met | Evidence |
|---|---|---|---|
| 1 | Accepts NL question as input (`pharos-docs "how do I deploy a contract?"`) | `./pharos-docs` executable; question → live `searchDocumentation` call | README §4; `evidence/evidence.json` E1,E2,E3,E7,E8,M1,M2 |
| 2 | Returns concise answer + links/references to source doc sections | Answer cards: verbatim excerpts + `Source: <doc URL> (via Docs MCP, retrieved <date>)` | `evidence/evidence.json` citations |
| 3 | 'No good answer found' handled gracefully, never invents | UNVERIFIED miss path, exit code 2; relevance gate; closest-pages suggestions (labeled as browse hints, not answers) | `evidence/evidence.json` M1–M2; tests |
| 4 | README with install/usage + 3 example queries with outputs | This README: §3 install, §4 usage, §6 examples (all real MCP output) | Below |

**Machine-checked citations:** every quoted excerpt in the evidence battery is
asserted — offline — to be a verbatim substring of the raw MCP response it came
from (`evidence/raw/<id>.txt`). See `tests/test_cli.py::TestMachineCheck`.

## 2. Install

Requirements: Python 3.8+ (stdlib only — no pip packages), internet access
(every query calls the live Docs MCP).

```bash
cd tasks/t04-doc-search-cli
chmod +x pharos-docs
./pharos-docs "how do I deploy a contract?"
```

Run the test suite:

```bash
python3 -m unittest tests.test_cli          # offline machine-checks (no network)
T04_LIVE=1 python3 -m unittest tests.test_cli.Live   # live MCP round-trips
```

Replay the evidence battery (real MCP calls; slow — the endpoint drops
connections and the client retries with backoff):

```bash
python3 evidence/run_evidence.py
```

## 3. Usage

```
pharos-docs "natural language question"
pharos-docs --json "question"          # machine-readable output
pharos-docs --top 5 "question"         # up to 5 answer cards
pharos-docs --page <doc-url>           # full page text via the getPage tool
pharos-docs --ask "question"           # synthesized answer via askQuestion
pharos-docs --raw-log <path> "q"       # also dump the raw MCP response text
```

Exit codes: `0` = DOC-GROUNDED answer, `2` = UNVERIFIED (no good answer found,
nothing invented), `1` = error (e.g. MCP unreachable after retries).

## 4. How it works

```
question
  → searchDocumentation tool @ docs.pharos.xyz/~gitbook/mcp
  → parse "Title / Link / Content" results
  → relevance gate: a result COVERS the question only if the question's
    distinctive terms (len ≥ 3, non-generic) appear in its title+content;
    all LONG terms (≥ 6 chars) must be present, plus ≥ half of all terms.
    (searchDocumentation always returns ~10 results, even for out-of-scope
    questions -- the gate is what makes "no" possible.)
  → top covering results become answer cards: verbatim excerpt windows
    around the densest cluster of question terms + doc URL + date
  → no covering result → UNVERIFIED (exit 2) + closest-pages browse hints
```

The endpoint drops connections mid-stream (~30–40% of calls in our tests); the
client (`src/docs_mcp.py`) retries with exponential backoff + jitter and
salvages partial SSE bodies. No `initialize` handshake is needed — the server
accepts `tools/call` statelessly.

## 5. Example queries (real MCP output, 2026-10-19)

### 5.1 `pharos-docs "what is the Atlantic testnet chain id and RPC url"` → DOC-GROUNDED (exit 0)

```
QUESTION
  what is the Atlantic testnet chain id and RPC url

LABEL: DOC-GROUNDED

ANSWER (verbatim excerpts from the Developer Docs MCP; nothing added)
> RPC Public Endpoint
> https://atlantic.dplabs-internal.com
> WSS Public Endpoint
> wss://atlantic.dplabs-internal.com
> Explorer
> https://atlantic.pharosscan.xyz/
> ChainID
> 688689
> Environment
> Atlantic Testnet
-- Atlantic Testnet
   Source: https://docs.pharos.xyz/getting-started/network/atlantic-testnet (via Docs MCP, retrieved 2026-10-19)

MCP: https://docs.pharos.xyz/~gitbook/mcp :: searchDocumentation
```

### 5.2 `pharos-docs "where do I get testnet tokens for gas on Pharos"` → DOC-GROUNDED (exit 0)

Full record: `evidence/evidence.json` record E3; raw MCP response in
`evidence/raw/E3.txt`. The Docs MCP answers with the faucet guidance **including
the honest docs gap** (the faucet is referenced but no URL is given) — the CLI
reports the gap instead of inventing a URL.

### 5.3 Miss demo: `pharos-docs "what is the birthday of the Pharos CEO"` → UNVERIFIED (exit 2)

```
QUESTION
  what is the birthday of the Pharos CEO

LABEL: UNVERIFIED

No good answer found. The Developer Docs MCP returned 10 result(s) but none covers
this question above the relevance gate, so this tool will not improvise an answer.

Closest pages in the docs (browse suggestions, not answers):
  - Pharos Skill Engine
    https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide
  - Piggy Bank Tutorial
    https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide/piggybank-skill-guide
  - About Pharos
    https://docs.pharos.xyz/introduction/readme
```

Full transcripts for the 7-query battery (5 grounded + 2 misses):
`evidence/evidence.json` (machine-readable, with raw MCP logs under
`evidence/raw/`). Replay any time: `python3 evidence/run_evidence.py`.

## 6. Architecture

```
pharos-docs            CLI: question → MCP tools → relevance gate → answer card
src/docs_mcp.py        stdlib MCP client: Streamable HTTP, SSE parsing,
                       retry-with-backoff, partial-body salvage;
                       ALLOWED_TOOLS = {searchDocumentation, getPage, askQuestion}
tests/test_cli.py      offline machine-checks (citations verbatim vs raw logs,
                       no stale index artifacts) + live MCP tests (T04_LIVE=1)
evidence/run_evidence.py  7-query battery → evidence.json + evidence/raw/*.txt
```

Key design decisions:

- **The MCP is the source.** There is no local index, no corpus, no scraping.
  The previous `llms-full.txt` index build was deleted outright (see git history).
- **The relevance gate is the honesty mechanism.** The MCP's search always
  returns results; "no" is a decision the CLI makes by checking that the
  question's distinctive terms actually appear in the results.
- **Synonym bridging is vocabulary-only** (`tokens`↔`pros`/`phrs`, etc.) — it
  helps find covering passages; it never creates content.
- **`sendFeedback` is never called.** It files a real report to the docs team;
  it is excluded from `ALLOWED_TOOLS` and asserted absent by test.

## 7. Honest limits

- Answers depend on the live Docs MCP: if the endpoint is down, the CLI errors
  (exit 1) instead of answering from memory. It never silently serves stale data.
- The MCP's search ranking is the docs site's own; the CLI quotes what the MCP
  returns, verbatim — including any docs-publishing artifacts on the pages.
- `askQuestion` answers are synthesized by the MCP's answer engine over the docs
  corpus; they are labeled as such and carry the engine's own source links.
- Coverage is whatever the Pharos docs cover. Out-of-scope questions get
  UNVERIFIED — including plausible-sounding dev questions the docs don't
  address. That refusal is the feature the task grades.
