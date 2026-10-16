# SUBMISSION.md — T05 Threshold Guardian (copy-paste Arena pack)


## Title

Threshold Guardian — policy gate that blocks threshold-breaching transfers

## One-liner

A SkillEngine policy gate that intercepts proposed transfers, evaluates six
independent on-chain conditions against a single commented policy file, and
BLOCKS any write that breaches thresholds — with a mainnet hard-firewall.

## Description

Threshold Guardian is LIGHTKEEPER's T05 lamp: a policy gate standing between
any proposed transfer and the chain.

**What it does.** `guardian.py` takes a transfer proposal and runs it through
six independent conditions, every one read live from the chain and every one
configurable in one commented file (`policy.yaml`):

1. **Private key check** — key present in env (value never logged).
2. **Sender binding** — env key derives to the policy sender; proposal must match.
3. **Network check / mainnet firewall** — `eth_chainId` read live; anything but Atlantic (688689) is REFUSED. Mainnet-class actions are refused *unconditionally* — `policy.mainnet.enabled=false` — even with explicit re-confirmation supplied.
4. **Threshold check** — value ≤ `max_per_tx_phrs` (0.005) AND rolling-window total ≤ `max_per_window_phrs` (0.02/60m).
5. **Gas-price sanity** — `eth_gasPrice` ≤ 50 gwei cap.
6. **Balance sufficiency** — `eth_getBalance` covers value + worst-case fee reserve.

These implement the SkillEngine toolkit's 4 mandatory Write Operation
Pre-checks (private key, address derivation, network confirmation, balance
check) as first-class evaluated conditions. Every run emits a decision trace
(each condition's live value, pass/fail, reason, final decision) to console
and `run-logs/guardian-audit.jsonl`. Fail-closed: stale/unreadable data ⇒
BLOCK, never guess. ALLOW is the only path that broadcasts — exactly once,
under a nonce lock, waiting for the receipt.

**Both outcomes demonstrated on Atlantic testnet (chain 688689):**

- **HOLD** — 0.05 PHRS proposal → BLOCKED (0.05 > max_per_tx 0.005), exit 2, no broadcast, nothing spent. `run-logs/hold.log`.
- **FIRE** — 0.0001 PHRS self-transfer, 6/6 conditions PASS → broadcast and mined: tx `0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c`, status 1, block 31481282. Explorer: https://atlantic.pharosscan.xyz/tx/0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c
- **REFUSE (bonus)** — mainnet-class proposal: live `eth_chainId` read against the real Pharos mainnet RPC returned 1672 → REFUSE, exit 3, refused again *with* explicit re-confirmation supplied. `run-logs/mainnet-refusal.log`.

**Tests:** 13/13 unit tests pass offline (`tests/test_policy_engine.py`):
boundary at threshold, rolling window, gas spike, insufficient balance,
stale-data fail-closed, wrong-chain refuse, mainnet refuse ± re-confirmation,
missing key.

**Spend:** 0.00031 PHRS total (0.0001 value + 21000 gas @ 10 gwei), of a
0.15 PHRS budget. Honest disclosure: thresholds were fixed up front to
exercise both branches symmetrically — never post-hoc rigging.

## Links

- Source (commit-pinned): https://github.com/mohamedwael201193/lightkeeper/tree/d9ef4d7f02542483734fef43cb58b20c6fcc6cbc/tasks/t05-threshold-guardian
- Demo video: PENDING-VIDEO
- FIRE tx: https://atlantic.pharosscan.xyz/tx/0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c
- Share link (portal session): PENDING — coordinator adds if/when available

## Transaction hashes

- FIRE (approved + broadcast, Atlantic): `0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c`
- HOLD: none — honestly blocked, no broadcast.
- REFUSE: none — honestly refused, no broadcast.

## How to run

```bash
export PATH="$HOME/.foundry/bin:$PATH"
python3 guardian.py validate
python3 guardian.py propose --to <addr> --value-phrs 0.05     # BLOCK, exit 2
python3 guardian.py execute --to <addr> --value-phrs 0.0001   # ALLOW + broadcast
python3 guardian.py propose --network mainnet --to <addr> --value-phrs 0.0001  # REFUSE, exit 3
python3 tests/test_policy_engine.py                          # 13/13
```
