# T13 Reviewer Notes

## What to check (30-second path)

1. Open `evidence/transcripts/logs.json` — question, two DOC-GROUNDED citations
   (URL + 2026-10-16 + excerpt), then `execution` with two real tx hashes.
2. Click the explorer links (both curl-verified 200 on 2026-10-16):
   - https://atlantic.pharosscan.xyz/tx/0x36564924532bfe15be4871f40bf533c0ceecbc045592dc348d60fad5faabf16b
   - https://atlantic.pharosscan.xyz/tx/0xf7f35529e142acf7dfe2a07225a68e7411182121445d51dc2b5395a56e2da0a7
3. Confirm the Transfer log's `transactionHash` in the transcript equals the
   transfer tx — the agent verified its own answer against the chain.
4. Run `python3 tests/test_transcripts.py` — 10/10, including a live
   `eth_getLogs` re-query (read-only, no new broadcasts).

## Design decisions

- **Why WPHRS, not a deployed fixture:** the official Token Registry page lists
  WPHRS (`0x838800b758277CC111B2d48Ab01e5E164f8E9471`, 18 decimals) on Atlantic.
  Using the canonical wrapped token keeps every claim DOC-GROUNDED instead of
  self-asserted. Its `name()` returns "Wrapped Pharos" on-chain.
- **Why the logs transcript broadcasts:** `eth_getLogs` needs something real to
  find. A dust `deposit()` (0.0005 PHRS) creates the footprint; because this
  WPHRS contract's `deposit()` emits `Deposit` only, a dust `transfer()`
  (0.0001 WPHRS, self→self) creates the `Transfer` log the question is about.
  Both txs are status `0x1`.
- **Why `--from` on estimate:** `cast estimate` defaults to the zero address,
  which reverts on balance checks. The transcript passes the real sender so the
  estimate reflects the actual call.
- **Why 4 transcripts:** the official text says "≥2 different functions";
  3 executions (balanceOf/decimals, transfer-estimate, getLogs) doubly satisfy
  it, and the 4th is the mandated fail-closed probe (docs don't cover WPHRS
  pricing → `[UNVERIFIED]`, nothing executed).

## Findings

- **Docs-vs-chain mismatch (2026-10-16, curl-verified live):** the corpus token-registry page says
  WPHRS's name is "Wrapped PHRS"; the contract's `name()` returns "Wrapped Pharos" on-chain.
  The console try module's 04 VERDICT renders this as DOCS ≠ CHAIN with the contract as live
  truth. `symbol()` ("WPHRS") and `decimals()` (18) agree with the docs (DOCS ≡ CHAIN).
  This is exactly the behavior the loop is built for: proof that can disagree with the docs.

## Honest limitations

- The "Docs MCP" here is retrieval over 6 real docs.pharos.xyz pages fetched
  2026-10-16 — not the portal-embedded Docs MCP (no public API; `?ask=` 403s
  plain GETs) and not the mainnet-only hosted Chain MCP. The loop (docs →
  execute → interpret) is identical; the surfaces are the public ones a
  reviewer can re-verify. Nothing is faked to look like the portal.
- Corpus is intentionally small (6 pages). Questions outside it get
  `[UNVERIFIED]` by construction — demonstrated, not just claimed.
- Gas costs are point-in-time (gas price 1–10 gwei observed); gas *amounts* are
  exact. Total spend 0.000055914 PHRS vs 0.15 budget.
- `cast logs` without `--json` prints empty stdout even when logs exist
  (found during build); the agent uses `--json` — documented here so the
  behavior isn't mistaken for missing logs.
- Video is pending (see VIDEO-GUIDE.md); all terminal/explorer footage will be
  the real artifacts above, no staged fakes.
