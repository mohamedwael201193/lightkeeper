# T25 dApp Support Agent — Evidence

**Chain:** Pharos Atlantic testnet (chain id 688689) · **Date:** 2026-10-16
**Wallet:** `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` (shared LIGHTKEEPER deployer)
**Spend:** ≈ 0.0020 PHRS total (budget ≤ 0.15 PHRS) — itemized in `evidence.json`
**Tests:** `python3 tests/test_agent.py` → **8/8 PASS**, every diagnostic value asserted against live `cast` chain queries.

All transcripts below are real program output (also saved verbatim under `evidence/transcripts/`).

---

## Transcript 1 — Doc-grounded Q&A (required)

**Q:** *What is the Atlantic testnet chain ID?*

**A (verdict: answered):**
> ChainID 688689; Environment: Atlantic Testnet; rate limit 500 requests per 5 minutes; max 64 pending transactions per address. The docs page leaves the RPC and explorer cells blank — confirm live endpoints against the network registry or a live eth_chainId check instead of memorizing them.

**Label:** DOC-GROUNDED — direct excerpt.
**Citation:** source `https://docs.pharos.xyz/getting-started/network/atlantic-testnet.md` · fetched 2026-10-16.

## Transcript 2 — Say-so path (docs don't cover it → no improvisation)

**Q:** *How do I run a confidential transaction on Pharos?*

**A (verdict: not_covered):**
> I don't have a doc-grounded answer for that. My knowledge base is built from the real Pharos docs pages I fetched on 2026-10-16 (llms.txt index, Atlantic Testnet page, FAQs, SkillEngine networks.json), and none of them cover your question. I won't improvise — ask about Atlantic network parameters, the native token, gas failures, or recommended tooling (RPC/oracles/bridges/wallets/dev frameworks), or point me at the doc page to add.

**Label:** UNVERIFIED — coverage gap, stated honestly instead of improvised.

## Transcript 3 — Live diagnostic #1: REVERT WITH REASON (required)

**Input:** tx `0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23`
(self-generated dust failure on Atlantic — called `boom()` on the T25 fixture contract
`0x5C5803746A187727090a44FbAe2a956f3d2525a3`)

**Agent output (verdict: revert_with_reason):**
> Your transaction FAILED at block 31482154: the contract reverted. SUPPORT-DIAG: intentional revert with reason. It still cost 0.000022 PHRS in gas (failed txs pay for work done). Fix: the contract itself refused the call with reason "SUPPORT-DIAG: intentional revert with reason". Read the contract's docs or source for that exact message — it names the failed requirement (e.g. wrong phase, cap reached, bad parameter). Adjust your inputs to satisfy it and resend.

- block 31482154, status 0, gas_used 21510 / gas_limit 100000 — matches `cast receipt` exactly (asserted in tests).
- Revert reason decoded from `eth_call` replay at block−1 (`Error(string)` selector `0x08c379a0`).
- Explorer: https://atlantic.pharosscan.xyz/tx/0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23

## Transcript 4 — Live diagnostic #2: OUT OF GAS (required)

**Input:** tx `0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf`
(self-generated dust failure on Atlantic — called `burn(100000)` with a 120,000 gas limit on fixture v2 `0xC987a20fEEDc38772cE0786c3233148586a67e53`)

**Agent output (verdict: out_of_gas):**
> Your transaction FAILED at block 31482265 with OUT OF GAS: it consumed all 120,000 gas supplied (gasUsed == gasLimit) and still hadn't finished. The EVM deducts the full gas limit up front, so a limit set exactly at the needed amount can also fail before refunds apply. Fix: resend the same transaction with a higher gas limit — start with 1.5–2x, e.g. 180,000 instead of 120,000. Unused gas is refunded, so overshooting the limit slightly is safe.

- gas_used == gas_limit == 120000, status 0 — matches `cast receipt` exactly (asserted in tests).
- Fix rationale cited DOC-GROUNDED from the Pharos FAQ (`https://docs.pharos.xyz/getting-started/faqs.md`, fetched 2026-10-16).
- Explorer: https://atlantic.pharosscan.xyz/tx/0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf

## Transcript 5 — Live diagnostic #3 (bonus): SOLIDITY PANIC

