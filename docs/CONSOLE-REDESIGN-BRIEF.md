# CONSOLE REDESIGN BRIEF — Founder Order (2026-10-16 ~08:00 EEST)

## 0. Verdict
The shipped dark blue-on-blue OCTOPUS console is **REJECTED** by the founder: too heavy,
unreadable, unorganized. This is a full retheme + restructure, not a tweak. The previous
OCTOPUS-DESIGN.md dark spec is superseded for page theme (the octopus mark survives as a
small logo accent only).

## 1. New art direction — "Porcelain Console" (light theme)
- Surfaces: white/paper `#FFFFFF`, `#F8FAFF`; light blue tints `#EAF1FF`, `#D9E6FF`.
- Text: ink `#0B1533`, secondary slate `#5A6B8C`.
- Accent blue `#2456E6` used **sparingly** (primary actions, lit states). Gold `#C9A227`
  only for LIT badges/accents. Green `#16A34A` / red `#DC2626` only for PASS/FAIL.
- Deep royal blue `#1414c8` may appear ONLY as a thin page backdrop framing light content
  cards — never as the content surface.
- Typography: serif display for the wordmark at a **restrained size that never clips**
  (fix the current giant LIGHTKEEPER title bleeding off both viewport edges at 1440px);
  Inter for UI; monospace for hashes/data/addresses.
- No blue-on-blue text. Contrast is non-negotiable.

## 2. Organization principles (good patterns only — do NOT copy any reference layout)
- Numbered flow sections per task view: **01 Configuration → 02 Live trace/output → 03 History log**,
  separated by hairline rules, small-caps labels.
- Dense, honest data: monospace values, status chips (LIT/DIM, PASS/FAIL, COMPLETE).
- Action row: one primary filled button + secondary outlines. Standing honest-UI rule:
  every button performs a real read/action or does not exist (with a plain-language reason).
- Status strip: connection state · network (Pharos Atlantic) · wallet address when connected ·
  evidence timestamp.

## 3. Required sections (in order)
1. **Header** — small octopus mark + wordmark, nav, **Connect Wallet button (Pharos Atlantic
   testnet)** showing address + PHRS balance when connected. (Explicitly requested; was missing.)
2. **Hero (compact)** — concept line "One lighthouse. Twenty-eight lamps." + live stats
   (lamps lit /28, points secured /3,200). No full-viewport color field.
3. **The Stack** (explicitly requested — "where are the skills and libraries and their usage"):
   - Cards for the 10 `@lightkeeper/*` shared libraries (what each does).
   - 28-skill matrix grouped by toolkit: Chain MCP / SkillEngine / Developer Docs MCP / Composition,
     each task chip linking to its flow view.
4. **Lamps grid** — 28 cards, honest LIT/DIM from `evidence.json` (DIM = in progress, never mocked).
5. **Per-task flow view** (the core ask — replaces the current evidence-dump view):
   - 01 Configuration — the task's real inputs/policy (e.g. policy.yaml values).
   - 02 Execution trace — real `evidence.json` data + live Atlantic reads where the task supports it
     (tx hashes link to the explorer).
   - 03 History — run logs.
   - **Fix:** Builder's summary currently renders raw HTML tags as text — render markdown properly.
   - Arena submission panel stays: SUBMISSION.md copy-paste pack, "founder submits himself" note.
6. **Keeper's log / activity feed.**
7. **Footer** — honest generation note (keep the existing wording).

## 4. Proof architecture (founder's question, answered)
Tasks are proven by **real Atlantic testnet transactions** and filmed from their **native surfaces**
per each task's `VIDEO-GUIDE.md` (terminal / CLI / Telegram / explorer) — NOT from a web UI.
The console is the showcase and organizer. Per-task flow views **visualize real evidence**;
they never fake execution. Nothing demo/mock. (This is why there is no per-task "dapp" to deploy.)

## 5. Deploy (founder-authorized 2026-10-16)
- Founder granted deploy permission via tokens in `~/workspace/lightkeeper/.env` (mode 600;
  **never** in chat, commits, or bundles).
- **Vercel**: deploy the console frontend with `VERCEL_TOKEN` — but ONLY after redesign + QA pass.
  Do NOT deploy the pre-redesign console.
- **Render**: only if a backend appears. There is currently no backend (console is a static Vite
  app; tasks are scripts/CLIs). Do not invent one.

## 6. Acceptance gates
- [ ] Light theme throughout; zero blue-on-blue text
- [ ] Wallet connect works on Pharos Atlantic (address + PHRS balance shown)
- [ ] The Stack section present (10 libs + 28-skill toolkit matrix)
- [ ] Every shipped task has a 01→02→03 flow view with real data; DIM tasks honest
- [ ] Builder's summary renders markdown (no raw HTML tags)
- [ ] Hero title never clips at 1440px
- [ ] No mock data anywhere; `tsc` clean; `vite build` clean; QA pass

## 7. What to preserve
- `scripts/gen-lamps.mjs` wiring (`tasks/*/evidence.json` + `task.yaml` → `src/data/lamps.json`);
  DIM-without-evidence honesty rule.
- Reuse existing component logic where possible (ActivityFeed, LampCard data shapes, TaskDetail evidence plumbing).
- Footer's honest generation note.
