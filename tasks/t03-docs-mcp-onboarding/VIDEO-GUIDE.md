# VIDEO-GUIDE — T03 Docs MCP Onboarding (45–90 s)

**Rule:** REAL screen content only. No staged fakes. Every shot below shows a real artifact from this
build. If a command is slow (throttled endpoint), show the real wait or a real cut — never a mock.

## Shot list (shot-by-shot)

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8 s | Scroll `evidence.md` §1 (the query log) in an editor, real text visible | "T03 is a feedback task. I asked the real Pharos docs nine onboarding questions — through the documented ask endpoint and the docs pages — and logged every answer verbatim." |
| 2 | 8–20 s | Terminal: run `python3 scripts/query_log.py run` live; show 2–3 queries attempting, answers arriving | "The runner replays all nine queries against the live endpoint and stores every response — or the failure — as evidence. Nothing is invented." |
| 3 | 20–35 s | Show one gap demo: `evidence.md` §2, G2 — the Docs-MCP answer saying the hosted Chain MCP connects to chain 1672/PROS, then the Atlantic page (688689/PHRS) side by side | "Here's a real gap. The docs answer points my agent at chain 1672 — that's mainnet. The arena runs on 688689. Nothing in the MCP docs says so. That's a builder reading the wrong chain." |
| 4 | 35–50 s | Show the G2 row's suggested fix column, then `QUICKSTART.md` §1 with the chain-identity warning | "Each gap gets an exact query and a suggested fix. And what I built: a First-5-Queries quickstart derived only from real answers — including a warning about that chain trap." |
| 5 | 50–65 s | `REVIEWER_NOTES.md` on screen; close on the repo tree of `tasks/t03-docs-mcp-onboarding/` | "Full log, raw JSON, runner, and reviewer notes — all in the repo, commit-pinned. The log says where the docs couldn't answer, too — that's the honest part." |
| 6 | 65–85 s | On `https://lightkeeper-console.vercel.app/#/task/docs-mcp-onboarding`: pick "Deploy", fill the contract name, show the generated `forge create` with `--chain-id 688689` and the one-line flag explanations, hit Copy | "And the fastest honest path from question to command: the console builds the exact deploy command with Atlantic RPC and 688689 pinned — so you can never land on mainnet by accident. Copy, paste into your own terminal. It never signs for you." |

## Filming notes

- Resolution 1080p, terminal font ≥16 pt, editor with line numbers on.
- Keep the terminal output real: if the endpoint throttles mid-take, keep it — the flakiness is G1.
- No voiceover over fake UI. No slides summarizing the gaps — show the actual markdown.
- Target 75–85 s; hard cap 90 s.

## PENDING-VIDEO

Video slot: **PENDING-VIDEO**. This guide is the filming plan; the recording is the user's to shoot
(or a follow-up task once a screen-capture path is available).
