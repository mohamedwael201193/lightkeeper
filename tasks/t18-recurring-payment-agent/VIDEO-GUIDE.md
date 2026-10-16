# VIDEO GUIDE — T18 Recurring Payment Agent (45–90 seconds)

**Rule: REAL terminal + REAL explorer pages. No staged fakes.** Every shot
below uses the actual commands and the actual tx from the evidence packet.
If a shot cannot be reproduced live, cut it — do not simulate it.

## Setup (before recording)

- Terminal open in `tasks/t18-recurring-payment-agent/`, env sourced:
  `set -a; source ../../.env; set +a`
- Browser tab open at the live tx:
  https://atlantic.pharosscan.xyz/tx/0xeec25b539944419c8a507bc34c2ad20595737997fd702c1bf7d262e45807ec10
- `config/schedule.json` restored to the evidence version if you re-run
  anything (the demo schedule is cancelled; re-running `tick` on it only
  shows SKIP — which is itself a fine shot).

## Shot list

| # | Time | Visual | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Terminal: `cat config/schedule.json` | "TIDE, the recurring payment agent. A JSON schedule: recipient, amount, weekly interval, max runs, stop conditions." |
| 2 | 8–20s | Terminal: `python3 src/tide.py status` | "One command shows the history board — paid, pending, failed — and the next scheduled payment." |
| 3 | 20–40s | Terminal: `python3 src/tide.py tick` — show the PAID line with the tx hash | "A tick pays the single due installment — a real transfer on Atlantic testnet. This is the live transaction." |
| 4 | 40–55s | Browser: the explorer tx page — point at status Success, block 31481497, value 0.0005 PHRS | "On the explorer: success, block 31481497, exactly 0.0005 PHRS." |
| 5 | 55–70s | Terminal: run `tick` again — show `SKIP: no installment due` | "And the idempotency guarantee: run the tick again and it skips — the same installment can never be paid twice." |
| 6 | 70–85s | Terminal: `python3 src/tide.py pause` then `tick` → SKIP, then `resume` | "Pause, resume, cancel — the operator always has the kill switch. No cron was installed by the build; scheduling is the operator's own cron." |

## Notes for the editor

- Keep terminal font large; the tx hash must be legible.
- Shot 5 is the money shot — linger on the SKIP line.
- Total target: 60–75s. If over 90s, cut shot 6's resume/cancel demo.
- Export 1080p, upload, paste the link into SUBMISSION.md replacing `PENDING-VIDEO`.
