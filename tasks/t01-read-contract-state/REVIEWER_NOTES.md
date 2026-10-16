# T01 · REVIEWER NOTES (paste-ready for the Arena submission form)

**What this is:** a contract-state reader for Pharos Atlantic (chain 688689).
It reads 8 typed values from one contract — `totalLamps` (uint256), `keeper`
(address), `realmName` (string), `decimals` (uint8), `lampBalanceOf(keeper)`
and `lampBearer(0..2)` (mappings) — all pinned to a single block, with raw
hex, decoded values, human formatting, and address labels. Decimals are read
from the contract itself, never assumed. A mapping storage-slot proof
(`eth_getStorageAt(keccak256(keeper‖slot4))`) is recomputed independently and
shown matching.

**How to verify in 60 seconds:**
1. Open the contract on the explorer:
   https://atlantic.pharosscan.xyz/address/0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD
2. Open the deploy tx:
   https://atlantic.pharosscan.xyz/tx/0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b
3. Clone the repo subfolder, set `ATLANTIC_RPC_URL=https://atlantic.dplabs-internal.com`,
   run `bin/read-contract-state.sh` — it asserts chain 688689 first, then prints
   all 8 values with the pinned block. Run `bin/read-contract-state.sh --negative`
   to see both failure cases fail loudly. Run `bash test/run-tests.sh` for the
   full suite (reader vs independent raw-JSON-RPC re-reads).

**Coverage of the 4 official bullets:** (1) 8 values ≥ 3, via `eth_call` (the
JSON-RPC primitive behind Chain MCP's `eth_call`; the hosted MCP serves mainnet
only, so Atlantic reads go direct-RPC — stated openly); (2) contract address +
pinned block number + block hash on every run; (3) decimals applied from the
chain, addresses checksummed and labelled; (4) README with contract, run
command, and real sample output.

**Known honest deviations:** `forge script` cannot simulate against this RPC
(it sends the block as a raw JSON number → `PARAM_VERIFY_ERROR`); deploy used
`forge create --broadcast` (one tx, nonce-safe). Documented in README §8.

**Cost:** 0.00039961 PHRS total (1 deploy tx; reads free). No mocks, no
fixtures, no placeholders anywhere in this task.
