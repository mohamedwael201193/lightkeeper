# T24 Audit-Log Agent — Evidence

## What was built

An append-only, hash-chained audit log of REAL agent actions on Pharos Atlantic
testnet (chain 688689), plus a wallet-activity reporter that accepts a wallet +
date range, groups on-chain activity, totals per category, and exports
Markdown/CSV/PDF. Source: `src/lib.mjs` (chain hashing/verification),
`src/report.mjs` (live chain scan + classifier + exporters), `bin/audit-log.mjs`
(CLI: `log`, `verify`, `transcript`, `report`).

## The live run (2026-10-16, ~07:20–08:15 EEST) + chain anchor (~09:40–09:50 EEST)

The agent asserted chain 688689, read the wallet balance, and executed **two real
dust transfers** (0.0001 PHRS each, self-transfer) on Atlantic testnet:

- tx1 `0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1`
  → https://atlantic.pharosscan.xyz/tx/0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1
  — status 0x1, block 31483610, fee 0.000021000000021 PHRS
- tx2 `0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68`
  → https://atlantic.pharosscan.xyz/tx/0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68
  — status 0x1, block 31483646, fee 0.000021000000021 PHRS

Then the agent **anchored the chain head on-chain**: one dust self-send
(0.0001 PHRS) whose calldata IS entry #20's entryHash:

- anchor `0xcb79d4a218dece0c55868efd0240089343a5ee8c4887b5f6888517eab70ee76e`
  → https://atlantic.pharosscan.xyz/tx/0xcb79d4a218dece0c55868efd0240089343a5ee8c4887b5f6888517eab70ee76e
  — status 0x1, block 31486961, gas 21512, fee 0.000021512000021512 PHRS,
  input data = `0xadcf050b125a1459cc06551e724f1772d7afeb28c7e2c9475b1f913f27e3ed7e`
  = entry #20's entryHash (verified live via `eth_getTransactionByHash`)

Every action — the chain-id read, the balance read, both broadcasts, both receipt
confirmations, the six dropped anchor attempts (logged, not hidden), the mined
anchor, its calldata check — was appended to `state/audit-log.jsonl` as a
hash-chained entry (`timestamp, actor, action, params, txHash, prevHash →
entryHash`, sha256 over canonical JSON). `audit-log verify` replays all
22 entries: **PASS** (`sample-output/verify-pass.txt`).

## Tamper-evidence demo

A COPY of the log was tampered — one character flipped in entry #12
(`"valuePhrs":"0.0001"` → `"0.0002"`).
`audit-log verify` on the copy: **FAIL — "entry #12: entryHash mismatch — field
content was altered after logging"** (`sample-output/verify-fail-tampered-copy.txt`).
The original log was then verified again: **PASS — untouched**.

## Wallet activity report

`audit-log report --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
--from-date/--to-date` scanned ~3h of chain: 116 native transfers out, 1 in,
90 contract interactions, 7 failed tx, 0 ERC-20 transfers, 0 approvals, 0 swap
events; totals per category plus notable transactions with explorer links.
Exported as Markdown, CSV, and a hand-rolled one-page PDF (all real data):
`sample-output/audit-report-2026-10-16T05-13-57.{md,csv,pdf}`.

## Honest disclosures

1. The first broadcast attempts (log entries 2–3) were accepted by the RPC but
   never mined — 28 workers share one deployer key and same-nonce replacement
   dropped them. The retries (with `cast send --async`) mined immediately. The
   dropped attempts remain in the log as the true record, disclosed by a
   `note:mempool-drop-disclosure` entry.
2. The chain-anchor broadcast hit the same failure mode harder: five consecutive
   `cast send` (no `--async`) attempts returned hashes that never reached the
   mempool. All five are logged (entries 15–20, each embedding the then-current
   head hash as calldata); the `--async` retry mined at block 31486961 and its
   calldata was verified == entry #20's entryHash before logging entry #21.
2. The Atlantic RPC rejects `eth_getLogs` topic filters
   (`PARAM_VERIFY_ERROR: invalid topic length`, verified live) and HTTP-400s
   unfiltered ranges over a few hundred blocks. The report scans unfiltered logs
   in 200-block chunks with client-side topic filtering, and caps native-transfer
   block scans at the most recent 4000 blocks — both disclosed in each report.
3. The scanned wallet is the shared LIGHTKEEPER deployer key, so the report
   reflects all workers' activity, not only this agent's. All figures are real
   chain reads.

## Spend

Total: **0.000363512000063512 PHRS** (fees 0.000063512000063512 + dust 0.0003) —
0.24% of the 0.15 PHRS budget. Full spend log in `evidence.json`.

## Tests

`node --test test/` — 7/7 pass: genesis linkage, chain integrity, tamper→FAIL on
params edit, tamper→FAIL on prevHash break, tamper→FAIL on missing field,
canonical-hash determinism, empty-log verify. Live paths (real reads logged,
verify PASS/FAIL transcripts) are captured in `sample-output/`.
