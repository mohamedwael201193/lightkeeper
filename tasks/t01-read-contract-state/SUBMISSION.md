# T01 — SUBMISSION PACK (copy-paste into the Arena form — do NOT submit on my behalf)

## Title
T01 · Read Contract State — KeeperRegistry live reader (Atlantic)

## One-liner
Reads 8 typed state values from a live Atlantic contract, all pinned to one
block, with human formatting, address labels, and an independent storage-slot
proof — failures fail loudly, never silently.

## Full description
A contract-state reader for Pharos Atlantic (chain 688689). It deploys a
minimal typed-state contract (`KeeperRegistry`: uint256, address, string,
uint8, and two mappings — 8 readable values total), then reads every state
variable via `eth_call` — the JSON-RPC primitive behind Chain MCP's `eth_call`
tool (the hosted Chain MCP serves mainnet only, so Atlantic reads go
direct-RPC with identical semantics; stated openly in the README). All reads
are pinned to a single block (block number + hash shown on every run).
Decimals are read from the contract itself (6) and applied to the balance
(`3.000000 lamps`); addresses are checksummed and labelled; a mapping
storage-slot proof (`eth_getStorageAt(keccak256(keeper‖slot4))`) is recomputed
independently and shown matching the view result. Failure states are
first-class: wrong chain-id, no-code address, unknown selector, and empty
returns all abort loudly — demonstrated by `bin/read-contract-state.sh
--negative` (2/2 fail loudly). Evidence: deploy tx
0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b (block
31481260), contract 0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD, per-run
evidence manifest, real terminal transcripts, and a live test suite (reader
vs independent raw-JSON-RPC re-reads — all pass). Total spend: 0.00039961
PHRS (1 deploy tx; reads are free). No mocks, no fixtures, no placeholders.

## Repo link (commit-pinned subfolder)
https://github.com/mohamedwael201193/lightkeeper/tree/b4a53c58fcb92f3d41ed56ed880596ed8c7d6075/tasks/t01-read-contract-state

## Proof links
- Deploy tx: https://atlantic.pharosscan.xyz/tx/0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b
- Contract: https://atlantic.pharosscan.xyz/address/0xe1Ae5eC5B4416e7d725981946e11aF0A44bF4ecD

## Transactions
- Deploy: 0xe181acf0a80fa9b09ba0f77afe92c8f5faa36c193cf2735ec545265253b4a86b
  (block 31481260, status 1, 399603 gas @ 1000000001 wei = 0.00039961 PHRS)

## Video
PENDING-VIDEO — record per VIDEO-GUIDE.md (45–90s), then replace this line
with the hosted URL.

## Reviewer notes
(paste REVIEWER_NOTES.md verbatim)
