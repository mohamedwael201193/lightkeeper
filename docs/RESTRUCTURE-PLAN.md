# RESTRUCTURE PLAN — Two Faces: Public Product vs Founder Cockpit
**Critic audit · 2026-10-16 · author: devmo**
Scope: per-task pages (`/#/task/<slug>`). Read-only audit of current code; this plan is the only write.

---

## 1. Classification law (brief §0C, restated brutally)

A judge opens a task page to see a **product**: what the lamp does, how to try it, and proof it really happened on-chain. Right now they get a **build folder**: terminal commands, YAML dumps, log tails, and instructions addressed to the founder.

The law is one question per block: **who is this block talking to?**

- **FOUNDER** if it tells the founder what to DO (submit, copy, film, export), or explains HOW the task was BUILT (raw config dumps, log tails, transcripts, decoding notes, failure-mode tables, "the assistant never submits on the founder's behalf").
- **PUBLIC** if it shows what the skill DOES, lets a stranger TRY it with their own wallet, or lets them VERIFY the proof (tx hashes as explorer links with plain labels).

When in doubt, it goes to FOUNDER. A clean public page is worth more than one extra proof detail on it.

Also binding: §0A/§0B still hold — task pages keep the porcelain workbench theme; copy is LIGHTKEEPER-first (Atlantic/Pharos appear only as chain/network context, never as the headline).

---

## 2. Block-by-block audit of the CURRENT TaskDetail (`apps/console/src/components/TaskDetail.tsx`)

**Result: 8 top-level blocks. 3 stay PUBLIC · 3 go FOUNDER entirely · 2 are split (curated part PUBLIC, raw part FOUNDER).** Every offender is named below.

| # | Block (current) | Verdict | One-line justification |
|---|---|---|---|
| 0 | Back link ("Back to the lamps") | **PUBLIC** | Neutral nav. Keep. |
| 1 | Task hero: `{id} · {toolkit} · {tier} · {points} pts` + name + LIT/DIM chip | **PUBLIC** | The product identity line. **Gap:** it has NO one-line what-it-does — the page immediately becomes a config dump. Add the curated one-liner here (§4). |
| 2 | 01 Configuration — raw `task.yaml` code-block dump | **FOUNDER** | Build-recipe dump. A judge does not read YAML to understand a product. |
| 3 | 01 Configuration — raw `policy.yaml` code-block dump | **FOUNDER** | Same: build recipe. Exception: T05's policy *values in plain words* ("0.005 PHRS per tx") are a public feature — they must be re-authored as plain-language parameters, not shown as YAML. |
| 4 | 01 Configuration — "Evidence-declared parameters" auto-dumped table | **SPLIT** | Curated readable parameters (limits, thresholds, addresses) → PUBLIC as a plain "How it's configured" row. Raw auto-dumped keys → FOUNDER. Currently renders up to 24 undifferentiated keys = builder jargon. |
| 5 | 02 Execution trace — deployed contracts table (name + explorer link) | **PUBLIC** | Verifiable proof artifact. Keep, plain labels. |
| 6 | 02 Execution trace — Runs table (label + decision chip + receipt link) | **PUBLIC** | The core proof block. Keep. |
| 7 | 02 Execution trace — inline `r.log` fragments under run labels | **FOUNDER** | Raw log one-liners = internal archaeology. Delete from public; keep in founder face. |
| 8 | 02 Execution trace — Transaction receipts list (hash + explorer link) | **PUBLIC** | Pure proof. Keep, with a plain one-line caption ("every tx below is clickable on the Atlantic explorer"). |
| 9 | ◈ Try it live (`TryPanel.tsx`) | **PUBLIC** | The whole section is already clean: live reads cost nothing, funds only ever *proposed*, visitor signs in THEIR wallet, LIGHTKEEPER never sees keys. Keep verbatim. The 20 `try/<slug>.tsx` modules being built are all PUBLIC by definition. |
| 10 | 03 History — activity feed list (title + time + explorer link) | **PUBLIC** | Verifiable activity. Keep — but rewrite builder-addressed copy inside it. |
| 11 | 03 History — raw run-log file tails in `<details>` accordions | **FOUNDER** | "Real tails of `run-logs/*` written by the task builder" is a build-doc confession. A judge reads outcomes, not log tails. Move all. |
| 12 | ✎ Builder's summary — full `README.md` rendered as markdown | **FOUNDER — and the #1 offender** | Dumps the entire build doc: "How to run" sections, `set -a; source ~/workspace/lightkeeper/.env`, SkillEngine pre-check tables, architecture notes, test commands. This single block is why the founder said the pages read like internal docs. **Remove from public entirely.** Replace with 3 plain sentences written for a stranger (§4, §6 rewrite rules). Full README goes to the founder face. |
| 13 | ▣ Arena submission — "Open Arena task board" + "Copy submission note" + "Export lamp JSON" + "the assistant never submits on the founder's behalf — he files them himself" | **FOUNDER — the #2 offender** | Three buttons that do founder errands + a sentence that is literally internal ops language ("the assistant never submits on the founder's behalf", "he files them himself") rendered on a public page. Move the entire section to the founder face. |
| 14 | Bottom mono line `{ARENA_BOARD}/{slug}` | **FOUNDER** | Internal path leak. Delete from public. |

