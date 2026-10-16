# FLAGSHIP CREATIVE BRIEF — 28 flagship demos
**Creative direction for the LIGHTKEEPER console · 2026-10-16 · Founder order: think like the best UI/UX designer in the world.**

This brief builds ON the [PRESENTATION-STANDARD.md](./PRESENTATION-STANDARD.md) (the law) and the [CONSOLE-REDESIGN-BRIEF.md](./CONSOLE-REDESIGN-BRIEF.md) (the identity). It does not override them: every animation still maps to a real state, body ≥ 14px, contrast audit stands, 390px is the gate, zero founder content in the public face, LIGHTKEEPER-first, blue = the stage / light = the workbench. No new dependencies (framer-motion + lucide-react only). This brief is the creative layer ABOVE the standard — the thinking that turns compliant pages into flagship demos.

**The state of the tree today:** the SHOWTIME op already rebuilt all 28 try modules on the standard. They are *correct* — 01→02→03, ResultCard climaxes, honest loaders. They are not yet *flagships*. The ceiling is T21's whale materializing as a giant spring-ticked number and T24's red-team lab where visitors FEEL tamper-evidence. Every other module must rise to that bar, in its own way. This brief names, per task, the single signature instant, the intellectual signature, the demo arc, and a decisive rebuild/refine verdict.

---

## 0. The North Star

A judge opens any task page and within five seconds can answer three questions without reading a manual: **what does this thing do, is it real, what's the clever part.** If the page needs a paragraph to be understood, it failed — no matter how clean it looks.

Three principles carry every module:

1. **The Reveal Grammar.** Every module speaks the same three beats, but each with its own voice:
   - **01 · Whisper.** Configuration is compact, calm, quiet. Small inputs, plain controls. It sets the stage and gets out of the way.
   - **02 · Heartbeat.** While real work is in flight, the page has exactly one pulse: the step label, the bar width, the pulsing dot. Nothing else moves. The user should *feel* the machine working, not watch a screensaver.
   - **03 · Verdict.** The answer lands like a verdict, not a report. The headline value is the largest thing on the page; everything else goes quiet around it. One sharp beat — a 0.3s rise — then stillness.

2. **Thinking made visible.** We never just present data. Every module exposes the *reasoning*: the rule that fired, the assumption we refused to make, the score we keep on ourselves, the denial we issued. The cleverest thing about each skill becomes the thing you SEE.

3. **Every task has a thing.** A flagship demo is a physical metaphor made digital: a radar, a ledger chain, a courtroom, a gauge, a newspaper, a sieve, a stamp. The module's layout, motion, and climax all serve that one object. If you can't name the thing, you haven't found the design yet.

---

## 1. The flagship visual language (global, all 28)

### 1.1 Signature transitions — the shared choreography vocabulary

Each transition below maps to a real state change. Rebuilders pick the ones that fit their task's *thing*; nothing else is allowed.

| Name | What it is | Maps to | Where it shines |
|---|---|---|---|
| **The Rise** | ResultCard rises 12–16px + fades in, once, 0.3s | The real answer arriving | Every 03 climax (already law) |
| **The Tick** | Number springs from 0 to the real value, once | A measured quantity landing | T21's whale, T14's balance, T19's invoice total |
| **The Swing** | SVG needle rotating to the value, 0.6s ease-out | A gauge reading resolving | T16's health factor, T23's risk verdict |
| **The Draw** | SVG stroke drawing itself (check mark, chain link) | A verdict sealing | T24's intact seal, T27's gate PASS |
| **The Settle** | Ranked items sorting into place, stagger ≤ 0.5s total | A ranking computed from live reads | T07's 12 cycles, T28's venue board, T21's whale list |
| **The Split** | One panel dividing into before/after or docs/chain | A comparison resolving | T13's courtroom, T01's time travel, T22's quoted-vs-settled |
| **The Stamp** | Verdict chip scaling 1.15→1.0 with a soft thud-shadow | A binary judgment issuing | T05/T11's ALLOW/BLOCK, T08's PASS/FAIL |
| **The Assembly** | Fields ticking into a document one by one (≤0.5s total) | A structured artifact composing | T17's payment plan, T18's schedule, T19's invoice |

Forbidden: anything on a timer, decorative canvases in data regions, staggered reveals longer than 0.5s total, parallax in the workbench. If you can't name the state, delete the motion.

### 1.2 Percussion, not wallpaper — visual rhythm without sound

Think like a drummer. The page is mostly **silence** (whisper-quiet 01, still 03) with **sharp beats** at the moments that matter:

