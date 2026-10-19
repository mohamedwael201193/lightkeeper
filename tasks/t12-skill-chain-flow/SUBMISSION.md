# SUBMISSION PACK — T12 "Skill + Chain MCP Flow" (copy-paste ready)

> Paste the fields below into the Arena submission form. The commit-pinned link
> will be filled after commit. Replace PENDING-VIDEO when the video ships.

**Title:**
T12 — Skill + Chain MCP Flow ("Spend Readiness Check")

**One-liner:**
One end-to-end composition flow: live Chain MCP reads (by tool name, mainnet)
feed a SkillEngine preflight skill whose ALLOW/BLOCK verdict depends on nothing
but that data — proven by contrast runs quoting the same live balance.

**Description:**
A single user request (`flow.py --amount-usdc X --run-label Y`) drives
READ → SKILL → EXECUTE → VERIFY in one session. READ issues Chain MCP
`tools/call` **by name** against `https://mcp.pharos.xyz/mcp` on Pharos mainnet
(1672): `get_chain_info`, `get_block_number` (pins one block), `get_balance`
(PROS), `eth_call` (USDC `balanceOf` + `decimals` at the pinned block),
`get_gas_price`. The preflight skill evaluates those live values verbatim
against a pre-declared `policy.yaml` (4 named rules: RULE-NETWORK chainId guard,
RULE-BALANCE live-balance-vs-amount, RULE-GAS ≤ 50 gwei, RULE-FRESHNESS
stale-packet rejection at skill time and verify time, fail-closed).
EXECUTE: on ALLOW, a real `estimate_gas` simulation via the Chain MCP —
**no signing, no broadcast** (mainnet is real funds; stated in policy, code,
and README, not hidden). On BLOCK the phase is skipped loudly. VERIFY re-reads
via the MCP and asserts the verdict is STABLE.

Dependency proven by live contrast runs (2026-10-20): 100 USDC → all 4 rules
PASS → ALLOW → `estimate_gas` 52,679; 1,000,000 USDC → RULE-BALANCE FAIL quoting
the live balance (16,712.740923 USDC) → BLOCK → EXECUTE skipped. Same flow,
same watched holder — the verdict flips on the MCP-returned data alone.
Unit tests 8/8. Zero raw JSON-RPC, zero private keys, zero broadcasts.

**Repo link (commit-pinned):**
https://github.com/mohamedwael201193/lightkeeper/tree/f646a97f7e985f1d68273331cb4212242ae21a89/tasks/t12-skill-chain-flow

**Share/demo links:**
- Chain MCP endpoint: https://mcp.pharos.xyz/mcp (health: https://mcp.pharos.xyz/health)
- USDC on mainnet explorer: https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815
- Watched holder: https://pharosscan.xyz/address/0x936564245b69f5a293b42cbd752e0ee3bb68b470
- Run manifest: `tasks/t12-skill-chain-flow/evidence/run-manifest.json`
  (`mcp_tools_called`, `raw_rpc_calls: 0`)

**Video:** PENDING-VIDEO (45–90s: one request → Chain MCP reads → skill verdict
→ contrast run flipping the verdict)

**Console try-it-live:** `apps/console/src/components/try/skill-chain-flow.tsx`
— interactive READ → SKILL → EXECUTE → VERIFY step-through with the real MCP
tool calls, the four rule verdicts on live values, and a "probe the boundary"
panel that runs the skill's exact rule math against live Chain MCP reads
(routed through the console's same-origin MCP proxy). Nothing executes or
signs in the browser.

**Reviewer notes:**
- v2 rebuild (2026-10-20): v1 read Atlantic via `cast` ("Chain MCP-equivalent"
  rationalization) — withdrawn after the T01–T04 rejections. v2 calls the real
  Chain MCP tools by name on mainnet; `raw_rpc_calls: 0` in the manifest.
- Composition proof: contrast runs `allow-1`/`block-1` in
  `run-logs/flow-transcript.jsonl` — same flow, different proposed amount,
  different verdict, both quoting the same live MCP balance.
- No-broadcast is a design statement (`policy.yaml behavior.no_broadcast`),
  not a gap: the task proves the *decision* depends on MCP data, which is
  what the composition requirement tests.
