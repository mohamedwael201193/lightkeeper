# T15 — VIDEO GUIDE (45–90 seconds)

> **Rule: real terminal + real explorer pages only. No staged fakes.**
> Label on screen, spoken once: *"testnet mechanics demonstration — not real yield."*
> The live run is COMPLETE — all tx hashes below are real (see LINKS.md).

## Shot list

| # | Sec | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8 | Terminal: `python3 -m optimizer.discover` output; highlight `third_party_yield_venues_found: 0` | "First, the honest part: I scanned Atlantic testnet for real yield venues. There are none. So instead of faking it, I deployed two real vaults with on-chain rate cards." |
| 2 | 8–20 | Explorer: Kelp address page → "Contract" tab showing `rewardPerBlock = 10000000000000`; then Kraken page | "Kelp pays point-zero-zero-zero-zero-one PHRS per block, zero entry fee. Kraken pays two-point-five times more — but watch what the optimizer does with that." |
| 3 | 20–38 | Terminal: `python3 -m optimizer.optimize …` output; scroll the two horizons | "Net math, not APY theater. At fifty blocks, gas and fees eat everything — the answer is honestly 'stay put'. At a thousand blocks, Kelp wins — because Kraken's reward pool only funds four hundred blocks. The optimizer caps fantasy yield at the funded runway." |
| 4 | 38–55 | Terminal: stake tx → `cast` receipt; then claim; show balance delta; overlay the equation `delta = blocks × rate` | "Live run: staked dust, waited 141 blocks, claimed. Kelp paid exactly 141-times-ten-to-the-thirteen wei — to the wei, no rounding. Kraken matched its pro-rata formula to the wei too. The math on screen is the math on chain." |
| 5 | 55–70 | Terminal: `cat runs/unsigned_deposit.json` highlighting `"signed": false`; key-hygiene grep test passing | "And the agent never touches keys — the deposit transaction is prepared unsigned, for your signature only. Twelve tests prove no signing code exists in the module." |
| 6 | 70–80 | Explorer: claim tx page, "testnet mechanics demonstration — not real yield" caption | "T15: the yield optimizer that tells you when to stay put." |

## Filming notes

- Terminal font ≥18pt, dark background; type commands live (no pasted output).
- Explorer pages: real atlantic.pharosscan.xyz URLs from LINKS.md — show the URL bar.
- If the claim delta and the view differ by a few blocks of accrual, say so on camera
  (pending view was read N blocks before the claim mined) — honesty is the brand.
- Keep the honesty caption visible in shots 2–6 (lower third).
