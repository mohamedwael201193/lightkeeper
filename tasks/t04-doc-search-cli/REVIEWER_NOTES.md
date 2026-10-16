# T04 — Doc-Search CLI: Reviewer Notes

## 1. The `?ask=` endpoint investigation (why this is not a thin HTTP wrapper)

The docs advertise a dynamic ask endpoint in `llms.txt` (lines 14–20):

```
GET https://docs.pharos.xyz/<page-path>.md?ask=<question>&goal=<endgoal>
```

The verdict team confirmed **first-hand (2026-10-16)** that it returns **403 on plain HTTP GETs**,
and there is no public Docs-MCP API, repo, or schema — the official Docs MCP is portal-embedded
behind a wallet sign-in this agent cannot perform.

During this build (2026-10-16, ~07:30–10:30 UTC) the endpoint intermittently returned **HTTP 200**
with a plausible answer (e.g. `?ask=what+is+the+chain+id` → "Pharos Pacific Mainnet's chain ID is
**1672** (`0x688`)"). T03's evidence independently documents the same reachability discrepancy.

Decision, and why it doesn't matter which behavior you observe: the endpoint is **undocumented**,
has **no citation schema**, and **has 403'd before**. A CLI that shells out to it at answer time
would be exactly the "thin HTTP wrapper" the task forbids, and would silently break the day it
403s again. `pharos-docs` therefore contains **no HTTP client at all** (asserted by
`test_no_thin_http_wrapper`: no `?ask=`, no `curl`, no `urllib`, no `requests` in the CLI) and
answers only from a local index of fetched pages. Network is used only by `fetch_corpus.sh` and
`--rebuild-index`, never at answer time.

## 2. Architecture decisions

- **Corpus = `llms.txt` + `llms-full.txt` + `sitemap.md`, fetched live 2026-10-16.** The full corpus
  (403 KB, 146 H1 sections) is the GitBook export the docs themselves point to ("Full Documentation
  Bundle"). `llms.txt` is indexed as its own page because the authoritative **Defaults** block
  (Chainlink default oracle, ZAN default RPC, CCIP-first cross-chain, Foundry/Hardhat) exists only
  there — it is what makes "which X should I use" questions answerable.
- **Positional page attribution.** The full-corpus export follows the sitemap's TOC order exactly
  (verified 72/72 against strict title/slug matching). Pages are attributed to URLs positionally,
  which correctly disambiguates duplicate titles — the Foundry and Hardhat "Write Your First …"
  guides (four identical title pairs) each get their own correct URL. A positional/strict sanity
  check runs at every index build and fails the build on disagreement.
- **Sub-sections rendered as H1s fold into their parent page** (73 folded; e.g. Chain-MCP recipe
  steps, eth-getproof proof steps). Nothing is dropped; citations stay at page level.
- **The only URL fix-up:** `introduction/readme` 307-redirects to the docs home (GitBook readme
  convention), so "About Pharos" citations use the stable `introduction/readme.md`, the only form
  that serves the page content (verified 2026-10-16).

## 3. Retrieval design

BM25 (k1=1.5, b=0.75, stdlib only) over 438 passages, plus four documented, standard-IR boosts:

1. **Query synonym expansion** (0.5 weight): faucet↔{pros,phrs,gas,tokens,claim}, bridge↔{cctp,cross,chain},
   oracle↔{chainlink,supra}, validator↔node, deploy↔deployment, tps↔{transactions,second}, wallet↔metamask.
   Expansions only *find* passages — they never create content.
2. **Page-title boost**: 1 + 0.25 per distinct query term in the page title (cap 2.0).
3. **Recommendation boost** (×1.35): "which/should/best/recommend" questions prefer passages
   containing prefer/recommend/default/suggest — this surfaces the documented Defaults block.
4. **Rare-term boost** (×1.5): passages covering a distinctive query term (idf ≥ 5.0, or absent
   from the corpus entirely).

Answers are **verbatim quotes** selected by greedy max-marginal-coverage sentence selection
(preferring substantive sentences over bare headings), deduplicated. The `[INFERENCE]` paragraph is
a fixed, explicitly labeled disclosure — the tool never presents synthesis as a doc quote.

## 4. The honest-miss gate (threshold tuning, honestly reported)

Two gates must both pass for DOC-GROUNDED:

1. **Score**: top passage BM25 ≥ `--min-score` (default 1.0).
2. **Coverage**: top passage shares ≥ max(2, 50%) of the question's content terms **and** covers
   every distinctive (rare) query term present.

Calibration (see `tests/probe_scores.py`): the 7 evidence questions score 8.0–22.6 and pass both
gates; "what is the birthday of the Pharos CEO" and "how do I run a Pharos node on a Raspberry Pi"
fail the coverage gate and exit 2 with UNVERIFIED. The Raspberry Pi case is the important one: the
docs genuinely don't cover it, generic node passages score 9–11, and the gate refuses anyway.
`--min-score 999999` forces the miss path for any question (tested).

## 5. Known corpus artifact (not a bug in this build)

The Foundry "Write Your First Uniswap Contract" page, **as published in `llms-full.txt`**, contains
a Hardhat `npx hardhat ignition deploy … --network pharos` example (verified: the page's source
text contains "hardhat ignition" 3× alongside "forge" 12×). The CLI quotes it under the correct
Foundry URL because that is what the page says. The citation URL is always the true page; the tool
quotes the page faithfully rather than "fixing" it.

## 6. What was NOT done (per the QA fixes)

- No `--live` mode, no reverse-engineering of private/portal APIs. Deleted from the design, as ordered.
- No portal-seeded `kb/seed.json`: the T03 Docs-MCP session requires a wallet sign-in this agent
  cannot perform, and T03's own evidence came from the public surfaces. The local-retrieval design
  (verdict-sanctioned alternative (a)) is used instead — strictly stronger for citation discipline.
- No chain calls, no spend (0 PHRS; budget cap was 0.15). No secrets in the repo (`.env` never read
  by the tool; nothing to read — the CLI needs no credentials).

## 7. How to re-verify (5 minutes)

```bash
cd tasks/t04-doc-search-cli
python3 -m unittest tests.test_cli          # 14/14, no network, no chain
./pharos-docs "how do I deploy a contract?" # exit 0, DOC-GROUNDED
./pharos-docs "what is the birthday of the Pharos CEO"; echo $?  # exit 2, UNVERIFIED
python3 evidence/run_evidence.py            # replays all 9 evidence queries
```

## 8. HARDEN pass 2026-10-16 — rebuild pipeline re-verified from live docs

The rebuild path (`./pharos-docs --rebuild-index` → `fetch_corpus.sh` + `src/build_index.py`)
was re-run end-to-end in a throwaway copy of the task dir (shipped index/corpus untouched):

- Refetched `llms.txt` + `llms-full.txt` + `sitemap.md` from the live Pharos docs.
- Live corpus is **byte-identical** to the 2026-10-16 snapshot (`llms-full.txt` = 403670 bytes
  both); zero drift between fetch and the shipped index.
- Rebuilt index: 146 pages parsed, 74 indexed, **438 passages** — identical to the shipped index.
- Evidence battery re-run against the freshly built index: **9/9 expectations PASS**
  (E1–E7 DOC-GROUNDED exit 0, M1–M2 UNVERIFIED exit 2).

So the "refresh the corpus" answer to the stale-snapshot objection is verified, not aspirational:
a from-scratch rebuild reproduces the shipped index exactly, and every evidence query still
lands on its expected label and exit code.
