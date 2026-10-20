# T13 Accuracy Audit — the docs said it, we executed it

**Audited:** 2026-10-20 · **Verdict: 6/6 PASS** · Machine-readable: `audit.json`
· Machine-check: `python3 -m unittest tests.test_accuracy_audit` (offline, 6 tests)
· Re-run: `python3 accuracy-audit/run_audit.py` (real network checks, exit 0
iff every check passes)

## What this is

T13's whole composition loop is "the docs name it, the chain proves it": the
Docs MCP names a function selector, the agent calls that same function on-chain
via the Chain MCP. This audit independently re-verifies every link of that
chain with an original implementation (not the task's `doc_agent.py`):

1. that the Docs MCP really does name the selectors T13 cites,
2. that those selectors are *correct* — recomputed from the canonical
   signatures with a real keccak, not quoted from the docs,
3. that the docs-cited contracts behave as the docs claim, via fresh Chain MCP
   reads at the current block.

No mocks, no fixtures. The Chain MCP remains the read oracle (it is the
task-mandated transport); the audit is independent of the task's scripts and
of its pinned-block figures.

## Results

| # | Claim under audit | How it was checked | Result |
|---|---|---|---|
| B1 | The Docs MCP names `0x18160ddd` as the `totalSupply()` selector | Fresh `askQuestion` round-trip (independent client); verbatim substring assertion on the answer | **PASS** — `0x18160ddd` appears in the verbatim answer |
| B2 | The docs-cited selectors equal the true keccak selectors | Real `cast keccak` of each canonical signature; `decimals()` claim cross-read from the committed verbatim transcript | **PASS** — `totalSupply()`→`0x18160ddd`, `decimals()`→`0x313ce567`, `balanceOf(address)`→`0x70a08231`, `latestAnswer()`→`0x50d25bcd`; every one matches the docs-cited value |
| B3 | USDC `0xc879c018db60520f4355c26ed1a6d572cdac1815` has 6 decimals (docs claim) | Fresh Chain MCP `eth_call decimals()` at the current block — not the task's pinned figure | **PASS** — returns exactly 6 |
| B4 | Live `totalSupply()` is a sane figure near the 2026-10-20 pinned value | Fresh Chain MCP `eth_call totalSupply()`; ±5% tolerance for legitimate supply drift | **PASS** — 43,481,279.246573 USDC, exactly the pinned figure (no drift) |
| B5 | The docs-named USDC/USD feed `0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d` exists on-chain | Fresh Chain MCP `get_code`; non-empty bytecode assertion | **PASS** — 4,088 chars of deployed bytecode |
| B6 | Live `latestAnswer()` on the feed reads a sane stablecoin price | Fresh Chain MCP `eth_call` with the independently computed selector; ±2% band around $1.00 (docs: 18 decimals) | **PASS** — **$0.999852** (pinned 2026-10-20: $0.99987) |

## Honesty notes

- B2 is the audit's sharpest edge: the selectors are *recomputed*, so a docs
  typo in a selector would fail here even if the docs consistently quoted it.
- B4's tolerance is ±5% but the live figure matched the pinned figure to the
  last base unit — recorded as-is, not rounded into agreement.
- The MCP endpoints drop connections intermittently from some networks; the
  audit client uses curl with retries (`--retry-all-errors`) for the HTTP
  layer. The JSON-RPC bytes on the wire are identical either way.
