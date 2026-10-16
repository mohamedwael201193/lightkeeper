# T26 — Weekly Digest Agent: Official Requirements (quoted verbatim)

Source: `~/workspace/your_files/pharos-arena-MEGA.md`, section
**"### T26 — Weekly Digest Agent (Medium, 100 · Support)"**.

> **OFFICIAL:** (1) Runs on schedule (weekly default, configurable). (2) Key metrics WITH comparison to previous period. (3) Highlights TOP 3 notable events. (4) Delivers to REAL channel (email/Telegram/Discord) or published page.

> **Implementation:** external scheduler (no official cron — say so); Chain MCP metric collectors with ≤1,000-block chunked `get_logs`; persisted `state.json` snapshot for explicit current-vs-previous deltas; deterministic rule-based TOP-3 ranking; delivery to a REAL channel (Telegram `sendMessage` with env-only token, message_id as receipt) or published page. Honest bootstrap: baseline run + historical backfill so the comparison is real data.

> **Evidence:** two consecutive digests with deltas, TOP-3 section, delivery receipt, share link.

> **Video:** metrics → previous-period comparison → TOP 3 → delivered digest.

> **Risks:** scheduler reliability (monitor it); first-run baseline (backfill honestly).

Related, from MEGA §243 (quoted verbatim):

> - **No scheduling/cron** → T18/T26 need an external scheduler (system cron / GitHub Actions) driving the skill.

Related, from `~/workspace/pharos-arena/LIGHTKEEPER-VERDICT.md`:

- §147 item 7: Telegram bot token + chat ID — "T16/T20/T26 REQUIRE a real notification channel."
- §147 item 14: "External scheduler (GitHub Actions) for T18/T26 — we configure once the repo exists (no native SkillEngine cron exists)."

## How this build satisfies each requirement

| # | Requirement | Satisfied by |
|---|---|---|
| 1 | Runs on schedule (weekly default, configurable) | `cron/install-weekly-cron.sh` (operator-run installer; weekly default, `WINDOW_DAYS` configurable) + `cron/weekly-digest.github.yml` alternative. The builder does NOT install cron on any machine — documented honestly (no SkillEngine cron exists). |
| 2 | Key metrics WITH comparison to previous period | `src/digest.py --backfill` persists a real previous-window snapshot to `state.json`; `--run` diffs current vs previous (tx count, native in/out, gas spent, creations, failures, token events) with Δ and % |
| 3 | TOP 3 notable events | Deterministic rule-based ranking in `rank_notable()`: failed tx (100) > contract creation (50) > large native ≥0.05 PHRS (40) > token transfer (25) > contract interaction (10) > plain transfer (5); ties → newest block |
| 4 | Delivers to REAL channel | `src/digest.py --deliver` → Telegram `sendMessage` with env-only token; returned `message_id` is the delivery receipt (recorded in `state.json` + `evidence.json`) |

Evidence checklist: two consecutive digests with deltas (`digests/digest-previous-baseline.md` + `digests/digest-<date>.md`), TOP-3 section (in both), delivery receipt (Telegram `message_id`, in `evidence.json`), share link (commit-pinned GitHub path in `SUBMISSION.md`).
