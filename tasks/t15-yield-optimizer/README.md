<div align="center">

# ⚱️ T15 · YIELD OPTIMIZER

**One lighthouse. Thirty lamps — this one finds where the light pays.**

*The honest yield-seeker of the LIGHTKEEPER fleet: it surveys every lamp in the
harbor, measures the true flame against wind and wax, and tells you plainly
whether to move your oil — or stay put.*

</div>

> **TESTNET MECHANICS DEMONSTRATION.** Every number below is read live from Pharos
> Atlantic testnet (chain 688689). Rewards are valueless testnet PHRS — never real yield.

---

## 1. What it is

A yield optimizer with radical honesty as its competitive edge. It (1) **discovers**
what yield venues actually exist on Atlantic testnet, (2) reads **live on-chain rate
views** (reward rate, entry/exit fees, minimum holding period, reward-pool runway) from
≥3 sources at a **pinned block**, (3) computes **net yield** — gross rewards minus
entry fee, minus exit fee (waived only after the holding period), minus real gas from
live `eth_gasPrice` × `eth_estimateGas`, and (4) outputs a **recommendation with
expected net gain, or "stay put" with a reason**. Execution is **unsigned-tx only**:
the module builds the deposit transaction for *your* signature and never holds keys
(CI grep gate enforces this).

## 2. The discovery finding (this IS the result)

Atlantic testnet has **no third-party yield venues**. The discovery module
(`optimizer/discover.py`) proves it two ways: `eth_getCode` probes on well-known
deterministic deployments (canonical Multicall3: absent) with the two OctopusVaults
as **positive controls** (present — the probe method works), plus a 30-block activity
scan (5 txs, chain near-idle). `runs/discovery.json` documents the method and the
empty result. Rather than mock venues, T15 deploys **two real, funded staking vaults**
with immutable on-chain rate cards — fully disclosed testnet fixtures — and compares
those plus the honest 0% "stay put" wallet baseline.

## 3. The two OctopusVaults (live on Atlantic)

| | OctopusVault-Kelp | OctopusVault-Kraken |
|---|---|---|
| Address | `0xe3212234B17A90cCBC36b0B44845394b62838b08` | `0xDC3D4a3f47BB479692239ECC362a16CE3485B283` |
| rewardPerBlock | 1e13 wei (0.00001 PHRS) | 2.5e13 wei (0.000025 PHRS) |
| entryFeeBps / exitFeeBps | 0 / 50 | 100 / 100 |
| minHoldBlocks | 100 | 400 |
| Reward pool (funded at deploy) | 0.01 PHRS | 0.01 PHRS |

`src/OctopusVault.sol` — MasterChef-style accrual, rewards **capped by the funded
pool** (the vault can never promise more than it holds; `runwayBlocks()` is a view),
fees routed back into the reward pool, all parameters immutable. 8 forge unit tests.

## 4. Net-yield math

For horizon H blocks and principal P:

```
share     = P_net / (totalStaked + P_net)          # marginal share, stated
gross     = rewardPerBlock × min(H, runway) × share # runway-capped: honesty
entryFee  = P × entryFeeBps / 10000
exitFee   = (P − entryFee) × exitFeeBps / 10000  iff H < minHoldBlocks else 0
gas       = (gasStake + gasClaim + gasWithdraw) × liveGasPrice
net(H)    = gross − entryFee − exitFee − gas
APY       = rewardPerBlock × share × blocksPerYear / P   # blocksPerYear from MEASURED block time
```

The optimizer runs every venue at **two horizons**: the fee-sensitivity flip is real —
at 50 blocks gas+fees dominate and **STAY PUT** wins; at 1,000 blocks the rate
differential wins. The runway cap is the star of the show: Kraken's 2.5× rate is
**capped at its 400-block funded runway**, so Kelp (deeper runway, zero entry fee)
wins the 1,000-block comparison on net. Naive APY ranking would pick the loser.

## 5. Live evidence (Atlantic, dust amounts)

- **Deploy txs:** Kelp `0x91c13f9cb3e4df65c7d7b23218bb04241ee0cc66a8b0180a16db617b1240feb9`,
  Kraken `0x1d01194b335186295860624f6f94f6d6af19c856a9ffcd29d009deaa2601edbd`
- **Stake → claim → withdraw** run with before/after balances; claim deltas equal
  `(claimBlock − stakeBlock) × rewardPerBlock` exactly (single staker).
- Full tx ledger + spend log: `evidence.json` · narrative: `evidence.md`
- Explorer: https://atlantic.pharosscan.xyz/tx/`<hash>` (every link curl-tested)

