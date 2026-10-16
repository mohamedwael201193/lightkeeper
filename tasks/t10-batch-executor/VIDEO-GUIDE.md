# VIDEO GUIDE — T10 "Flotilla" Batch Executor (45–90 seconds)

**Rule: REAL terminal + REAL explorer pages only. No staged fakes. If a step
can't be shown live, say so on camera.**

## Shot list

**Shot 1 (0–8s) — Hook, terminal.**
Open a terminal in `tasks/t10-batch-executor/`. On camera, type and run:
`node bin/run.mjs plan` — show the mode plan output (simple/single-batch/
multi-batch with the 10/11 and 200/201 boundaries).
*Say: "Flotilla picks the batch mode automatically — ten or fewer goes
sequential, eleven to two hundred goes through the distributor contract in one
transaction, above that it chunks."*

**Shot 2 (8–20s) — The contract, explorer.**
Open https://atlantic.pharosscan.xyz/address/0xec0aeCf6c778f44AEa12Ee17afB38f4E0af0a2a4
in the browser. Scroll the contract overview; show the deploy transaction
https://atlantic.pharosscan.xyz/tx/0xa12af6de7b4f7c9ca1b2ddf691d7f738c3cf02e301211a47aa02952f5c0bde30.
*Say: "The hardened distributor is live on Atlantic — duplicate and
zero-address rejection, a 200-per-call cap, and it can never trap funds."*

**Shot 3 (20–45s) — The headline batch, explorer logs.**
Open https://atlantic.pharosscan.xyz/tx/0x3daa4e7dd323e17a0d3e81758709d2497b0c6522ef6f6f9d0e1a95d2fa9a274b.
Show the status (success), then the Logs tab: count the twelve Distributed
events on camera — eleven with success true, one with success false
(`0x49b26d46…b94`), and the BatchExecuted summary (12, 11, 1).
*Say: "Twelve actions, one transaction. Eleven recipients paid. The twelfth
was a contract built to refuse the transfer — its failure is recorded in the
event log, the rest of the batch completed, and its funds were refunded in the
same transaction. That's isolated partial failure, on-chain."*

**Shot 4 (45–65s) — Gas saving, terminal.**
In the terminal, show `evidence.json`'s `gas_report` section (or `cat` the
receipt comparison): 11 × 21,000 = 231,000 vs batch 202,173; and the 3-point
curve (n=8/10/11 → 149,170/185,573/202,173 gas) behind the console's estimate.
*Say: "Measured, not estimated: eleven individual sends cost 231 thousand gas;
the batch cost 202 thousand — twelve and a half percent saved. Three live
runs pin the per-recipient cost at about seventeen thousand gas, so the batch
already wins from around three recipients — well before the eleven-recipient
mode boundary."*

**Shot 5 (65–80s) — Tests + honest close.**
Run `forge test` (12/12) and `node --test test/mode.test.mjs` (9/9) in the
terminal — show green.
*Say: "Twelve contract tests, nine mode-selection tests, all green. Total
spend: three hundredths of a PHRS. Honest limits are in the README — the demo
ran twelve recipients, and the ERC20 path is tested but not yet live."*

## Spoken script (condensed, ~75s)

> "Flotilla — one signature launches the fleet. Three modes: ten or fewer
> sends go sequential; eleven to two hundred go through the distributor
> contract in a single transaction; above that, it chunks — the cap is enforced
> on-chain. The headline run: twelve dust transfers in one Atlantic
> transaction. Eleven paid. The twelfth was a fixture built to refuse — its
> failure is right there in the event log, the batch still succeeded, its funds
> refunded in the same transaction. Gas: 231 thousand for eleven individual
> sends, 202 thousand for the batch — measured from real receipts, twelve and
> a half percent saved, breakeven around three recipients. Three more live
> runs proved the exact commands the console builder generates. Twenty-one
> tests green, six hundredths of a PHRS spent, every limit stated in the README."

## B-roll / cutaways

- `evidence.md` gas table on screen during Shot 4.
- The `Distributed` event list in the explorer during Shot 3 (pause on the
  `success=false` line).

## Shot 6 (optional, 80–95s) — The console builder (Tier C)

Open the Flotilla task page in the LIGHTKEEPER console ("Try it live" section).
Add two recipient rows — type one address with a typo to show the red "bad
address" chip live, fix it, watch the total and mode update, click "+ Add the
refuser fixture" to drop the live RevertingReceiver into the batch, then click
"Copy commands" and show the generated script.
*Say: "And in the LIGHTKEEPER console, the batch builder validates every
address live, refuses duplicates, picks the mode, compares gas against
individual sends, and generates the exact cast commands with a dry-run first —
the exact format was round-trip tested on-chain. It never signs or broadcasts
anything itself — your terminal, your keys."*
If the cut runs over 90s, drop Shot 5's test output or this shot — the
on-chain evidence is the priority.
