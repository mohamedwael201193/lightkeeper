# OCTOPUS — the LIGHTKEEPER art direction

**Status:** FOUNDER-LOCKED 2026-10-16. Every frontend surface of LIGHTKEEPER
follows this design. No deviations without founder approval.

**Reference image:** `~/workspace/user/media_library/image/3b/3b7b6cb0c6165a03dbad8f0b25873dea8f9ea71ad35f970f00d150e5f19ed97a.png`
("OCTOPUS MENTALITY" — study it before building anything visual.)

## The concept

**One lighthouse. Twenty-eight lamps. One octopus to tend them.**

Pharos = the lighthouse of Alexandria rising from the sea. The octopus =
the keeper — porcelain-white, ancient, precise — whose twenty-eight arms
each hold one lamp (one Arena task). Deep Atlantic blue is the water we all
swim in; gold is the lighthouse light. This is not decoration: the console's
information architecture IS the octopus — a central keeper view with 28
tentacle-cards radiating outward, each one a task lamp (lit = shipped with
evidence, dim = in progress).

## Palette (exact)

| Token | Hex | Use |
|---|---|---|
| `--abyss` | `#1414c8` | Page background (deep royal blue, from the reference) |
| `--abyss-deep` | `#0d0d8f` | Gradient depth / footer / lower sections |
| `--gold` | `#d9a821` | Display headlines, key numbers, lit lamps |
| `--gold-soft` | `#e8c766` | Headline highlights, hover states |
| `--porcelain` | `#f4f6ff` | Cards, panels, the octopus body |
| `--porcelain-blue` | `#dfe6ff` | Card borders, subtle dividers |
| `--ink` | `#ffffff` | Microcopy, labels (white on blue) |
| `--ink-dim` | `#b9c2f5` | Secondary text on blue |

Never: pure black backgrounds, neon gradients, cream-and-terracotta,
violet/purple washes.

## Typography

- **Display:** high-contrast DIDONE-style serif, ALL CAPS, gold, huge.
  The console hero reads `LIGHTKEEPER` the way the reference reads
  `OCTOPUS` — spanning the viewport, letterspaced, sitting BEHIND/AROUND
  the hero creature. Section titles (`TWENTY-EIGHT LAMPS`) same treatment
  at smaller scale.
- **Body/microcopy:** clean grotesque sans, white, small, generous
  line-height. Short poetic lines, never paragraphs ("Shape the Future
  Before It Arrives" energy — ours: "One lighthouse. Twenty-eight lamps.").
- **Numbers:** tabular figures for stats; gold for the big ones
  (3,200 points, 28 tasks).

## Signature motifs (use all three)

1. **The porcelain octopus.** Hero creature: white porcelain octopus with
   blue floral patterns and gold-accented suckers (generate transparent PNG
   in this exact style — porcelain white + `--abyss` florals + gold
   accents). It floats center-hero, tentacles reaching toward the task grid.
   Transparent background, soft gold glow beneath it.
2. **Thin diagonal white lines.** 1px white lines at ~30° crossing the hero
   and section dividers — architectural, precise, from the reference.
3. **The Menu pill.** Top-right pill button (outline, white) — the console's
   nav trigger. Top-left: circular mark (lighthouse beam + octopus ring).

## Console layout (apps/console)

```
┌────────────────────────────────────────────────────┐
│ ( )  LIGHTKEEPER                        [≡ Menu]    │  deep blue
│                                                    │
│   L I G H T K E E P E R   (gold serif, huge)       │
│        [porcelain octopus, floating]               │
│   "One lighthouse. Twenty-eight lamps."            │
│                                                    │
│   T W E N T Y - E I G H T   L A M P S              │
│   ┌────┐ ┌────┐ ┌────┐ ┌────┐ ... 28 lamp cards    │
│   │ T01│ │ T02│ │ T03│ │ T04│  porcelain cards,    │
│   │100 │ │100 │ │ 50 │ │ 50 │  gold = lit/shipped  │
│   └────┘ └────┘ └────┘ └────┘  dim = in progress   │
│                                                    │
│   stats strip: 3,200 pts · 28 tasks · rank         │
│   activity feed (Animated List, real events)        │
└────────────────────────────────────────────────────┘
```

- **Dashboard rules from the legendary setup still apply:** sidebar nav,
  stats strip with Number Ticker, Animated List activity, dashed empty
  states, subtle motion in data regions. The OCTOPUS skin sits ON TOP of
  the easy-dashboard bones — beauty never breaks usability.
- **Background:** Gradient ASCII tuned to `--abyss`/`--gold` at LOW
  opacity behind the hero only; data regions stay clean.
- **Buttons:** the premium glossy recipe (MicroKit) — gold primary CTAs
  with sheen sweep; porcelain secondary.

## Task modules

Task packages are code-first, but every `tasks/tNN-*/README.md` opens with
the OCTOPUS header block (gold serif title on deep blue, one-line poetic
lede) so the repo reads as one designed artifact, not 28 scripts.

## Imagery rules

- Transparent PNG/WebP only, one palette (`--abyss` + `--porcelain` +
  `--gold`). Porcelain-octopus style for creature art; 3dicons Clay style
  for feature accents (never mixed with the octopus on one screen).
- No white-box PNGs. No stock crypto art. No invented coin marks (§10 of
  the legendary setup).
