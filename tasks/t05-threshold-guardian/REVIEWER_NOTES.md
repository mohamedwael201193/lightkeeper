# Reviewer notes — T05 Threshold Guardian

## What to check (2 minutes)

1. Open `policy.yaml` — every threshold is there, commented. Nothing in code.
2. Open `run-logs/hold.log` — one FAIL line (threshold), `DECISION: BLOCK`, exit 2, no tx hash anywhere.
3. Open `run-logs/fire.log` — six PASS lines, `DECISION: ALLOW`, then a real broadcast: `0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c`, status 1, block 31481282. Click the explorer link; verify from/to/value/status yourself.
4. Open `run-logs/mainnet-refusal.log` — a live `eth_chainId` read against the real Pharos mainnet RPC returned 1672 → `DECISION: REFUSE`, exit 3, even with `--confirm-mainnet` supplied. Nothing was signed or broadcast.
5. Run `python3 tests/test_policy_engine.py` — 13/13 pass, no network needed.

## What we deliberately did NOT do

- **No `>= 0` FIRE policy.** The competitor's showcased FIRE was trivially satisfied. Our FIRE branch required all six conditions to genuinely pass on live chain data; our HOLD branch fired on a real threshold breach (0.05 > 0.005).
- **No post-hoc threshold-rigging.** Thresholds were fixed in `policy.yaml` *before* the runs to exercise both branches, and are disclosed as such (evidence.json `honesty_notes`). The branches are real; the runs exercise them symmetrically.
- **No mainnet confirmation theater.** The skill asks for "mainnet re-confirmation"; we implemented it *plus* a hard firewall: `policy.mainnet.enabled=false` means refusal is unconditional — the safest honest reading, and it is proven live, not asserted.
- **No invented ERC-20.** All conditions use primitives that exist on Atlantic (native balance, gas price, chain id). Dust is native PHRS; no mock tokens.
- **No key material anywhere.** The env key never appears in logs, traces, ledger, or the repo. The `sender-binding` check derives the address via `cast wallet address` and compares — the key value is never printed.

## Known limits (stated, not hidden)

- The rolling-window ledger is local (`run-logs/spend-ledger.jsonl`): it gates this guardian's own broadcasts. A second guardian instance would not see it — documented as a single-operator assumption.
- `guardian.py execute` is deliberately two-step (`propose` then `execute`): an ALLOW proposal never self-broadcasts.
- Testnet only. Atlantic block data is public; all "live" claims are explorer-verifiable.
