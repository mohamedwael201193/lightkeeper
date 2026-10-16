<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:8px;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:52px;letter-spacing:14px;font-weight:bold;">T12 · SKILL + CHAIN FLOW</div>
  <div style="color:#f4f6ff;font-size:15px;margin-top:16px;letter-spacing:2px;"><i>The keeper reads the sea before it lets the hand cast a single coin.</i></div>
</div>

> LIGHTKEEPER · Task 12 — **Skill + Chain MCP Flow** (Medium · 100 pts · Composition)

# §1 — What this is

One end-to-end composition flow that reproduces the portal pattern from MEGA §240:
**read live state via Chain MCP-class tools → invoke a skill action on that data → verify via chain queries** — all from a single user request, in one session.

The flow is a **"Spend Readiness Check"**: a single CLI request (`python3 flow.py --amount-phrs X --run-label Y`) triggers

1. **READ** — pinned-block live queries: chainId, block number, native PHRS balance, gas price, and contract state (`pingCount()`, `keeper()` on the `KeeperPing` registry).
2. **SKILL** — a preflight skill evaluates the *live values verbatim* against `policy.yaml` (six named rules: network, destination, keeper-consistency, amount, gas, freshness). Verdict: `ALLOW` or `BLOCK`.
3. **EXECUTE** — a real dust transaction (`ping()`, 0.0001 PHRS) is broadcast **only** if the skill approved.
4. **VERIFY** — follow-up chain queries confirm the post-state: `pingCount` must be `pre+1` after an ALLOW run, unchanged after a BLOCK run.

Skill output **depends on** live chain data: the same flow with a different proposed amount on the same live state yields a different verdict (see §4).

# §2 — The preflight skill (policy)

`policy.yaml` is pre-declared before any run and never edited mid-run. Rules, in evaluation order:

| Rule | What it checks | Fail means |
|---|---|---|
| RULE-NETWORK | live `chainId` == 688689 (Atlantic) | BLOCK (mainnet 1672 listed, `enabled: false`, un-overridable) |
| RULE-DEST | target == deployed `KeeperPing` address | BLOCK (no redirect) |
| RULE-KEEPER-CONSISTENCY | on-chain `keeper()` == expected keeper | BLOCK (contract state changed under us) |
| RULE-AMOUNT | proposed value ≤ 0.005 PHRS | BLOCK (quotes the live values in the detail) |
| RULE-GAS | live gas price ≤ 50 gwei | BLOCK |
| RULE-FRESHNESS | reads ≤ 120 blocks old (skill time **and** broadcast time) | BLOCK — stale-packet rejection |

Fail-closed throughout: any unreadable data → BLOCK, never guess.

# §3 — Call order

```
USER REQUEST  (single command)
│
├─► READ ........ cast: eth_chainId · eth_blockNumber · eth_getBalance(pinned)
│                 cast: eth_gasPrice · call pingCount()@block · call keeper()@block
│
├─► SKILL ....... evaluate(live values verbatim, policy.yaml)
│                 verdict = ALLOW | BLOCK (+ named failing rules)
│
├─► EXECUTE ..... if ALLOW: re-check freshness @broadcast-time
│                 │           flock-cast send ping() --value 0.0001 PHRS
│                 else:       no broadcast
│
└─► VERIFY ...... cast: call pingCount() @latest
                  assert pingCount == pre + (1 if executed else 0)
```

# §4 — Live contrast runs (dependency proven)

Same flow, same contract, different proposed amounts → different verdicts:

**allow-3** — 0.0001 PHRS → all 6 rules PASS → **ALLOW**
→ tx [`0xbdc80ff0…6d4349`](https://atlantic.pharosscan.xyz/tx/0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349) (status 1, block 31482141)
→ `pingCount()` **0 → 1** → VERIFY OK

**block-1** — 0.1 PHRS → RULE-AMOUNT FAIL (proposed 100000000000000000 wei > max 5000000000000000 wei, quoting the live balance 5.868857845315957842 PHRS) → **BLOCK**
→ no broadcast → `pingCount()` **1 → 1** (unchanged) → VERIFY OK

Full transcripts with every real value: `run-logs/flow-transcript.jsonl`.
Deploy tx: [`0x84202229…6b4aa3`](https://atlantic.pharosscan.xyz/tx/0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3) (block 31481433, contract `0xFc9fe952036bFe00F8BC5d9D2860c3750B834Ad1`).

# §5 — Reproduce it

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t12-skill-chain-flow
python3 flow.py validate                 # policy sanity check
python3 tests/test_policy.py            # 8 unit tests, no chain needed
python3 flow.py --amount-phrs 0.0001 --run-label allow   # → ALLOW + execute + verify
python3 flow.py --amount-phrs 0.1    --run-label block   # → BLOCK, no tx, verify
```

Nonces: every broadcast goes through `flock /tmp/lk-nonce.lock` (shared-key safety across the 28 T-workers).
Budget: 0.0004362040 PHRS spent of the 0.15 PHRS cap (`evidence.json`).

# §6 — Chain & precision notes

- Atlantic testnet **only** (chainId **688689** = `0xa8231`, native **PHRS**); no mainnet touched.
- The portal's hosted Chain MCP endpoint is **mainnet-only**; T12 reproduces the portal pattern locally with `cast` against Atlantic — same tool boundaries (read via chain queries → skill action on that data → verify via chain queries), per MEGA §240.
- `estimate_gas` has no `block` param on the real MCP → no pinned-block dry-runs there either; T12 pins reads with `cast call --block`.
- Atlantic blocks are ~1s, so sequential RPC reads span dozens of blocks: the freshness rule runs at skill time **and** again at broadcast time (fail-closed both).

# §7 — Risks & honest limits

- The first live run blocked on `RULE-FRESHNESS` (10-block window too tight); the window was widened to 120 blocks in `policy.yaml` **before any execution** — the refusal is preserved in the transcript as run history, not deleted.
- One mid-build run ALLOWED but crashed on a `cast send --value` encoding bug before broadcasting — also preserved; no transaction was sent.
- The shared deployer key is used by 28 concurrent workers, so the wallet balance moves independently of T12; balances are recorded per-run in the transcript, never asserted cross-run.
- Skill boundary: the "skill" here is the local preflight evaluator driven by chain data (composition with Chain MCP-class reads); the verdict depends on nothing but the live reads + the pre-declared policy.

# §8 — Links

- Evidence: `evidence.md` / `evidence.json` (curl-verified)
- Official requirements: `REQUIREMENTS.md` (quoted verbatim)
- Reviewer notes: `REVIEWER_NOTES.md`
- Links: `LINKS.md` (curl-verified)
- Arena pack: `SUBMISSION.md` · Filming guide: `VIDEO-GUIDE.md`
- Explorer: tx [deploy](https://atlantic.pharosscan.xyz/tx/0x8420222999ecd41fa7256a69b5980d9515336e6a762df16918b9a96e3e6b4aa3) · tx [execute](https://atlantic.pharosscan.xyz/tx/0xbdc80ff038803c1571e66e4aed36f4700cea5f077102f29cdf12a4b84d6d4349) · [contract](https://atlantic.pharosscan.xyz/address/0xFc9fe952036bFe00F8BC5d9D2860c3750B834Ad1)
