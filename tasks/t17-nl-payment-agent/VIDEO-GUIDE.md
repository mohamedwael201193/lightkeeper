# T17 Video Guide (45–90 seconds)

**Slot status:** PENDING-VIDEO — record after commit, host unlisted, paste link
into SUBMISSION.md.

## Setup

- Terminal (large font) + browser with two Atlantic explorer tx pages open in
  background tabs.
- Working dir: `~/workspace/lightkeeper/tasks/t17-nl-payment-agent`
  (or the cloned repo path).
- `export PATH="$HOME/.foundry/bin:$PATH"` already run. Do NOT show `.env` or
  any key on screen. The agent prints "(key loaded from env, never printed)" —
  that line is the proof of hygiene; leave it in frame.

## Shot-by-shot (real terminal, real explorer — NO staged fakes)

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Terminal: `python3 agent.py new --text "send 0.01 PHRS to 0x0b0d…"` | "T17 is a natural-language payment agent for Pharos Atlantic. I type a payment in plain English; the parser extracts a structured plan — or refuses." |
| 2 | 8–20s | Terminal: `python3 agent.py review --run <id>` — REVIEW card scrolls | "Review renders before anything else: exactly what moves, where, the cost, and an unsigned transaction — signed: false. Nothing has been sent." |
| 3 | 20–30s | Terminal: `python3 agent.py new --text "send 0.01 PHRS or 0.02 PHRS to 0x…"` | "Ambiguous input is refused with a reason — two amounts, and it will not pick one. No plan, no review, no broadcast." |
| 4 | 30–45s | Terminal: `confirm` with exact phrase, then `send` — gate checks, tx hash, 4/4 PASS verification | "Only an explicit CONFIRM bound to the plan hash unlocks broadcast. One dust transaction on Atlantic, then receipt read-back: status, recipient, value, block — all pass." |
| 5 | 45–60s | Browser: explorer page for 0xd95016…dbc6fd | "Real receipt on the Atlantic explorer: 0.01 PHRS, status success. Total evidence spend: 0.025 PHRS of a 0.15 budget." |
| 6 | 60–75s | Terminal: `python3 -m unittest tests.test_parser` → OK 20/20 | "Twenty unit tests — valid, invalid, ambiguous, prompt injection — plus a CI check that the parser and reviewer contain no signing code at all." |

## Rules for the recording

- Every keystroke is real; if a command fails on camera, keep it — honest
  failure beats a staged take.
- Never display the private key, `.env` contents, or the full `cast send`
  command line. The agent never prints them; don't either.
- Keep it under 90 seconds. One continuous screen recording is fine; no
  editing that reorders events.
