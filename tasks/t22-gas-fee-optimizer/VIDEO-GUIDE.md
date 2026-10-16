# VIDEO-GUIDE — T22 Gas Fee Optimizer (up to 120 seconds with the console shot)

Film the REAL terminal and REAL explorer pages. No staged fakes, no mock
dashboards. Keep each shot tight; the script below is spoken over the shots.

## Shots

| # | seconds | show | spoken script |
|---|---|---|---|
| 1 | 0–6 | Title card over the README's OCTOPUS header block (deep blue, gold serif) | "T22 — Gas Fee Optimizer. A lamp that only spends when the water is right." |
| 2 | 6–20 | Terminal: `cat evidence/fee-snapshot.json` scrolling through block-pinned samples; then `cat evidence/tier-table.json` | "Twelve real gas-price polls from Atlantic testnet, each pinned to its block. Tiers are computed with an explicit method — slow is the 25th percentile, standard the median, fast the 75th. The testnet was flat at ten gwei, so all three tiers land there. We report that flatness; we don't fake variance." |
| 3 | 20–32 | Terminal: `python3 tests/test_tiers.py` — all 18 PASS lines | "The tier math is unit-tested on a labeled real snapshot — eighteen of eighteen pass." |
| 4 | 32–48 | Terminal: `cat evidence/job-reports.json` (both jobs: submit reasons, deadlines, hashes) | "Two jobs, two real transactions. Job A had a forty-five second deadline and went on a favorable reading at three-point-nine seconds. Job B had a thirty second deadline with a threshold below any real market price — it held, then fired at the deadline margin. The deadline is never missed." |
| 5 | 48–70 | Browser: the two explorer tx pages (scroll to effectiveGasPrice / status / block) | "And here are the real receipts on the Atlantic explorer. Both succeeded. Both settled at an effective price of about one gwei — even though we submitted at the recommended ten-gwei standard. That difference is the optimizer's honest savings: about point-zero-zero-zero-one-eight-nine PHRS per transaction versus the fast tier." |
| 6 | 70–78 | Terminal: Job C explorer page (tx 0x799d5674…7305, block 31486593) | "And the gap persists: two and a half hours later, Job C — submitted at the same ten-gwei standard — settled again at one gwei." |
| 7 (NEW) | 78–92 | Terminal: `cat evidence/settled-price.json` (quoted vs avg settled, min/max) | "The sharp finding: every gas tool quotes the network's gas price — ten gwei here. We measured what the chain actually charged: the last seven settled transactions averaged three-point-six gwei. Five paid the one-gwei base fee; two heavy ones paid the full quote. We price against settled numbers, not the quote." |
| 8 (NEW) | 92–98 | Terminal: `cat evidence/abort-drill.txt` | "And the deadline guarantee survives a dead network: with the RPC gone, the job aborts loudly with exit code two — it never silently holds past the deadline." |
| 9 | 98–106 | Terminal: `cat evidence.json` spend log | "Total spend for the whole task: about nine hundred-thousandths of a PHRS, inside our point-one-five budget." |
| 10 | 106–114 | README §3 on screen, fade to the OCTOPUS header | "Twenty-two of twenty-eight lamps lit." |
| 11 (NEW — interactive console shot) | 114–150 | Browser: the LIGHTKEEPER console lamp page → "Try it live" → Gas Fee Optimizer: hit Refresh, show the live gwei reading + latest block + utilization; point at the Quoted-vs-Settled panel (live quote vs avg settled effective price from real receipts) and the session sparkline; flip tx type to Contract call and urgency to High, show the tier table re-pricing in PHRS | "And now the lamp is tryable: the console reads Atlantic's gas price live — no wallet, no signature — and recomputes the slow, standard and fast tiers from what the chain says right now, not from a table. The Quoted-vs-Settled panel shows the live quote against what recent transactions actually paid — real receipts, real numbers. Pick a contract call at high urgency and the cost re-prices instantly. That's the same percentile method the agent used for the real jobs — A, B and C, whose real receipts are linked right below."

## Rules

- Every number on screen must match the evidence files. Nothing is re-typed for the camera.
- The explorer pages must be the real `atlantic.pharosscan.xyz` URLs from LINKS.md.
- If anything on screen disagrees with `evidence.json`, re-shoot — never narrate over a mismatch.
- Video slot in SUBMISSION.md stays PENDING-VIDEO until the file exists.
