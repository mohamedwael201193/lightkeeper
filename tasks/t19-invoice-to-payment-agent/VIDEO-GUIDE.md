# VIDEO-GUIDE.md — T19 Invoice-to-Payment Agent (45–90s)

**Rule: real terminal + real explorer pages only. No staged fakes, no
pre-typed success screens. If a command fails on camera, keep it and
explain — honesty beats polish.**

## Setup

- Terminal at `~/workspace/lightkeeper/tasks/t19-invoice-to-payment-agent/`
- Env loaded (`ATLANTIC_RPC_URL`, `DEPLOYER_ADDRESS` set; private key never shown)
- Browser tab open at the explorer tx page (proves the payment is real):
  https://atlantic.pharosscan.xyz/tx/0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9
- `paid-stamps.jsonl` temporarily renamed for the duplicate-refusal demo is
  NOT needed — the re-run refusal uses the real stamp. (For a *fresh* pay on
  camera, use a new invoice id; see shot 5 note.)

## Shot list

| # | Seconds | Visual | Spoken script |
|---|---|---|---|
| 1 | 0–8 | `cat samples/invoice-001.json` | "This is an invoice — JSON format. Payee, amount, currency, reference." |
| 2 | 8–18 | `python3 -m agent.cli parse samples/invoice-002.csv` then `parse samples/invoice-003.txt` | "Three parsers: JSON, CSV, plaintext. Each extracts payee, amount, currency, reference — nothing guessed." |
| 3 | 18–30 | `python3 -m agent.cli parse samples/invoice-bad-amount.json` → flagged; `parse samples/invoice-bad-currency.txt` → flagged | "A negative amount is refused. A USD invoice is flagged — this agent pays PHRS only, it never converts or guesses." |
| 4 | 30–45 | `python3 -m agent.cli review samples/invoice-001.json` — scroll the review + unsigned tx | "Review: pay 0.001 PHRS to this address for invoice INV-2026-001. The agent builds a real unsigned transaction from live chain data — the invoice reference travels as metadata, because a native transfer has no memo bytes. We document that instead of faking it." |
| 5 | 45–65 | `python3 -m agent.cli pay samples/invoice-001.json --confirm INV-2026-001` on a FRESH invoice id (e.g. copy the sample to `invoice-004.json` with a new id) → PAID + tx hash; then immediately switch to the explorer tab showing the mined tx | "Explicit confirmation, then a real dust payment on Atlantic. Here's the transaction on the explorer — mined, successful." |
| 6 | 65–80 | Re-run the same pay command → `REFUSED … Double-payment prevented.` | "Run it again — refused. The paid-stamp makes double-payment impossible." |

## Notes

- Shot 5: the original `INV-2026-001` is already stamped (that's the point of
  shot 6). For a fresh on-camera payment, duplicate the sample with a new
  `invoice_id` — one extra dust tx costs ~0.000021 PHRS.
- Keep the private key out of frame; commands read it from env.
- Total runtime target: under 90 seconds. Cut shot 2 to one format if needed.
