# T23 — Wallet Risk Checker: Official Requirements (quoted VERBATIM)

Source: Pharos Season of AI Agent Arena, T23 Build page, extracted 2026-10-15
(via `~/workspace/your_files/pharos-arena-MEGA.md` §4, T23 entry).

> **OFFICIAL:** (1) Checks ≥4 signals (contract age, verified code,
> flagged-address interaction, unusual approvals, freshly-funded wallet...).
> (2) Outputs risk level (low/med/high) WITH specific reasons.
> (3) Plain-language explanation per flag.
> (4) Demonstrated on ≥1 clean AND ≥1 risky example.

## How this build maps to each requirement

| # | Requirement | Satisfied by |
|---|---|---|
| 1 | Checks ≥4 signals | 8 real on-chain checks: S1 account age (first-activity block), S2 tx count / freshly-funded pattern, S3 native balance, S4 contract-vs-EOA + code verification, S5 recent activity window, S6 interaction diversity (Transfer logs), S7 unusual approvals (Approval logs), S8 flagged-address watchlist |
| 2 | Risk level (low/med/high) WITH specific reasons | Disclosed-heuristic composite: HIGH if watchlist hit or ≥3 FLAGs; MED if 1–2 FLAGs or any UNKNOWN; LOW if 0 FLAGs and 0 UNKNOWNs. The specific reasons are the per-check FLAG/UNKNOWN verdicts listed above the composite in every report |
| 3 | Plain-language explanation per flag | Every check carries a plain-language `explanation` field; every heuristic is labeled HEURISTIC |
| 4 | ≥1 clean AND ≥1 risky example | Example A (established wallet): deployer `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` — 168-day-old EOA, active, 2 hygiene flags → MED (heuristic). Example B (risky pattern): fresh fixture contract `0x2459eC8B2ca982a8c2C6188c098701177D63EC43` — 32 blocks old, unverified, freshly funded, 0 counterparties → HIGH (heuristic). Both with block numbers in `evidence.md` / `evidence.json` |

## Binding honesty constraints (from the task contract)

- Every number in a report is a live chain read (Atlantic testnet, chain ID 688689). No mocks, no invented scores.
- The composite level is a *disclosed heuristic* derived from the checks by a printed formula — never presented as an authoritative score.
- Heuristics are labeled HEURISTIC wherever they appear.
- The flagged-address check is reported N/A (not PASS) when no watchlist is configured — an unrun check is not a clean check.
- The "risky" example is a self-deployed, explicitly labeled TEST FIXTURE demonstrating flag mechanics — never an accusation against a third party.
