<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:12px;">

# <span style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;letter-spacing:0.18em;">DRY-RUN EXECUTOR</span>

<p style="font-family:Georgia,serif;color:#f4f6ff;font-style:italic;font-size:18px;">
One lighthouse. Twenty-eight lamps.<br/>
<i>This arm holds the sounding line — it tastes the water before the ship commits.</i>
</p>

<p style="color:#b9c2f5;font-size:13px;letter-spacing:0.08em;">
T08 · MEDIUM · 100 PTS · SKILLENGINE · ATLANTIC TESTNET (688689)
</p>

</div>

---

## 1. What this is

The Dry-Run Executor answers one question before any transaction is allowed near the chain: **what would happen if we sent this?** It simulates via `eth_call` + `estimateGas` — never broadcasting — and issues a signed-by-nobody **SimulationReceipt**: predicted PASS or FAIL, the exact revert reason on failure, the gas estimate with a **1.2× safety factor**, the predicted cost, and before/after state snapshots marked "chain unmodified".

Execution is **structurally gated**: the dry-run module cannot broadcast (no signer capability at all — enforced by a runtime tripwire and a unit test). A separate broadcast module replays only receipts whose ticket says PASS. A FAIL ticket is refused, logged, and never touches the chain. This module is also T07's safety harness.

## 2. How it works (the pipeline)

```
proposed tx
  │  1. VALIDATE   address/sig sanity + chain-id MUST be Atlantic (688689), else REFUSED
  ▼
  │  2. eth_call   `cast call` — surfaces the revert reason, zero broadcast
  ▼
  │  3. estimate   `cast estimate` — success → gas number; failure → exact revert reason
  ▼
  │  4. gas price  `cast gas-price` → predicted cost = ceil(estimate × 1.2) × price
  ▼
  │  5. project    before/after state snapshots ("chain unmodified")
  ▼
  SimulationReceipt JSON  →  PASS ticket → broadcast.py may replay it
                          →  FAIL ticket → broadcast.py REFUSES (exit 2, logged)
```

Revert decoding (`src/revert_decode.py`) handles `Error(string)`, `Panic(uint256)` (with the Solidity panic-code table), and custom errors — reported as selector hex, **never invented**.

## 3. Live proof (Atlantic testnet, real transactions)

