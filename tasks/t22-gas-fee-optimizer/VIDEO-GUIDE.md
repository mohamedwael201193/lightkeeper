# VIDEO-GUIDE — T22 Gas Fee Optimizer (45–90 seconds)

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
| 6 | 70–80 | Terminal: `cat evidence.json` spend log | "Total spend for the whole task: six hundred-thousandths of a PHRS, inside our point-one-five budget." |
| 7 | 80–90 | README §1 on screen, fade to the OCTOPUS header | "Twenty-two of twenty-eight lamps lit." |

## Rules

- Every number on screen must match the evidence files. Nothing is re-typed for the camera.
- The explorer pages must be the real `atlantic.pharosscan.xyz` URLs from LINKS.md.
- If anything on screen disagrees with `evidence.json`, re-shoot — never narrate over a mismatch.
- Video slot in SUBMISSION.md stays PENDING-VIDEO until the file exists.
