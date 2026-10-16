# T27 — Arena Submission Pack (copy-paste ready)

## Title

Doc-Grounded Builder Agent — cited plans, coverage gate, real Atlantic execution

## One-liner

A builder agent that plans strictly from retrieved Pharos docs — every step cited (URL + date + excerpt), uncovered steps refused instead of improvised — then executes the covered plan for real: ERC-20 deployed and verified on Atlantic.

## Description

**What it does.** Given a build request, the agent runs a 5-stage pipeline: INTAKE → docs research (local crawl of pharos.xyz llms.txt + docs pages) → cited PLAN rendered before acting → COVERAGE CHECK (every step must trace to a cited passage; any step without coverage is flagged UNVERIFIED and the agent REFUSES it with a reason — never improvises) → real EXECUTION of the covered plan → on-chain VERIFY → verdict report. Citation discipline on every claim: DOC-GROUNDED / INFERENCE / UNVERIFIED.

**Four scripted requests, all real:**
- R1 "deploy an ERC20 on Atlantic and verify it" → EXECUTED: deployed `0x25c2853B5AD74965e9228A64b7805ceE3b0eCd19` (Token/MTK, supply 1,000,000), verified on SocialScan ("Contract successfully verified"), tx `0xe54edf…235e3379` block 31482431.
- R2 "read the ERC-20 balance" → EXECUTED: `balanceOf(deployer) = 1000000`.
- R3 "transfer 10 tokens" → PREPARED FOR SIGNATURE: real unsigned tx (calldata `0xa9059cbb…`, gas 66063, nonce 138, chainId 688689) — nothing broadcast, per the funds-safety requirement.
- R4 "make my token confidential" → REFUSED with say-so: the docs contain zero passages on confidential/shielded transactions, so the agent names the uncovered terms and refuses instead of improvising.

**Honest engineering, on the record:** the doc's `forge script --broadcast` is rejected by the Atlantic RPC (it sends `eth_getTransactionCount` with a `requireCanonical` block object the RPC can't parse — proven via proxy capture, even for a no-op script). The agent falls back to the skill-documented `cast send --create` (same bytecode, args, RPC, chain) and logs the substitution as INFERENCE.

**Tests:** 6/6 coverage-gate unit tests pass. **Spend:** 0.00094 / 0.15 PHRS.

## Links

- Code (commit-pinned): https://github.com/mohamedwael201193/lightkeeper/tree/2169d68555e16a2027c3063e8c30fa7cde943be5/tasks/t27-doc-grounded-builder-agent
- Deploy tx: https://atlantic.pharosscan.xyz/tx/0xe54edfefd89057d6f54b1d954bbe0ac2b5ba7f73c382d68890b8e3ce235e3379
- Token (verified): https://atlantic.pharosscan.xyz/address/0x25c2853B5AD74965e9228A64b7805ceE3b0eCd19
- Demo video: PENDING-VIDEO

## Transaction hashes

- Deploy: `0xe54edfefd89057d6f54b1d954bbe0ac2b5ba7f73c382d68890b8e3ce235e3379` (status 1, block 31482431)

## Video

PENDING-VIDEO — filming guide in `VIDEO-GUIDE.md` (45–90s: question → cited plan → execution → on-chain verify → verdict; R4: "docs don't cover this").
