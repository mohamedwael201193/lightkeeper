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

**Interactive console demo (new):** LIGHTKEEPER console "Try it live":
`apps/console/src/components/try/whale-watching-agent.tsx` (Tier A — live reads only,
no wallet, costs nothing). "Whale radar": configurable PHRS threshold (default 1)
+ block window (default 20, max 100); polls latest blocks via `eth_getBlockByNumber`
(full transactions — native transfers emit no logs), filters ≥ threshold, renders
from → to → value rows ranked largest-first with explorer links; Refresh + labeled
auto-refresh (30s, off by default, on/off switch — never silent background spam);
honest empty state on quiet water. No USD conversion (no price feed exists);
counterparties shown shortened, never invented.