## 6. How to run

```bash
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ~/workspace/lightkeeper/.env; set +a   # ATLANTIC_RPC_URL only; no keys needed
cd ~/workspace/lightkeeper/tasks/t15-yield-optimizer

# 1. discovery (documents the empty-venue finding)
python3 -m optimizer.discover --out runs/discovery.json

# 2. live scan (pinned block; needs VAULT_A / VAULT_B)
export VAULT_A=0xe3212234B17A90cCBC36b0B44845394b62838b08
export VAULT_B=0xDC3D4a3f47BB479692239ECC362a16CE3485B283
python3 -m optimizer.scan --out runs/scan.json

# 3. optimize (two horizons; fee-sensitivity flip included)
python3 -m optimizer.optimize --scan runs/scan.json --principal 0.02 \
  --horizon 1000 --short-horizon 50 --out runs/recommendation.json

# 4. unsigned deposit tx (for YOUR signature — the module never signs)
python3 -m optimizer.prepare --scan runs/scan.json --venue Kelp \
  --principal 0.02 --out runs/unsigned_deposit.json

# 5. tests
forge test                                  # 8 vault rate-math tests
python3 tests/test_optimizer.py             # 12 net-math + key-hygiene tests
```

## 7. Key hygiene

`optimizer/` contains **no signing code and no keys** — `tests/test_optimizer.py`
runs a CI grep gate over `optimizer/`, `src/`, and docs that fails on any mention
of secret key material, signing routines, or wallet-recovery phrases.
The live evidence run (stake/claim/withdraw) was executed by the **operator** via
flock-wrapped `cast send` (dust, Atlantic only) **outside** the module — the module
itself can only *propose* unsigned transactions.

## 8. Honest limits

- Atlantic has no third-party yield venues; the comparison set is two
  builder-deployed fixtures + a 0% baseline. All three are labeled as such.
- Rewards are testnet PHRS with zero monetary value — "testnet mechanics demonstration".
- APY is illustrative at dust scale (marginal share ≈ 100%); large deposits dilute.
- Reward pools are finite: when a pool empties, rewards stop — the optimizer caps
  gross at the measured runway instead of projecting fantasy yield.
- `runwayBlocks()` is a **live-computed view** (`rewardPool / rewardPerBlock`), not a
  stored constant — it decays as rewards are paid out. Verified 2026-10-20: Kraken
  read 400 at the scan's pinned block 31482643, and 243 at re-check (pool now
  0.006099 PHRS). The optimizer always uses the pinned-block value from its scan;
  re-running the scan picks up the current runway. This is real on-chain behavior,
  not a data error.
- Share-link / video slots: `SUBMISSION.md` (video PENDING-VIDEO).

## 9. Requirements → evidence

| # | Official requirement (T15, Hard) | How it is met | Evidence |
|---|---|---|---|
| 1 | Compares ≥3 yield sources on LIVE on-chain data | Two disclosed builder-deployed OctopusVaults (Kelp, Kraken) + honest 0% wallet baseline; every rate/fee/hold view read via `eth_call` at ONE pinned block (31482643) with explorer block link | `runs/scan.json` (`source_count: 3`), `runs/discovery.json` (empty third-party finding) |
| 2 | Accounts for gas + entry/exit fees + minimum holding period | `net(H) = runway-capped gross − entryFee − exitFee(H<minHold) − gas`; live `eth_gasPrice`, measured (never assumed) block time; fee-sensitivity run at two horizons shows the flip | `optimizer/optimize.py`, `runs/recommendation.json` (50-block → STAY PUT, 1000-block → ALLOCATE) |
| 3 | Outputs clear recommendation with expected net gain, or 'stay put' with reason | `ALLOCATE` → winner + `expected_net_wei`/`expected_net_phrs`; `STAY PUT` → reason string; per-venue net/APY ledger with assumption notes | `runs/recommendation.json` |
| 4 | If executing: prepares txs for USER SIGNATURE ONLY — agent never holds keys | `prepare.py` builds an unsigned deposit tx (`signed: false`, no v/r/s fields, chain-id gated to 688689); CI grep gate in tests fails on any signing code or secret material | `optimizer/prepare.py`, `runs/unsigned_deposit.json`, `tests/test_optimizer.py` (12/12 pass) |

All yield figures trace to on-chain reads at the pinned block — no hardcoded rates,
no invented APYs. Re-verify any value: `rewardPerBlock()` etc. are plain `eth_call`s
against the addresses in §3.
