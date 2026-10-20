# T14 — Evidence

## What was built

A read-only portfolio assistant for Pharos Atlantic testnet (chain 688689). Given a
wallet address and a natural-language question, it answers from live on-chain reads,
with every number citing its source contract and block. Seven question types are
supported (balance, holdings, transaction count, recent activity, gas headroom,
token info, protocol positions), routed by local code — no LLM, no guessing. A natural-language summary
generator composes the full portfolio report from the snapshot.

The core reading logic lives in the task's own library
(`src/lib/portfolio.mjs`); the CLI (`bin/run.mjs`, chain-ID assertion first), the
intent/answering layer (`src/index.mjs`), the coverage manifest (`sources.yaml`),
and the test suite round it out.

## What the chain said (live evidence, block 31483013)

Portfolio snapshot of the LIGHTKEEPER wallet
`0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`, pinned at block **31483013**:

| Asset | Balance | Source |
|---|---|---|
| PHRS (native) | 5.865657109313757106 | `eth_getBalance`, block 31483013 |
| USDC | 18.5 | `0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B :: balanceOf`, block 31483013 |
| USDT | 0 | `0xE7E84B8B4f39C507499c40B4ac199B050e2882d5 :: balanceOf`, block 31483013 |
| WBTC | 0 | `0x0c64F03EEa5c30946D5c55B4b532D08ad74638a4 :: balanceOf`, block 31483013 |
| WETH | 0 | `0x7d211F77525ea39A0592794f793cC1036eEaccD5 :: balanceOf`, block 31483013 |
| WPHRS | 0.0025 | `0x838800b758277CC111B2d48Ab01e5E164f8E9471 :: balanceOf`, block 31483013 |
| LPK | 1,000,000 | `0x7d9C06353DdfeBC078A3a834A672CBF10aa06Ab9 :: balanceOf`, block 31483013 |

- Transaction count: **139** (`eth_getTransactionCount`, block 31483013).
- Recent activity (blocks 31473013–31483013, 9 ERC20 Transfer events): the LPK mint
  (1,000,000 LPK received, tx `0xbf309a965b05…`, block 31481364) plus four
  0.0001 WPHRS in/out pairs — third-party dust transfers observed on-chain and
  reported as-is, with no story invented about them.
- Gas headroom at 10 gwei: ~27,931 simple transfers from the native balance.

