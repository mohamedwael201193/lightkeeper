# T24 — Audit-Log Agent — Official Requirements

**Source:** Pharos Season of AI Agent Arena, T24 Build page, extracted read-only 2026-10-15
into `~/workspace/your_files/pharos-arena-MEGA.md` §4 (Medium, 100 pts, Compliance / Security).
Quoted VERBATIM below — reviewers score against this list.

**OFFICIAL:**
1. Accepts wallet + date range.
2. Groups activity (transfers in/out, swaps, approvals, contract interactions).
3. Totals per category + notable txs with links.
4. EXPORTS report as Markdown/PDF/CSV.

## How this build satisfies each requirement

| # | Requirement | Where it is satisfied (verifiable in this folder) |
|---|---|---|
| 1 | Accepts wallet + date range | `bin/audit-log.mjs report --wallet <addr> --from-date/--to-date/--from-block/--to-block`; dates resolve to blocks via live-measured avg block time (method disclosed in report header) |
| 2 | Groups activity (transfers in/out, swaps, approvals, contract interactions) | `src/report.mjs`: native transfers in/out (block scan), ERC-20 Transfer events (getLogs), Approval events (getLogs), swap events (Uniswap V2/V3 topics), contract interactions (wallet-sent txs with non-empty input + logs touching wallet) |
| 3 | Totals per category + notable txs with links | Report output: totals table + "Notable transactions" with `https://atlantic.pharosscan.xyz/tx/<hash>` links; `evidence.json` carries the same links |
| 4 | EXPORTS report as Markdown/PDF/CSV | `sample-output/audit-report-*.md`, `*.csv`, `*.pdf` — generated from live RPC data, hand-rolled PDF with real content |

## Task-specific extension (T24 build order)

Beyond the four official bullets, this build is also an **audit log of the agent's own
actions**: an append-only, hash-chained local log (`state/audit-log.jsonl`, each entry
`timestamp, actor, action, params, txHash, prevHash → entryHash`) recording the REAL
actions run in the demo — ≥2 real dust txs plus the read actions around them — with a
`verify` command that replays the chain and proves tamper-evidence (tamper-demo run on a
COPY; the original verifies PASS before and after). See `evidence.md` for the transcript.
