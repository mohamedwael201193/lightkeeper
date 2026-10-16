# VIDEO GUIDE — T06 Saga Executor (45–120 seconds)

**Rule: NO staged fakes.** Every frame shows a real terminal or a real
explorer page. The 0x0 receipt is the star — linger on it.

## Interactive console demo (ship in the video)

The console's "Try it live" surface (`apps/console/src/components/try/saga-executor.tsx`)
is filmed as **shot 7 below**: it walks a reviewer through the forced-failure run step by
step — each step card shows the mined tx, block, receipt status, and the executor's decision,
and a "Verify receipts live" button re-reads every receipt from Atlantic RPC on camera.

## Shot list

| # | Sec | Visual | Spoken script |
|---|---|---|---|
| 1 | 0–8 | Terminal: `python3 scripts/saga.py --selftest` → "ALL SELFTESTS PASSED" (25 cases). | "T06, the Saga Executor. Twenty-five unit tests: receipt classifier, retry policy, state machine, resume parser — all green before anything touches the chain." |
| 2 | 8–25 | Terminal scroll of Run A state log / run.json: four txs, `saga_state: SUCCEEDED`. | "Run A: approve, lock, execute, settle — four steps, four confirmed receipts. Each step is receipt-checked with post-state gates before the next starts." |
| 3 | 25–45 | **Explorer page** of `0x91f7e02125434e3f29a56ed086f440a283ac000575fb1ff3369bbf269f819b05` — point at **Status: 0 (failed)**, block 31482534. | "Run B: the forced failure. We called execute with an impossible minOut — and the chain really rejected it. Status zero. A real mined revert, not a simulation." |
| 4 | 45–65 | Terminal: state log lines `FAILED_PERMANENT → COMPENSATING`; then the two compensation txs on the explorer, both Status 1. | "The executor saw the zero, classified it permanent — no retry — and compensated forward: a refund of every wei of locked dust, plus an allowance revoke. Both mined." |
| 5 | 65–80 | Terminal: `cast call` balanceOf → `1000000000000000000000000`; on-screen caption: **"finalized txs can't be undone — compensation only."** | "Balance before: one million. After: one million. Finalized transactions can't be undone — only compensated. Gas is the one thing you never get back, and we report it." |
| 6 | 80–90 | Repo dir listing + evidence.json spend line: total 0.00218 PHRS of 0.15 budget. | "All evidence, receipts, and the spend log are in the repo. T06 — done, on-chain." |
| 7 | 90–105 | **Console interactive demo** on lightkeeper-console.vercel.app: open the T06 Saga Executor lamp → scroll to the live surface → click the 0x0 step card open → press "Verify receipts live" and wait for the live ✓ badges → scroll to the reproduce panel. | "The same saga, interactive: every step of the real failure run, explorable. Click the failed step — the real receipt, the real block. Hit verify and the console re-reads each receipt straight from Atlantic. Reproduce it all from the commands below — T06, proven twice: once on-chain, once in the demo." |
| 8 | 105–120 | Terminal, two commands back-to-back: `python3 scripts/saga.py run-c 1000 --kill-after approve` → process exits 137 (show the exit code); then `python3 scripts/saga.py resume t06-run-c-…` → scroll to `"saga_state": "SUCCEEDED"`. On-screen caption: **"killed mid-step — resumed with zero duplicate broadcasts."** | "And the hardest test: we killed the executor mid-step — exit code 137, no cleanup. Then resumed it from the state log. It re-read the in-flight receipt instead of re-sending, and finished the saga. One broadcast per step, even across death." |

## Filming notes

- Film the terminal at 1080p, font ≥18pt; never retype hashes — copy from `evidence.md`.
- On the explorer, wait for the page to fully render before recording the scroll (pages are server-rendered; the status field is in the first viewport).
- The caption in shot 5 must be literal text on screen for ≥3 seconds.
- Do not narrate over the 0x0 page — let the "failed" status breathe for 2 seconds.
- Total runtime target: 120 seconds with the console + crash shots (75 without). No background music with lyrics.
