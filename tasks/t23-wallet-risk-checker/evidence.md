# T23 Wallet Risk Checker — Evidence

## Summary

Built a read-only wallet risk checker for Pharos Atlantic testnet that runs
**8 real on-chain checks** per address (S1 account age, S2 tx count / funding
pattern, S3 native balance, S4 contract-vs-EOA + code verification, S5 recent
activity window, S6 interaction diversity from Transfer logs, S7 approval
hygiene from Approval logs, S8 flagged-address watchlist) and emits a
per-check PASS / FLAG / UNKNOWN / N/A report with raw values, plain-language
explanations, and a **disclosed-heuristic composite** (LOW/MED/HIGH). Every
number is a live chain read; the tool asserts chain ID 688689 before running
and never signs or broadcasts.

Demonstrated on **two real Atlantic addresses**: an established wallet
(deployer, relatively clean → **MED** with 1 hygiene flag disclosed) and a
fresh self-deployed fixture contract (risky pattern → **HIGH** with 3 flags).
Both reports below are from block-pinned runs (**block 31482629**) — the
Atlantic RPC is load-balanced and its nodes diverge on `latest` state for hot
wallets, while historical blocks are sticky-consistent, so the checker
supports `--block` pinning and the test suite cross-checks every raw value
against independent `cast` queries at the same block: **ALL TESTS PASSED**.

## Environment (all asserted live)

- Network: Atlantic testnet, chain ID **688689** (`eth_chainId` → `0xa8231`)
- RPC: `https://atlantic.dplabs-internal.com`
- Explorer: `https://atlantic.pharosscan.xyz/`
- Tool: `node bin/run.mjs` (Node 24, stdlib only, JSON-RPC; no private key used)

## Example A — established wallet (relatively clean)

Address: `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`
Explorer: https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
Report block: **31482629** (pinned) · Composite: **MED** (heuristic — 1 check flagged)

| Check | Verdict | Raw values |
|---|---|---|
| S1 account age | PASS | first activity block 24340730; 7,141,899 blocks ≈ 167.7 days (threshold 50,000) |
| S2 tx count / funding | PASS | nonce 137; balance 5.865699109313799106 PHRS |
| S3 balance | PASS | 5.865699109313799106 PHRS @ block 31482629 (context) |
| S4 account type | PASS | EOA, no bytecode |
| S5 activity window | PASS | 109 effective outbound txs in last 10,000 blocks (threshold 500) |
| S6 diversity | PASS | 31 transfer events involving address, 5 distinct counterparties |
| S7 approvals | **FLAG** | 11 approval events, 4 spenders, **6 unlimited approvals** — genuine hygiene finding: each unlimited approval lets the spender move all of that token |
| S8 watchlist | N/A | no flagged-address set configured for Atlantic testnet (check not applicable, excluded from composite) |

## Example B — risky pattern (fresh fixture contract)

Address: `0x2459eC8B2ca982a8c2C6188c098701177D63EC43` (T23RiskFixture — self-deployed **test fixture**, explicitly labeled; demonstrates flag mechanics on a known-benign contract, never an accusation)
Explorer: https://atlantic.pharosscan.xyz/address/0x2459eC8B2ca982a8c2C6188c098701177D63EC43
Report block: **31482629** (pinned) · Composite: **HIGH** (heuristic — 3 checks flagged)

| Check | Verdict | Raw values |
|---|---|---|
| S1 account age | **FLAG** | creation block 31481833; 796 blocks old (threshold 50,000) |
| S2 tx count / funding | **FLAG** | nonce 1 (creation only, EIP-161), 0 effective outbound; balance 0.001 PHRS — freshly funded and idle |
| S3 balance | PASS | 0.001 PHRS @ block 31482629 (context) |
| S4 account type | UNKNOWN | contract, 343 bytes bytecode; source verification **unknown** — explorer verification API unreachable (unknown is not treated as safe) |
| S5 activity window | PASS | 0 effective outbound txs in window (creation nonce excluded) |
| S6 diversity | **FLAG** | 0 transfer events involving address, 0 counterparties in 10,000 blocks |
| S7 approvals | PASS | 0 approvals in window |
| S8 watchlist | N/A | as above |

## Fixture deployment log (nothing hidden)

| # | Action | Tx hash | Block | Status |
|---|---|---|---|---|
| 1 | Deploy T23RiskFixture v1 (no `receive()`) | `0x31be16ea86cf0d921fe1828c783adf9456daa7aece479bf1825c902ccc63657d` | 31481756 | success → `0x131063513a0E60e87bF74521ae19A161cf296EFf` (**superseded**: funding reverted without `receive()`) |
| 2 | Deploy T23RiskFixture v2 (with `receive()`) | `0xe0e0323267bcf8ba922695802005ce4aa1656d5188c8ea9f724d455cebafd79f` | 31481833 | success → `0x2459eC8B2ca982a8c2C6188c098701177D63EC43` |
| 3 | Fund fixture with 0.001 PHRS | `0x270a075a90f3bdb71f10d86cb0877205901cd085dfd526f47ebe6d0df8ef5c66` | 31481847 | success |

Note: `forge create --broadcast` worked against this RPC (the coordinator's
`forge script --broadcast` PARAM_VERIFY_ERROR did not affect `forge create`).

## Spend log (all dust, Atlantic testnet)

| Tx | gasUsed × effectiveGasPrice (1,000,000,001 wei) | Cost (PHRS) |
|---|---|---|
| v1 deployment | 117,039 × 1,000,000,001 | 0.000117039000117039 |
| v2 deployment | 127,307 × 1,000,000,001 | 0.000127307000127307 |
| fixture funding (gas) | 21,055 × 1,000,000,001 | 0.000021055000021055 |
| fixture funding (value) | — | 0.001 |
| **Total** | | **≈ 0.001265401000265401 PHRS** |

Budget: ≤ 0.15 PHRS. Spent: ~0.00127 PHRS. The checker itself is read-only and spends nothing.

## Tests

`node test/run-tests.mjs` runs the checker live on both addresses (pinned to a
finalized historical block via `--block`, because the load-balanced Atlantic
RPC diverges on `latest` state for hot wallets while historical blocks are
sticky-consistent) and asserts: balance == `cast balance --block <pin>`,
nonce == `cast nonce --block <pin>`, account type == `cast code`, window delta
== derived from `cast nonce` at both ends, ≥4 checks, verdict domain, every
check explained, every heuristic labeled, composite valid with disclosed
formula, fixture == HIGH, deployer != HIGH. Result: **ALL TESTS PASSED**.

## Honest limitations (also in README §7)

- Heuristics are statistical caution flags, not accusations; the composite must
  never be quoted without its formula and HEURISTIC label.
- Native PHRS transfers are invisible to the Transfer-log scan; approvals
  outside the 10,000-block window are not covered; never-active addresses
  report age UNKNOWN.
- Contract source verification is UNKNOWN while the explorer verification API
  is unreachable — contracts therefore floor at MED.
- S8 needs a configured watchlist to mean anything (none exists for Atlantic).
- Atlantic testnet only; chain-ID assertion refuses all other networks.
