# SUBMISSION PACK — T12 "Skill + Chain MCP Flow" (copy-paste ready)

> Paste the fields below into the Arena submission form. Do not edit the
> pinned-commit link. Replace PENDING-VIDEO when the video ships.

**Title:**
T12 — Skill + Chain MCP Flow ("Spend Readiness Check")

**One-liner:**
One end-to-end composition flow: live Chain MCP reads feed a SkillEngine preflight skill whose ALLOW/BLOCK verdict gates a real dust tx, verified by follow-up chain queries — proven by contrast runs.

**Description:**
A single user request (`flow.py --amount-phrs X`) drives READ → SKILL → EXECUTE → VERIFY in one session, reproducing the portal pattern (MEGA §240). READ pins a block and queries live Atlantic state: chainId, block number, native PHRS balance, gas price, and contract state (pingCount(), keeper() on the KeeperPing registry). The preflight skill evaluates those live values verbatim against a pre-declared policy.yaml (6 named rules: RULE-NETWORK chainId guard, RULE-DEST, RULE-KEEPER-CONSISTENCY, RULE-AMOUNT ≤0.005 PHRS, RULE-GAS ≤50 gwei, RULE-FRESHNESS stale-packet rejection enforced at skill time and broadcast time, fail-closed). EXECUTE broadcasts a real dust tx (ping(), 0.0001 PHRS) only on ALLOW. VERIFY re-reads pingCount() and asserts the expected post-state.

Dependency proven by contrast runs on the same contract: 0.0001 PHRS → ALLOW → real tx → pingCount 0→1; 0.1 PHRS → BLOCK quoting the live balance → no broadcast → pingCount unchanged. Post-harden re-runs (2026-10-16) re-executed the full pair live: allow-4 → ALLOW → real tx 0x022bc47b…fd7128 (block 31486412) → pingCount 1→2; block-2 → BLOCK against a fresh live balance (5.870589420313178416 PHRS) → no broadcast. Honest run history (one freshness-BLOCK, one broadcast crash before any tx) preserved in the transcript. Unit tests 8/8. Budget 0.0005699020 of 0.15 PHRS.

**Repo link (commit-pinned):**
https://github.com/mohamedwael201193/lightkeeper/tree/d9ef4d7f02542483734fef43cb58b20c6fcc6cbc/tasks/t12-skill-chain-flow

**Share/demo links:**
https://atlantic.pharosscan.xyz/tx/0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3 (deploy)
https://atlantic.pharosscan.xyz/tx/0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349 (ALLOW execute)
https://atlantic.pharosscan.xyz/address/0xFc9fe952036bFe00F8BC5d9D2860c3750B834Ad1 (KeeperPing)

**Tx hashes (Atlantic testnet, chain 688689):**
- 0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3 (deploy, block 31481433, success)
- 0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349 (ping() dust, block 31482141, success)
- 0x022bc47b3f1932f531791f7b6fc9ed30da719bf9535394c30e4bbcbc11fd7128 (ping() dust, post-harden re-run, block 31486412, success)

**Video:** PENDING-VIDEO (45–90s: one request → chain reads → skill verdict → contrast run flipping the verdict; see VIDEO-GUIDE.md)

**Console try-it-live (Tier C — CLI-native):** `apps/console/src/components/try/skill-chain-flow.tsx`
— "See the whole chain before you run it": an interactive READ → SKILL → EXECUTE → VERIFY
step-through with the real commands, the six rule verdicts, and the real live values from both
contrast runs. Scenario toggle: ALLOW path (0.0001 PHRS → real tx 0xbdc80ff…6d4349) vs BLOCK path
(0.1 PHRS → RULE-AMOUNT fail, no broadcast). A "Probe the boundary yourself" simulator replays
the skill's exact rule math on the recorded live values — visitors type any PHRS amount and see
where ALLOW flips to BLOCK (labeled as simulation, not execution). "Copy full runbook" generates the exact command
sequence for either path. The console never executes anything — every command runs in the
visitor's own terminal; LIGHTKEEPER never sees or asks for private keys.

**Reviewer notes:** see REVIEWER_NOTES.md verbatim.
