# T17 Video Guide (45–90 seconds)

**Slot status:** PENDING-VIDEO — record after commit, host unlisted, paste link
into SUBMISSION.md.

Two recordable demos exist; **Demo B (console, Tier B)** is the new
interactive surface and the strongest visual proof of the differentiator
(zero ambiguity tolerance + visitor-signed). Pick one, or combine (keep under
90s).

## Setup (Demo A — CLI)

- Terminal (large font) + browser with two Atlantic explorer tx pages open in
  background tabs.
- Working dir: `~/workspace/lightkeeper/tasks/t17-nl-payment-agent`
  (or the cloned repo path).
- `export PATH="$HOME/.foundry/bin:$PATH"` already run. Do NOT show `.env` or
  any key on screen. The agent prints "(key loaded from env, never printed)" —
  that line is the proof of hygiene; leave it in frame.

## Setup (Demo B — console, new)

- Browser on the LIGHTKEEPER console → T17 task page → "Try it live — with
  your own wallet". A burner wallet (MetaMask/Rabby) holding a little Atlantic
  testnet PHRS, switched to Pharos Atlantic Testnet (chain 688689) before
  recording. Never show seed phrases or private keys — only the wallet's
  public signing popup may appear on camera.

## Shot-by-shot (real terminal / real browser — NO staged fakes)

### Demo A — CLI agent (runs 1–3 + unit tests)

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Terminal: `python3 agent.py new --text "send 0.01 PHRS to 0x0b0d…"` | "T17 is a natural-language payment agent for Pharos Atlantic. I type a payment in plain English; the parser extracts a structured plan — or refuses." |
| 2 | 8–20s | Terminal: `python3 agent.py review --run <id>` — REVIEW card scrolls | "Review renders before anything else: exactly what moves, where, the cost, and an unsigned transaction — signed: false. Nothing has been sent." |
| 3 | 20–30s | Terminal: `python3 agent.py new --text "send 0.01 PHRS or 0.02 PHRS to 0x…"` | "Ambiguous input is refused with a reason — two amounts, and it will not pick one. No plan, no review, no broadcast." |
| 4 | 30–45s | Terminal: `confirm` with exact phrase, then `send` — gate checks, tx hash, 4/4 PASS verification | "Only an explicit CONFIRM bound to the plan hash unlocks broadcast. One dust transaction on Atlantic, then receipt read-back: status, recipient, value, block — all pass." |
| 5 | 45–60s | Browser: explorer page for 0xd95016…dbc6fd | "Real receipt on the Atlantic explorer: 0.01 PHRS, status success. Total evidence spend: 0.025 PHRS of a 0.15 budget." |
| 6 | 60–75s | Terminal: `python3 -m unittest tests.test_parser` → OK 20/20 | "Twenty unit tests — valid, invalid, ambiguous, prompt injection — plus a CI check that the parser and reviewer contain no signing code at all." |

### Demo B — console interactive (new Tier B surface; ~60s)

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–10s | Console T17 page, click the "Dust payment" preset in "Try it live" | "Same agent, now in the browser. I type a payment in plain English — the parser runs locally, no LLM, and renders the intent as structured chips with a confidence note." |
| 2 | 10–22s | Click "Ambiguous → refusal" preset — the REFUSED panel appears | "Now the differentiator: ambiguous input — two amounts — is refused. It will not guess. It never infers a recipient." |
| 3 | 22–35s | Click "Dust payment" again → "Propose this payment" → mandatory REVIEW card with amber dust note | "A clean phrase becomes a proposal, and review is mandatory: exactly what moves, where, the amount — with an amber warning above the dust limit. This page has never touched my keys." |
| 4 | 35–55s | Click "Sign in my wallet" → wallet popup appears → approve → "Confirmed on Atlantic — your tx, signed in your wallet" + explorer link | "I approve, and the signature happens entirely in my own wallet — my address, my testnet PHRS. The console only ever proposed. Receipt, on the explorer." |

## Rules for the recording

- Every keystroke is real; if a command fails on camera, keep it — honest
  failure beats a staged take.
- Never display the private key, seed phrase, `.env` contents, or the full
  `cast send` command line. In Demo B the wallet popup may show only the
  transaction details, never secrets.
- Keep it under 90 seconds. One continuous screen recording is fine; no
  editing that reorders events.
