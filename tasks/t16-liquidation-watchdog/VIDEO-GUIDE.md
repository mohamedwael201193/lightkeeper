# VIDEO GUIDE — T16 Liquidation Watchdog (45–90 seconds)

## Concept

One continuous screen recording. Real terminal, real chain, real Telegram —
**no staged fakes**. The arc: healthy position → configure thresholds → real
price drop → alert lands on the phone → repay → recovered.

## Shot list

| # | Seconds | What is on screen | Spoken script |
|---|---|---|---|
| 1 | 0–8 | Terminal: `cat watcher/config.yaml` (highlight `warn_hf: 1.3`, `critical_hf: 1.1`) | "The watchdog reads its thresholds from config — warn at 1.3, critical at 1.1. Nothing hard-coded." |
| 2 | 8–18 | Terminal: `python3 watcher/watch.py --dry-run` → `hf=1.6000 zone=OK` | "First run: the position is healthy, health factor 1.6, read live from chain. No alert — correctly." |
| 3 | 18–32 | Terminal: the `cast send … setPrice(int256) 150000000` command executing; then the explorer tx page loading for `0x6a9a22…484861` | "Now I move the oracle price on-chain — two dollars to one-fifty. This is a real state change, not a simulation." |
| 4 | 32–45 | Terminal: `python3 watcher/watch.py` → `zone=WARNING … ALERT SENT telegram_message_id=716`; **cut to the phone/Telegram window showing the actual alert message** with the concrete action | "The watcher catches it — health factor 1.2, warning zone — and the alert lands with a concrete action: repay forty cents of debt, or add collateral." |
| 5 | 45–60 | Terminal: `cast send … repay()` then `watcher/watch.py` → `RECOVERED` | "I repay on-chain, the health factor is back to 1.5, and the watcher logs recovered — with no alert spam." |
| 6 | 60–70 | Explorer page of the contract `0x108989a1…bf4a`, scroll the `healthFactor` read result | "Every number came from chain. Contract, transactions and logs are linked in the submission." |
| 7 | 70–85 | Console (lightkeeper-console.vercel.app): T16 task page → "Try it live" → paste the operator address, hit Check risk → PASS/AT RISK chip, health factor, liquidation price, concrete repay-or-top-up numbers; then paste an empty address → honest "no position" state | "And on the console, the risk math is live on any address: health factor, the exact price that would liquidate you, and the concrete repay-or-top-up action — read off the chain in front of you." |

## Filming notes

- Record the terminal at a readable font size (≥16pt); keep the prompt visible
  so the commands are auditable.
- For shot 4, show the REAL Telegram message (message_id 716, delivered
  2026-10-16) — open the chat and scroll to it; do not retype or mock it.
- If the price-drop tx takes >20s to confirm, cut the waiting time but keep
  the receipt visible.
- Total budget: keep it under 90 seconds; 60–75 is the sweet spot.
- Export 1080p, upload, and replace the PENDING-VIDEO slots in SUBMISSION.md
  and LINKS.md with the real URL.
