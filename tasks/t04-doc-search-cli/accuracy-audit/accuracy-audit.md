# T04 Accuracy Audit — checking the docs, not just quoting them

**Audited:** 2026-10-20 · **Verdict: 5/5 PASS** · Machine-readable: `audit.json`
· Machine-check: `python3 -m unittest tests.test_accuracy_audit` (offline, 4 tests)
· Re-run: `python3 accuracy-audit/run_audit.py` (real network checks, exit 0
iff every check passes)

## What this is

T04 cites specific claims from the Pharos developer docs (via the Docs MCP):
the deploy guidance, the Atlantic testnet chain ID, the RPC endpoint. An
evidence battery proves the CLI *quotes* them faithfully. This audit goes one
step further and checks whether the cited claims are *true* — by executing
independent verifications against the live chain.

Every check below is a real executed check from an independent client
implementation (not the `pharos-docs` CLI): fresh Docs MCP `tools/call`
round-trips plus direct JSON-RPC calls to the docs-claimed Atlantic endpoint.
No mocks, no fixtures.

## Results

| # | Claim under audit | How it was checked | Result |
|---|---|---|---|
| A1 | The live Docs MCP still returns the `forge script … --broadcast` deploy guidance T04 cites | Fresh `searchDocumentation` round-trip; substring assertions on the verbatim MCP text | **PASS** — 10 hits returned, 2 contain `forge script` + `--broadcast` (no doc drift) |
| A2 | The Atlantic Testnet docs page claims ChainID 688689 and RPC `https://atlantic.dplabs-internal.com` | Fresh `getPage` round-trip; regex extraction from the verbatim page markdown | **PASS** — docs claim: ChainID=688689, RPC=`https://atlantic.dplabs-internal.com` |
| A3 | The docs' chain-ID claim is true on the wire | Direct `eth_chainId` JSON-RPC call to the docs-claimed RPC endpoint (independent of the MCP) | **PASS** — `eth_chainId` → `0xa8231` = **688689**, matching the docs claim exactly |
| A4 | The docs-claimed RPC endpoint is live | Direct `eth_blockNumber` JSON-RPC call | **PASS** — block 31,638,947 and climbing |
| A5 | The cited deploy guidance's `--chain-id 688689` matches the live chain | Substring assertion on the fresh A1 text vs the A3 wire result | **PASS** — the docs' own deploy example is self-consistent with the live chain |

## Honesty notes

- The Docs MCP endpoint drops connections intermittently from some networks;
  the audit client uses curl with retries (`--retry-all-errors`) for the HTTP
  layer. The JSON-RPC bytes on the wire are identical either way.
- `askQuestion` was deliberately not used here: the audit targets the exact
  claims T04 cites, which all come through `searchDocumentation`/`getPage`.
- A3/A4 call the Atlantic RPC directly — the same public endpoint the docs
  advertise — so the verification is independent of the MCP transport.
