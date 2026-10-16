# T28 — Video Guide (45–90 seconds)

**Rule: REAL terminal + REAL explorer pages. No staged fakes, no mock runs,
no pre-typed outputs. If a command takes 90s on the slow RPC, record the run
and speed the footage up with an on-screen "sped up ×8" label — never cut to
a fake result.**

## Shot list

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Title card (OCTOPUS style, deep blue `#1414c8`, gold serif): "T28 · MULTI-PROTOCOL AGGREGATOR" | "Task 28: one interface over many protocols. Three live venues on Pharos Atlantic — two vaults and a lending pool — read in a single run." |
| 2 | 8–18s | Explorer: open `https://atlantic.pharosscan.xyz/address/0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9` — show Contract tab / the deploy tx | "Every venue is a real deployed contract. Here is MeridianVault, deployed in transaction 0x3aca…2068c." |
| 3 | 18–35s | Terminal: `python3 aggregate.py run` — let it print the three venues, the comparison ranking, the block number | "One run pins a single block and reads all three venues: TVL, APYs, share price, utilization — normalized into one report, ranked by live supply APY." |
| 4 | 35–48s | Terminal: `python3 aggregate.py route --intent deposit --amount-wei 1000000000000000` | "The router picks HalcyonVault at 5.2% — and explains why each venue won or lost, with the exact numbers." |
| 5 | 48–60s | Terminal: `python3 aggregate.py prepare --venue T28-VAULT-B --action deposit --amount-wei 100000000000000` — highlight `dry_run: passed` and the NOT BROADCAST line | "Actions are prepared for signature only: unsigned transaction, gas estimate, dry-run passed — never broadcast by the tool." |
| 6 | 60–75s | Terminal: `python3 aggregate.py chaos` — show the UNREACHABLE line and the re-ranked comparison | "One protocol down: the dead venue is marked unreachable with a reason — the other two keep aggregating. No zeros invented." |
| 7 | 75–85s | Explorer tx page of the borrow tx + `evidence.json` spend log on screen | "Seven real transactions, two-thousandths of a PHRS in gas, every link in evidence. One lighthouse, twenty-eight lamps." |

## Recording notes

- Font: large terminal font (18pt+), dark background; explorer in dark mode if available.
- Keep the block numbers visible — they are the proof the data is live.
- Total target: 75–85 seconds. Export 1080p.
- Upload, paste link into `SUBMISSION.md` replacing `PENDING-VIDEO`.