- **One beat** when the result lands (the Rise + a single expanding ring on the hero value, gone in 0.6s).
- **A heartbeat** during runs (the pulsing dot + advancing step label — the ONLY motion).
- **A double beat** for failures and refusals (the Stamp lands twice — verdict, then reason — because the denial IS the product; see §3, the Beautiful Refusal doctrine).
- **A swell** for accumulating verdicts (T20's replay: each alert's PASS tick arrives with its own soft beat; T23's scan: checks arriving one by one, the composite gauge swinging last).

`prefers-reduced-motion`: every beat becomes instant. The verdict still lands — it just doesn't travel.

### 1.3 The five-second rule (global)

On landing, before any interaction, each module must pass the five-second test: a stranger answers *what it does*, *that it's real*, and *the clever part*. The per-task section names the exact sentence each module must make obvious. Achieve it with: a one-line honest descriptor under the task name (already there — keep it sharp), the tier line ("Tier A — live reads, no wallet, costs nothing") as a trust badge, and the configure act showing the *thing* immediately (the radar dial, the ledger chain strip, the empty gauge) even before the run.

### 1.4 Contrast, type, stage discipline (restated, non-negotiable)

Playfair Display for the verdict headline only; Inter for everything else; monospace for hashes/addresses/block numbers. Ink `#0B1533` on porcelain; slate `#5A6B8C` for secondary notes at 14px+; accent `#2456E6` for the one primary action; gold `#C9A227` for LIT badges only (text in `golddeep #8A6F12`); pass/fail green/red for verdicts. Blue = the stage (hero only); the workbench stays light. 390px: headline fits two lines, StatStrip collapses to 2 columns, primary action ≥ 44px and sticky for Tier B sign flows.

---

## 2. The anti-generic checklist — what "beginner-level" looks like

If a rebuilt module matches any of these, it is not done. Judges have seen all of these a thousand times:

1. **The form → button → table.** Inputs on top, a button, a data table below. That's a database admin panel, not a demo. The 01→02→03 acts must feel like acts — different visual registers, not one long form.
2. **Three identical stat cards in a row with tiny labels.** If the numbers don't each earn their place, cut them. StatStrip is 2–4 numbers that *summarize the verdict*, not a dashboard widget graveyard.
3. **Small text blended into the background.** The founder's original complaint. The answer must be the biggest, darkest thing on the page. If a judge has to squint, the hierarchy failed.
4. **A spinner that isn't tied to a call.** Any motion during 02 that doesn't name a real RPC call is decoration and lies about work. One pulsing dot, real step labels, real progress.
5. **Everything the same size.** No headline, no whisper. Flagship pages have a dynamic range: a 48px verdict and 14px notes, with nothing in between competing.
6. **A result that reads like a receipt.** Hashes and block numbers are evidence, not the story. The story is the verdict sentence a human would say out loud: *"Kraken's 2.5× rate loses to the runway cap — Kelp wins at 180 days."*
7. **Mock-adjacent emptiness.** A blank panel with "No data" is a dead end. Empty states are invitations with one CTA that does something real.
8. **The clever part buried in a paragraph.** If the module's intellectual signature (its thinking layer) isn't *visible* — as a structure, a visual, a moment — it doesn't exist for the judge.
9. **Founder content leaking into the public face.** Submission packs, internal notes, "upload" instructions, build commentary — behind `?founder=1`, always. When in doubt, it's founder content: leave it out.
10. **Pharos-first copy.** If a sentence could appear on Pharos's own website, rewrite it to be about what WE built. The chain is technical context; the skill is the headline.

---

## 3. Global creative doctrines (apply across tasks)

**A. The Beautiful Refusal.** Denials, refusals, and honest negatives get the premium treatment — they are flagship moments, not error states. T04's UNVERIFIED, T08's FAIL-that-blocks-signing, T11's REFUSED_MAINNET, T27's R4 refusal, T05's BLOCKED proposal: each gets the double-beat Stamp, a plain-language reason, and the dignity of a designed verdict. *"The machine said no, and here's exactly why"* is more impressive to a judge than any success path — it proves the system has judgment.

**B. Show the losers.** T07 shows all 12 cycles including losers; T15 shows the raw-rate winner losing; T22 shows the quote losing to the settled price. Whenever a module computes a winner, the honest comparison — the thing that lost and why — is part of the showpiece. Judges trust a system that shows its work more than one that only shows trophies.

**C. The keeper keeps score of itself.** T08's predicted-vs-actual drift ledger is a pattern, not a one-off. Anywhere the module predicts (T15's net math, T22's tiers, T09's signal rule), the result act should include the self-score: *what we said vs what happened*. Accountability is a visual.

**D. Name the thing it can't see.** T14 says "native PHRS transfers emit no events — this scan only covers ERC20." T23's heuristic is printed, disclosed, never authoritative. Every module states its blind spot in one honest line near the result. This is a feature: it proves we know the difference between measured and claimed.

**E. The chain is the receipt, not the story.** Explorer links are always present (plain labels, copy buttons) but always *below* the verdict. The verdict is the headline; the hash is the footnote that proves it.

---

## 4. The 28 flagships — one by one

Each task: **the wow moment** (the single signature instant), **the thinking layer** (our intellectual signature, made visible), **the flagship structure** (beginning → rising action → climactic reveal), the **verdict** (REBUILD from scratch vs REFINE — decisive), and the **5-second test** (the sentence a stranger must get).

---

### T01 · Read Contract State — "Ask any contract anything"

- **The wow moment — TIME TRAVEL.** The same token's `totalSupply` at a historical block vs now, rendered as a before/after Split: two values, one animated delta arrow between them. The signature instant is the delta ticking into place — *"the chain remembers."*
- **The thinking layer — never assume.** Decimals are read from the contract itself, never hardcoded; per-value failures are LOUD (never silent zeros); every value is tagged with its read method and pinned block. The panel wears its methodology: `balanceOf(holder) @ block 31,484,201 · eth_call`.
- **The flagship structure.** 01: address + "what do you want to know" (name/symbol/decimals/supply presets, optional balanceOf holder, optional time-travel block). 02: the block-pin moment — "pinning block 31,484,201" — then each value arriving with its own tick. 03: the token **name as the display headline** (the human answer), the balance/supply as the hero number, and the time-travel delta card as the climax for those who pinned history.
- **Verdict: REFINE.** The read flow and honesty are solid. Rebuild only the 03 act: promote name to headline, add the before/after Split card, make per-value read tags visible.
- **5-second test:** *"Paste any contract, ask it anything — the chain answers, pinned to one block."*

### T02 · Event Log Monitor — "Watch any contract live"

- **The wow moment — CAUGHT LIVE.** Events that land on-chain *after* you hit Watch get the green pulsing chip and rise to a dedicated "caught live" panel with a count-up. The signature instant is the first live catch: the panel was empty, then it isn't — *"you just watched the chain move."*
- **The thinking layer — the watch session.** The tip block at watch-start is the session's anchor; everything above it is new, everything below is context. The reorg buffer (skip last 2 blocks) is shown as a named engineering decision, and topic0 is computed from the signature live — never hardcoded. The feed's split (live vs historical) IS the thinking.
- **The flagship structure.** 01: contract + event presets (the LogEmitter presets have real events waiting). 02: **the sonar sweep** — replace the generic loader with a horizontal block-range bar that fills chunk by chunk (each chunk is one real `eth_getLogs` call; the bar labels name the real block ranges). 03: the caught-live panel (if any) as the climax, then ResultCard, StatStrip, the full feed.
- **Verdict: REFINE — but rebuild the 02 act.** The sonar-scan bar is the one structural addition; everything else (caught-live panel, decode, feed) is already flagship-grade.
- **5-second test:** *"Point it at any contract and watch events land live — green means it happened after you started watching."*

