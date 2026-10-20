# T25 — Rare-failure hunt log (out_of_gas / revert_panic)

**Conclusion: NOT FOUND in scanned range.** No organic Pharos mainnet transaction
matching either target failure class was found in the range scanned below.
This is an honest negative result — nothing is claimed, upgraded, or downgraded.

## Method (all reads via the real Chain MCP)

- Endpoint: `https://mcp.pharos.xyz/mcp` (Pharos Chain MCP, Streamable HTTP),
  client = repo `packages/chain-data/py/lightkeeper_chain_data.ChainMCP`.
- Chain identity asserted live before scanning: `get_chain_info` -> chainId 1672.
- Walked blocks backwards from the tip with `get_block(block, includeTransactions=true)`,
  then `get_transaction_receipt(hash)` for **every** transaction; kept those with
  `status == 0x0` (failed). Organic on-chain transactions only — no self-made
  transactions, no simulations of record.
- Classification rules (exactly as tasked):
  - `out_of_gas`: receipt `status == 0x0` AND `gasUsed == gas` (the tx gas limit).
  - `revert_panic`: failed tx whose revert data begins with the Panic selector
    `0x4e487b71`. Receipts on this chain carry no revert-data field, so each failed
    tx was additionally probed by replaying the exact tx via the MCP `eth_call`
    tool against the pre-block state (block - 1); one tx was also probed at its own
    block and block + 1. A replay is evidence about the revert payload, not a
    substitute for a trace — non-reproducing replays are reported as-is.

## Scope actually scanned

- Started (UTC): 2026-10-20T04:59:56Z
- Tip at start: block 20719431
- **Block range scanned: 20717132 - 20719431** (2300 blocks, descending from the tip)
- Transactions seen: 772 - Receipts checked: 772
- Failed transactions (status 0x0) found: 14
- MCP errors during scan: 0
- Scan stopped by the task's 45-minute time-box (before reaching any floor).

## Target-class results

- `out_of_gas` (gasUsed == gasLimit): **0 cases.** Every failed tx consumed
  strictly less than its limit (closest: 163,682 / 223,929).
- `revert_panic` (revert data starting `0x4e487b71`): **0 cases.** No replay of
  any failed tx returned the Panic selector; observed revert payloads were
  `Error(string)` SLIPPAGE, custom-error selectors, bare/empty data.

## Failed transactions found but NOT in either target class

Real organic failures in range; each excluded for the stated, checkable reason.
Recorded for context only - none is presented as a rare-failure case.

| Block | Tx hash | gasUsed | gasLimit | block-1 eth_call evidence |
|---|---|---|---|---|
| 20718599 | `0x1fe26cfd0bb1486abb80a93803833895274b34248f55129780a7ff3d524d02cb` | 214045 | 3000000 | succeeds at block-1 state (result returned; see note below) |
| 20718490 | `0x73c3d01762ac1bfccf2ce263adf0e6236f012fac95c160cfde884c5161c3a335` | 171019 | 540000 | reverts; data starts `0x911bb2c9` (custom error) |
| 20718135 | `0x314cc6f24ab0eb1f69ec0a891b2ed379a6ce2b3baf549cd4be5d1adf0105d755` | 31141 | 361185 | reverts; bare 32-byte payload (`0x0000...00c9`), no selector |
| 20718134 | `0xf896b9aa8e481185acb8d76ec607df12fc5a9a73e57c61505d2311f2ca35c33e` | 163668 | 223911 | reverts; data is bare selector `0xe39aafee` (custom error) |
| 20718133 | `0xba511c79661103fbe19fea38eb0c27adc9e65fe733d3c452a6f1b49a391f72d2` | 29035 | 385986 | reverts; empty revert data (`0x`) |
| 20718131 | `0xad5f84d78e2103885e1b9843d26cdc9fa39ba8bac3a710c72f1e8dfa2b700cb0` | 29688 | 420000 | succeeds at block-1 state (empty result) |
| 20718097 | `0x7f4dd306727be5344d10f036e55266d36b0265365a5b816d6ba3d1a6a4c88836` | 31141 | 361164 | reverts; bare 32-byte payload, no selector |
| 20718096 | `0xd7905852ab3437fa2a0ae92821986098fd8f90f00d37a6f07954b9bf60ba569c` | 29035 | 385992 | reverts; empty revert data (`0x`) |
| 20717689 | `0xc9d40cfc0e12cf00b137463d5a74757a0a3f84391cd2a1aa275aae8923faea2f` | 31141 | 361188 | reverts; bare 32-byte payload, no selector |
| 20717688 | `0x08c5ab3371bcdce54335ebf3760db899ba201d40dff8c74458b1702505df4881` | 163682 | 223929 | reverts; data is bare selector `0xe39aafee` (custom error) |
| 20717687 | `0x48e9db17ac52600adc8e15aa08c78040ebfdee8b14c20698e7ac58c1787740fc` | 29035 | 386000 | reverts; empty revert data (`0x`) |
| 20717686 | `0xa008e5d2264a2482567fd040b4182bf17ee8f25a44a83c6c099c0ec58bf56844` | 178493 | 3000000 | reverts; data starts `0x08c379a0` = Error(string) |
| 20717528 | `0xf13b51bef64dfcd0d59d57f8948de12d0ef75e085356861614ba82ec203c53f5` | 29035 | 385044 | reverts; empty revert data (`0x`) |
| 20717528 | `0xf07f87a9e13cac47fd8f462f63fbe5d6772940d55ba651196292657cb717945a` | 162714 | 222703 | reverts; data is bare selector `0xe39aafee` (custom error) |

Notes on exclusion patterns:
- One swap tx (block 20718599) replayed successfully at block-1 and at its own
  block, but reverted at block + 1 with `Error(string)` "SLIPPAGE"
  (data `0x08c379a0...`) - a reason-string revert, not a Panic.
- Others reverted on replay with custom-error selectors (e.g. `0x911bb2c9...`,
  `0xe39aafee`), a bare 32-byte payload, or empty revert data (`0x`) - none is
  the Panic selector `0x4e487b71`, and none exhausted its gas limit.

## Honest bottom line

In 2,300 recent mainnet blocks (772 transactions, 14 failures), neither
`out_of_gas` nor `revert_panic` occurred. The classes may exist deeper in chain
history or in busier ranges; they were **not found in the scanned range** above.
