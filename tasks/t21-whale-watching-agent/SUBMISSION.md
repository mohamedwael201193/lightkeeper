# T21 — Arena Submission Pack (copy-paste ready)

> Paste each field into the Pharos Season of AI Agent Arena per-task submission form.
> Video: PENDING-VIDEO — film with `VIDEO-GUIDE.md`, then replace the slot below.

---

**Title:**
Whale-Watching Agent — ranked leviathan reports on Atlantic testnet

**One-liner:**
A read-only monitor that scans Atlantic blocks for large native PHRS transfers and
produces ranked, explained whale reports plus a summary view across all watched addresses.

**Description:**
T21 watches Atlantic testnet (chain 688689) for significant transfers. Native PHRS moves
emit no logs, so the agent reads blocks directly (full transactions, value ≥ 0.05 PHRS —
threshold set at 5× the max transfer observed in a 100-block sample of real traffic);
ERC-20 Transfer logs are scanned in ≤1,000-block chunks with a real keccak-256 topic.
Every match becomes an explained report (what / how much / from → to, labelled where
known — unknown counterparties are shown shortened, never invented), ranked largest-first,
with a summary view across all six watched addresses (in/out counts, totals, last block).
Dedupe state (`txhash` / `txhash:logIndex`) guarantees no repeat alerts; quiet windows
produce honest empty states. Live evidence: a full scan transcript plus a real 0.05 PHRS
transfer executed on Atlantic (block 31482165, tx
`0xf566e34c25ca3c32dc4f6c687b7345501ea8da065398d71e9b87bc246371ba70`) — disclosed in
the report as self-seeded, never presented as organic. 16 unit tests green.

**Repo link (commit-pinned):**
https://github.com/mohamedwael201193/lightkeeper/tree/050bfbf/tasks/t21-whale-watching-agent

**Proof link:**
https://atlantic.pharosscan.xyz/tx/0xf566e34c25ca3c32dc4f6c687b7345501ea8da065398d71e9b87bc246371ba70

**Video link:**
PENDING-VIDEO

**Reviewer notes:**
See `REVIEWER_NOTES.md` in the task folder: 60-second verification map, reproduction
commands, and the honesty notes (threshold justification, self-seed disclosure, label
policy, quiet-window policy). Total on-chain spend for this task: 0.050021 PHRS
(self-seeded transfer + gas; the agent itself is read-only).

**Interactive console demo:** LIGHTKEEPER console "Try it live":
`apps/console/src/components/try/whale-watching-agent.tsx` (Tier A — live reads only,
no wallet, costs nothing). Configurable "whale radar": PHRS threshold (default 1)
+ block window (default 20, max 100) + the agent's six-address watchlist with honest
on-chain labels — moves touching the watchlist get a `watched · <label>` chip;
unknown counterparties shown shortened, never invented. Reads via
`eth_getBlockByNumber` (full transactions — native transfers emit no logs) using ONE
batched JSON-RPC round trip per 50 blocks (RPC-verified: 50 blocks in ~12s vs ~3min
sequential), renders from → to → value rows ranked largest-first with explorer
links, plus a stat strip (largest move, whale volume) and a session field log of
past scans. Refresh is manual-only plus a labeled auto-refresh (30s, off by default,
interval killed on unmount). Honest empty state on quiet water; every failure gets
a plain-language message + a Retry-scan button. No USD conversion (no price feed
exists). Verified live 2026-10-16: a fresh 20-block scan surfaced a real organic
5.317112716533166 PHRS move (block 31486556,
`0x945603168a3d3ba0036497255489804888f6766bcfd3e8f4e5ecf099ce2c8ee8`).
