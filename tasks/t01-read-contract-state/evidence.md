# T01 · Evidence — Read Contract State (≥300 words)

## What was built

A contract-state reader for Pharos Atlantic (chain 688689) in
`tasks/t01-read-contract-state/`. It deploys a minimal typed-state contract
(`KeeperRegistry`: uint256, address, string, uint8, and two mappings — 8
readable values total), then reads **every** state variable via `eth_call`,
all pinned to a single block, and pretty-prints raw hex, decoded values,
human formatting, and decoding notes. The deploy is the task's only
transaction; reads are free.

## Real on-chain facts

- **Deploy tx:** `0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b`
  — block **31481260**, status 1, gas used 399603 @ 1000000001 wei.
  Explorer: https://atlantic.pharosscan.xyz/tx/0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b
- **Contract:** `0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD`
  Explorer: https://atlantic.pharosscan.xyz/address/0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD
- **Live read (pinned block 31481725):** totalLamps=3, keeper=
  0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3, realmName="Atlantic Deep",
  decimals=6, lampBalanceOf(keeper)=3000000 (3.000000 lamps), lampBearer(0..2)=keeper.
- **Slot proof:** `eth_getStorageAt(keccak256(keeper ‖ slot4))` returned the
  identical 3000000 — the mapping layout is demonstrated, not asserted.

## Honesty notes (what didn't go as the spec literally said)

1. The task spec asks for a `forge script` deploy. `forge script`'s on-chain
   simulation passes the block number as a raw JSON number, which the Atlantic
   RPC rejects (`PARAM_VERIFY_ERROR: failed to parse block hash or number` —
   reproduced with isolated probes against `eth_getBalance`/`eth_getBlockByNumber`;
   `eth_call` tolerates it, the others don't). Deployment used
   `forge create --broadcast` instead: one signed tx, nonce-safe under
   `flock /tmp/lk-nonce.lock`. The `script/DeployKeeper.s.sol` recipe is kept
   in-repo; the deviation is documented in README §8, not hidden.
2. The public hosted Chain MCP (`mcp.pharos.xyz`) serves **mainnet only**, so
   Atlantic reads use direct JSON-RPC `eth_call` — the identical primitive
   behind Chain MCP's `eth_call` tool. Stated in the reader output and README,
   never implied otherwise.

## Spend log (≤ 0.15 PHRS budget)

| Action | Tx hash | Gas used | Gas price (wei) | Cost (PHRS) |
|---|---|---|---|---|
| Deploy `KeeperRegistry` | `0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b` | 399603 | 1000000001 | **0.0003996030** |
| All reads (`eth_call`) | — (no tx) | 0 | — | 0 |
| **Total** | | | | **0.0003996030** |

## Test run

`test/run-tests.sh` — 5 groups against the live deployment: (1) reader runs
clean + manifest emitted; (2) all 8 values re-read via **independent raw
curl JSON-RPC** at the pinned block and byte-compared; manifest decoded values
asserted equal; (3) mapping slot layout re-verified independently;
(4) negative path 2/2 fail loudly + no-code-address read aborts;
(5) chain-id gate aborts on mismatch. Result: **all PASS, 0 failed**.

## Artifacts

- `sample-output/transcript-live.txt` — real terminal transcript of the read
- `sample-output/transcript-negative.txt` — negative-path transcript
- `evidence/run-manifest.json` — generated per-run manifest (tool, chain,
  block + hash, all values raw/decoded/human, slot check, no-mock attestation)
- `deployment.json` — contract, deploy tx, block, explorer links
- Every link in `LINKS.md` was curl-verified HTTP 200.
