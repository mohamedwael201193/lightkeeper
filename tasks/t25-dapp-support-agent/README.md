<div align="center" style="background:#1414c8; padding:48px 24px; border-radius:8px;">
  <div style="font-family:Georgia,'Times New Roman',serif; color:#d9a821; font-size:42px; letter-spacing:8px; font-weight:bold;">T25 · DAPP SUPPORT AGENT</div>
  <div style="color:#f4f6ff; font-size:15px; margin-top:16px; font-style:italic;">When your transaction dies on Atlantic, this lamp tells you why — in plain words, with the receipt to prove it.</div>
  <div style="color:#b9c2f5; font-size:12px; margin-top:8px; letter-spacing:2px;">LIGHTKEEPER · PHAROS AGENT ARENA · EASY · 50 PTS</div>
</div>

---

## 1. What this is

A dApp support agent for the Pharos Atlantic testnet with **two real capabilities**:

1. **Live diagnostics** — hand it a tx hash and it fetches the tx + receipt, identifies the failure cause (revert reason, out-of-gas, panic, constructor revert, insufficient balance/allowance/token-balance…), and explains it in plain language with a suggested fix. Hand it an address and it reports balance, tx count, and recent activity.
2. **Doc-grounded Q&A** — answers Pharos questions from a local knowledge base built from real doc-page fetches (2026-10-16). Every claim is labeled **DOC-GROUNDED** (URL + date + excerpt) / **INFERENCE** / **UNVERIFIED** — and when the docs don't cover a question, it **says so instead of improvising**.

Stdlib Python only. Read-only by design: `diagnose`, `account`, and `ask` never broadcast. Total chain spend for the whole build: **≈ 0.0020 PHRS** (budget was 0.15).

## 2. Quickstart

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a   # provides ATLANTIC_RPC_URL
cd tasks/t25-dapp-support-agent

# Diagnose a failed transaction
python3 src/support_agent.py diagnose 0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23

# Look up an account
python3 src/support_agent.py account 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3

# Ask a docs question
python3 src/support_agent.py ask "What is the Atlantic testnet chain ID?"

# Machine-readable output for any command
python3 src/support_agent.py diagnose 0x<hash> --json

# Run the test suite (re-runs everything live, asserts vs direct chain queries)
python3 tests/test_agent.py
```

## 3. How diagnosis works

`diagnose <txhash>` runs intake → `eth_getTransactionByHash` + `eth_getTransactionReceipt` → cause branches:

| Verdict | Signal | Method |
|---|---|---|
| `not_found` | no tx record | honest path: wrong hash / never broadcast / wrong network |
| `pending_or_dropped` | tx known, no receipt | honest path: mempool state is not provable from public RPC — stated, not guessed |
| `success` | `status == 1` | block, gas used, fee in PHRS, plain-language confirmation |
| `out_of_gas` | `gasUsed == gasLimit` | direct receipt read; fix rationale cited DOC-GROUNDED from the Pharos FAQ |
| `revert_with_reason` | `Error(string)` | `eth_call` replay of the exact calldata at **block−1**, decode `0x08c379a0` |
| `revert_panic` | `Panic(uint256)` | replay + decode `0x4e487b71`, code meanings labeled INFERENCE (standard EVM semantics) |
| `revert_no_data` | empty revert data | reported as-is with fix guidance |
| `revert_custom` | unknown selector | **selector reported honestly** — never invented |
| `insufficient_balance` | value tx, balance shortfall | `eth_getBalance(from, block−1)` vs `value + gasLimit × price` |
| `insufficient_allowance` | `transferFrom` too big | `allowance(owner, spender)` + `balanceOf(owner)` reads at block−1 |
| `insufficient_token_balance` | owner lacks tokens | same pre-condition reads; fires only when the allowance already covered the amount |
| `revert_constructor_reason` / `_panic` / `_custom` / `revert_constructor` | deployment failed | init code replayed via `eth_call` at block−1 (no `to`); decoded like a call revert, framed as a deployment |

Every verdict prints: the verdict, the key numbers, a plain-language explanation, a suggested fix, the label, and the explorer link.

## 4. Doc-grounded Q&A and the citation discipline

`src/kb.json` is a hand-built knowledge base from real page fetches on 2026-10-16:

- `https://www.pharos.xyz/llms.txt` — docs index + recommended tooling defaults (ZAN/Alchemy/Nirvana, Chainlink, CCIP/CCTP/LayerZero, Safe/Fordefi, Foundry/Hardhat)
- `https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md` — chain ID 688689, rate limits, pending-tx caps
- `https://docs.pharos.xyz/getting-started/faqs.md` — the gas-limit/refund out-of-gas mechanism
- SkillEngine `assets/networks.json` — PHRS as Atlantic's native token (the prose docs leave those cells blank; the verdict's precision doctrine says ground this in `networks.json`)

Retrieval is keyword-scored; below threshold the agent returns `not_covered` with an explicit "I won't improvise" message (proven live — see `evidence/transcripts/t2-ask-sayso.txt`). The GitBook `?ask=` endpoint is **not** used (it 403s plain GETs — verified first-hand).

## 5. Evidence — six distinct real failures, all mined on Atlantic

