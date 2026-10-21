<div style="background:#1414c8;padding:48px 32px;text-align:center;border-radius:4px">
<div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:44px;letter-spacing:10px">POLICY GATEKEEPER</div>
<div style="color:#f4f6ff;font-family:Georgia,serif;font-style:italic;font-size:17px;margin-top:14px">One lighthouse. Thirty lamps. — <b>T11</b>, the arm that says <i>no</i>.</div>
<div style="color:#b9c2f5;font-size:13px;margin-top:10px;letter-spacing:2px">LIGHTKEEPER · PHAROS AGENT ARENA · TASK 11 · 100 PTS</div>
</div>

*No agent writes to the chain until the policy has spoken — and every word is written down.*

---

## 1. What this is

The Policy Gatekeeper is a pre-execution policy engine for **agent write
actions**. Before any write is proposed to the chain, the gate evaluates it
against a versioned `policy.json` and returns **APPROVE** (with a gate
stamp) or **DENY** (with the named rule that fired and why). Every decision
— approve, deny, or refuse — is appended to a hash-chained, append-only
audit trail (`audit/check-log.jsonl`).

It is **not** T05's threshold guardian: T05 decides on *amounts*. T11 decides
on *action policy*: which action types exist, which selectors, which tokens,
which destinations, at what hours, how often.

## 2. The policy (`policy.json`, versioned, hashed)

`policy_id: t11-policy-v1`, sha256 `403e6395…159bb` (recomputed live; the
hash is stamped into every audit entry so a policy edit can never rewrite
history).

| Rule | What it does |
|---|---|
| `action_allowlist` | Only `native_transfer`, `erc20_transfer`, `contract_call`. `deploy` is absent on purpose — proposing it DENIES. |
| `network_firewall` | Only Atlantic chain 688689. Mainnet (1672) is **REFUSED outright** (`mainnet.enabled=false`); re-confirmation is required and never granted. |
| `selector_allowlist` | `contract_call` may only invoke 4 whitelisted ERC-20 selectors (`transfer`, `approve`, `mint`, `balanceOf`). |
| `token_allowlist` | `erc20_transfer` only for whitelisted token contracts (empty in v1 → such actions DENY until a token is added). |
| `destination_allowlist` | Two entries: the dust sink `0x0000…dEaD` and the deployer itself. |
| `per_action_caps` | `native_transfer` ≤ 0.01 PHRS; token/call actions carry 0 native value. |
| `time_window` | Writes approved only 02:00–08:00 UTC (demo window; the deny path is unit-tested). |
| `cooldown` | ≥ 60 s between approved writes, enforced from the audit trail. |

Fail-closed: missing, corrupt, or incomplete policy → REFUSE, never approve.

## 3. How a run works

```
propose → evaluate --action-file A.json → DENY  (named rule, no stamp, logged)
                                          → APPROVE (+ gate stamp, logged)
                                          → REFUSED_MAINNET (logged, nothing broadcast)
APPROVE → execute --action-file A.json --stamp S.json
          → 4 mandatory pre-checks → broadcast once (nonce lock) → receipt → logged
```

`evaluate` is pure: no RPC, no subprocess, no side effects — proven by a unit
test that replaces every side-effecting callable with one that explodes.
`execute` cannot run without a **fresh, audit-backed gate stamp**: the stamp
must be unexpired, bind exactly this action and this policy version, be
cryptographically intact, and have a matching APPROVE entry in the audit
chain. A forged/expired stamp → `REFUSE` (demonstrated in
`run-logs/nobypass.log`).

## 4. The 4 mandatory SkillEngine Write Operation Pre-checks

Enforced on the execute path, in order, before any broadcast:

- **P1** — private key present (value never printed).
- **P2** — key derives to `policy.sender` (`0xf76e…bC71a3`); any other key is a key-confusion firewall trip.
- **P3** — chain id read **live** from the RPC; anything but 688689 aborts.
- **P4** — balance covers value + 0.001 PHRS fee reserve (fail-closed on unreadable balance), plus gas-price sanity ≤ 50 gwei.

Mainnet re-confirmation: a mainnet-class proposal is refused at `evaluate`
time with `REFUSED_MAINNET` — no RPC call, no broadcast path exists.

## 5. No-bypass

