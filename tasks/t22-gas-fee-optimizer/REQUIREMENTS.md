# T22 — Gas Fee Optimizer: official requirements

Quoted VERBATIM from the live Arena Build page (extracted 2026-10-15 into
`~/workspace/your_files/pharos-arena-MEGA.md`, §4 T22):

> **OFFICIAL:** (1) Tracks gas price over time + shows recent history.
> (2) Accepts tx with deadline, holds until gas favorable OR deadline reached.
> (3) Reports actual gas paid vs price at request time.
> (4) NEVER misses deadline — submits at deadline even if gas high.

Per-task build plan (MEGA §4 T22 implementation notes):
- gas-price time series + history chart; job queue with deadline;
- hold-until-favorable logic with `SUBMIT_MARGIN`;
- at the margin, submit on the freshest known sample; abort loudly, never
  silently hold (QA fix — a missing-data fail-safe that keeps holding breaks
  the guarantee);
- **at least one user-signed broadcast through to a mined receipt** reporting
  `effectiveGasPrice` vs at-request price (QA fix — an unsigned-only demo can
  never satisfy "actual gas paid").

Per-task bar + precision patches (`~/workspace/pharos-arena/LIGHTKEEPER-VERDICT.md`):
- Chain MCP has NO `eth_feeHistory` tool → T22 uses agent-side `get_gas_price`
  polling (we poll `eth_gasPrice` per block, block-pinned; a raw RPC
  `eth_feeHistory` call is additionally used only for chain-context, labeled as such).
- Risk accepted: flat testnet gas is the known environment — the
  deadline-forced path is still fully demonstrable, and we report the flatness
  honestly rather than manufacturing variance.
