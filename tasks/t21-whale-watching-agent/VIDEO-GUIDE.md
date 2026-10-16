# T21 — Video Guide (45–90 seconds)

**Status: PENDING-VIDEO** — film after the evidence scan is complete.
**Rule: REAL terminal output only.** Every command below runs against Atlantic testnet
(chain 688689). Never stage, mock, or re-type output. If a command errors on camera,
leave the error in and narrate the fix — honesty beats polish.

**Setup:** terminal, `cd ~/workspace/lightkeeper/tasks/t21-whale-watching-agent`,
env loaded (`set -a; source ~/workspace/lightkeeper/.env; set +a`).
Font large enough to read at 720p.

---

## Shot 1 — The watchlist (0:00–0:12)

**Do:** `python3 src/whale_watch.py watchlist`

**Say:** "T21, the Whale-Watching Agent. Six watched addresses on Atlantic testnet,
whale threshold — zero point zero five PHRS, measured from real chain traffic."

**Show:** the 6 addresses with honest labels printing.

## Shot 2 — The move (0:12–0:32)

**Do:** `python3 src/whale_watch.py scan --from-block 31481230 --to-block <TIP>`

**Say:** "Scanning blocks with full transactions — native transfers don't emit logs,
so we read the blocks directly. One whale event: a zero point zero five PHRS move."

**Show:** the scan completing, `matches: 1`, paths of the scan JSON + report.
(Values: block 31482165, tx `0xf566e34c25ca3c32dc4f6c687b7345501ea8da065398d71e9b87bc246371ba70`.)

## Shot 3 — The explained report (0:32–0:55)

**Do:** open `reports/watch-report-*.md`, scroll to `#1`.

**Say:** "The report explains the move: what, how much, from where, to where —
labelled where known. This one is marked self-seeded: a disclosed test transfer,
never presented as organic. And here is its explorer link."

**Show:** from → to lines with labels, the `https://atlantic.pharosscan.xyz/tx/…` link.

## Shot 4 — The summary view (0:55–1:12)

**Do:** scroll to "Summary view — all watched addresses".

**Say:** "Summary across all six watched addresses: whale moves in and out,
totals, last block. Quiet addresses show honest zeros — nothing invented."

**Show:** the markdown table.

## Shot 5 — The proof it works (1:12–1:30)

**Do:** `python3 -m pytest tests/ -q`

**Say:** "Sixteen unit tests — threshold boundaries, dedupe, ranking, label honesty.
All green. Real blocks, real transactions, real report. That's T21."

**Show:** `16 passed`.

---

## Shot 6 — The interactive console demo (1:30–1:50)

**Do:** open `lightkeeper-console.vercel.app` → T21 → "Try it live" → "Whale radar":
threshold 1 PHRS, 20 blocks → **Scan latest blocks**.

**Say:** "And now the live surface anyone can use — no wallet, no signature, free
reads. One batched RPC request reads all twenty blocks — no slow sequential crawl.
Real Atlantic blocks, real transfers, ranked largest-first, every hash linked to
the explorer. Moves touching the agent's watchlist carry a watched chip with their
honest on-chain label."

**Show:** the progress line ("Reading 20 blocks in 1 batched request…"), rows
appearing (or the honest empty state: "quiet water — no native transfers ≥ threshold
in this window"). Toggle auto-refresh on, then off, showing the label flips between
"(on — untick to stop)" and "(off)" and it never polls silently. Scroll to "03 ·
Field log" showing the session's scan history.

## Shot 7 — A failure, handled (1:50–2:05, optional)

**Do:** (in dev tools, go offline) hit **Scan latest blocks** again.

**Say:** "And when the RPC is unreachable, nobody gets a spinner of death —
plain language, plus a retry button."

**Show:** the error panel with "Retry scan".

## Don'ts

- Don't film the `.env` file or any private key — the agent is read-only and needs none.
- Don't convert PHRS to dollars on camera — no price feed exists; say so if asked.
- Don't re-run `scan` with `--no-commit-state` tricks to fake a second detection —
  dedupe state is the feature, not an obstacle.
