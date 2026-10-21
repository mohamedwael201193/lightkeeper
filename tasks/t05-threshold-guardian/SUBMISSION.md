# SUBMISSION.md — T05 Threshold Guardian (copy-paste Arena pack)


## Title

Threshold Guardian — policy gate that blocks threshold-breaching transfers

## One-liner

A SkillEngine policy gate that intercepts proposed transfers, evaluates three
live chain reads plus three off-chain policy checks against a single commented
policy file, and BLOCKS any write that breaches thresholds — with a mainnet hard-firewall.

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
- **WINDOW-LOAD ×4 + WINDOW-BLOCK (deep edge)** — four 0.0045 PHRS dust fires, each ALLOW → broadcast (status 1, blocks 31486305/31486321/31486393/31486440):
  - `0xb1ba9e2dc1c03e39d6896ecb07c063cf2a8b6a37712d47a321fae3213fd59a18`
  - `0x04effe58f393349714ff6a5badeff5780d2c30ccce238f8184075854eb223f3f`
  - `0xe160ca25fd76966a867fd36b761c08831ad54ed395069cfb59e1dc23ed912e7b`
  - `0xe51e3e9b7fb93d9232d092725eedd6aac6d6d8f3d1688e4def8bf9ad0d6e85c3`

  The spend ledger then holds 0.018 PHRS inside the 60-minute window, so a fifth 0.0045 PHRS proposal — which *passes* per-tx (0.0045 ≤ 0.005) and every other condition — is BLOCKED on the rolling window alone (`0.018 + 0.0045 = 0.0225 > 0.02`), exit 2, nothing broadcast. `run-logs/window.log`. The aggregate gate proven with a real on-chain ledger behind it, not a mocked counter.
- **REFUSE (bonus)** — mainnet-class proposal: live `eth_chainId` read against the real Pharos mainnet RPC returned 1672 → REFUSE, exit 3, refused again *with* explicit re-confirmation supplied. `run-logs/mainnet-refusal.log`.

**Tests:** 13/13 unit tests pass offline (`tests/test_policy_engine.py`):
boundary at threshold, rolling window, gas spike, insufficient balance,
stale-data fail-closed, wrong-chain refuse, mainnet refuse ± re-confirmation,
missing key.

## Console try-it-live surface (interactive, Tier B)

`apps/console/src/components/try/threshold-guardian.tsx` — "The guardian you
can trigger." The visitor configures the same policy (inputs prefilled from
`policy.yaml`: max_per_tx 0.005, rolling window 0.02/60m, max gas 50 gwei),
then RUNs the gate: the console evaluates six conditions client-side against
**live Atlantic reads** (`eth_chainId`, `eth_gasPrice`, `eth_getBalance` of the
visitor's address) and renders a condition-by-condition trace with the exact
numbers compared (each condition PASS/BLOCK, e.g.
`0.0001 PHRS ≤ 0.005 PHRS (max_per_tx)`).

- **ALLOW path:** the visitor proposes a dust self-transfer (0.0001 PHRS to
  their own address) → mandatory review step (to / value / estimated cost, dust
  warning as amber) → they sign in THEIR wallet → receipt + explorer link.
  "Your tx — signed in your wallet, from your address." The rolling-window
  check counts the visitor's own confirmed session txs.
- **HOLD path:** a one-click "propose 0.05 PHRS" negative shows the trace go
  BLOCKED — nothing proposed, nothing signed, nothing broadcast, nothing spent.
- **History:** the task's real audit trail from `evidence.json` (HOLD, FIRE
  with tx hash, four WINDOW-LOAD fires, the WINDOW-BLOCK edge, two REFUSEs)
  plus spend ledger 0.01915/0.15 PHRS.

## Links

- Source (commit-pinned): https://github.com/mohamedwael201193/lightkeeper/tree/dc949c522fa32ccd7e66198e9e82fa8fb517c9e0/tasks/t05-threshold-guardian
- Demo video: https://hallowed-lichen-6ef2.here.now/T05-threshold-guardian.mp4
- FIRE tx: https://atlantic.pharosscan.xyz/tx/0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c
- Share link (portal session): PENDING — coordinator adds if/when available

## Transaction hashes

- FIRE (approved + broadcast, Atlantic): `0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c`
- WINDOW-LOAD 1–4 (approved + broadcast, Atlantic, all status 1):
  - `0xb1ba9e2dc1c03e39d6896ecb07c063cf2a8b6a37712d47a321fae3213fd59a18`
  - `0x04effe58f393349714ff6a5badeff5780d2c30ccce238f8184075854eb223f3f`
  - `0xe160ca25fd76966a867fd36b761c08831ad54ed395069cfb59e1dc23ed912e7b`
  - `0xe51e3e9b7fb93d9232d092725eedd6aac6d6d8f3d1688e4def8bf9ad0d6e85c3`
- HOLD: none — honestly blocked, no broadcast.
- WINDOW-BLOCK: none — honestly blocked on the rolling window, no broadcast.
- REFUSE: none — honestly refused, no broadcast.

**Spend:** 0.01915 PHRS total (0.0181 value + gas across five broadcasts), of a 0.15 PHRS budget. Honest disclosure: thresholds were fixed up front to
exercise both branches symmetrically — never post-hoc rigging.

## How to run

```bash
export PATH="$HOME/.foundry/bin:$PATH"
python3 guardian.py validate
python3 guardian.py propose --to <addr> --value-phrs 0.05     # BLOCK, exit 2
python3 guardian.py execute --to <addr> --value-phrs 0.0001   # ALLOW + broadcast
python3 guardian.py propose --network mainnet --to <addr> --value-phrs 0.0001  # REFUSE, exit 3
python3 tests/test_policy_engine.py                          # 13/13
```
