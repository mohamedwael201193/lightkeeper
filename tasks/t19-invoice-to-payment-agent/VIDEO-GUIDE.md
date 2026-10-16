# VIDEO-GUIDE.md — T19 Invoice-to-Payment Agent (45–90s)

**Rule: real terminal + real explorer pages only. No staged fakes, no
pre-typed success screens. If a command fails on camera, keep it and
explain — honesty beats polish.**

## Setup (CLI track)

- Terminal at `~/workspace/lightkeeper/tasks/t19-invoice-to-payment-agent/`
- Env loaded (`ATLANTIC_RPC_URL`, `DEPLOYER_ADDRESS` set; private key never shown)
- Browser tab open at the explorer tx page (proves the payment is real):
  https://atlantic.pharosscan.xyz/tx/0xc9270686464dcfe86ec94bce292b48be6e1f7d6d8b4f7b68a4e0a8a43b9cc4f9
- `paid-stamps.jsonl` temporarily renamed for the duplicate-refusal demo is
  NOT needed — the re-run refusal uses the real stamp. (For a *fresh* pay on
  camera, use a new invoice id; see shot 5 note.)

## Setup (console interactive track — new)

- Browser at https://lightkeeper-console.vercel.app → T19 lamp → "try it live"
- MetaMask on **Pharos Atlantic Testnet** (chain 688689) with a few cents of
  testnet PHRS; a faucet top-up in view proves the funds are real.
- Keep the wallet popup on screen when it appears — the signature is the story.

## Shot list — CLI track

| # | Seconds | Visual | Spoken script |
|---|---|---|---|
| 1 | 0–8 | `cat samples/invoice-001.json` | "This is an invoice — JSON format. Payee, amount, currency, reference." |
| 2 | 8–18 | `python3 -m agent.cli parse samples/invoice-002.csv` then `parse samples/invoice-003.txt` | "Three parsers: JSON, CSV, plaintext. Each extracts payee, amount, currency, reference — nothing guessed." |
| 3 | 18–30 | `python3 -m agent.cli parse samples/invoice-bad-amount.json` → flagged; `parse samples/invoice-bad-currency.txt` → flagged | "A negative amount is refused. A USD invoice is flagged — this agent pays PHRS only, it never converts or guesses." |
| 4 | 30–45 | `python3 -m agent.cli review samples/invoice-001.json` — scroll the review + unsigned tx | "Review: pay 0.001 PHRS to this address for invoice INV-2026-001. The agent builds a real unsigned transaction from live chain data — the invoice reference travels as metadata, because a native transfer has no memo bytes. We document that instead of faking it." |
| 5 | 45–65 | `python3 -m agent.cli pay samples/invoice-001.json --confirm INV-2026-001` on a FRESH invoice id (e.g. copy the sample to `invoice-004.json` with a new id) → PAID + tx hash; then immediately switch to the explorer tab showing the mined tx | "Explicit confirmation, then a real dust payment on Atlantic. Here's the transaction on the explorer — mined, successful." |
| 6 | 65–80 | Re-run the same pay command → `REFUSED … Double-payment prevented.` | "Run it again — refused. The paid-stamp makes double-payment impossible." |

## Shot list — console interactive track (new, 60–90s, 2 formats → broken → signed)

| # | Seconds | Visual | Spoken script |
|---|---|---|---|
| 1 | 0–12 | Console T19 "try it live"; click **Sample: JSON invoice** → **Extract & validate** → clean table (payee, amount, token PHRS, reference) | "Paste an invoice — here the real JSON sample from the agent. LIGHTKEEPER extracts payee, amount, token, reference client-side with the same no-guess rules. Clean — no flags." |
| 2 | 12–22 | Click **Sample: plaintext invoice** → Extract — KEY: value format detected, clean | "Second format: plaintext, KEY: value. Same rules, same clean extraction." |
| 3 | 22–35 | Click **Sample: broken invoice** → Extract → red flags: line-item total 0.0014 ≠ 0.001, "mismatch flagged, not paid"; the Review button is gone | "Now a deliberately broken invoice: line items don't add up. Flagged — and notice, there is no way forward. Nothing pays from a flagged invoice." |
| 4 | 35–55 | Back to the JSON sample → Extract → **Review this payment** → the review card: payee, amount, invoice id, reference; click **Sign in my wallet** → MetaMask popup on Pharos Atlantic → confirm → "waiting for Atlantic to mine it" | "Back to the good invoice. One mandatory review — payee, amount, invoice, reference — then the visitor signs in their own wallet. LIGHTKEEPER never touches keys." |
| 5 | 55–75 | Receipt card: "paid — confirmed on Atlantic" + "Your tx — signed in your wallet." → click through to the explorer, show the mined tx | "Confirmed on Atlantic — the receipt is the visitor's own transaction, on the explorer, mined. Invoice to money in one review." |

## Notes

- Shot 5: the original `INV-2026-001` is already stamped (that's the point of
  shot 6). For a fresh on-camera payment, duplicate the sample with a new
  `invoice_id` — one extra dust tx costs ~0.000021 PHRS.
- Keep the private key out of frame; commands read it from env.
- Total runtime target: under 90 seconds per track. Cut the CLI track to the
  console track if the video must stay short — the interactive demo covers all
  four official requirements (2+ formats, flags, summary + payment, samples)
  in one screen.
