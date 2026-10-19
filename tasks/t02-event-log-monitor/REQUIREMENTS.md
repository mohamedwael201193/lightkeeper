# T02 — Official Requirements (quoted verbatim)

Source: Pharos Agent Arena Build page for T02, as captured in
`~/workspace/your_files/pharos-arena-MEGA.md` §4 (extracted read-only 2026-10-15).

**OFFICIAL:** (1) Chain MCP log queries filtered by contract address + event signature.
(2) Runs CONTINUOUSLY (polling/block-by-block); reports only NEW events, no duplicates.
(3) Decodes events into readable fields (from/to/amount/tx/block).
(4) Demonstrated catching ≥1 live or test event.

Additional implementation guidance from the LIGHTKEEPER research (non-official, stated as ours):
- Poller with chunked `get_logs` (≤1,000 blocks/call; topic0 = keccak256 of the event
  signature computed in code).
- Dedupe via `blockNumber:logIndex` seen-set with atomic persist-before-emit.
- 2-block confirmation lag for reorg tolerance; per-cycle logging.
- ~~Test event: a self-generated REAL dust transfer on Atlantic (explicitly allowed as
  "test event" — labeled, never fabricated).~~ **SUPERSEDED 2026-10-19 (v2):**
  the monitor now watches real USDC `Transfer` events on Pharos mainnet via
  Chain MCP `get_logs`; the v1 Atlantic self-generated test event is retained
  as labeled history only.