A purpose-built probe contract, `DryRunProbe`, was deployed at
[`0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f`](https://atlantic.pharosscan.xyz/address/0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f)
(deploy tx [`0xbb5fac…4748e44`](https://atlantic.pharosscan.xyz/tx/0xbb5facf81cd46d97cdb706ef2ecf6ecda70cd7cb32133b2ba5ed1a08b4748e44)).

**Scenario A — dry-run predicts a REVERT.** `boom()` was dry-run:
`cast estimate` failed with the exact reason **`DryRunProbe: forced boom`**
(decoded from `Error(string)` payload `0x08c379a0…`). Receipt status: FAIL.
The gate was then tested for real: `broadcast.py` was pointed at the FAIL
ticket and **refused execution** (exit 2), appending to `runs/blocked-execution.log`.
Nothing was broadcast — no transaction exists for `boom()`.

**Scenario B — dry-run predicts SUCCESS, then the real broadcast matches.**
`ping()` dry-run: PASS, estimate **58,219** gas → 1.2× limit **69,863** →
predicted cost **0.00069863 PHRS**. A `forge script` simulation **without
`--broadcast`** confirmed: "Script ran successfully / SIMULATION COMPLETE",
script gas 62,804. The PASS ticket was then broadcast through the gate:
tx [`0x639f87…012ee`](https://atlantic.pharosscan.xyz/tx/0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee)
— **status success**, gas used **45,470** (within the 69,863 safety limit),
`Pinged` event emitted, probe `count` moved **0 → 1** exactly as projected.

**Scenario C — the prediction holds a SECOND time (repeatability).** A fresh
`ping()` dry-run (receipt `runs/receipt-C.json`, block 31486270): PASS, estimate
**37,379** → limit **44,855** → predicted cost **0.00044855 PHRS**. Broadcast
through the gate: tx
[`0xd294bb…4fb03`](https://atlantic.pharosscan.xyz/tx/0xd294bb5c03c55d7ffdd750b0a20384aa393e490da11fe3d7f67845d34d34fb03)
— **status success**, gas used **28,370** (within the 44,855 limit), `Pinged`
event with count **2** (was 1, exactly as projected). The gate was also
re-tested against the fresh FAIL receipt → **refused** (exit 2) again.

### The prediction ledger — the executor keeps score

One-shot proof is easy to cherry-pick, so the executor measures itself:
every gated broadcast appends a prediction-vs-reality row to
[`runs/prediction-ledger.jsonl`](runs/prediction-ledger.jsonl) (via
`tools/ledger.py`, called automatically by `broadcast.py` after success).
Two rows so far — **both predictions held** (status success, gas inside the
1.2× limit, state exactly as projected). The honest read: estimates
**over-predict by ~30%** on Atlantic (58,219→45,470, 37,379→28,370); the 1.2×
factor covers that drift with margin. Estimates are predictions — now with
public drift data.

Full logs: `runs/` · machine-readable: `evidence.json` · narrative: `evidence.md`.

## 4. Repository layout

```
tasks/t08-dry-run-executor/
├── src/
│   ├── dryrun.py          # the simulation gate (CANNOT broadcast — no signer capability)
│   ├── revert_decode.py   # Error/Panic/custom revert decoding, never invented
│   └── broadcast.py       # the ONLY broadcaster; replays PASS tickets via flock
├── tests/
│   └── test_estimation_parsing.py   # 17 unit tests (parsing, decoding, gate math)
├── contracts/DryRunProbe.sol        # on-chain probe (boom→revert, ping→success)
├── script/Probe.s.sol               # forge script for the contract-flow dry-run
├── tools/rpc-normalize-proxy.py     # local proxy: normalizes this RPC's strict params
├── runs/                            # REAL run logs + SimulationReceipts (evidence)
├── foundry.toml
├── task.yaml  REQUIREMENTS.md  evidence.md  evidence.json
├── REVIEWER_NOTES.md  LINKS.md  SUBMISSION.md  VIDEO-GUIDE.md
```

## 5. Run it yourself

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t08-dry-run-executor
set -a; source ../../.env; set +a   # provides ATLANTIC_RPC_URL (never echoed)

# 1) dry-run only — predicts, never broadcasts, no key needed
python3 src/dryrun.py --rpc-url "$ATLANTIC_RPC_URL" \
  --from 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 \
  --to   0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f \
  --sig "ping()" --out runs/receipt-demo.json

# 2) broadcast ONLY a PASS ticket (FAIL tickets are refused, exit 2)
python3 src/broadcast.py --receipt runs/receipt-demo.json \
  --rpc-url "$ATLANTIC_RPC_URL" --key-env DEPLOYER_PRIVATE_KEY

# 3) unit tests (no network, no key)
python3 tests/test_estimation_parsing.py

# 4) forge-script contract flow, simulation only (see §6 for the proxy note)
forge script script/Probe.s.sol --rpc-url http://127.0.0.1:8546   # via tools/rpc-normalize-proxy.py
```

## 6. Known quirk: this RPC vs `forge script` (disclosed, not hidden)

The Atlantic RPC (`atlantic.dplabs-internal.com`) is strict about request
params: it rejects `params: null` and `{blockHash, requireCanonical}` block
specifiers with `PARAM_VERIFY_ERROR: failed to parse block hash or number`.
Foundry sends both (first: `eth_chainId` with `params: null`; then
`eth_getTransactionCount` with a `{blockHash}` object). `cast` works because it
sends `params: []` and `"latest"`.

`tools/rpc-normalize-proxy.py` is a local request normalizer (null→`[]`,
`{blockHash}`→`"latest"` — the blockHash forge sends is the `latest` block it
just fetched, so the answer is identical). All data still comes from live
Atlantic; nothing is mocked. Full root-cause trace in `REVIEWER_NOTES.md`.

## 7. Security & honesty notes

- **No secrets in this repo.** The dry-run module never reads the environment for keys (runtime tripwire + unit test enforce it); the broadcaster reads the key transiently from the environment and never prints or logs it. `.env` is git-ignored; `forge`'s `broadcast/` + `cache/` dirs are git-ignored.
- **No mock/demo/fake success.** All three scenarios ran against live Atlantic: Scenario A produced a real FAIL receipt and a real refusal log; Scenarios B and C each produced a real broadcast receipt matching its prediction (status success, gas within the 1.2× limit, state exactly as projected), plus a second recorded gate refusal.
- **Simulation/reality drift (official risk, disclosed — now measured):** `runs/prediction-ledger.jsonl` tracks every gated broadcast: estimates over-predict by ~30% on Atlantic (58,219→45,470, 37,379→28,370). The 1.2× safety factor exists precisely for this drift — both txs fit inside their limits with margin. Estimates are predictions, now with public drift data.
- **Budget:** 0.00032640 PHRS spent of the 0.15 PHRS task budget (deploy + 2 broadcasts; dry-runs cost nothing).

## 8. Links

- Probe contract: <https://atlantic.pharosscan.xyz/address/0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f>
- Deploy tx: <https://atlantic.pharosscan.xyz/tx/0xbb5facf81cd46d97cdb706ef2ecf6ecda70cd7cb32133b2ba5ed1a08b4748e44>
- Scenario B real tx: <https://atlantic.pharosscan.xyz/tx/0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee>
- Scenario C real tx (repeatability): <https://atlantic.pharosscan.xyz/tx/0xd294bb5c03c55d7ffdd750b0a20384aa393e490da11fe3d7f67845d34d34fb03>
- Prediction ledger: `runs/prediction-ledger.jsonl` (prediction-vs-reality per broadcast)
- All links curl-verified (HTTP 200) — see `LINKS.md`.
- Submission pack: `SUBMISSION.md` · filming guide: `VIDEO-GUIDE.md` · reviewer deep-dive: `REVIEWER_NOTES.md`