### T03 · Docs MCP Onboarding — "From question to command in 30 seconds"

- **The wow moment — THE COMMAND ASSEMBLES ITSELF.** The generated `cast`/`forge` command appears as a premium terminal artifact, each flag fading in with its plain-language explanation beside it (stagger ≤ 0.5s, mapped to the "composed" state). The signature instant is the full command standing complete with every flag accounted for — *"this is exactly what to type, and why."*
- **The thinking layer — the three-stage pipeline made visible.** Validate → compose → explain: each stage is named in the 02 act, and the explanation panel cites the real Docs-MCP query log the command shape came from. Nothing executes in the browser; the honesty boundary (you run it in YOUR terminal) is stated as a feature, not a limitation.
- **The flagship structure.** 01: "what do you want to do" (read / send / deploy / watch) as intent cards. 02: the pipeline — three named stages, each a real step. 03: the command as the artifact (copy button, per-flag explanation list), the climax being the complete, explained, copy-ready command.
- **Verdict: REFINE.** Rebuild the 03 act around the terminal artifact + Assembly transition; the pipeline logic is untouched.
- **5-second test:** *"Tell it what you want to do — it builds the exact terminal command, every flag explained."*

### T04 · Doc-Search CLI — "Search the docs, get the command"

- **The wow moment — THE BEAUTIFUL REFUSAL.** When nothing matches, the panel doesn't show an empty state — it issues a designed UNVERIFIED verdict (double-beat Stamp, plain reason, the exit-2 mirror of the CLI). The signature instant is realizing the machine *refuses to guess* — *"it knows what it doesn't know, and says so."*
- **The thinking layer — citations as the product.** Every answer is a verbatim excerpt with doc-page URL and retrieval date. The match path shows the scoring (why THIS answer won); the miss path mirrors the CLI's UNVERIFIED behavior exactly.
- **The flagship structure.** 01: the question input + battery chips (the 9 real evidence queries) + refusal demos. 02: honest one-line status while the local index scores. 03: the match as a citation card (excerpt, source, date, the exact `./pharos-docs` command) — or the refusal verdict.
- **Verdict: REFINE.** Elevate the refusal treatment per the Beautiful Refusal doctrine; the match card needs the citation typography to feel like a sourced document, not a chat bubble.
- **5-second test:** *"Ask anything about the docs — you get the verbatim answer with its source, or an honest 'I don't know'."*

### T05 · Threshold Guardian — "The guardian you can trigger"

- **The wow moment — THE BLOCK.** The visitor deliberately proposes a breaching transfer and watches the red BLOCK stamp land — the denial is the product. The signature instant is the stamp's double beat: *BLOCKED*, then the reason, then the silence of nothing being broadcast.
- **The thinking layer — the trace.** Every condition shows the exact numbers compared — live value vs configured threshold — with PASS/BLOCK per gate. The honest negative is one click away, and the policy engine is evaluated client-side against live Atlantic reads.
- **The flagship structure.** 01: policy values + the proposal (recipient, amount). 02: each gate evaluating live, rows ticking in as reads resolve. 03: the verdict Stamp as the climax — ALLOW continues to the dust self-transfer (visitor signs, own wallet); BLOCK ends the story with the reason, beautifully.
- **Verdict: REFINE.** Rebuild the 03 act around the Stamp; differentiate from T11 (see below): T05 is the guardian you *trigger* — the drama is the firing, the dust transfer that only happens when every gate passes.
- **5-second test:** *"Set the rules, try to break them — watch the guardian block you, with the exact numbers."*

### T06 · Saga Executor — "The saga that really failed"

- **The wow moment — COMPENSATION RUNS IN REVERSE.** The forced-failure run rendered as a step timeline: approve → lock → **execute(0x0) detonates** → then refund → revoke unwind *backwards*, the timeline visually reversing direction. The signature instant is the reversal — *"this is what a saga is: failure with a way back."*
- **The thinking layer — failure forensics.** Revert reason, finality depth, compensation latency — pure reads, presented as a forensics panel. Three real runs for contrast: forced failure, full success, crash-recovery (killed at exit 137, resumed to SUCCEEDED). Every hash is a real mined Atlantic tx.
- **The flagship structure.** 01: pick one of the three real saga runs. 02: replay — one step per real `eth_getTransactionReceipt` read, the timeline drawing forward. 03: the timeline showpiece — the failure run's reversal as the climax — plus the forensics panel and the contrast runs.
- **Verdict: REFINE.** The one structural addition is the reverse-direction compensation visual; everything else (timeline, forensics, contrast) is already the right shape.
- **5-second test:** *"Watch a real on-chain saga fail — and watch it unwind itself, step by step, backwards."*

### T07 · Arbitrage Scanner — "The scanner that shows its losers"

