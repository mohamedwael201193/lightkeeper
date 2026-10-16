# T12 — Skill + Chain MCP Flow · Official Requirements

Source: `~/workspace/your_files/pharos-arena-MEGA.md`, § "T12 — Skill + Chain MCP Flow (Medium, 100 · Composition)".

Quoted VERBATIM:

> **OFFICIAL:** (1) Skill output depends on LIVE Chain MCP data in the same flow. (2) End-to-end from a single user request. (3) Diagram/write-up of call order. (4) Demo run showing real data through both tools (composed, not side-by-side).

Additional guidance quoted verbatim from the MEGA:

> **Implementation:** "Spend Readiness Check": single request → pinned-block Chain MCP reads (block, native balance, token balanceOf, decimals) → live values passed verbatim into a SkillEngine preflight skill → verdict. **Dependency proven by contrast runs** (e.g. 30 USDC → READY/unsigned tx vs 100 USDC → BLOCKED quoting the same live balance) + stale-packet rejection + chainId-match guard.

> **Evidence:** call-order diagram, two contrast runs with live values, share link.

> **Video:** one request → Chain MCP reads → skill verdict → contrast run flipping the verdict.

> **Risks:** SkillEngine-testnet vs MCP-network split (chainId guard); side-by-side-looking demo (contrast runs fix it).

Composition doctrine quoted verbatim from MEGA §240:

> **Composition (T12/T13):** on ai.pharos.xyz the agent holds both Chain MCP tools and SkillEngine actions in one session — read live state via MCP → invoke skill on that data → verify via MCP.

Composition proof standard quoted verbatim from MEGA §257:

> **Composition:** both in one session (T12, T13, T27, T28) — prove dependency with contrast runs (same flow, different live data → different verdict), never side-by-side screenshots.

## How T12 satisfies each requirement

| # | Official requirement | T12 implementation |
|---|---|---|
| 1 | Skill output depends on LIVE Chain MCP data in the same flow | `flow.py`: Chain MCP-class reads (`eth_chainId`, `eth_blockNumber`, `eth_getBalance`, `eth_gasPrice`, `pingCount()`, `keeper()` via `cast`) pinned to one block; the values are passed **verbatim** into `evaluate()` — the skill computes its verdict from nothing else |
| 2 | End-to-end from a single user request | One CLI request (`flow.py --amount-phrs X --run-label Y`) drives READ → SKILL → EXECUTE → VERIFY with zero further input |
| 3 | Diagram/write-up of call order | `README.md` §3 (call-order diagram, ASCII) |
| 4 | Demo run showing real data through both tools (composed, not side-by-side) | Two live contrast runs in `run-logs/flow-transcript.jsonl`: same flow, same contract, different proposed amounts → different verdicts (ALLOW+execute+verify vs BLOCK+no-tx+verify) |
| — | Dependency proven by contrast runs | `allow-1` (0.0001 PHRS → ALLOW → real `ping()` tx → `pingCount` 0→1) vs `block-1` (0.1 PHRS → BLOCK quoting the live balance → `pingCount` unchanged) |
| — | Stale-packet rejection | `RULE-FRESHNESS`: pinned-block reads older than 60 blocks ⇒ BLOCK (Atlantic blocks ~1–2s, so 60 ≈ 1–2 min window; first live run hit this rule and was correctly refused) |
| — | ChainId-match guard | `RULE-NETWORK`: live `chainId` must equal 688689 or BLOCK; mainnet (1672) listed in policy with `enabled: false`, un-overridable |

Precision notes (from `~/workspace/pharos-arena/LIGHTKEEPER-VERDICT.md`, §30 precision patches):
- Chain MCP = 14 tools (13 read-only + `send_raw_transaction`); the portal's hosted endpoint is **mainnet-only**, so this task reproduces the portal pattern locally with `cast` against Atlantic testnet (chainId 688689) — the same tool boundaries, read via Chain MCP-equivalent queries → skill action on that data → verify via chain queries (MEGA §240).
- Native token on Atlantic is **PHRS** (grounded in SkillEngine `networks.json` + live `eth_chainId` → `0xa8231`); never called "PROS".
- `estimate_gas` has no `block` param → no pinned-block dry-runs; this task pins with `cast call --block` for reads instead.