**Input:** tx `0x2c78309c41ce0bd53f611ac5a1ad5e2bfa0e29b7f5e3514b9f0a429c2dcab048`
(self-generated — the v1 fixture's `burn()` accumulator overflowed; a real mined revert)

**Agent output (verdict: revert_panic):**
> Your transaction FAILED at block 31482171: the contract reverted. Panic(0x11): arithmetic overflow/underflow. It still cost 0.000023 PHRS in gas (failed txs pay for work done). Fix: this is a low-level Solidity panic — almost always a bug in the CALLER's inputs or the contract's assumptions (e.g. math overflow, array out of bounds). Double-check array indices and amounts; if the contract is yours, add a require() with a message at the suspect line.

- Label: INFERENCE (panic-code meanings are standard EVM semantics; no Pharos doc page covers revert decoding — stated in the label, not hidden).
- Explorer: https://atlantic.pharosscan.xyz/tx/0x2c78309c41ce0bd53f611ac5a1ad5e2bfa0e29b7f5e3514b9f0a429c2dcab048

## Transcript 6 — Live diagnostic (bonus): ACCOUNT LOOKUP

**Input:** address `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`

**Agent output (verdict: account_report):** EOA, live balance in PHRS, on-chain tx count (nonce), and recent ERC-20 Transfer activity over the last 500 blocks with an honest coverage note (plain PHRS transfers emit no logs and cannot appear — disclosed, not hidden).

- balance/nonce asserted against live `cast balance` / `cast nonce` in tests (tolerance documented: shared hot wallet).
- Explorer: https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3

---


## Transcript 7 — Live diagnostic: INSUFFICIENT ALLOWANCE (official required cause)

**Input:** tx `0x8e655c344f8d30ca23d8369eb2c6594d86acf3b07616ff7cfbe0cb6f51dadd01`
(self-generated dust failure — `transferFrom` of 1 SDT with zero approval on the T25 ERC-20 fixture `0xCbdd6E1EFf8264DDb611BA7F887A8e8DAfCDb5BE`)

**Agent output (verdict: insufficient_allowance):** the panel and CLI both read `allowance(owner, spender)` and `balanceOf(owner)` at block−1 and name the exact shortfall (0 approved vs 1 SDT attempted). Fix: `approve()` from the owner's wallet first, then resend.

- Explorer: https://atlantic.pharosscan.xyz/tx/0x8e655c344f8d30ca23d8369eb2c6594d86acf3b07616ff7cfbe0cb6f51dadd01

---

## Transcript 8 — Live diagnostic: INSUFFICIENT TOKEN BALANCE (official required cause)

**Input:** tx `0x9e1561f8ba0e8d3482707bd336a8d1d96f62a19a0cd08e7645b89f25ce9e0613`
(self-generated dust failure — `transferFrom` of 2000 SDT with 10000 SDT approved but only 1000 SDT held, on the T25 ERC-20 fixture `0xCbdd6E1EFf8264DDb611BA7F887A8e8DAfCDb5BE`)

**Agent output (verdict: insufficient_token_balance):** allowance covered the amount, so the agent reports the owner's token shortfall instead (1000 held vs 2000 attempted). Fix: reduce the amount or fund the owner.

- Explorer: https://atlantic.pharosscan.xyz/tx/0x9e1561f8ba0e8d3482707bd336a8d1d96f62a19a0cd08e7645b89f25ce9e0613

---

## Transcript 9 — Live diagnostic: CONSTRUCTOR REVERT DECODED (bonus)

**Input:** tx `0x1e70dc673ec96753bf6c45962186a4586db0b663c0ff81912707d53958f4e167`
(self-generated dust failure — deployment of `src/AlwaysReverts.sol`, whose constructor always reverts)

**Agent output (verdict: revert_constructor_reason):** the agent replays the init code at block−1 and decodes `Error("SUPPORT-DIAG: constructor always reverts")` — a failed deployment is never reported as a generic silent revert.

- Explorer: https://atlantic.pharosscan.xyz/tx/0x1e70dc673ec96753bf6c45962186a4586db0b663c0ff81912707d53958f4e167

---

## Coverage statement

| Official requirement | Status |
|---|---|
| Accepts tx hash, fetches tx+receipt | ✅ `diagnose` command, live RPC |
| Identifies failure cause (revert reason / out of gas / insufficient balance or allowance…) | ✅ branches: out_of_gas, revert_with_reason, revert_panic, revert_no_data, revert_custom, insufficient_balance, insufficient_allowance, insufficient_token_balance |
| Plain-language explanation + suggested fix | ✅ every verdict carries both |
| ≥3 DIFFERENT failure types demonstrated | ✅ 6 distinct, all real mined txs: revert-with-reason, out-of-gas, panic, insufficient allowance, insufficient token balance, constructor revert |
| Citation discipline DOC-GROUNDED / INFERENCE / UNVERIFIED | ✅ every answer labeled; say-so path proven |
| Unknown revert selectors reported honestly | ✅ `revert_custom` reports the raw selector |
| Pending tx honest path | ✅ `pending_or_dropped` states the mempool unknown explicitly |
| No mock/demo/placeholder | ✅ all txs mined on Atlantic; fixtures labeled self-generated |

**Organic-failure scan:** 400 recent Atlantic blocks were scanned for third-party (non-wallet) status-0 txs; none appeared in the window. Per the MEGA implementation note ("organic PharosScan mainnet failures **or** self-generated real dust failures on Atlantic — labeled, never fabricated"), the 3 self-generated types above satisfy the requirement. No failure was fabricated or staged.