- **The wow moment — THE WHOLE MARKET.** All twelve directed cycles ranked in two leaderboards (WPHRS-start, TKB-start), losers included, each with its full cost decomposition. The signature instant is the Settle: twelve rows sorting into place, the winner crowned, the losers still visible with their honest SKIP reasons — *"we show you the trades we didn't take, too."*
- **The thinking layer — cost decomposition + receipts.** Per-leg fees on notionals, slippage, gas, the slippage guard band; every scan appended to a session evidence log exportable as JSONL (mirroring the CLI's `scans.jsonl`). Net math, not gross theater.
- **The flagship structure.** 01: threshold, notional, slippage guard. 02: the block-pinned sweep — pin one block, read all three `getReserves()` at that block, price twelve cycles. 03: the two leaderboards settling (climax), the winner's cost breakdown, the session evidence log.
- **Verdict: REFINE.** Elevate the leaderboard into the Settle choreography; make SKIP verdicts beautiful (machine-readable reason, designed, not greyed-out).
- **5-second test:** *"Twelve arbitrage paths priced live from one pinned block — winner, losers, and the receipts."*

### T08 · Dry-Run Executor — "See the outcome before your wallet opens"

- **The wow moment — THE EXECUTOR KEEPS SCORE OF ITSELF.** The predicted-vs-actual self-score rendered as a vivid vs-layout: what the dry-run predicted, what actually happened, the drift. The signature instant is the drift ledger — *"this machine grades its own homework."*
- **The thinking layer — the gate law.** A FAILing dry-run BLOCKS the sign path with the reason stated on the button — never a dead button, never auto-broadcast. The five real sequential calls (eth_call → estimateGas → gas price → block → balance) are each named. Review-before-sign is the religion.
- **The flagship structure.** 01: assemble to/value/data (presets). 02: the five named reads, the heartbeat. 03: the PASS/FAIL verdict Stamp (climax) → the self-score vs-layout → the drift ledger → the sign path (only if PASS), with the visitor signing in their own wallet.
- **Verdict: REFINE.** The self-score panel is the differentiator — make it a living ledger that accumulates across runs in the session, not a one-shot card.
- **5-second test:** *"Simulate any transaction first — if the simulation fails, the sign button refuses with the reason."*

### T09 · Trend Watcher (Swell Line) — "A single spike provably cannot trigger it"

- **The wow moment — THE STREAK.** The trailing above-band streak rendered as a live-counting streak meter: each sampled block either extends or resets it, and FIRE needs 3 consecutive confirmations. The signature instant is watching a lone spike arrive, the streak reset to zero, and the verdict stay silent — *"that's the rule working."*
- **The thinking layer — the rule made visible.** Per-block `baseFeePerGas` sampled one block at a time (the run progress counts real observations), fastMA(5)/slowMA(15), the 0.5% confirmation band drawn on the chart. The panel shows exactly WHY the signal did or did not fire for the window it sampled.
- **The flagship structure.** 01: window config. 02: sampling — the chart drawing point by point, each point a real block read, the band and streak updating live. 03: the chart as the hero (the biggest thing on the page), the verdict (FIRE / no-fire with the reason), the streak anatomy.
- **Verdict: REFINE — rebuild the 03 act around the chart as hero.** The chart needs draw-on choreography and the band/streak must be visually unmistakable. The math is already exact; the presentation must make the rule *legible*.
- **5-second test:** *"Watch the chain's gas price draw itself block by block — and see exactly why the alarm did or didn't fire."*

### T10 · Batch Executor ("Flotilla") — "The fleet"

- **The wow moment — THE CROSSOVER.** The cost curve: individual-send cost vs batch cost plotted against recipient count, the two lines crossing at the measured breakeven n=3. The signature instant is the crossover point labeled — *"below 3, send individually; above 3, launch the flotilla."*
- **The thinking layer — the measured model.** ≈7,500 fixed + ≈17,700 gas/recipient, fitted from 3 live runs (n=8/10/11) — the console shows the model, not just the number. Mode boundaries (≤10 simple · 11–200 single-batch · >200 multi-batch) as a visible decision tree the visitor's batch walks through.
- **The flagship structure.** 01: add recipient rows (address + amount), live validation, the fleet assembling. 02: the builder validates and walks the decision tree — the mode lighting up as the row count crosses boundaries. 03: the crossover chart (climax for the curious), the batch document, the exact forge/cast commands, estimated gas.
- **Verdict: REFINE.** The one structural addition is the crossover chart; the builder, validation, and command generation are already right.
- **5-second test:** *"Build a batch of payments — see the exact moment batching beats individual sends."*

### T11 · Policy Gatekeeper — "Every block, explained"

- **The wow moment — READING THE LAW.** The seven gate conditions rendered as a named trace where each gate cites the policy line it enforces, evaluated on live values. The signature instant is the trace completing: seven PASS/BLOCK rows, each with the exact comparison — *"this is what a policy engine is thinking."*
- **The thinking layer — the denial is the product.** ALLOW continues to propose → mandatory review → visitor signs. DENY and REFUSED_MAINNET are final — nothing proposed, nothing broadcast — and get the Beautiful Refusal treatment. The verdict JSON is copyable.
- **The flagship structure.** 01: the proposed action (recipient/value), policy presets, the mainnet-refusal preview toggle, wallet connect. 02: the live reads (chain id, gas price, balance). 03: the verdict Stamp (climax) → the seven-row trace → the review step (if ALLOW).
- **Verdict: REFINE — and differentiate from T05.** T05 is the guardian you *trigger* (drama of firing); T11 is the *explainer* (pedagogy of the trace). T11's flagship move is the policy-line citations — the trace reads like annotated law.
- **5-second test:** *"Propose any transfer — watch seven policy gates judge it, each citing its rule."*

### T12 · Skill + Chain MCP Flow — "See the whole chain before you run it"

- **The wow moment — THE PIPELINE LIGHTS UP.** The full skill→chain flow drawn as a real pipeline diagram: phases as segments, commands as nodes. As the six live reads resolve, each phase lights up with its real value and each of the six named rules evaluates visibly. The signature instant is the whole chain lit — *"you've seen the entire machine before running a single command."*
- **The thinking layer — byte-identical parity.** The wei conversion matches `flow.py`'s Decimal math to the 1-wei edge (classifier parity tested); the verdict-rule math is probeable live. Every command, rule, value, and tx hash is from the task's real contrast runs.
- **The flagship structure.** 01: pick the flow / phase to inspect. 02: inspection IS the run — six real chain reads, phases lighting in order. 03: the lit pipeline (climax), the six rule evaluations, the verdict math, the contrast-run evidence.
- **Verdict: REFINE.** The structural addition is the pipeline diagram with light-up phases; the logic (parity-tested, do-not-touch) stays byte-identical.
- **5-second test:** *"The entire agent pipeline, inspectable phase by phase — every value read live, every rule shown."*

### T13 · Docs MCP + Chain MCP Agent — "Explain then prove" ⚖️

- **The wow moment — THE COURTROOM.** Two columns face each other: **the docs** (claim, labeled DOC-GROUNDED/INFERENCE/UNVERIFIED, verbatim excerpt, doc URL, retrieval date) vs **the live chain** (the function executed now, decoded, interpreted). In the middle: the verdict Stamp — AGREES or CONTRADICTS. The signature instant is the mismatch landing: docs say "Wrapped PHRS", the chain answers "Wrapped Pharos" — the CONTRADICTS stamp falls between them.
- **The thinking layer — claim labels as epistemology.** Every docs claim carries its evidence grade; when the docs don't cover the function, the panel says UNVERIFIED and executes NOTHING (fail-closed). The verdict is the hero — so the hero gets the default: the prefilled `name()` lands the visitor on the real mismatch on the very first run.
- **The flagship structure.** 01: contract address + function signature. 02: the docs lookup and the live execution as two named tracks. 03: the courtroom (climax) — docs column, chain column, verdict in the middle — then the evidence trail below.
- **Verdict: REBUILD FROM SCRATCH.** The current panel is a comparison; the flagship is a trial. The courtroom layout, the verdict-in-the-middle, the fail-closed UNVERIFIED treatment — this needs a new structure, not a polish pass.
- **5-second test:** *"The docs say one thing, the chain says another — watch the verdict fall between them."*

### T14 · Portfolio Assistant — "The only honest total on a testnet"

- **The wow moment — THE TICKER.** The PHRS balance ticking up with a spring the moment the real reads land — the hero number, the anchor of the portfolio. The signature instant is the tick resolving: *"that's your balance, read live, pinned to one block."*
- **The thinking layer — honesty as design.** No fiat anywhere (testnet assets have no market value — stated, not implied); "unknown, never zero" for failed reads; "what the keeper can't see, it says" (native transfers emit no events). The gas-headroom tab answers the real question: *how many transfers can you afford?*
- **The flagship structure.** 01: connect wallet or paste any address. 02: the three named read phases (balances → activity → gas). 03: the ticker hero (climax) → StatStrip → the three tabs (Balances / Activity / **the survival meter**: gas price × balance = transfers covered) → the keeper's reference as a labeled historical record.
- **Verdict: REFINE.** Elevate the gas tab into the "survival meter" framing; the ticker, tabs, and honesty labels are already flagship-grade.
- **5-second test:** *"Any address, full portfolio, live — and it tells you exactly what it can't see."*

### T15 · Yield Optimizer — "Net math, not APY theater" 🏟️

- **The wow moment — THE UPSET.** Kraken's 2.5× raw rate LOSES. The head-to-head arena: two vaults (Kelp vs Kraken), three holding horizons, the net(H) math run live per round — and the raw-rate favorite falls to the runway cap at long horizons and to friction at short ones. The signature instant is the upset being named: *"the 2.5× vault loses — here's the math."*
- **The thinking layer — net(H), shown.** net(H) = runway-capped gross − entry fee − exit fee(H) − gas, against the honest 0% stay-put baseline, for the visitor's stake size, computed from live chain state. The honesty label is on the page: testnet mechanics demonstration, rewards are valueless testnet PHRS.
- **The flagship structure.** 01: stake size + horizon. 02: the live reads of both vaults + gas price. 03: **the arena** (climax) — two columns, three horizon rounds, net math visible per round, a winner crowned per horizon — then the full net(H) breakdown and the stay-put baseline.
- **Verdict: REBUILD THE 03 ACT FROM SCRATCH.** The current result is a verdict; the flagship is a tournament. The arena layout (rounds, per-round math, crowning) is a new structure.
- **5-second test:** *"Two vaults enter, net math decides — watch the high-APY favorite lose to fees and caps."*

### T16 · Liquidation Watchdog — "Your position, live risk" 📉

- **The wow moment — THE NEEDLE SWINGS.** A precision SVG risk gauge: the needle swings with the real health factor and lands — SAFE, WATCH, or CRITICAL — with a 0.6s ease-out that maps to the value resolving. The signature instant is the swing to CRITICAL: *"that's your position, right now."*
- **The thinking layer — "restore to 1.5," made visible.** The exact oracle price that triggers liquidation, the price cushion, and the concrete escape plan: repay X or top up Y to restore HF ≥ 1.5 — the same math the Telegram watcher fires with, shown as reasoning, not just numbers.
- **The flagship structure.** 01: paste any address. 02: the one `eth_call` to `getUserAccountData` — a single honest heartbeat. 03: the gauge (climax) → the verdict sentence → **the escape plan** ("two ways out": repay X / top-up Y, each with the resulting HF) → the oracle-price tripwire and cushion.
- **Verdict: REBUILD FROM SCRATCH.** The gauge must be a real state-mapped SVG needle (not a styled bar), and the escape plan is the climax the current module lacks. New structure: gauge → verdict → two-ways-out.
- **5-second test:** *"One read tells you if a position is safe — and exactly how to save it if it isn't."*

### T17 · Natural-Language Payment Agent — "Type it, review it, sign it"

- **The wow moment — THE PARSER'S MIND.** Free text turning into a structured plan live: each matched phrase highlights in the input as its field ticks into the plan document (Assembly transition). Ambiguous input is REFUSED with its rule tag — never guessed. The signature instant is the plan document standing complete, each field traceable to the words that made it — *"it understood you, and it can prove it."*
- **The thinking layer — the rule-tag vocabulary.** Every outcome carries a machine-checkable R-… tag, shown as chips; the plan hash is byte-identical to the CLI's plan_id, so parse → review → sign share one identity. The deterministic, no-LLM parser (the audited grammar, 34 unit tests) is the point — show the grammar, don't hide it.
- **The flagship structure.** 01: type the instruction (with examples that show the grammar's shape). 02: the three parse stages, the input highlighting phrase-by-phrase, the plan assembling field-by-field. 03: the plan as a precision document (climax) → the rule tags → mandatory review → visitor signs → receipt.
- **Verdict: REBUILD THE 02 ACT FROM SCRATCH.** The phrase-highlighting + field-by-field assembly is the signature moment the current module doesn't have. The plan document and review flow refine in place.
- **5-second test:** *"Type 'send 5 PHRS to…' — watch the machine turn your words into a signed plan, or refuse."*

### T18 · Recurring Payment Agent ("TIDE") — "Design a recurring payment"

- **The wow moment — THE TIDE CHART.** The schedule rendered as a horizontal timeline: each of the N payments a tick on the timeline with its date and amount, the total committed as the hero. The signature instant is the timeline completing — *"that's your next six months, designed."*
- **The thinking layer — honest architecture + recovery.** SkillEngine has no native cron (confirmed-absent primitive) — ticks come from the operator's system cron, stated plainly. The TideTimeout/broadcast-unknown recovery story is a timeline, not a footnote. The idempotency key is prominent on the document.
- **The flagship structure.** 01: recipient, amount, interval, count, start. 02: the three composition steps, the schedule composing. 03: the tide chart (climax) → the schedule as a premium document → the exact `tide.py` schedule.json + CLI commands → the recovery story.
- **Verdict: REFINE.** The structural addition is the tide-chart timeline; the builder, validation, and command generation are already right. Nothing executes here — the boundary stays.
- **5-second test:** *"Design N payments across time — see them laid out like a tide chart, copy the config."*

### T19 · Invoice-to-Payment Agent — "Invoice to money in one review"

- **The wow moment — THE BINDING.** The mandatory review step reframed: the invoice reference can't go on-chain (native PHRS has no memo bytes), so the review *binds* it off-chain — payee, amount, reference, wallet-balance coverage — and the binding is shown explicitly as the moment of commitment. The signature instant is the review sealing: *"the reference lives here now, honestly labeled."*
- **The thinking layer — the no-guess extractor.** The client-side parser (same rules as the agent's parsers.py) pulls payee/amount/token/reference from JSON, CSV, KEY:value, or free text — with mismatch flags, never silent guesses. The invoice as a premium document: total as hero number, line items as elegant rows.
- **The flagship structure.** 01: paste invoice text. 02: parsing, then the real wallet-balance coverage read. 03: the invoice document (climax) → **the binding** (review) → visitor signs → receipt + explorer link.
- **Verdict: REFINE.** The document treatment exists; elevate the review into "the binding" moment and make the no-memo-bytes honesty rule a designed feature of the review, not a footnote.
- **5-second test:** *"Paste any invoice — it becomes a payment document, reviewed, bound, and signed by you."*

### T20 · On-Chain Alert Bot — "Verify the ledger live"

- **The wow moment — THE AUDIT ROOM.** The production alert ledger (35 alerts, 0 duplicate keys) replayed against the live chain in the visitor's browser: each alert re-checked (receipt status + block + recipient), each arriving with its own soft PASS beat, the 210 PASS audit badge accumulating. The signature instant is the badge completing — *"35 alerts, re-verified live, zero duplicates."*
- **The thinking layer — ledger semantics.** Write-ahead SENDING marker before Telegram, SENT after; dedupe key `<condition>:<txhash>`; the audit script's 6-checks-per-alert replay. The verbatim Telegram alert from the threshold trip, shown as the artifact it is.
- **The flagship structure.** 01: the rule builder (generates the exact config.yaml — copy-paste, console never sends). 02: the replay — arm the watcher (eth_blockNumber), then one receipt re-check per alert, the audit room filling. 03: the ledger showpiece (climax) → the audit badge → the alert feed, every alert carrying its receipt.
- **Verdict: REFINE.** The structural addition is the audit-room accumulation choreography; the ledger, badge, and config builder are already right. Tier C honesty stays: the console never sends Telegram.
- **5-second test:** *"Thirty-five real alerts, re-verified against the live chain in your browser."*

### T21 · Whale-Watching Agent — "Whale radar" 🐋

- **The wow moment — THE WHALE MATERIALIZES.** The largest whale ticking up from zero with a spring the moment the real result arrives — a giant animated number that IS the result. (Already the ceiling. Keep it; it's the reference implementation of The Tick.)
- **The thinking layer — the honest radar.** Native PHRS emits no logs, so the agent reads blocks directly — batched, 50 blocks per round trip (~12s vs ~3min sequential; the engineering is named). Counterparties get honest on-chain labels or nothing — identities are never invented. No USD: there is no price feed on Atlantic, stated plainly.
- **The flagship structure.** 01: threshold + window, the watchlist with honest labels. 02: the batched sweep — one real step per batch, block ranges named. 03: the whale materializing (climax) → StatStrip → the largest-first ranked list settling in → scan history.
- **Verdict: REFINE ONLY.** This is the flagship ceiling — polish the ranked list's Settle, keep everything else. Other rebuilders should study this module's 03 act.
- **5-second test:** *"Set a threshold, scan the chain — the biggest whale appears as a giant ticking number."*

### T22 · Gas Fee Optimizer — "What the chain actually charged" ⚖️

- **The wow moment — QUOTED VS SETTLED.** Two numbers face each other in the Split: what every gas tool *quotes* (eth_gasPrice) vs what the chain *actually charged* (average effectiveGasPrice from live-settled receipts). The signature instant is the settled number landing lower — or higher — than the quote: *"stop pricing against the quote."*
- **The thinking layer — measured tiers.** slow/standard/fast from LIVE samples (p25/p50/p75 of observed effective prices, mirroring the agent's tier-table methodology) — not a static table. The recommendation is priced against the settled number. The three real mined receipts are linked as evidence.
- **The flagship structure.** 01: transaction type (transfer / contract call) + urgency. 02: the live reads — gas price, priority fee, block utilization, settled receipts. 03: **the showdown** (climax) — quoted vs settled, the Split resolving — then the tier recommendation with the PHRS cost per tier against a real gas budget.
- **Verdict: REBUILD THE 03 ACT FROM SCRATCH.** The current result is a recommendation; the flagship is a confrontation. The showdown layout is a new structure.
- **5-second test:** *"Every tool quotes the gas price — this one shows what the chain actually charged."*

### T23 · Wallet Risk Checker — "X-ray any wallet"

- **The wow moment — THE SCAN.** Eight checks arriving one by one like an X-ray sweep — account age (nonce binary search), tx count, freshly-funded pattern, balance, EOA vs contract, activity burst, interaction diversity, approval hygiene — each landing with its PASS/FLAG/UNKNOWN/N/A chip, then the composite gauge swinging to LOW/MED/HIGH last. The signature instant is the gauge swing after the sweep: *"eight checks, one verdict."*
- **The thinking layer — the disclosed heuristic.** The composite is a printed formula, never an authoritative score. Every flag ships a plain-language explanation: what it means, what to do. The finale: the "who can drain this wallet" list — exact token→spender approval grants, named.
- **The flagship structure.** 01: paste any address. 02: **the sweep** — eight named checks, each a real read, arriving with its chip (the heartbeat with substance). 03: the gauge Swing (climax) → the verdict sentence → the eight check rows → the drain-list finale.
- **Verdict: REBUILD FROM SCRATCH.** The current module is a report; the flagship is a scan. The sweep choreography, the gauge, and the drain-list finale need a new structure.
- **5-second test:** *"Paste any wallet — watch eight security checks sweep it, ending in one honest verdict."*

### T24 · Audit-Log Agent — "Try to break it" 🔗

- **The wow moment — THE ATTACK FAILS.** The red-team lab: four attacks (flip a character, flip+forge the hash, delete an entry, swap two entries) run live against copies of the real 22-entry chain — and the verifier names the exact broken entry every time. The signature instant is the "attack foiled" panel: *"you tried to cheat the ledger, and it told you which line."*
- **The thinking layer — attack-vs-defense narrative.** Each attack carries its "why the chain catches it" explanation (the forge attack is the jewel: reforging entry #12's hash breaks entry #13's prevHash — you can't forge one link without breaking the next). The chain-anchor transaction pins the log head on-chain: its calldata IS entry #20's entryHash, verifiable live.
- **The flagship structure.** 01: the real chain prefilled, editable — flip anything, the verdict recomputes in-browser. 02: hashing per entry (real SHA-256 digests) → link verification → the three live anchor checks. 03: the Intact/Broken verdict (climax) → the chain strip → the entry inspector (stored vs recomputed hash) → the red-team lab → "verify our proof."
- **Verdict: REFINE ONLY.** This is the flagship ceiling alongside T21 — the red-team lab is the reference implementation of "thinking made visible." Tighten, don't rebuild.
- **5-second test:** *"A real tamper-evident log — then four attack buttons so you can try to break it yourself."*

### T25 · dApp Support Agent — "Every failed tx, explained"

- **The wow moment — THE AUTOPSY.** Paste any failed tx hash; the diagnosis engine replays it at block−1 and the cause lands as the verdict headline: **"Out of gas."** / **"Reverted: …"** / **"No code at destination."** The signature instant is the cause named in 48px Playfair — *"your transaction died, and here's the coroner's report."*
- **The thinking layer — the replay methodology.** eth_call replay at block−1; revert reasons decoded (Error(string), Panic(uint256), custom selectors); reverted deployments' init code replayed; allowance/balance shortfalls read at block−1. Unknown cases reported as unknown with the raw receipt — never invented. Three real preset hashes from the task's evidence.
- **The flagship structure.** 01: paste any Atlantic tx hash (presets: the three real evidence txs). 02: the forensic reads — transaction, receipt, replay — each named. 03: **the autopsy report** (climax): cause as headline → the evidence trail (what the replay showed, in order) → "what to change next time" → the raw receipt for the skeptical.
- **Verdict: REBUILD FROM SCRATCH.** The current module is a diagnosis panel; the flagship is an autopsy report. Cause-as-headline, evidence trail, fix guidance — new structure.
- **5-second test:** *"Paste any failed transaction — get the cause of death, the evidence, and the fix."*

### T26 · Weekly Digest Agent — "Your week on-chain, printed"

- **The wow moment — THE FRONT PAGE.** The digest rendered as an editorial document: a newspaper front page for one address's week — six sections (the real T26_SECTIONS), deterministic TOP-3 ranking, whale threshold 0.05 PHRS, the week's numbers as the masthead stats. The signature instant is the front page standing complete — *"this is your chain week, typeset."*
- **The thinking layer — deterministic editorial.** The ranking rules are stated (TOP-3, whale threshold); token metadata via real eth_call. Tier C honesty kept and stated: the console never sends Telegram, never schedules — delivery stays copy-paste CLI config below the result. The section picker is real: checked sections become the CLI's T26_SECTIONS.
- **The flagship structure.** 01: watched address, the six section toggles, scan window. 02: the end-to-end scan — chain tip, indexer txs, chunked getLogs with live "chunk N of M." 03: the front page (climax) → the section cards → highlights feed → scan history → the CLI config.
- **Verdict: REFINE.** The editorial treatment needs typography love — a real front-page hierarchy (masthead, sections, the editor's note saying why these sections) — but the structure is right.
- **5-second test:** *"Any address, any week — a printed digest of everything it did on-chain."*

### T27 · Doc-Grounded Builder Agent — "The machine said no, beautifully"

- **The wow moment — THE BEAUTIFUL REFUSAL.** The R4 refusal gets the premium treatment: a designed, signed refusal document — what was asked, which coverage gate failed, which steps were UNVERIFIED, what would be needed to proceed. The signature instant is realizing the refusal is the feature: *"it won't build what it can't verify, and it's proud of it."*
- **The thinking layer — the honesty architecture.** classify() ported 1:1 (node-verified 8/8); the coverage gate computed in code (PASS iff zero UNVERIFIED steps); step 3 always real async work — 4–5 sequential eth_calls for live verification, or the real gap scan over the 97-passage corpus for refused goals.
- **The flagship structure.** 01: the build request. 02: the three-stage pipeline — classify → coverage gate → live verification — each named. 03: the GATE VERDICT as hero (climax): PASS with the verified plan, or the refusal document, designed with full dignity.
- **Verdict: REFINE.** The verdict hero exists; the refusal document needs the full Beautiful Refusal treatment — typography, the gate anatomy, the path to unblocking.
- **5-second test:** *"Ask it to build something — it verifies every step against docs and chain, or refuses beautifully."*

### T28 · Multi-Protocol Aggregator — "One view, every venue"

- **The wow moment — THE BOARD SETTLES.** Three venues (two SimpleVaults + one SimpleLending) read at one pinned block, normalized (TVL/APY/share price/utilization/liquidity depth) into one ranked board that settles into place — the winner crowned for the visitor's deposit or borrow intent. The signature instant is the settle: *"three protocols, one ranking, no tables."*
- **The thinking layer — the eth_getCode honesty gate.** A venue whose read fails or whose address holds no bytecode is marked UNREACHABLE — never zero-filled. (An eth_call against a dead address returns 0x and the venue would look alive at 0.00% APY.) The gate is named on the page; UNREACHABLE is a designed state, not an error.
- **The flagship structure.** 01: intent (deposit/borrow) + amount. 02: the pinned-block reads across all three venues. 03: the ranked board settling (climax) → the winner's crowning (why it won, for this intent) → per-venue normalized rows → the run command (CLI, execution stays there).
- **Verdict: REFINE.** The board needs the Settle choreography and the crowning moment; UNREACHABLE needs its designed state. The normalization and intent logic are already right.
- **5-second test:** *"Three lending venues, one pinned block — the board ranks them and crowns your winner."*

---

## 5. The five full rebuilds (decisive)

All 28 get flagship treatment; five need new structures, not polish. Rebuilders on these five start from a blank 03 act (01/02 logic and all read/decode/verdict code carry over untouched — only the presentation structure is new):

| # | Task | Why it must be rebuilt | The new structure |
|---|---|---|---|
| 1 | **T13 · Docs-Chain Agent** | A comparison panel can't carry a verdict. The mismatch deserves a trial. | **The courtroom:** docs column vs chain column, verdict Stamp in the middle. Fail-closed UNVERIFIED as a designed state. |
| 2 | **T16 · Liquidation Watchdog** | A gauge that doesn't swing is a label. The escape plan is the product and it's missing. | **Gauge → verdict → two-ways-out:** state-mapped SVG needle, then repay-X / top-up-Y to restore HF ≥ 1.5. |
| 3 | **T22 · Gas Fee Optimizer** | A recommendation without its adversary is forgettable. The quoted-vs-settled insight needs staging. | **The showdown:** quoted vs settled in the Split, then tiers priced against the settled number. |
| 4 | **T23 · Wallet Risk Checker** | A report doesn't feel like an X-ray. The eight checks must arrive as a sweep, the verdict as a swing. | **The scan:** sweep choreography → gauge Swing → check rows → the drain-list finale. |
| 5 | **T25 · dApp Support Agent** | A diagnosis panel buries the cause. The cause is the headline. | **The autopsy report:** cause in 48px Playfair → evidence trail → "what to change next time" → raw receipt. |

Everything else is **REFINE**: keep the read/decode/verdict logic byte-identical, rebuild or elevate the specified act (02 sonar for T02, 03 arena for T15, 03 showdown-adjacent for T07/T28, 02 assembly for T17, 03 binding for T19, audit-room for T20, tide chart for T18, crossover for T10, courtroom-adjacent trace for T11, terminal artifact for T03, refusal typography for T04/T27, front-page typography for T26, pipeline light-up for T12, self-score ledger for T08, chart-as-hero for T09, escape-plan-adjacent polish for T01/T14). T21 and T24 are the ceiling — study them, tighten them, don't rebuild them.

---

## 6. Execution notes for the 28 rebuilders

1. **Read the standard first, this brief second.** The standard is law; this brief is direction. Where they seem to conflict, the standard wins — then tell the coordinator, because the brief is wrong.
2. **Steal the transitions, not the layouts.** The §1.1 vocabulary is shared; no two modules should look alike. T13's courtroom and T22's showdown both use the Split — they must still feel like different products.
3. **The 5-second test is the gate.** Before committing, open the module cold and read the 5-second sentence from §4 for your task. If a stranger wouldn't get it, the structure failed — fix the structure, not the copy.
4. **Do not touch the logic.** Reads, decoders, parsers, math, parity-tested boundaries — byte-identical. The flagship is presentation. (Exception: the five rebuilds' 03 acts, which are new presentation code over unchanged logic.)
5. **Honesty checklist still applies** (standard §10): every button real or hidden with reason, every number from a real call, loader steps map 1:1 to calls, `tsc -p tsconfig.app.json` clean, `npm run build` green, 390px verified.
6. **No founder content, no Pharos-first copy, no new dependencies.** Ever.
7. **Reduced motion is not optional.** Every beat in this brief has an instant fallback. Test it.

---

*Brief ends. The standard is the law; this is the ambition. Make every lamp a flagship.*
