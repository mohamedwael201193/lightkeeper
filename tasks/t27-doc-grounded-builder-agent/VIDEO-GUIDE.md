# T27 — Video Guide (45–90 seconds)

**Rule: NO staged fakes.** Every frame is a real terminal or the real explorer. Record the screen at 1080p; keep the spoken script verbatim-ish.

## Shot list

| # | Time | Visual | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Terminal: `python3 src/agent.py --request "deploy an ERC20 token on Atlantic and verify it" --mode plan` — the cited plan scrolls (steps D1–D9, each with doc URL + excerpt) | "T27 is a builder agent that plans only from retrieved Pharos docs. Watch: every step of this deploy plan carries its citation — URL, date, excerpt — before anything executes." |
| 2 | 8–20s | Terminal: `--mode execute` run — `forge build`, `forge test` pass, deploy broadcasts | "The coverage gate passes, so it executes for real on Atlantic testnet. Build, test, then the deployment transaction." |
| 3 | 20–32s | Browser: `https://atlantic.pharosscan.xyz/tx/0xe54edfefd89057d6f54b1d954bbe0ac2b5ba7f73c382d68890b8e3ce235e3379` — status Success, block 31482431 | "Mined. Block 31482431, status success." Cut to the address page: verified source badge, Token / MTK, total supply one million. |
| 4 | 32–42s | Terminal: R3 prepared-for-signature output — the unsigned tx JSON (`to`, `data: 0xa9059cbb…`, `gas: 66063`, `nonce: 138`) | "A funds-moving request is never auto-broadcast. The agent prepares the real unsigned transaction — calldata, gas, nonce — for the user's wallet to sign." |
| 5 | 42–55s | Terminal: R4 refusal — the SAY-SO message: *"the docs do not cover this request — no passage mentions: confidential, shielded"* | "And the coverage gate's whole point: ask for something the docs don't cover — confidential transactions — and the agent says so instead of improvising. That's the demo." |
| 6 | 55–60s | Terminal: `pytest tests/ -q` → `6 passed` | "Six coverage-gate tests, all green. Lamp 27 is lit." |

## Console demo segment (optional B-roll, 20s)

Open the task's console page, "Try it live": type the goal "deploy an ERC20 token on Atlantic
and verify it" — the generated plan scrolls with every step carrying its doc URL and excerpt
("Every step cites its source"). Click the R4 preset: the console renders the agent's real
refusal — "the docs do not cover this request" — and say: "Uncovered steps are refused, never
improvised." Click "Copy full command sequence" and say: "One paste, and you run the covered
plan on your own machine." (Console never executes; everything runs in the visitor's own
terminal.)

## B-roll (optional, if time allows)

- `corpus/` folder: the 5 retrieved docs + `doc_provenance.json` (URL + fetch date).
- `run-logs/forge-script-rpc-incompatibility.txt`: the proxy capture proving why `forge script` can't run on this RPC.

## What NOT to film

- Do not re-run the deploy for the camera (the tx is already mined — show the real one).
- Do not fake the refusal — run the real command; the output is deterministic.
- No mock terminals, no typed-but-not-run commands, no stock footage.
