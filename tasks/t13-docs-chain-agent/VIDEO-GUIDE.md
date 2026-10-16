# T13 VIDEO GUIDE — "The agent that cites, then proves" (45–90 seconds)

Goal: question → docs answer WITH visible sources → the SAME function executed
live on Atlantic → the interpreted result → second function. NO staged fakes:
every terminal command and every explorer page is real.

## Shot plan (total ~75s)

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Terminal: `cat corpus/SOURCES.json` (6 docs URLs + 2026-10-16 dates) | "T13 is an agent that answers developer questions from the real Pharos docs — then proves each answer by executing it live on Atlantic testnet." |
| 2 | 8–25s | Terminal: `python3 src/doc_agent.py balance` — scroll the answer + the two DOC-GROUNDED citations (URL + excerpt visible) | "Question one: how do I read an ERC-20 balance? The agent answers from the docs, with sources — eth_call from the JSON-RPC reference, WPHRS from the official token registry." |
| 3 | 25–35s | Same terminal output scrolled to EXEC: `balance_wei: 2500000000000000`, interpretation "0.0025 WPHRS at block 31482405" | "Then it runs the exact procedure — a real eth_call — and interprets: 0.0025 WPHRS. Read-only, zero gas." |
| 4 | 35–50s | Terminal: `python3 src/doc_agent.py estimate` — EXEC: `estimate_gas: 40067`, `buffered_limit_20pct: 48080` | "Question two: gas estimation. The docs say estimate and add a twenty-percent buffer — the agent does both: 40,067 gas, buffered limit 48,080." |
| 5 | 50–65s | Terminal: `python3 src/doc_agent.py logs` (fast-forward the two broadcasts) → browser: the transfer tx on atlantic.pharosscan.xyz, then the matched log | "Question three: event logs. The agent creates a real on-chain footprint — a dust deposit and transfer — then queries eth_getLogs and matches the log to its own transaction hash." |
| 6 | 65–75s | Terminal: `python3 src/doc_agent.py failclosed` — the UNVERIFIED answer; `python3 tests/test_transcripts.py` tail: "Ran 10 tests … OK" | "And when the docs don't cover it — like a WPHRS price feed — it says so and executes nothing. Ten tests, all live, all pass." |
| 7 | 75–95s | Browser: the LIGHTKEEPER console, T13 lamp page — the "Explain then prove" try-it-live panel. Type WPHRS + `balanceOf(address)` with a holder address, press "Explain then prove": the docs-grounded explanation (DOC-GROUNDED citations with URLs and excerpts) appears left, the live on-chain proof decodes right. Then type a made-up signature like `priceFeed()` and show the UNVERIFIED fail-closed panel — nothing executed. | "And now it's live for anyone: ask the panel a function, get the docs-grounded explanation with sources, and watch the same function execute on Atlantic — side by side. Unknown function? It says UNVERIFIED and touches nothing. That's the loop." |

## Filming rules

- Record the terminal at 1080p, font ≥16pt. Run each command fresh — do NOT
  replay old output. The `logs` shot will broadcast 2 more dust txs (~0.00006
  PHRS); that's fine, they're real evidence. (Or reuse the existing txs and
  say the footage is the recorded run — never claim a replay is live.)
- Explorer pages: open the two real tx links from LINKS.md in the browser on
  camera; scroll the Logs tab.
- Spoken script is verbatim above — read it, don't improvise numbers. The
  balance figure will differ on a fresh run; say the number the terminal shows.
- No music-only montage, no mock UI, no "simulated" labels anywhere.

## After filming

- Upload, paste the URL into SUBMISSION.md's "Demo video" slot (replacing
  PENDING-VIDEO), and commit.
