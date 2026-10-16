# T27 Evidence — Doc-Grounded Builder Agent

**Network:** Atlantic testnet (chain 688689) · **Date:** 2026-10-16 · **Deployer:** `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`

## The live build (R1)

The agent retrieved the Pharos docs, rendered a 9-step cited plan (coverage gate PASS), and executed it for real:

- **Deploy tx:** https://atlantic.pharosscan.xyz/tx/0xe54edfefd89057d6f54b1d954bbe0ac2b5ba7f73c382d68890b8e3ce235e3379
  (block 31482431, status 1, 941730 gas @ 1000000001 wei — curl-tested 200)
- **Token:** https://atlantic.pharosscan.xyz/address/0x25c2853B5AD74965e9228A64b7805ceE3b0eCd19
  (curl-tested 200) — `Token` / `MTK`, 18 decimals, totalSupply `1000000`, deployer balance `1000000`
- **Verification:** `forge verify-contract` → *"Contract successfully verified"* (SocialScan blockscout API, chain 688689, GUID `8e213c49…23fa6ac3a4f`)

## Spend log

| Tx | PHRS |
|---|---|
| `0xe54edf…235e3379` deploy (941730 gas × 1000000001 wei) | 0.00094173 |

**Total: 0.00094173 / 0.15 PHRS.** Verify is off-chain (no gas); R2 reads are free; R3 never broadcast.

**Re-verified live 2026-10-16 ~09:45 EEST** (free reads only, no tx): `name=Token`, `symbol=MTK`,
`totalSupply=1000000`, `balanceOf(deployer)=1000000`, bytecode 7110 hex chars — all match the
07:20 run.

## The four requests

| ID | Verdict | Proof |
|---|---|---|
| R1 deploy + verify | EXECUTED | tx + verified contract above; `run-logs/r1-deploy-execute.json` |
| R2 read balance | EXECUTED | `balanceOf(deployer) = 1000000`; `run-logs/r2-balance-execute.json` |
| R3 transfer 10 MTK | PREPARED_FOR_SIGNATURE | real unsigned tx (`0xa9059cbb…`, gas 66063, nonce 138, chainId 688689) — **nothing broadcast**; `run-logs/r3-transfer-prepared.json` |
| R4 confidential token | **REFUSED** | *"the docs do not cover this request — no passage mentions: confidential, shielded"*; `run-logs/r4-refusal.json` |

## Unit tests

`tests/test_coverage_gate.py` — **6 passed, 0 failed** (every covered step cites URL+date+excerpt; uncovered requests refused; transfer broadcast withheld; deploy plan uses documented chain-id/verifier).

## Honest deviations (not hidden)

1. **`forge script --broadcast` cannot run on the Atlantic RPC** — it sends `eth_getTransactionCount` with an EIP-1898 block object carrying `requireCanonical`, which the RPC rejects (`PARAM_VERIFY_ERROR`), proven via proxy capture even for a no-op script (`run-logs/forge-script-rpc-incompatibility.txt`). The agent falls back to the skill-documented equivalent `cast send --create` — same bytecode, same constructor args, same RPC, same chain — and logs the substitution as INFERENCE.
2. **First verify attempt timed out** on the explorer indexer (the skill warns: wait ~10s after deploy). The retry succeeded.
3. The agent's first run parsed the contract address from the wrong field (blockHash); the correction (`run-logs/r1-verify-correction.txt`) re-ran verify + on-chain checks against the true address. The agent code was fixed (`contractAddress` table-row regex first).

No secrets anywhere in the repo: the private key traveled via environment only and is redacted from every log.
