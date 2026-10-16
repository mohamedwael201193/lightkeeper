<div align="center">

# T24 · AUDIT-LOG AGENT

*Every action the keeper takes, written in ink that cannot be unwritten.*

</div>

---

## 1. Verdict (the 30-second test)

An append-only, **hash-chained audit log** that records REAL agent actions with
REAL tx hashes on Pharos Atlantic testnet — plus a wallet-activity reporter
(wallet + date range → grouped activity, totals, notable txs with links,
Markdown/CSV/PDF exports). Live demo: 2 real dust txs mined
([tx1](https://atlantic.pharosscan.xyz/tx/0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1),
[tx2](https://atlantic.pharosscan.xyz/tx/0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68)),
14-entry chain verifies **PASS**, tampered copy verifies **FAIL** naming the
exact entry, original untouched. Total spend: 0.000242000000042 PHRS of the
0.15 budget. No mocks, no placeholders, no fake success.

## 2. What it does

- `audit-log log` — append one entry: `{index, timestamp, actor, action,
  params, txHash, note, prevHash, entryHash}`. `entryHash = sha256(canonical
  JSON of all fields)`; each entry's `prevHash` is the previous `entryHash`
  (genesis = 64 zeros). Any edit to any field breaks that entry's hash and
  every link after it.
- `audit-log verify` — replays the whole chain; PASS only if every hash
  recomputes and every link holds. Exit code 1 + named failures otherwise.
- `audit-log transcript` — human-readable Markdown snapshot of the log.
- `audit-log report --wallet ADDR --from-date/--to-date` — live chain scan:
  native transfers in/out (block scan), ERC-20 transfers, approvals, swap
  events (Uniswap V2/V3 topics), contract interactions; totals per category +
  notable txs with explorer links; exports MD/CSV/PDF. Dates resolve to blocks
  via live-measured average block time; coverage limits are disclosed in the
  report header.

## 3. How to run

```bash
# env: ATLANTIC_RPC_URL must be set (DEPLOYER_PRIVATE_KEY only for the demo writes)
node bin/audit-log.mjs log --actor lk-t24-agent --action read:chain-id \
  --params '{"chainId":688689}'
node bin/audit-log.mjs verify            # PASS / FAIL
node bin/audit-log.mjs transcript --out sample-output/audit-log.transcript.md
node bin/audit-log.mjs report --wallet 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 \
  --from-date 2026-10-16T02:00:00Z --to-date 2026-10-16T05:00:00Z \
  --export md,csv,pdf
node --test test/                        # 7/7 hash-chain unit tests
```

Live demo (re-runnable, dust only): `demo/run-live-demo.sh`,
`demo/broadcast-under-lock.sh`, `demo/finish.sh` document the exact run.

## 4. Requirements coverage

| Official requirement (verbatim) | Satisfied by |
|---|---|
| (1) Accepts wallet + date range | `report --wallet/--from-date/--to-date/--from-block/--to-block` |
| (2) Groups activity (transfers in/out, swaps, approvals, contract interactions) | `src/report.mjs` classifier: native in/out, ERC-20 Transfer/Approval events, V2/V3 swap topics, non-empty-input wallet txs |
| (3) Totals per category + notable txs with links | report totals table + notable-tx section with `atlantic.pharosscan.xyz/tx/<hash>` links |
| (4) EXPORTS report as Markdown/PDF/CSV | `sample-output/audit-report-*.{md,csv,pdf}` — real data, hand-rolled PDF |

Plus the task-specific bar: ≥2 real dust txs logged with real hashes, read
actions logged around them, `verify` proving tamper-evidence on a tampered
COPY while the original stays PASS.

## 5. Evidence

- `evidence.md` — full narrative (≥300 words); `evidence.json` — machine
  evidence: tx hashes, receipts, spend log, curl-verified links, test results.
- `sample-output/verify-pass.txt` — 14 entries, PASS.
- `sample-output/verify-fail-tampered-copy.txt` — FAIL naming entry #12.
- `sample-output/audit-log.transcript.md` — the verified log.
- `sample-output/audit-report-2026-10-16T05-13-57.{md,csv,pdf}` + `chain-scan-*.json`.

## 6. Design notes

- **Hashing:** sha256 over canonical (sorted-key, recursive) JSON — key order
  can never change a hash. Pure Node stdlib, no dependencies.
- **Append-only:** entries are JSONL lines; `verify` additionally checks index
  sequence and required fields, so line deletion/reordering is detected.
- **Nonce safety:** every broadcast wrapped in `flock /tmp/lk-nonce.lock`
  (shared-key discipline across 28 workers); `--async` used after observing
  that default polling mode never surfaced submissions in this environment.
- **RPC quirks handled honestly:** topic-filtered `eth_getLogs` is rejected by
  this Atlantic RPC — the reporter uses unfiltered 200-block chunks with
  client-side filtering; native-transfer block scans are concurrency-limited
  (3) and capped (default 4000 most-recent blocks), always disclosed.

## 7. Honest limitations

- The demo wallet is the **shared** LIGHTKEEPER deployer key: the activity
  report reflects all workers' actions, and first broadcast attempts were
  dropped by same-nonce replacement (disclosed in-log, then retried).
- Swap detection covers Uniswap V2/V3 event topics only; 0 detected in the
  window is a real finding, not a gap fill.
- ERC-20 transfer amounts are raw units (decimals resolved per-token only
  where the token contract is queried — not assumed).

## 8. Files

```
tasks/t24-audit-log-agent/
├── task.yaml  REQUIREMENTS.md  README.md  evidence.md  evidence.json
├── REVIEWER_NOTES.md  LINKS.md  SUBMISSION.md  VIDEO-GUIDE.md
├── package.json  .gitignore
├── bin/audit-log.mjs          # CLI: log | verify | transcript | report
├── src/lib.mjs                # hash chain, verify, RPC helpers
├── src/report.mjs             # wallet scan, classifier, md/csv/pdf exporters
├── src/wait-receipt.mjs       # receipt poller (no cast wait quirks)
├── test/hashchain.test.mjs    # 7 unit tests (node:test)
├── config/config.example.yaml
├── demo/{run-live-demo,rebroadcast,broadcast-under-lock,finish}.sh
└── sample-output/             # real artifacts: transcripts, reports, receipts
state/audit-log.jsonl          # runtime log (gitignored, never committed)
```
