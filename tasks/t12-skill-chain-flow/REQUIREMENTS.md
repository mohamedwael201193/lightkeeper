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

## v2 rebuild note (2026-10-20) — READ BEFORE REVIEWING

v1 of this task (2026-10-16) read Atlantic testnet via `cast` and called those
"Chain MCP-equivalent queries". That rationalization is **withdrawn**: the
Arena reviewers rejected T01–T04 for exactly this pattern ("your code still
reads directly from the Atlantic RPC … Switch the reads to Chain MCP").
v2 is a full rebuild: **every chain read is a Chain MCP `tools/call` by name**
against `https://mcp.pharos.xyz/mcp` on Pharos mainnet (1672) — zero `cast`,
zero direct RPC, zero private keys. The v1 Atlantic flow (KeeperPing,
`ping()` broadcasts) is superseded; its artifacts were removed from the repo
(preserved in the private archive) and are retained as labeled history only
in prose, not in code.

No-broadcast honesty note: mainnet is real funds. The skill NEVER signs or
broadcasts. On ALLOW it runs a real `estimate_gas` simulation through the
Chain MCP; on BLOCK the EXECUTE phase is skipped loudly. This is stated in
`policy.yaml` (`behavior.no_broadcast: true`), in the code, and in the README —
not hidden.

## How T12 satisfies each requirement (v2)

| # | Official requirement | T12 implementation |
|---|---|---|
| 1 | Skill output depends on LIVE Chain MCP data in the same flow | `flow.py` READ phase: `get_chain_info`, `get_block_number`, `get_balance`, `eth_call` (×2: `balanceOf`, `decimals`), `get_gas_price` — all MCP `tools/call` by name, all pinned to one block; the values pass **verbatim** into `evaluate()` — the skill computes its verdict from nothing else |
| 2 | End-to-end from a single user request | One CLI request (`flow.py --amount-usdc X --run-label Y`) drives READ → SKILL → EXECUTE → VERIFY with zero further input |
| 3 | Diagram/write-up of call order | `README.md` §3 (call-order diagram with MCP tool names, ASCII) |
| 4 | Demo run showing real data through both tools (composed, not side-by-side) | Two live contrast runs in `run-logs/flow-transcript.jsonl`: same flow, same watched holder, different proposed amounts → different verdicts (100 USDC → ALLOW + `estimate_gas` simulation vs 1,000,000 USDC → BLOCK quoting the live 16,712.74 USDC balance, EXECUTE skipped) |
| — | Dependency proven by contrast runs | `allow-1` vs `block-1` above; the verdict flips on the MCP-returned balance, nothing else |
| — | Stale-packet rejection | `RULE-FRESHNESS`: verify-block minus read-block > 120 ⇒ BLOCK (checked at skill time AND verify time) |
| — | ChainId-match guard | `RULE-NETWORK`: live `chainId` must equal 1672 or BLOCK; the Chain MCP serves mainnet only |

~~Precision notes (2026-10-16, SUPERSEDED): Chain MCP = 14 tools; "the portal's hosted endpoint is **mainnet-only**, so this task reproduces the portal pattern locally with `cast` against Atlantic testnet (chainId 688689) — the same tool boundaries, read via Chain MCP-equivalent queries" — **withdrawn 2026-10-20.** The task now calls the real Chain MCP on mainnet.~~
- Native token on mainnet is **PROS** (returned by `get_balance` as `"symbol": "PROS"`); the spend asset is USDC (`0xc879c018db60520f4355c26ed1a6d572cdac1815`, decimals read live from the contract: 6).
- `estimate_gas` is used for the EXECUTE-phase simulation (real MCP tool, no broadcast).
