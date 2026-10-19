# T10 — Batch Executor — Official Requirements (quoted verbatim)

Source: `~/workspace/your_files/pharos-arena-MEGA.md` §372 (extracted from the
official Build pages by 5 browsers).

## OFFICIAL

> **OFFICIAL:** (1) Accepts ≥3 independent actions. (2) Executes as batch
> (multicall / single prepared tx). (3) Reports gas saving vs individual.
> (4) Handles partial failure clearly (which failed, what happened to rest).

## Implementation guidance (MEGA, quoted)

> **Implementation:** Multicall3 `aggregate3Value` with `allowFailure=true` —
> per-call `(success, returnData)` makes partial failure demonstrable on-chain.
> If no canonical Multicall3 is verified on Atlantic, deploy it via Foundry
> (dust) and record address + deployment tx rather than hardcoding an
> unverified address. Gas saving from real `estimateGas` sums vs receipt
> `gasUsed`. Partial-failure demo: one intentionally reverting action, clearly
> labeled. Per-action `eth_call` preflight.

> **Evidence:** batch receipt with per-call results, gas-saving report
> (estimated-individual vs actual), partial-failure run log, share link.

> **Video:** 3+ actions → one batch tx → per-call results → gas saved →
> a failing action isolated.

> **Risks:** Multicall3 availability (deploy-if-missing plan); `0x174dea71`
> selector VERIFY LIVE.

## The 3 official batch modes (MEGA §248, per SkillEngine airdrop reference)

> batch has 3 official modes (per skill-engine airdrop reference:
> ≤10 simple mode / 11–200 single batch / >200 multi-batch).

- **≤ 10 recipients:** Simple mode — sequential transfers in-script, no contract.
- **11–200 recipients:** Single-batch Distributor mode — one hardened
  Distributor contract call completes all transfers in one transaction.
- **> 200 recipients:** Multi-batch Distributor mode — Distributor contract,
  `distribute` called in chunks (≤200 per call), supports CSV input.

## Task bar (verdict row, MEGA §640)

| T10 | Flotilla | L1 L3 L6 L10 | One batch tx; gas-saving report; isolated partial failure |
