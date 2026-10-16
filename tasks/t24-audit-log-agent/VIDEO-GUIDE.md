# VIDEO GUIDE — T24 Audit-Log Agent (45–90 seconds)

**Target:** 60 seconds. One continuous screen recording, no cuts hiding work.
**Rule:** REAL terminal + REAL explorer pages only. No staged fakes, no mock data,
no pre-typed outputs passed off as live.

## Shot list (shot-by-shot)

| # | Time | What the viewer sees | You say (spoken script) |
|---|---|---|---|
| 1 | 0:00–0:08 | Terminal: `cd tasks/t24-audit-log-agent && cat task.yaml` | "T24, the Audit-Log Agent. Every action this agent takes is written to an append-only, hash-chained log — timestamp, actor, action, parameters, tx hash, and a hash linking it to the previous entry." |
| 2 | 0:08–0:20 | Terminal: `node bin/audit-log.mjs verify` → `entries checked: 22 / VERIFY: PASS — chain intact…` | "The verify command replays the whole chain — 22 entries. If anyone edits a single field of a single entry, the hash of that entry changes and every link after it breaks." |
| 3 | 0:20–0:35 | Terminal: tamper a COPY (one character: entry #12 `"0.0001"` → `"0.0002"`), run verify on the copy → `VERIFY: FAIL / entry #12: entryHash mismatch`; then verify the original → PASS | "Here I tamper a copy — I flip ONE character in entry twelve. Verification fails on the copy, naming the exact entry. The original log is untouched and still verifies." |
| 4 | 0:35–0:55 | Browser: `https://atlantic.pharosscan.xyz/tx/<dust-tx-1>`, `<dust-tx-2>`, then the chain-anchor tx `<anchor-tx>` — show the Input Data field equals entry #20's hash | "The log isn't just self-referential. These are two real dust transfers the agent executed on Atlantic — both recorded in the log, both visible here. And this third transaction is the chain anchor: its input data IS the log head's hash — the local chain is pinned to Atlantic itself." |
| 5 | 0:55–1:05 | Terminal: `ls sample-output/` showing `audit-report-*.md`, `*.csv`, `*.pdf` | "And the wallet activity report — grouped transfers, approvals, contract interactions, totals per category, notable transactions with links — exported as Markdown, CSV and PDF, all from live chain data." |
| 6 | 1:05–1:30 | Browser: the task page on the LIGHTKEEPER console, "Try it live" section | "And anyone can verify it in their browser — the real 22-entry chain is prefilled, every hash recomputes live. There's a red-team lab: flip one character, forge the hash, delete an entry, swap two entries — each attack names the exact broken entry. And the anchor table confirms all three transactions live on Atlantic, including the calldata check. That is tamper-evidence you can feel." |

## Interactive-surface shot notes

- Shot 6 is filmed on the PUBLIC face of the task page (no founder-only content):
  the "Try it live" section loads the real 22-entry chain and shows CHAIN VALID.
- Red-team lab: click each attack — "Flip one character" → BROKEN AT ENTRY 12;
  "Flip + forge the hash" → BROKEN AT ENTRY 13 (the forged hash can't fix the
  next link); "Delete an entry" → BROKEN AT ENTRY 5; "Swap two entries" →
  BROKEN AT ENTRY 6. The original textarea above stays visibly untouched.
- Chain strip: click any node to inspect the entry (stored vs live-recomputed hash).
- Optional: click "Confirm all three on Atlantic" to show the two dust receipts
  (status 0x1, blocks 31483610 and 31483646) plus the chain-anchor tx with
  "input == entry #20 hash ✓" from the public Atlantic RPC.

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
