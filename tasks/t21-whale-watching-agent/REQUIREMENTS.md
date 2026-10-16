# T21 — Official Arena Requirements (quoted VERBATIM)

Source: `~/workspace/your_files/pharos-arena-MEGA.md` § "T21 — Whale-Watching Agent (Medium, 100 · Trading/Monitoring)".

---

### T21 — Whale-Watching Agent (Medium, 100 · Trading/Monitoring)

**OFFICIAL:** (1) Tracks ≥5 configurable addresses. (2) Configurable 'significant' threshold per token or value. (3) Each report explains the move (what/how much/where to, labelled where known). (4) Summary view of recent activity across ALL watched addresses.

**Implementation:** config (≥5 addresses, per-token thresholds, labels); chunked Transfer-topic scans; decoder producing per-move reports (labels where known — never fabricated labels); summary view across all addresses; dedupe + state. Quiet windows: honest empty states; self-seeded testnet transfer for the live-capture demo if needed.

**Evidence:** config, per-move reports, summary view, live-capture demo, share link.

**Video:** watchlist → a move → explained report → summary view.

**Risks:** no USD price feed → thresholds in token/native units (honest); native transfers aren't in logs (document the boundary).

---

## How this build satisfies each requirement

| # | Official requirement | Satisfied by |
|---|---|---|
| 1 | Tracks ≥5 configurable addresses | `src/config.yaml` → `watchlist` (6 addresses, validated: <5 is a hard error) |
| 2 | Configurable 'significant' threshold per token or value | `native_threshold_phrs: 0.05` + per-token `threshold_tokens` in `tokens:` |
| 3 | Each report explains the move (what/how much/where to, labelled where known) | `explain_move()` in `src/whale_watch.py`: what (asset+amount), how much, from→to with config labels, explorer link; unknown counterparties shown shortened with "(unlabeled — observed on-chain only)" — never invented |
| 4 | Summary view of recent activity across ALL watched addresses | `build_summary()` + report's "Summary view" table: in/out counts, totals, last block per address; quiet addresses show honest zeros |

Known-boundary handling (per "Risks"): native PHRS transfers emit no logs, so the
agent reads blocks directly (`eth_getBlockByNumber` with full transactions) —
documented in code and README. No USD price feed exists on Atlantic, so thresholds
are in native/token units — stated honestly everywhere, never converted to fiat.