The five registry tokens (USDC, USDT, WBTC, WETH, WPHRS) come from the official
Pharos Atlantic Token Registry
(https://docs.pharos.xyz/getting-started/token-registry.md) and each was verified
code-present on-chain via `eth_getCode` at block ~31481175 before being trusted.
LPK is the test token deployed by this task (see below).

## Protocol / vault search (2026-10-20) — a real position was found

The original build honestly reported "no live lending/vault protocols with
positions for this wallet". A follow-up search of Atlantic for real protocol
contracts the operator wallet has touched found three LIGHTKEEPER
builder-deployed contracts — all code-verified on-chain, all disclosed as
builder-deployed test contracts, never as third-party DeFi:

| Protocol | Kind | Contract | Position for `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` @ block 31638738 |
|---|---|---|---|
| MiniLend | lending | `0x108989a165a446e1d89CEe3C9936344ea7ADbf4a` (deployed by T16, deploy tx `0xc4da78490b2b0b2b501b5d0eb944878ed1d9f5cf47d5a3813e2d46a263a2c0de`) | **LIVE**: collateral 0.002 PHRS (`positions()` → 2000000000000000 wei); debt 0.0016 USD, contract-denominated 8dp (`160000`); health factor **1.5** (`1500000000000000000`); oracle price 1.5 USD/PHRS, 8dp (`150000000`); liquidation threshold 8000 bps — all via `getUserAccountData(address)` |
| Kelp | staking-vault | `0xe3212234B17A90cCBC36b0B44845394b62838b08` (deployed by T15) | `staked()` → **0** (stake fully claimed during the T15 run; reported as zero) |
| Kraken | staking-vault | `0xDC3D4a3f47BB479692239ECC362a16CE3485B283` (deployed by T15) | `staked()` → **0** (stake fully claimed during the T15 run; reported as zero) |

How it was searched: the LIGHTKEEPER task tree was inventoried for deployed
Atlantic contracts (T16's MiniLend lending pool, T15's Kelp/Kraken staking
vaults); each contract's position view was called for the operator wallet with
`cast call` at a pinned block (31638738, chain 688689) and cross-checked by the
assistant's own block-pinned reads in the test suite. No other lending/vault
contracts with operator-wallet positions were found. The MiniLend position was
created by the T16 evidence run (0.002 PHRS deposited, USD-denominated debt
borrowed, partially repaid) — it is a real on-chain position, and the
assistant now reads it as a second data class (protocol positions), every
number cited with contract AND block, exactly like token balances.

On the USD figures: MiniLend denominates debt in USD (8dp) natively on-chain
and carries its own operator-set oracle — the assistant READS these stored
contract values; it still queries no market price feed and performs no USD
valuation of token balances ("testnet — no market value" stands).

## The deployment (real, on-chain)

`contracts/KeeperToken.sol` — a minimal ERC20 ("Lightkeeper Test Token", LPK,
18 decimals), constructor minting 1,000,000 LPK to the deployer.

- Contract: `0x7d9C06353DdfeBC078A3a834A672CBF10aa06Ab9`
- Deploy tx: `0xbf309a965b0546c9464189a976d81fa77010cc59b02e54ba0578a310b555dc23`
- Block: 31481364, status success, gas used 742,987
- Cost: **0.005924 PHRS** (measured wallet delta), against a 0.15 PHRS budget
- Post-deploy `balanceOf` confirms 1,000,000 LPK in the wallet

This makes the portfolio non-trivial: the wallet holds native PHRS, 18.5 USDC,
and 1,000,000 LPK across verified contracts.

## The "I don't know" paths (negative probes, all passing)

1. **Unsupported function** — calling a non-existent view on the real USDC contract
   is refused by design (the encoder only supports declared read signatures).
2. **Untracked protocol** — "what is my position in the AquaLend vault?" → "I don't
   know … I only report positions I can read from verified contracts at a pinned
   block — I won't guess."
3. **No price feed** — "what is my portfolio worth in USD?" → refusal citing
   "testnet — no market value". No dollar figure appears anywhere in the output.
4. **No-code address** — a registry entry without bytecode is reported as UNKNOWN,
   never as a zero balance.

## What was refused (honest limits)

- **USD valuations of token balances.** Testnet assets have no market value and no
  price feed is queried. Every answer carries the label instead of a price. (The
  MiniLend debt/oracle USD figures are the contract's own stored units, read
  on-chain and cited — not a valuation the assistant performed.)
- **"Vault positions" outside the registry.** The assistant reads 3 verified
  protocol contracts live (MiniLend lending pool with a real operator position;
  Kelp/Kraken staking vaults reading zero after their stakes were claimed) and
  reports exactly that. Anything else — e.g. "my AquaLend vault position" — gets
  an explicit "I don't know", never a guess.
- **Full history.** `eth_getLogs` is capped at 1,000 blocks per call on this node;
  the assistant pages the latest 10,000 blocks and prints the window. The 18.5 USDC
  predates the window — out of scope, not invented.
- **Native transfer history.** PHRS transfers emit no events; the assistant states
  this instead of claiming to see them.
- **Write attempts.** There is no write path. The chain-ID assertion runs before any
  read; the housekeeping test greps the folder for key material and mock language.

## Verification

- `node --test test/portfolio.test.mjs` — **23/23 pass**, including live tests that
  assert the assistant's PHRS/USDC/LPK balances, tx count, and MiniLend/Kelp/Kraken
  positions equal independent `cast` queries at the same pinned block.
- `sample-output/demo-output.txt` — the full 7-question demo run, real terminal output.
- `sample-output/snapshot.json` — the machine-readable snapshot (includes `positions`).
- `sample-output/negative-probes.json` — the probe log.
- All links in `LINKS.md` curl-verified (HTTP 200) on 2026-10-16.