The only sanctioned write path is `gatekeeper.py execute`, which requires a
valid stamp. Demonstrated: a tampered stamp (expiry edited) is refused with
`no-bypass: stamp signature mismatch (tampered)`, and the refusal is itself
audit-logged (entry 3). Honest scope: this is a software guardrail over the
agent's own executor — it cannot stop someone from calling `cast send`
directly, and it does not claim to.

## 6. Audit trail

`audit/check-log.jsonl`: append-only, each entry carrying `prev_hash` and a
sha256 `entry_hash` over its canonical content. `audit-verify` recomputes the
whole chain (verified: 7 entries intact). Tampering is detected and proven in
unit tests.

## 7. Evidence — how to verify in 60 seconds

1. `python3 gatekeeper.py audit-verify` → chain intact, 7 entries.
2. Entry 1: DENY — destination `0x1111…1111` not allowlisted (named rule).
3. Entries 2+5: APPROVE → EXECUTED, tx
   [`0xc471c8…159bb`](https://atlantic.pharosscan.xyz/tx/0xc471c8f7aa4d8cb0963f80335d190607a883ab749d2058f0d047d476678159bb)
   (block 31481699, 0.001 PHRS to the dust sink).
4. Entry 4: REFUSED_MAINNET — proof the mainnet path refuses without broadcast.
5. Entries 6+7: APPROVE → EXECUTED again, tx
   [`0x42c4a3…05b6329`](https://atlantic.pharosscan.xyz/tx/0x42c4a35d024c2bfc16807d04f2f3478ac96b3d06a99349cf9ac86f98e05b6329)
   (block 31486909, 0.001 PHRS to the *other* allowlisted recipient, deployer
   self — the allowlist has two live entries, both proven).
6. `python3 tests/test_policy_engine.py` → 22/22.

## 8. Honest limits

- The demo executor broadcasts only `native_transfer`; other approved action
  types honestly refuse at execute time ("needs calldata the demo does not
  build") rather than fake a broadcast.
- `token_allowlist` is empty in v1, so `erc20_transfer` always denies today —
  the rule is live, the list is just unpopulated.
- The time window is a demo window; production would set real ops hours.
- Cooldown is per-machine (audit file), not global across the 28 workers.
- Gate-stamp = software guardrail, not a cryptographic signature.
- **Not proxy-rewired (deliberate):** the console panel reads Atlantic directly
  because `/api/mcp` (the console's MCP proxy) serves Pharos mainnet 1672 only,
  and this task's policy is Atlantic-only (chain 688689) — rewiring it through
  the proxy would point it at the wrong chain. Direct Atlantic reads are the
  correct transport here; the Chain MCP cannot serve this chain.

## 9. Requirements → evidence

| # | Official requirement (T11) | How it is met | Evidence |
|---|---|---|---|
| 1 | Clear policy (allowlists/limits/denylists) | `policy.json` v1.0.0 (`t11-policy-v1`): action/selector/token/destination allowlists, per-action caps, time window, cooldown, gas cap; sha256-hashed into every audit entry | `policy.json`; `gatekeeper.py show-policy` → `policy_hash 403e6395…159bb` |
| 2 | Intercepts action pre-execution and checks | `evaluate` runs 8 checks (R0 network firewall → R7 cooldown) before anything can execute; `evaluate` is pure (no RPC, no subprocess) | `gatekeeper.py` `evaluate_action`; `tests/test_policy_engine.py` 22/22 |
| 3 | Blocks violations WITH explanation | DENY names the exact rule + detail (e.g. `destination_allowlist`: "destination 0x1111…1111 allowlisted=False"); no stamp minted, nothing broadcast; exit code 2 | `audit/check-log.jsonl` entry 1; `run-logs/deny.log`; `run-logs/action-deny.json` |
| 4 | Allows valid with check log | APPROVE mints a gate stamp (300 s TTL, binds action + policy hash); every decision — APPROVE, DENY, REFUSE, EXECUTED — appended to the hash-chained audit log | `audit/check-log.jsonl` entries 2,5,6,7; `audit-verify` → chain intact; `run-logs/approve-evaluate.log` |

Boundary proof (all live, 2026-10-20): exactly-at-cap 0.01 PHRS → APPROVE;
one wei over → DENY (`per_action_caps`); unknown selector → DENY
(`selector_allowlist`); mainnet action → `REFUSED_MAINNET`
(`network_firewall`); second approval within 60 s → DENY (`cooldown`).
No-bypass: forged stamp → REFUSE exit 3, nothing broadcast
(`run-logs/nobypass.log`). Missing policy → REFUSE exit 3 (fail-closed).
