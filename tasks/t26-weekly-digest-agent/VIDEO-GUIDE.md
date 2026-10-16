# T26 — Video Guide (45–90 seconds)

**Status: PENDING-VIDEO** (script + shot list ready; film after this build).

## Concept

One continuous screen recording. No slides, no voiceover-only claims, no
staged fakes: a REAL terminal running the REAL pipeline, then the REAL
Telegram message on screen. If a step is slow (the log scan), show it
starting, cut with a visible "fast-forward — real run, ~6 min" caption, and
show it finishing. Never simulate output.

## Shot list

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Terminal: `cat task.yaml` (summary) + `ls digests/` | "T26, the Weekly Digest Agent. It watches an address on Pharos Atlantic, builds a real weekly digest, and delivers it to Telegram." |
| 2 | 8–20s | Terminal: `python3 src/digest.py --run` starting — show the window line: `blocks 31186577..31482619 (2026-10-09 -> 2026-10-16)`, then the chunked `eth_getLogs` scan running. Caption: "real scan, ~300k blocks, ≤1000-block chunks". | "The window is anchored on real block timestamps — a true calendar week. Token events come from chain-direct logs, scanned in thousand-block chunks." |
| 3 | 20–35s | The finished digest markdown on screen (`digests/digest-2026-10-16.md`): scroll the metrics table — 110 txs, 0.05 in, 0.1398 out, 0.0229 gas — and the Δ column vs the previous week. Mention the section blocks (TOP 3, whale moves, token flows, failures) are selectable via `T26_SECTIONS`. | "Key metrics with previous-period comparison. This week: 110 transactions, 25 contract creations, 7 failures — every delta against a real baseline week." |
| 4 | 35–50s | The TOP 3 section on screen. | "Top three notable events, ranked by deterministic rules — failures first. No hand-picking." |
| 5 | 50–65s | Terminal: `python3 src/digest.py --deliver` → `DELIVERED: message_id=723`. Then cut to the Telegram chat showing the actual delivered message. | "Delivered to a real Telegram channel. One message, message ID 723 — that's the receipt." |
| 6 | 65–75s | Show `evidence.json` (message_id, block range, tx hashes) + the explorer address page. | "Everything is evidenced: the digest text, the block range, all 110 transaction hashes, zero PHRS spent — the agent is read-only." |
| 7 | 75–90s | `cron/install-weekly-cron.sh` on screen (not executed). | "Scheduling is external — a cron installer is provided, because SkillEngine has no cron. Documented honestly, not faked." |

| 0 | 0–8s (alt) | Console: `lightkeeper-console.vercel.app/#/task/weekly-digest-agent` — section picker generating the config + cron lines | "Or build the digest in the LIGHTKEEPER console: pick the sections — the picker writes T26_SECTIONS and the agent renders exactly those blocks — set the schedule, copy the exact config and run commands." |

## Rules

- Film the real commands on the real repo. If anything fails, keep the
  failure in and narrate it — a recovered real run beats a fake clean one.
- Telegram shot must show the ACTUAL delivered message (message_id 723 or a
  newer real delivery), not a mockup.
- Total: 45–90 seconds. Export 1080p, upload, paste the link into
  SUBMISSION.md replacing PENDING-VIDEO.
