# T12 — Video Guide (45–90 seconds)

**Goal:** one request → Chain MCP reads → skill verdict → contrast run flipping
the verdict. Real terminal + real explorer pages. NO staged fakes: film the
actual `flow.py` runs; if a re-take changes state, say so on camera.

**Setup:** terminal open at `tasks/t12-skill-chain-flow/`, browser open on
https://atlantic.pharosscan.xyz/. Terminal font large. `policy.yaml` open in a
side pane.

## Shot-by-shot

**0–8s — The ask (face/voice, or terminal overlay).**
Say: "One request, four phases: read live chain state, a skill decides, it
executes only if approved, then we verify on-chain."

**8–25s — READ + SKILL (real terminal).**
Run `python3 flow.py --amount-phrs 0.0001 --run-label allow`. Point at the
`[READ]` line: live block, real balance, real gas, `pingCount` from the
contract. Then the `[SKILL]` lines: six named rules, all PASS, verdict ALLOW.
Spoken: "The skill saw the live values — not a guess, the chain told it."

**25–40s — EXECUTE + VERIFY (terminal → explorer).**
Point at `[EXECUTE]`: real tx hash. Paste it into atlantic.pharosscan.xyz —
show the Success receipt, block number, value 0.0001 PHRS. Back in terminal,
`[VERIFY]`: pingCount 0 → 1, OK.
Spoken: "Approved, so it executed — and we verified the state changed."

**40–60s — The contrast run (the proof of composition).**
Run `python3 flow.py --amount-phrs 0.1 --run-label block`. Point at
`RULE-AMOUNT: FAIL` — the detail quotes the live balance. Verdict BLOCK.
`[EXECUTE] skipped`. `[VERIFY]`: pingCount unchanged.
Spoken: "Same flow, same contract — a different amount and the skill says no.
No broadcast. The verdict depends on live data, not my intention."

**60–75s — Honesty close.**
Show `run-logs/flow-transcript.jsonl` (append-only run records) and say:
"Even the failed runs are in here — one freshness refusal, one crashed
broadcast that never sent a tx. Nothing edited out."

**75–90s — Outro.**
Show `evidence.md`: two txs, 0.0004362 PHRS of a 0.15 budget. End on the
contract page in the explorer.

## Spoken script (condensed, natural delivery)

> "Spend readiness check, one request. The flow reads live Atlantic state —
> block, balance, gas, and this little ping contract. The skill evaluates those
> numbers against a pre-declared policy: six rules, all pass, so it allows, and
> only then does it broadcast — real dust, real tx, and we verify the counter
> went from zero to one. Now the contrast run: same flow, but I ask for 0.1 —
> the skill fails the amount rule quoting the live balance, blocks, no tx, and
> the counter doesn't move. That's composition: the skill's output depends on
> live chain data. Full transcripts and tx hashes are in the repo."

**Do NOT:** re-run to "fix" a BLOCK on camera (the BLOCK is the demo); edit
the transcript; claim the portal MCP hosted endpoint — say "reproduced locally
with cast against Atlantic, same boundaries."
