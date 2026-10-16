# T07 — Evidence

All activity on Pharos Atlantic testnet (chain ID 688689). Explorer: `https://atlantic.pharosscan.xyz/tx/<hash>`.
Deployer (shared test key): `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`.

## 1. Venues deployed (real contracts, real reserves)

| Contract | Address | Deploy tx |
|---|---|---|
| WPHRS (test wrapped native) | `0x8a81455a477deeA986ca48cE83ca89C5331Da793` | see evidence.json |
| TKB (test USD) | `0x8BAa4fD0329dbf77c9fBFC44448B5669D356bfe1` | see evidence.json |
| poolA (1000 WPHRS / 1000 TKB) | `0x8683C6D6EeAA57B03688f43Ad0cbCA0af26Cf464` | see evidence.json |
| poolB (1000 WPHRS / 980 TKB) | `0x432BCd7bc6944Def44015bF00C82Eb50aA18A3F6` | `0x0592a0075a8a48848c3b32240f4ee05bda954d0f5c59ef1407813859a7f695e0` |
| poolC (1000 WPHRS / 1020 TKB) | `0x3f0ae6f640f067B2532194a0ef2c869Aa49E587D` | `0x3a0bc2631f958f13a016f3608eb98157a9e9b50efab994a26efc87106041e1fc` |

Setup txs: 2 mints (`0xf44fa64b…90dd0`, `0x469add8f…add40ed`), 6 approvals, 3 seeds (`0x0358cd6c…9853c347`, `0x8930f5f9…46cdd8a8`, `0x9f7fd60c…282d2c2f`) — full list in evidence.json. Source: `src/MockToken.sol`, `src/ArbPool.sol` (original code; `forge script --broadcast` is broken on this RPC — see REVIEWER_NOTES.md — so `forge create --broadcast` + `cast send` were used with identical bytecode).

## 2. Scan run transcripts (from `scans.jsonl`, unedited)

### Scan 1 — ACT + real on-chain execution
- `scan_id`: `t07-1792124602` · pinned block **31482138** · tip at decision 31482182 (within 50-block staleness limit)
- Venues read (parallel `eth_call` at pinned block): poolA 1000/1000, poolB 1000/980, poolC 1000/1020 (WPHRS/TKB, wei)
- Candidates evaluated: **12** (3 venues × 2 orders × 2 start tokens)
- Best route: **WPHRS → TKB on poolC → WPHRS on poolB**, trade size 10 WPHRS
- Cost decomposition (wei):
  - leg1 out: 10069011950850025248 TKB · leg2 out: 10139809535909437998 WPHRS
  - gross: **139809535909437998**
  - fee leg1 (30bps on 10 WPHRS notional): 30000000000000000
  - fee leg2 (30bps on 10.069… TKB notional): 30207035852550075
  - slippage total (vs zero-fee ideal, same reserves): 60198614842672484
  - gas: 175834 units × 10 gwei = 1758340000000000 (PHRS == WPHRS 1:1 by test construction)
  - **net: 138051195909437998 > threshold 50000000000000000 → ACT**
- Execution (opt-in `--execute`, `flock`-serialized broadcasts):
  - leg1: `0x39fe2154abde86a58418d85667dbec826207b3733eeadb81a877c85e2185de30` — receipt **status 1**, gasUsed 68728
  - leg2: `0xdcd894bb8bd2f981f2af78425bb58623f26c724502212b24820f2fca380c58ad` — receipt **status 1**, gasUsed 68760
- Post-state: deployer WPHRS balance **7000 → 7000.139809535909437998** (delta == predicted gross to the wei; gas paid separately in PHRS)

### Scan 2 — SKIP / BELOW_THRESHOLD (the threshold gate works)
- `scan_id`: `t07-1792124910` · pinned block **31482387** · threshold **0.5 WPHRS** (via `config-skip.json`)
- Same real spread: net 138051195909437998 wei < 500000000000000000 wei threshold
- Decision **SKIP**, `skip_reason: BELOW_THRESHOLD`, note: `net 138051195909437998 wei <= threshold 500000000000000000 wei`
- **No broadcast attempted** (`execution_tx_hashes` absent) — the gate held.

### Scan 3 — SKIP / NEGATIVE_NET (the honest "no opportunity" path)
- `scan_id`: `t07-1792124784` · pinned block **31482299** · run minutes after Scan 1's execution consumed the spread
- Best route net: **−253033563746112688 wei** → decision **SKIP**, `skip_reason: NEGATIVE_NET`
- This is the market responding to our own arb, reported truthfully — the deliverable the thin-liquidity risk section asked for.

### Scan 4 — SKIP / EXECUTION_FAILED (kept, not hidden)
- `scan_id`: `t07-1792124498` · pinned block **31482069**
- The route was ACT-worthy (net 138051195909437998), but the builder's shell lacked `cast` on PATH: `flock: failed to execute cast: No such file or directory`.
- Recorded as `SKIP / EXECUTION_FAILED` with the stderr captured; the scan was re-run as Scan 1. Append-only means append-only.

## 3. Re-seed (restoring spreads for the BELOW_THRESHOLD demo)

Owner-only `seed()` re-called on all three pools (reserves overwritten to documented ratios):
- poolA: `0x6b9b8d9ec3b57793b5e7a284b9bd7cf356639ace1bc24fd109c891be49624489`
- poolB: `0xa5affcde830d7a44fd74d7a3dd9f902534dfce20801ad3d7a7a475ecb70cfd19`
- poolC: `0xfb2ab4a0b3ad3055c6a77a929a329d32add7594c57c5279dd5ef33bd02b833a9`

## 4. Tests

`python3 test_math.py` — **10/10 pass**, including:
- `test_quote_matches_independent_fixture`: quoter == independently hand-derived value `10071012252896552420`
- `test_quote_equals_onchain_getAmountOut`: Python math == `ArbPool.getAmountOut` via `eth_call` at a pinned block (live)
- fee-on-notional exactness, slippage baseline, net-identity, no-liquidity → None, profitable-direction detection

## 5. Spend log

21 T07-attributable broadcasts (5 deploys, 2 mints, 6 approvals, 3 seeds, 2 arb legs, 3 re-seeds). Per-tx `gasUsed × effectiveGasPrice` summed from receipts — see `evidence.json` → `spend`. Total within the 0.15 PHRS task budget. (The shared deployer key's other nonces belong to other task workers and are not counted.)