**Honest summary of what's wrong:** the public page is currently ~70% founder content by vertical space. The hero promises a product and then delivers: two raw YAML dumps, raw log tails, the entire build README, and a submission cockpit. The TryPanel and the runs/contracts/receipts tables are the only parts a judge should keep seeing.

**Nav/footer check (Header.tsx, App.tsx Footer):** Header nav is clean (Home / Lamps / The Stack / Keeper's log, wallet connect, Atlantic chip). Footer has the honest generation note — keep wording, add the one discreet `founder` link (§5). No other founder leaks in chrome.

---

## 3. Per-task table (all 28)

For every task: the **public one-liner** (goes in the hero), what to **rewrite** vs **move**, and task-specific notes. The general rule applies everywhere unless noted: Builder's-summary block → rewrite to 3 plain sentences + full README to FOUNDER; Arena panel → FOUNDER; raw `task.yaml`/`policy.yaml`/`config.yaml` dumps → FOUNDER; run-log tails → FOUNDER; TryPanel → PUBLIC as-is; runs/contracts/receipts → PUBLIC.

| Task | Public one-liner | Rewrite / move | Task-specific notes |
|---|---|---|---|
| T01 Read Contract State | Reads 8 typed values from a live contract, all pinned to one block, with an independently verified storage-slot proof. Failure states fail loudly — never silent zeros. | Rewrite: the storage-slot proof becomes a public line ("independently re-verified via raw storage reads") — no slot-table dump. Move: `bin/` commands, sample-output. | deploy tx + contract address stay PUBLIC as explorer links. |
| T02 Event/Log Monitor | Watches a live contract's events block by block, decodes every log into readable fields, never duplicates an alert — survives a `kill -9` without re-emitting. | Rewrite: chunking/reorg logic → one plain sentence ("reorg-tolerant, exactly-once"). Move: `monitor.py` internals, scan-range mechanics. | Emitter contract address PUBLIC as explorer link. |
| T03 Docs MCP Onboarding | A feedback-task deliverable: a verbatim query log over the Pharos docs with 5 confirmed documentation gaps — each with the exact query and a suggested fix. | Rewrite: frame as "what it found" (the 5 gaps) not "how it was run". Move: query-log runner commands, onboarding quickstart for the founder's arena use. | This task IS notes by nature; its public proof is the 5 gaps, plain-language. |
| T04 Doc-Search CLI | A command-line tool that answers Pharos developer questions with citations — every claim carries its source passage. | Rewrite: lead with the honesty feature (citations, no improvisation). Move: BM25/index build steps, fetch dates of the corpus. | Sample Q&A (one example question + cited answer) is strong PUBLIC proof. |
| T05 Threshold Guardian | A policy gate that intercepts proposed transfers and BLOCKS any write that breaches thresholds — six live chain conditions, one plain policy file, mainnet refused outright. | Rewrite: policy values in plain words ("0.005 PHRS per tx · 0.02 per hour · gas cap 50 gwei") — no YAML. Move: `guardian.py` CLI invocations, audit-jsonl mechanics. | The three-outcome story (HOLD / FIRE / REFUSE) is PUBLIC-proof gold: decision chips + one tx link + "blocked, nothing spent". |
| T06 Saga Executor | A multi-step approve→lock→execute→settle workflow with real retry and compensation — proven by a genuine mined failure receipt followed by confirmed compensation transactions. | Rewrite: saga states diagram → one sentence ("each step must succeed before the next starts; a mined failure triggers automatic compensation"). Move: retry backoff schedule, `--gas-limit` failure-broadcast mechanics (fascinating but builder-internal). | **The real mined `status: 0` receipt + compensation txs are the single best PUBLIC proof artifact in the fleet** — lead with it: "the failure is real, on-chain, and the recovery is too." |
| T07 Arbitrage Scanner | Scans three live AMM venues at one pinned block, computes every cross-venue cycle with real math, nets fees and gas — acts, or skips with a machine-readable reason. | Rewrite: constant-product math → "real pricing math, fees and gas subtracted". Move: `scans.jsonl` mechanics, `--execute` CLI docs. | Honest no-op scans (SKIP with reason) are PUBLIC-proof gold too — show a skip row, not just acts. |
| T08 Dry-Run Executor | Answers "what would happen if we sent this?" by simulation — issues a signed-by-nobody SimulationReceipt, and never broadcasts. | Rewrite: `eth_call`/`estimateGas` mechanics → "it simulates, it doesn't send". Move: receipt schema, CLI flags. | The SimulationReceipt artifact can be shown PUBLIC as a redacted sample (no keys/paths). |
| T09 Trend Watcher | Watches Atlantic's fee market and fires only when the trend is real — 5/15 moving-average crossover with a confirmation band, never wave-chasing. | Rewrite: sampling mechanics → "samples real base fee per block". Move: daemon flags, confirmation-band tuning notes. | "Fires only after 3 confirmations" is a clean PUBLIC line. |
| T10 Flotilla — Batch Executor | Implements the 3 official batch modes from the SkillEngine airdrop reference for atomic multi-step execution. | Rewrite: batch modes → one plain sentence each (or "all-or-nothing, sequenced, parallel"). Move: reference mapping, CLI. | PUBLIC try: propose-a-batch → visitor reviews in own wallet. |
| T11 Policy Gatekeeper | A pre-execution policy engine: every proposed write is evaluated against a versioned policy file — APPROVE with a gate stamp, or DENY with the named rule. | Rewrite: `policy.json` schema → plain examples ("this rule blocked X"). Move: versioning mechanics, gate-stamp format. | Show one real DENY row PUBLIC (blocked action, named rule) — gates are proven by what they stop. |
| T12 Skill + Chain MCP Flow | One end-to-end composition flow: read live state → invoke a skill action on that data → verify via chain queries, all from a single request. | Rewrite: "the portal pattern, reproduced end-to-end". Move: MEGA § references, session mechanics. | PUBLIC try: the composition loop is the most demo-able Tier B — visitor proposes, signs themselves. |
| T13 Docs MCP + Chain MCP Agent | Ask a question, get a cited answer from the real Pharos docs — then watch the answered procedure execute live on Atlantic. | Rewrite: citation labels (DOC-GROUNDED/INFERENCE/UNVERIFIED) → plain words ("every claim labeled by source; says so when the docs don't cover it"). Move: doc-fetch dates, passage index details. | One example Q→execution pair PUBLIC. |
| T14 Portfolio Assistant | Read-only portfolio reports in plain words: every number pinned to a block and cited to its source contract. It says "I don't know" instead of guessing — and refuses USD valuations on testnet assets. | Rewrite: the honesty rules are the product — keep them PUBLIC in plain language. Move: source-contract mapping mechanics. | "Refuses USD valuations" is a legendary PUBLIC line — keep it. |
| T15 Yield Optimizer | Discovers which yield venues actually exist on Atlantic testnet and reads their live rates — radically honest about what's real and what isn't. | Rewrite: "≥3 venues, live rate views, runway math" → plain. Move: venue-discovery mechanics, runway computations. | The honesty verdict ("these 2 venues are real, these are dead") is PUBLIC proof. |
| T16 Liquidation Watchdog | Watches a live on-chain lending pool's health factor and fires a single alert on a real threshold transition — never twice. | Rewrite: Aave-style health factor → "a health score computed on-chain". Move: watcher poll mechanics, `MiniLend` internals. | The single-transition alert + dedupe is the PUBLIC story. |
| T17 Natural-Language Payment Agent | Type "send 0.01 PHRS to 0x…" — the agent parses it into a plan, shows you a REVIEW card, and only moves funds after you approve in your own wallet. | Rewrite: parse→validate→review→sign pipeline → plain. Move: parser internals, plan schema. | PUBLIC try is the star here: the visitor types, the visitor signs. Emphasize "your wallet, your keys, your testnet PHRS". |
| T18 Recurring Payment Agent (TIDE) | Schedule-driven recurring payments: define recipient, amount, interval, stop conditions — each tick pays the single due installment, once. | Rewrite: tick mechanics → plain. Move: schedule schema, state file mechanics. | Show one real tick row PUBLIC (due installment paid, tx link). |
| T19 Invoice-to-Payment Agent | Turns an invoice file into a real on-chain payment — human review step, explicit confirmation, and a paid-stamp ledger that makes double-payment impossible. | Rewrite: paid-stamp ledger → "can't pay the same invoice twice". Move: invoice parsing, ledger mechanics. | The double-payment impossibility is the PUBLIC line; the review step is the PUBLIC try. |
| T20 On-Chain Alert Bot | Watches the chain block by block and delivers each matching event to a real Telegram channel — tx hash, explorer link, value, block number. Exactly once, never twice. | Rewrite: dedupe/crash-safety → "never duplicates, survives restarts". Move: `watch.sh` flags, `state/` mechanics, bot-token sourcing (never public, obviously). | **The real Telegram delivery is PUBLIC-proof gold** — a redacted screenshot/description of the delivered alert + the trigger tx link stays PUBLIC. Bot token/chat ID never appear anywhere public. |
| T21 Whale-Watching Agent | Monitors Atlantic for large transfers and produces a ranked watch report: what moved, how much, from where, to where — labeled where known, never invented. | Rewrite: ranking mechanics → plain. Move: threshold config, report generation internals. | One real ranked report excerpt PUBLIC (addresses shortened, explorer links). |
| T22 Gas Fee Optimizer | Polls real fee data, computes speed tiers, recommends a price for your urgency — and proves it by sending real dust through a cheap window and at the deadline. | Rewrite: tier computation → "three speeds, real numbers". Move: poll mechanics, execution flags. | The two dust txs (cheap window vs forced deadline) with `effectiveGasPrice` are clean PUBLIC proof. |
| T23 Wallet Risk Checker | Read-only risk check on any address: 8 real on-chain checks — age, tx pattern, balance, contract-vs-EOA, activity window. No judgment, just data. | Rewrite: the 8 checks → a plain bullet list. Move: check implementations, scoring weights. | PUBLIC try is perfect Tier A: paste an address, get the report — free, keyless. |
| T24 Audit-Log Agent | An append-only hash-chained log of real agent actions with real tx hashes — plus a wallet-activity reporter (address + date range → activity, totals, notable txs) with Markdown/CSV/PDF exports. | Rewrite: hash-chaining → "tamper-evident, each entry links to the last". Move: log format, export generation internals. | One real log entry + one real tx link PUBLIC; export samples redacted. |
| T25 dApp Support Agent | Hand it a failed tx hash and it tells you why in plain words, with the receipt to prove it — plus doc-grounded Q&A that admits when the docs don't cover a question. | Rewrite: the verdict table (revert_with_reason, out_of_gas…) → 2-3 plain examples. Move: replay mechanics (`eth_call` at block−1), selector decoders. | The known real failure diagnosis (tx `0x405295cd…` → plain explanation) is strong PUBLIC proof. PUBLIC try Tier A: paste any tx hash. |
| T26 Weekly Digest Agent | Compiles real on-chain activity for a watched address over a 7-day block window — tx count, volume in/out, gas spent — diffed against the previous period. | Rewrite: block-window mechanics → plain. Move: `eth_getLogs` batching, persistence of previous period. | One real digest excerpt PUBLIC (numbers, no addresses of the founder). |
| T27 Doc-Grounded Builder Agent | A builder that plans strictly from retrieved Pharos documentation — never from memory, never improvised. | Rewrite: retrieval pipeline → "retrieves first, plans second". Move: planner internals, retrieval corpus details. | The example build ("deploy an ERC20 on Atlantic") with its cited plan PUBLIC. |
| T28 Multi-Protocol Aggregator | One interface over fault-isolated on-chain venues: reads every venue's live state at one pinned block — TVL, APYs, utilization — normalized and comparable. | Rewrite: normalization math → "same units, comparable". Move: registry mechanics, fault-isolation internals. | One pinned-block comparison table PUBLIC (venue × APY/TVL, explorer links). |

---

## 4. Exact new PUBLIC page outline (template for all 28)

One template, no exceptions. A judge understands the page in 10 seconds.

```
┌─────────────────────────────────────────────────────────────┐
│  Back to the lamps                                          │  ← nav (keep)
│                                                             │
│  T05 · SKILLENGINE · MEDIUM · 100 PTS        [🔥 LIT]        │  ← identity line
│  Threshold Guardian                                         │  ← name (keep)
│  A policy gate that intercepts proposed transfers and       │
│  BLOCKS any write that breaches thresholds — six live       │  ← curated one-liner
│  chain conditions, one plain policy file.                   │
├─────────────────────────────────────────────────────────────┤
│  ◈ TRY IT LIVE — with your own wallet                        │  ← TryPanel (keep)
│  [safety sentence: live reads cost nothing; funds only ever  │
│   proposed; you sign in YOUR wallet with YOUR testnet PHRS; │
│   LIGHTKEEPER never sees keys]                              │
│  [per-task try/<slug>.tsx surface]                          │
├─────────────────────────────────────────────────────────────┤
│  ON-CHAIN PROOF                                             │  ← renamed 02
│  "Everything below happened on the Atlantic testnet and     │
│   is clickable on the explorer."                            │
│  · Deployed contracts — name → explorer link (shortened)    │
│  · Runs — plain label · decision chip (ALLOW/BLOCK/…) ·     │
│    receipt link. No raw log fragments.                      │
│  · Transaction receipts — hash list → explorer links        │
│  [DIM tasks: honest empty state — "No runs recorded yet.    │
│   This lamp stays dim until real evidence lands." No mocks.]│
├─────────────────────────────────────────────────────────────┤
│  HOW IT'S CONFIGURED (curated, ≤8 rows)                     │  ← renamed 01, plain
│  "Configured in plain words — nothing hard-coded."          │
│  Plain-language parameter rows only                         │
│  (e.g. "Max per transaction — 0.005 PHRS").                 │
│  NO raw YAML. NO file dumps. NO task.yaml.                  │
├─────────────────────────────────────────────────────────────┤
│  WHAT IT DOES (3 plain sentences, curated per task)         │  ← replaces Builder's summary
│  Replaces the full-README dump. Written by the restructure  │
│  workers from §3's one-liners. Plain language. No commands. │
│  No terminal. No env files. No "How to run".                │
└─────────────────────────────────────────────────────────────┘
```

**Explicitly deleted from the public page:** 01's raw `task.yaml`/`policy.yaml` code dumps; 02's inline raw log fragments; all of 03 (replaced — see below); the full-README "Builder's summary"; the entire "Arena submission" panel; the bottom `{ARENA_BOARD}/{slug}` mono line.

**What replaces 03 History on the public page:** nothing as a section — the runs/receipts tables in ON-CHAIN PROOF already carry the verifiable history. The activity-feed items with explorer links may stay as a compact "Recent activity" list (≤5, plain titles, links) ONLY if their copy is rewritten founder-free. Raw log tails are gone from public.

**DIM-task honesty rule (unchanged):** empty states say "not recorded yet", never mock data.

---

## 5. Exact FOUNDER face spec (the cockpit)

**Gating (mechanical, no new dependencies):**
- Activation: URL `?founder=1` on any route (e.g. `/#/task/t05-threshold-guardian?founder=1`) → parsed in `useRoute()` → persisted to `localStorage['lk_founder']='1'`. Persists across visits; a "leave founder mode" control clears it.
- Discovery: **one** discreet link in the footer — small, low-contrast, lowercase `founder` — that sets founder mode and stays on the current page. Not in the header/nav. Not advertised anywhere. Never indexed: when founder mode is active, inject `<meta name="robots" content="noindex,nofollow">` and `document.title` gets no founder marker (don't leak in tab titles).
- Rendering: founder mode renders **all** FOUNDER blocks on the task page (same route, extra sections below the public content, visually separated — e.g. a dashed "founder tools" divider) AND unlocks a `#/founder` cockpit page listing all 28 tasks with quick access to each task's pack.

**Contents of the founder face per task (everything §2 marked FOUNDER, plus cockpit tools):**
1. **SUBMISSION.md copy pack** — rendered markdown + "Copy submission pack" button. The founder files it himself on the Arena board; the assistant never submits.
2. **VIDEO-GUIDE.md** — shot list rendered, for filming from the native surfaces (terminal/CLI/Telegram/explorer).
3. **Arena task board link** — "Open Arena task board" (moved from public).
4. **Export lamp JSON** — "Export lamp JSON" (moved from public).
5. **Internal notes** — raw `task.yaml` / `policy.yaml` / `config.yaml` dumps, full `README.md`, decoding notes, failure-mode tables, transcripts, run-log tails, raw evidence parameter dump.
6. **Copy submission note** — the quick note button (moved from public).
7. Per-task **content inventory** — which artifacts exist (SUBMISSION.md ✓/✗, VIDEO-GUIDE ✓/✗, evidence.json ✓/✗, run-logs count) so the founder sees at a glance what's missing before submission day.

**Cockpit-level ( `#/founder` ):** 28-row table — task, LIT/DIM, submission pack ready ✓/✗, video guide ready ✓/✗, evidence count, quick links to task page (founder mode) + arena board. One "Export all lamp JSON" bulk button. Nothing on this page is ever linked from public chrome.

**Hard rules:** no founder block renders without `lk_founder==='1'`. No founder text in the public bundle's visible copy. `try/` modules stay PUBLIC-only and must never import founder content.

---

## 6. Rewrite rules (binding on all 3 restructure workers)

1. **LIGHTKEEPER-first, plain language.** The product is the lamp; Atlantic testnet appears only as chain context ("on the Atlantic testnet", "explorer link"). No Pharos headlines, no arena headlines.
2. **Zero founder-addressed sentences.** Never "you" = the founder. No "copy", no "submit", no "upload", no "film", no "the task builder hasn't written X yet" (rewrite as "not recorded yet"), no "the assistant never submits on the founder's behalf" — that sentence is banned from every public surface; it lives only in the founder cockpit.
3. **Zero submission mentions on public pages.** No "Arena submission", no "submission status", no "SUBMISSION.md", no board links, no pack, no export-JSON.
4. **Zero "upload".** The word does not appear on public pages.
5. **Zero raw config.** No YAML dumps, no code-block file contents, no `set -a; source …/.env`, no terminal commands, no file paths as instructions on public pages.
6. **No build archaeology.** No log tails, no transcripts, no decoding notes, no failure-mode tables, no "runs/" paths on public pages. Outcomes + receipts only.
7. **"What it does" = 3 sentences max**, derived from §3's one-liners. A stranger with no crypto background understands sentence 1; sentence 2 names the mechanism in plain words; sentence 3 names the proof ("proven by N real transactions, all linked below").
8. **TryPanel copy is frozen** — the safety sentence stays verbatim; per-task try modules describe actions, never keys, never custody ("LIGHTKEEPER never sees, holds, or asks for private keys" is the invariant).

---

## 7. The 3 most offensive founder-leaks currently on public pages

1. **"Standing rule: the assistant never submits on the founder's behalf — these packs are copy-paste-ready, and he files them himself."** (TaskDetail.tsx, Arena submission section.) Internal ops language, third-person founder reference, rendered to every visitor. This is the single sentence that most proves the founder's "internal build docs" verdict.
2. **The full `README.md` dump under "✎ Builder's summary"** — including "How to run" sections with `set -a; source ~/workspace/lightkeeper/.env` terminal commands on a public product page. A judge is being told how to source the founder's env file.
3. **"Real tails of `run-logs/*` written by the task builder — never simulated."** (03 History header) + raw log-tail accordions + "The task builder hasn't committed any" empty states — the page narrates the *build process* to the visitor instead of the *product*.

Honorable mention: the "Copy submission note" button (asks the visitor to copy the founder's submission memo) and the bottom `{ARENA_BOARD}/{slug}` mono line (internal path leak).

---

## 8. Implementation order for the restructure workers

1. **Worker A — PUBLIC template:** rebuild `TaskDetail.tsx` to §4's outline; add curated `one_liner` + `what_it_does` (3 sentences) + `config_plain` (≤8 plain rows) fields to the lamp data pipeline (`scripts/gen-lamps.mjs` + `src/data/lamps.json`); delete all FOUNDER blocks from the public render; rewrite empty-state copy founder-free.
2. **Worker B — FOUNDER face:** founder-mode gating (`?founder=1` + `localStorage`), discreet footer link, founder sections on the task page (SUBMISSION.md, VIDEO-GUIDE.md, arena link, export JSON, raw dumps, internal notes), `#/founder` cockpit, noindex guard.
3. **Worker C — per-task content:** for all 28 tasks, author `one_liner`, 3-sentence "what it does", and curated `config_plain` rows per §3; verify every tx hash/contract address against evidence; plain-language labels; no jargon.
4. **Audit experts (after):** re-run this critic's classification block-by-block on the rebuilt pages — any founder-addressed sentence or raw dump on a public route is a FAIL.

**Done when:** a judge opening any of the 28 task pages sees hero → try-it-live → on-chain proof → plain config → what-it-does, with zero founder words; the founder opening the same page with `?founder=1` sees his full cockpit; `tsc` + `vite build` clean.
