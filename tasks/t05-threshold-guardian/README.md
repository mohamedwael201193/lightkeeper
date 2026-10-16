<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:12px;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:42px;letter-spacing:0.18em;">THRESHOLD GUARDIAN</div>
  <div style="color:#f4f6ff;font-size:14px;margin-top:12px;letter-spacing:0.06em;">LIGHTKEEPER · T05 · lamp five of twenty-eight</div>
</div>

*The keeper's hand stays the lamp it cannot vouch for — every transfer passes
the gate, or it does not pass at all.*

---

## 1 · What this is

A **policy gate that intercepts proposed transfers and BLOCKS any write that
breaches configured thresholds**. It is not a demo of a guardian — it *is*
the guardian that signed this task's only broadcast. A proposal enters;
six independent conditions are read live from the chain; a decision trace
is emitted; and only `ALLOW` reaches `cast send` — under a nonce lock, once,
with a receipt. `BLOCK` and `REFUSE` never broadcast. `REFUSE` is reserved
for mainnet-class actions, which this guardian declines outright, with no
override flag.

## 2 · The 4 mandatory Write Operation Pre-checks

Per the SkillEngine skill (`~/workspace/custom-skills/pharos-skill-engine/SKILL.md`,
"Write Operation Pre-checks"), implemented as pipeline conditions:

| # | Skill pre-check | Guardian condition | How |
|---|---|---|---|
| 1 | Private key check | `key-present` | env `DEPLOYER_PRIVATE_KEY` set; value never printed/logged |
| 2 | Derive public address, confirm | `sender-binding` | `cast wallet address` must derive to `policy.sender`; proposal sender must match |
| 3 | Network confirmation | `network` | `eth_chainId` read live; anything but 688689 ⇒ refused. Mainnet ⇒ REFUSE even with explicit re-confirmation (`policy.mainnet.enabled=false` is a hard firewall) |
| 4 | Automatic balance check | `balance` | `eth_getBalance` ≥ value + worst-case fee reserve; fail-closed on stale data |

Plus T05's own: **threshold** (per-tx + rolling-window caps) and **gas-price
sanity** (`eth_gasPrice` ≤ policy cap) — six conditions total, every one
configurable in `policy.yaml`.

## 3 · The policy file

One file, plain words, every number commented — `policy.yaml`:

```yaml
sender: "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
network:
  allowed_chain_id: 688689        # Atlantic testnet ONLY
  mainnet: { chain_id: 1672, enabled: false }   # listed only to be refused
limits:
  max_per_tx_phrs: "0.005"
  max_per_window_phrs: "0.02"
  window_minutes: 60
  max_gas_price_gwei: "50"
```

Nothing is hard-coded in `guardian.py`. Validate with
`python3 guardian.py validate`.

## 4 · How to run (both outcomes)

```bash
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ~/workspace/lightkeeper/.env; set +a

# HOLD — above threshold → BLOCKED, exit 2, no broadcast
python3 guardian.py propose --to 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --value-phrs 0.05

# FIRE — below threshold → APPROVED; `execute` broadcasts once (real tx)
python3 guardian.py execute --to 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --value-phrs 0.0001

# REFUSE — mainnet-class action → REFUSED, exit 3, no broadcast, no key use
python3 guardian.py propose --network mainnet --to 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --value-phrs 0.0001
```

Exit codes: `0` = ALLOW/success · `1` = error · `2` = BLOCK · `3` = REFUSE.
Audit trail: `run-logs/guardian-audit.jsonl` (one JSON line per evaluation).
Spend ledger: `run-logs/spend-ledger.jsonl` (feeds the rolling-window check).

## 5 · Evidence (real, on Atlantic testnet)

- **HOLD:** `run-logs/hold.log` — 0.05 PHRS proposal BLOCKED (`0.050000 PHRS >
  max_per_tx 0.005 PHRS`), exit 2, nothing broadcast, nothing spent.
- **FIRE:** `run-logs/fire.log` — 0.0001 PHRS self-transfer, 6/6 PASS →
  broadcast `0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c`,
  status 1, block 31481282 —
  https://atlantic.pharosscan.xyz/tx/0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c
- **REFUSE:** `run-logs/mainnet-refusal.log` — live `eth_chainId` read against
  the Pharos mainnet RPC returned 1672 → REFUSE, exit 3. Refused again with
  `--confirm-mainnet` supplied: refusal is unconditional.
- **Unit tests:** `python3 tests/test_policy_engine.py` — 13/13 pass (offline,
  mocked chain): boundary at threshold, rolling window, gas spike,
  insufficient balance, stale-data fail-closed, wrong-chain, mainnet refuse
  ±confirmation, missing key.
- **Spend:** 0.00031 PHRS total (0.0001 value + 21000 gas @ 10 gwei) of the
  0.15 budget. See `evidence.json` for the machine-readable log.

## 6 · Security & honesty

- Secrets live only in `~/workspace/lightkeeper/.env` (mode 600); the key
  value never appears in code, logs, traces, or this repo.
- Every broadcast goes through `flock /tmp/lk-nonce.lock` (28 builders share
  one key; no invented nonce schemes).
- Fail-closed: any unreadable/stale chain data ⇒ BLOCK, never guess.
- Thresholds were chosen up front to exercise both branches (0.005 cap;
  0.05 blocked; 0.0001 fired) — symmetric disclosure, not post-hoc rigging.
- Atlantic testnet only; dust amounts; mainnet is refused by policy.

## 7 · Reproduce / verify

1. `python3 guardian.py validate` — policy parses.
2. `python3 tests/test_policy_engine.py` — 13/13.
3. Re-run the HOLD and REFUSE commands — exits 2 and 3, no tx.
4. Open the FIRE tx on the explorer and confirm status 1, block 31481282,
   from/to `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`, value 0.0001 PHRS.
5. Confirm the audit JSONL line for each run matches the console trace.

## 8 · Links & submission

- Links (all curl-verified 200): `LINKS.md`
- Reviewer notes (what to check, what we deliberately did not do): `REVIEWER_NOTES.md`
- Exact copy-paste Arena submission pack: `SUBMISSION.md`
- 45–90s filming guide: `VIDEO-GUIDE.md`
- Machine-readable evidence: `evidence.json`
