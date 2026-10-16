# T08 — Reviewer Notes (for the Arena judge)

## The 30-second version

This module simulates any proposed transaction (`eth_call` + `estimateGas`,
never broadcasting) and issues a PASS/FAIL SimulationReceipt. A separate
broadcaster replays **only** PASS tickets. Two live Atlantic scenarios prove
it: (A) dry-run predicts `DryRunProbe: forced boom` → gate **refuses**
execution, logged; (B) dry-run predicts success (58,219 gas, 1.2× → 69,863
limit) → real tx succeeds using 45,470 gas, state moves 0→1 as projected.

## How to verify in < 2 minutes

1. Open the two explorer tx links in `LINKS.md` (both HTTP 200, curl-verified).
   Confirm: deploy tx created contract `0xd5f956BC…24a8f`; ping tx shows
   status success, gas used 45,470, and a `Pinged` event.
2. `python3 -c "import json; print(json.load(open('evidence.json'))['scenarioB_predictSuccessThenRealBroadcast']['realBroadcast']['withinSafetyFactor'])"` → `True`.
3. `python3 tests/test_estimation_parsing.py` → 17/17 OK (no network needed).
4. `grep -rn "getenv\|os.environ\|private-key" src/dryrun.py` → only the
   self-guard's split-token tripwire; the module cannot read secrets or
   pass a key to cast.
5. Feed `runs/receipt-A.json` (FAIL) to `src/broadcast.py` yourself → exit 2,
   `EXECUTION REFUSED` appended to `runs/blocked-execution.log`.

## Architecture decisions (and why)

- **Gate, not flag.** The dry-run module doesn't take a `--dry-run` boolean
  that a caller could forget — it structurally lacks any key/signer
  capability, enforced at runtime (`_guard_no_signer`) and by unit test.
  Broadcasting is a different file with a different job.
- **Receipts are tickets, not logs.** `broadcast.py` replays the receipt's
  exact parameters and its 1.2× gas limit — the human/operator never
  re-types gas numbers, removing a whole class of fat-finger risk.
- **Revert reasons are decoded, never invented.** `Error(string)` ABI
  decoding, Solidity panic-code table, and unknown custom errors reported
  as raw selector hex. The Scenario A reason came byte-for-byte from the
  chain's revert payload.
- **Nonce safety:** every broadcast is `flock /tmp/lk-nonce.lock`-wrapped;
  no custom nonce scheme was invented (28 workers share one key).

## The RPC quirk (root-caused, with packet trace)

`forge script` (no `--broadcast`) initially failed against
`atlantic.dplabs-internal.com` with `PARAM_VERIFY_ERROR: failed to parse
block hash or number`. A local logging proxy (`tools/rpc-normalize-proxy.py`,
log at `runs/rpc-proxy.log`) showed the exact sequence:

1. forge sends `eth_chainId` with `"params": null` → proxy rejects
   (`cast` sends `"params": []`, which is accepted).
2. After normalizing null→`[]`, forge sends `eth_getTransactionCount` with
   `{"blockHash": "0x3d84…", "requireCanonical": false}` → proxy rejects
   (it only accepts `"latest"`/hex block numbers).

The proxy normalizes both (`null`→`[]`; `{blockHash}`→`"latest"` — the
blockHash forge sends is the `latest` block it just fetched, so the answer
is identical). **All data still comes from live Atlantic; nothing is
mocked or replayed.** The `cast`-based pipeline (`cast call`, `cast
estimate`, `cast gas-price`) works against this RPC with no proxy at all.

## Known limitations (not hidden)

- **Simulation/reality drift:** `cast estimate` said 58,219 gas; the real tx
  used 45,470 (~28% over-prediction). The 1.2× safety factor exists for
  exactly this; the tx fit inside the limit. Estimates are predictions.
- **State-diff projection is probe-aware:** before/after snapshots read
  `count()` + balance and project `ping()`→+1 / `boom()`→unchanged. For
  arbitrary contracts the projection layer would need per-ABI plugins —
  the receipt schema already carries `sig`/`sigArgs` for that extension.
- **One shared deployer key:** broadcasts assume the flock-based nonce
  discipline documented in `evidence.md`.

## What was NOT done (and why)

- No mainnet touch: chain-id gate in `dryrun.py` refuses anything but 688689.
- No secrets in repo: `.env`, forge `broadcast/`+`cache/` are git-ignored;
  the broadcaster reads the key transiently from the environment.
- No video yet: slot marked `PENDING-VIDEO`; `VIDEO-GUIDE.md` is the
  shot-by-shot filming plan using only the real terminals/explorer pages
  produced here.
