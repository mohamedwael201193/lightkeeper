# T09 Trend Watcher — Video Guide (45–90s)

**Format:** terminal screen recording, no facecam needed. Every command below
produces REAL output — nothing is staged. Read the spoken lines naturally;
the timestamps are guides, not cuts.

## Setup (before recording)

```bash
cd ~/workspace/lightkeeper/tasks/t09-trend-watcher
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ../../.env; set +a
clear
```

## Shot list

### Shot 1 — The idea (0:00–0:12)

**Do:** show `README.md` header (Swell Line title) briefly, then clear.
**Say:** "T09 Trend Watcher — Swell Line. It watches Atlantic's fee market and
answers one question: is gas trending up, or is that just a wave? It only fires
after three consecutive confirmations — a single spike can never trigger it."

### Shot 2 — The anti-spike proof (0:12–0:35)

**Do:** `node bin/run.mjs spike-demo`
**Say:** "Watch this. A controlled series: flat, then one spike five times the
baseline. The streak climbs to one — then the reading falls back and the streak
resets. Result: no fire. Hold."
**Show:** the table rows 99000014 → 99000019 and the `Result: NO FIRE — HOLD` line.

### Shot 3 — The confirmed fire (0:35–0:55)

**Do:** `node bin/run.mjs sustained-demo`
**Say:** "Now a sustained climb. Streak one, streak two — and on the third
consecutive confirmation, FIRE. The streak resets, a cooldown starts, and the
next confirmations are held for cooldown. Exactly the rule, no exceptions."
**Show:** the `FIRE CONFIRMED_3X_ABOVE_BAND` row and the cooldown hold rows.

### Shot 4 — Live chain evidence (0:55–1:15)

**Do:** `node bin/run.mjs report`
**Say:** "And the live chain. Sixty real observations across Atlantic blocks
thirty-one million four-eighty-one thousand five-sixty-seven to seventy-eight.
The market was flat at one gwei, so the honest signal is hold — with the reason
stated. Flat markets don't get manufactured signals here."
**Show:** the summary counts and the last-10-decisions list.

### Shot 5 — Close (1:15–1:25)

**Do:** `npm test` (let the 12 green checks scroll).
**Say:** "Twelve unit tests, all green. Swell Line: three confirmations to fire,
one spike never enough. Read-only — zero gas spent."
**End card:** repo path `tasks/t09-trend-watcher`.

### Shot 6 — New interactive shot: the live console surface (0:00–0:40, standalone video option)

**Do:** open the LIGHTKEEPER console, task T09 → "Try it live". Hit **Sample the fee market**.
**Say:** "T09 in the browser. Thirty real blocks of Atlantic base-fee history, sampled live —
same eth_feeHistory source as the CLI. Sparkline, per-block deltas, fast and slow moving
averages, the half-percent band." Point at the verdict chip: "Hold — flat inside the band.
The streak is zero because the honest signal here is no signal. One spike could never fire
this — the rule needs three confirmations in a row, and the panel shows you the count."
Hit **Refresh sample** (free, no wallet, no signature). This shot is the new interactive
demo every visitor gets.

### Shot 7 — New: the one-click spike test (0:00–0:25, standalone video option)

**Do:** in the same "Try it live" panel, switch to the **Spike test — controlled** tab.
**Say:** "And the anti-spike proof, in the browser. A controlled series — fourteen flat
blocks, one spike five times the baseline, six flat — run through the exact same
confirmation math as the CLI. Watch row by row: the streak climbs to one at the spike,
the next reading falls below the band, the streak resets to zero. Result: no fire. It is
labeled controlled and synthetic on screen — it never pretends to be chain data."

## Don'ts

- Don't fake a live FIRE — the live market was flat; the honest evidence is HOLD
  plus the controlled-harness FIRE. Say so on camera if asked.
- Don't show `.env`, keys, or the `state/` directory contents beyond what's printed.
- Don't trim the WARMUP rows out of the demo tables — they're part of the honesty.
