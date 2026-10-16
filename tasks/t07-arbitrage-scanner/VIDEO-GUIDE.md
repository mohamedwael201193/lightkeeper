# T07 — Video Guide (45–90 seconds)

## Concept

"Scan → numbers → above-threshold prepared tx → below-threshold skip with logged reason." One continuous terminal session, no cuts inside a shot, no staged output. Everything the viewer sees is a real command against Atlantic testnet.

## Setup

- Terminal with the repo at `~/workspace/lightkeeper/tasks/t07-arbitrage-scanner/`, env sourced (`ATLANTIC_RPC_URL` set; private key present for the `--execute` shot only).
- Browser tabs pre-opened (but not shown until their shot):
  - `https://atlantic.pharosscan.xyz/tx/0x39fe2154abde86a58418d85667dbec826207b3733eeadb81a877c85e2185de30`
  - `https://atlantic.pharosscan.xyz/tx/0xdcd894bb8bd2f981f2af78425bb58623f26c724502212b24820f2fca380c58ad`
- Note: the Atlantic RPC is slow (~5–60s per scan). Either record the scan shots with a jump-cut AFTER the command is entered (say "scan running — cutting the wait"), or run them live and let the RPC latency play. Do not fake the wait with a pre-written output.

## Shot list

### Shot 1 — The venues are real (0:00–0:15)
**Show:** terminal.
**Do:** `cast call 0x432BCd7bc6944Def44015bF00C82Eb50aA18A3F6 "getReserves()(uint112,uint112)" --rpc-url "$ATLANTIC_RPC_URL"`
**Say (script):** "Task seven: arbitrage scanner. Three independent pools live on Atlantic testnet. This is pool B's real reserves, read on-chain just now — one thousand WPHRS, nine-eighty test dollars. No mocks."

### Shot 2 — The scan and the numbers (0:15–0:40)
**Show:** terminal.
**Do:** `python3 scanner.py` (read-only). Let it print; scroll to `best_route`.
**Say:** "One scan pins a block, reads all three venues, and prices twelve directed cycles. Best route: buy on pool C, sell on pool B. Gross one-three-nine-eight, fees per leg on the notional — never on the spread — slippage against the zero-fee ideal, gas from a live estimate. Net: plus point-one-three-eight WPHRS."

### Shot 3 — Above threshold: the real execution (0:40–1:05)
**Show:** terminal, then browser.
**Do:** `python3 scanner.py --execute` — show the two tx hashes. Then switch to the two explorer tabs; point at status "1 (success)" on each.
**Say:** "Threshold is point-oh-five. Net is above it, so the scanner acts — two real swaps, broadcast to testnet. Both mined, both successful. The wallet's WPHRS balance rose by exactly the predicted gross, to the wei. That is the execution leg."

### Shot 4 — Below threshold: the honest skip (1:05–1:25)
**Show:** terminal.
**Do:** `python3 scanner.py --config config-skip.json` (threshold 0.5 WPHRS). Show `"decision": "SKIP"`, `"skip_reason": "BELOW_THRESHOLD"`, and the note with the numbers.
**Say:** "Same real spread — but the threshold is now point-five. Net is below it, so nothing is broadcast. The scanner logs why: below threshold, with the numbers. On testnet, a truthful skip beats a fabricated opportunity. That's the build."

## Rules for the recording

- REAL terminal, REAL explorer pages. If a command is slow, cut the wait — never paste fake output.
- Keep the private key out of frame (it lives in `.env`, never echoed).
- Total: 45–90 seconds. Title the upload: `LIGHTKEEPER T07 — Arbitrage Scanner (Atlantic testnet)`.
- Video slot in SUBMISSION.md stays `PENDING-VIDEO` until the upload URL exists.