| # | Type | Tx | Receipt proof |
|---|---|---|---|
| 1 | **Revert with reason** — `Error("SUPPORT-DIAG: intentional revert with reason")`, decoded from replay | [`0x405295cd…0ca23`](https://atlantic.pharosscan.xyz/tx/0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23) | block 31482154, status 0, gas 21510/100000 |
| 2 | **Out of gas** — `gasUsed == gasLimit == 120000` | [`0x31993dc8…f3f5cf`](https://atlantic.pharosscan.xyz/tx/0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf) | block 31482265, status 0 |
| 3 | **Solidity panic** — `Panic(0x11)` arithmetic overflow | [`0x2c78309c…048`](https://atlantic.pharosscan.xyz/tx/0x2c78309c41ce0bd53f611ac5a1ad5e2bfa0e29b7f5e3514b9f0a429c2dcab048) | block 31482171, status 0 |
| 4 | **Insufficient allowance** — `transferFrom` of 1 SDT, 0 approved (`allowance`/`balanceOf` reads at block−1) | [`0x8e655c34…dadd01`](https://atlantic.pharosscan.xyz/tx/0x8e655c344f8d30ca23d8369eb2c6594d86acf3b07616ff7cfbe0cb6f51dadd01) | block 31486989, status 0 |
| 5 | **Insufficient token balance** — `transferFrom` of 2000 SDT, 10000 approved, 1000 held | [`0x9e1561f8…9e0613`](https://atlantic.pharosscan.xyz/tx/0x9e1561f8ba0e8d3482707bd336a8d1d96f62a19a0cd08e7645b89f25ce9e0613) | block 31487003, status 0 |
| 6 | **Constructor revert decoded** — `Error("SUPPORT-DIAG: constructor always reverts")` from init-code replay | [`0x1e70dc67…f4e167`](https://atlantic.pharosscan.xyz/tx/0x1e70dc673ec96753bf6c45962186a4586db0b663c0ff81912707d53958f4e167) | block 31487042, status 0 |

All six are **self-generated dust failures on Atlantic, labeled as such** — explicitly allowed by the official implementation note ("organic PharosScan mainnet failures **or** self-generated real dust failures on Atlantic — labeled, never fabricated"). Fixtures: `src/TestReverter.sol` (v2 at [`0xC987a20fEEDc38772cE0786c3233148586a67e53`](https://atlantic.pharosscan.xyz/address/0xC987a20fEEDc38772cE0786c3233148586a67e53)); `src/TestToken.sol` (minimal ERC-20 at [`0xCbdd6E1EFf8264DDb611BA7F887A8e8DAfCDb5BE`](https://atlantic.pharosscan.xyz/address/0xCbdd6E1EFf8264DDb611BA7F887A8e8DAfCDb5BE)); `src/AlwaysReverts.sol` (constructor-revert fixture — its deploy reverted as designed). Full transcripts: `evidence.md` + `evidence/transcripts/`.

## 6. Tests

`tests/test_agent.py` — 8 tests, **all PASS**, zero mocks:

- all three failure diagnoses re-run live and asserted field-by-field against `cast receipt` / `cast tx` (block, status, gasUsed, gasLimit, decoded reason)
- success-path and not-found-path covered
- `account` balance/nonce asserted against `cast balance` / `cast nonce` (tolerance documented: the deployer wallet is shared by all 28 builders, so it drifts)
- covered question → `answered` with URL + fetch date + excerpt containing the fact; uncovered question → `not_covered` with the say-so message

## 7. Honest limits

- **Organic third-party failure not demonstrated:** 400 recent Atlantic blocks were scanned for non-wallet status-0 txs; none appeared in the window. The requirement is met with 3 distinct self-generated types (allowed); nothing was fabricated to fill the gap.
- **Account activity is ERC-20 Transfers only:** plain PHRS transfers emit no logs, so `account` cannot list them — the coverage window and limit are printed with every report.
- **Pending vs dropped is unknowable** from public RPC — the agent says so instead of picking one.
- **Panic-code meanings are INFERENCE** (standard EVM semantics); no Pharos doc page covers revert decoding, and the label says that.
- **KB is 4 entries, hand-built 2026-10-16** — deliberately small; a wrong confident answer is worse than an honest "not covered".

## 8. Repo map

```
tasks/t25-dapp-support-agent/
├── task.yaml            # task metadata, evidence tx registry, run commands
├── REQUIREMENTS.md      # official requirements, quoted verbatim
├── README.md            # this file
├── evidence.md          # human-readable evidence + coverage statement
├── evidence.json        # machine-readable evidence (txs, spend, tests)
├── evidence/
│   ├── transcripts/     # 6 verbatim real transcripts (t1–t6)
│   ├── scan_failures.py # organic-failure scanner (one-off)
│   └── scan_deploys.py  # deploy locator (one-off)
├── src/
│   ├── support_agent.py # the agent (stdlib only)
│   ├── kb.json          # doc KB: 4 entries, real fetches, 2026-10-16
│   ├── TestReverter.sol # diagnostic fixture (Atlantic only)
│   └── foundry.toml / out/  # compiled fixture
├── tests/
│   └── test_agent.py    # 8 live tests, 8/8 PASS
├── REVIEWER_NOTES.md
├── LINKS.md
├── SUBMISSION.md
└── VIDEO-GUIDE.md
```
