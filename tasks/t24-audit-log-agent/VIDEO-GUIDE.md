# VIDEO GUIDE — T24 Audit-Log Agent (45–90 seconds)

**Target:** 60 seconds. One continuous screen recording, no cuts hiding work.
**Rule:** REAL terminal + REAL explorer pages only. No staged fakes, no mock data,
no pre-typed outputs passed off as live.

## Shot list (shot-by-shot)

| # | Time | What the viewer sees | You say (spoken script) |
|---|---|---|---|
| 1 | 0:00–0:08 | Terminal: `cd tasks/t24-audit-log-agent && cat task.yaml` | "T24, the Audit-Log Agent. Every action this agent takes is written to an append-only, hash-chained log — timestamp, actor, action, parameters, tx hash, and a hash linking it to the previous entry." |
| 2 | 0:08–0:20 | Terminal: `node bin/audit-log.mjs verify` → `VERIFY: PASS — chain intact…` | "The verify command replays the whole chain. If anyone edits a single field of a single entry, the hash of that entry changes and every link after it breaks." |
| 3 | 0:20–0:35 | Terminal: tamper a COPY, run verify on the copy → `VERIFY: FAIL / entry #3: entryHash mismatch`; then verify the original → PASS | "Here I tamper a copy — I rewrite entry three's value. Verification fails on the copy, naming the exact entry. The original log is untouched and still verifies." |
| 4 | 0:35–0:50 | Browser: `https://atlantic.pharosscan.xyz/tx/<dust-tx-1>` then `<dust-tx-2>` — show both mined dust transfers, status success | "The log isn't just self-referential. These are two real dust transfers the agent executed on Atlantic testnet — both recorded in the log with their real transaction hashes, both visible here on the explorer." |
| 5 | 0:50–1:00 | Terminal: `ls sample-output/` showing `audit-report-*.md`, `*.csv`, `*.pdf` | "And the wallet activity report — grouped transfers, approvals, contract interactions, totals per category, notable transactions with links — exported as Markdown, CSV and PDF, all from live chain data." |
| 6 | 1:00–1:20 | Browser: the task page on the LIGHTKEEPER console, "Try it live" section | "And anyone can verify it in their browser — the real chain is prefilled, every hash recomputes live. Watch: I flip ONE character in a copy of entry twelve — and the verifier names the exact broken entry. That is tamper-evidence you can feel." |

## Interactive-surface shot notes

- Shot 6 is filmed on the PUBLIC face of the task page (no founder-only content):
  the "Try it live" section loads the real 15-entry chain and shows CHAIN VALID.
- Click "Tamper one character in a copy (entry #12)" → the tampered copy's chip reads
  BROKEN AT ENTRY 12 with "entryHash mismatch — field content was altered after logging";
  the original textarea above is visibly untouched.
- Optional: click "Confirm both mined on Atlantic" to show the two live receipts
  (status 0x1, blocks 31483610 and 31483646) from the public Atlantic RPC.

## Recording notes

- Record at 1080p, terminal font ≥14pt. Keep the prompt line visible so the
  commands are readable as you type them (type them live — do not paste a
  wall of text).
- The tamper shot MUST show the copy's filename (`audit-log.tampered-copy.jsonl`)
  distinct from the original (`state/audit-log.jsonl`).
- Open the explorer links in the same recording session — real page loads,
  scrolled to the tx status/value fields.
- Suggested title: "LIGHTKEEPER T24 — Audit-Log Agent: hash-chained audit log of real agent actions (Pharos Atlantic)".
- Upload unlisted to YouTube; paste the link into SUBMISSION.md's video slot.
