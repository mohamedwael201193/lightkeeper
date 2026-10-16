# LIGHTKEEPER Presentation Standard — SHOWTIME Op (2026-10-16)

**Law for all 28 task agents.** Every try module is rebuilt on this standard.
Shared components: `apps/console/src/components/ui/` — import from `../ui`
(or `../../ui` from deeper paths). No new dependencies: framer-motion +
lucide-react are already installed.

Founder complaint this fixes: results rendered as small text blended into the
background, no progress feedback, no animation, cluttered random pages, no
wow. The fix is not more motion — it is **hierarchy, honesty, and motion
that means something.**

---

## 1. The journey: 01 Configure → 02 Run → 03 Result

Every try module is a three-act story, in this order, on one scrolling page:

| Act | Job | Components |
|---|---|---|
| **01 Configure** | Inputs, policy values, address pickers. Plain form controls on porcelain. | Native inputs + `btn-primary` / `btn-outline` |
| **02 Run** | Live progress while real work happens. | `ProgressLoader` (Tier A/B) or real step text (Tier C) |
| **03 Result** | THE answer, rendered as the showpiece. | `ResultCard` → `StatStrip` → `FeedList` |

Rules:

- **One act visible at a time in spirit:** 02 appears only while work is in
  flight; 03 replaces it when the real answer arrives. Never show a result
  panel and a spinner at once.
- **03 Result is always the visual climax.** The headline value is the
  largest thing on the page (`font-display`, 40px+). Nothing above it may
  compete for attention.
- History/run-logs belong in a `FeedList` BELOW the result, capped height,
  or in the page's existing history section — never above the headline.

## 2. When to use each component

- **`ResultCard`** — exactly once per module, for the final answer: the
  balance, the verdict, the tx hash, the computed value. `headline` = the one
  thing a judge must remember. `rows` = supporting facts (block, selector,
  raw value). `links` = real explorer URLs only, with plain-language labels.
  `copyValue` on hashes/addresses. `status="pass"|"fail"` when there is a
  real PASS/FAIL verdict.
- **`ProgressLoader`** — any Tier A read with 2+ sequential calls, any Tier B
  propose→sign→broadcast flow. `steps` = one entry per REAL async call; advance
  `current` only when a call actually starts/finishes. For a single call,
  one honest status line beats this component — do not inflate a one-call
  read into fake steps.
- **`StatStrip`** — 2–4 key numbers that summarize the result (counts,
  totals, balances). Numbers tick ONLY when the real value changes. Do not
  use for numbers that never move — render those as plain text rows.
- **`FeedList`** — events from `eth_getLogs`, run logs, alerts. Newest first.
  Each item: one line of meaning (what happened) + one line of data (hash /
  block / time). Empty feeds get a factual line, never a skeleton.
- **`EmptyState`** — an honest zero. Template: *"Quiet window — no events in
  this range. That's an honest answer, not an error."* One CTA that does
  something (widen range, pick another address).
- **`ErrorState`** — failures. Translate the RPC error into a plain-language
  sentence + what to do next + Retry. Raw `eth_call` errors never render.

## 3. Typography scale (enforced by the components)

- **Headline (the answer):** `font-display`, 40px (text-4xl) / 48px (sm:text-5xl),
  tracking-tight, ink `#0B1533`. Must fit two lines at 390px — cut words, not size.
- **Body:** 14px minimum (`text-sm`), ink for running text, slate `#5A6B8C`
  for secondary notes only. Running text in soft grey reads unfinished.
- **Data:** `font-mono` for hashes, addresses, selectors, block numbers.
  Truncate with a `title` tooltip; always offer the copy button on hashes.
- **Labels:** sentence case, 14px, semibold, slate. No tiny tracked caps.
- Two typefaces max: Playfair Display (display) + Inter (UI). Monospace is
  data only, never prose.

## 4. Contrast (non-negotiable, verified pairs)

- ink `#0B1533` on white/porcelain — body, headlines. ✓
- slate `#5A6B8C` on white — secondary notes, 14px+. ✓ (~5.5:1)
- white on accent `#2456E6` — primary buttons. ✓
- accent `#2456E6` on white — links, active states. ✓
- **Never:** gold `#C9A227` as text on light (use `golddeep #8A6F12` for
  LIT-badge text); any text on `royal #1414c8` (royal is hero-stage only);
  blue-on-blue anywhere in the workbench.

## 5. Spacing rhythm

- Section gap: `space-y-6` (24px) minimum between the three acts; 32px+
  between major page sections.
- Inside a card: `p-6` (mobile) / `p-8` (desktop); rows separated by
  `border-t border-hairline`, never hairline dividers floating in space.
- One left edge for text blocks. Generous whitespace is the luxury — do not
  fill it with ornament.

## 6. Animation rules — every motion reflects a REAL state

1. **Entrance:** ResultCard/StatStrip rise 12–16px + fade, once, 0.3s. Feed
   items slide in only when they ARRIVE (`AnimatePresence initial={false}`).
2. **Progress:** the step label, the bar width, and the pulsing dot are the
   ONLY animated elements during a run. No spinner that isn't tied to a call.
3. **Numbers:** tick via spring when the value changes; instant under
   `prefers-reduced-motion`.
4. **Forbidden:** animation on a timer, decorative canvases inside data
   regions, parallax in the workbench, staggered reveals longer than 0.5s
   total. If you can't name the state it reflects, delete the motion.

## 7. Founder-content ban (§0C — restated, absolute)

The public try-module face has **ZERO** founder content:

- No "upload the submission", no SUBMISSION.md copy pack, no arena-portal
  instructions, no "the assistant never submits".
- No internal notes: no decoding notes, no failure-mode tables, no raw
  transcripts, no builder commentary.
- Evidence is presented clean: tx hash → explorer link with a plain label
  ("View on explorer"), status chips (LIT/DIM, PASS/FAIL). Nothing else.

Founder material lives behind `?founder=1` only. When in doubt, it is
founder content — leave it out.

## 8. Identity (§0B — restated)

LIGHTKEEPER-first. The module is about what the skill DOES and its on-chain
proof. "Pharos Atlantic" / "chain 688689" appear as technical context (the
network badge, the read method note) — never as the headline. If a sentence
could appear on Pharos's own website, rewrite it to be about our work.

## 9. Mobile (390px is the gate)

- Core flow completable with thumbs: inputs full-width, primary button
  min-height 44px, sticky primary action at the bottom for Tier B sign flows.
- Headline fits two lines; StatStrip collapses to 2 columns; FeedList scrolls
  internally, never stretches the page.
- Test at 390px before calling a module done.

## 10. Honesty checklist (before you commit)

- [ ] Every button executes a real read/action or is hidden with a
      plain-language reason. No demo mode.
- [ ] Every number on screen came from a real RPC call or a real signature
      flow. No hardcoded "example" values in the UI.
- [ ] ProgressLoader steps each map to one real async call. No timer steps.
- [ ] Empty results say so honestly (EmptyState). Errors explain themselves
      (ErrorState). Nothing renders a fabricated value.
- [ ] `npx tsc -p tsconfig.app.json --noEmit` clean and `npm run build` green.
