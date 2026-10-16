# SUBMISSION PACK — T12 "Skill + Chain MCP Flow" (copy-paste ready)

> Paste the fields below into the Arena submission form. Do not edit the
> pinned-commit link. Replace PENDING-VIDEO when the video ships.

**Title:**
T12 — Skill + Chain MCP Flow ("Spend Readiness Check")

**One-liner:**
One end-to-end composition flow: live Chain MCP reads feed a SkillEngine preflight skill whose ALLOW/BLOCK verdict gates a real dust tx, verified by follow-up chain queries — proven by contrast runs.

**Description:**
A single user request (`flow.py --amount-phrs X`) drives READ → SKILL → EXECUTE → VERIFY in one session, reproducing the portal pattern (MEGA §240). READ pins a block and queries live Atlantic state: chainId, block number, native PHRS balance, gas price, and contract state (pingCount(), keeper() on the KeeperPing registry). The preflight skill evaluates those live values verbatim against a pre-declared policy.yaml (6 named rules: RULE-NETWORK chainId guard, RULE-DEST, RULE-KEEPER-CONSISTENCY, RULE-AMOUNT ≤0.005 PHRS, RULE-GAS ≤50 gwei, RULE-FRESHNESS stale-packet rejection enforced at skill time and broadcast time, fail-closed). EXECUTE broadcasts a real dust tx (ping(), 0.0001 PHRS) only on ALLOW. VERIFY re-reads pingCount() and asserts the expected post-state.

Dependency proven by contrast runs on the same contract: 0.0001 PHRS → ALLOW → real tx → pingCount 0→1; 0.1 PHRS → BLOCK quoting the live balance → no broadcast → pingCount unchanged. Honest run history (one freshness-BLOCK, one broadcast crash before any tx) preserved in the transcript. Unit tests 8/8. Budget 0.0004362040 of 0.15 PHRS.

**Repo link (commit-pinned):**
https://github.com/mohamedwael201193/lightkeeper/tree/<commit>/tasks/t12-skill-chain-flow

**Share/demo links:**
https://atlantic.pharosscan.xyz/tx/0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3 (deploy)
https://atlantic.pharosscan.xyz/tx/0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349 (ALLOW execute)
https://atlantic.pharosscan.xyz/address/0xFc9fe952036bFe00F8BC5d9D2860c3750B834Ad1 (KeeperPing)

**Tx hashes (Atlantic testnet, chain 688689):**
- 0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3 (deploy, block 31481433, success)
- 0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349 (ping() dust, block 31482141, success)

**Video:** PENDING-VIDEO (45–90s: one request → chain reads → skill verdict → contrast run flipping the verdict; see VIDEO-GUIDE.md)

**Reviewer notes:** see REVIEWER_NOTES.md verbatim.
