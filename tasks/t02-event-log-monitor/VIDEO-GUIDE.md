# T02 Video Guide — Event/Log Monitor (45–90s)

**Rule: REAL terminal + REAL explorer pages only. No staged fakes. Every frame is
re-recordable live.**

## Shot list

| # | Time | What you see | Spoken script |
|---|------|--------------|---------------|
| 1 | 0–8s | Terminal: `ls` of the task dir; open README hero (blue OCTOPUS header) | "Task T02: a live event monitor on Pharos Atlantic. The second lamp." |
| 2 | 8–18s | Terminal: `python3 monitor.py topics` → 3 topic0 hashes | "The monitor filters by contract address and computed event signatures — no hardcoded hashes." |
| 3 | 18–35s | Terminal: poller already running (`tail -f poll.log`); second pane fires `cast send ... ping(2718,"live")` → receipt; next cycle prints ALERT with decoded fields | "Watch: a real event fired while polling. The next cycle catches it — decoded, with block and tx hash." |
| 4 | 35–50s | Browser: explorer tx page for the live-catch tx; scroll to the Logs tab showing the decoded event | "The receipt on the Atlantic explorer — same tx, same log." |
| 5 | 50–65s | Terminal: `kill -9` the poller, restart it; `wc -l alerts.jsonl` → unchanged | "Kill it mid-run, restart it: zero re-emissions. The cursor survives." |
| 6 | 65–80s | Terminal: `monitor.py test --from-block=31481148 --to-block=<tip> --expect=Ping,Ping,Zap,Marker` → TEST PASS | "And the deterministic test: the monitor finds exactly the events we emitted. Nothing demoed, everything mined." |

## Filming notes

- Run the poller on one pane, `tail -f poll.log`; keep the wallet address visible.
- Record the explorer page LIVE (URL bar visible) — no screenshots.
- If a poll cycle is slow, trim silence, never fake the alert.
- End card: repo link + the 4 tx hashes.
