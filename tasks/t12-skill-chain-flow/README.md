<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:8px;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:52px;letter-spacing:14px;font-weight:bold;">T12 · SKILL + CHAIN FLOW</div>
  <div style="color:#f4f6ff;font-size:15px;margin-top:16px;letter-spacing:2px;"><i>The keeper reads the sea before it lets the hand cast a single coin.</i></div>
</div>

> LIGHTKEEPER · Task 12 — **Skill + Chain MCP Flow** (Medium · 100 pts · Composition)

# §1 — What this is (v2)

One end-to-end composition flow: **read live state via the real Chain MCP →
invoke a skill on that data → verify via the Chain MCP** — all from a single
user request, in one session.

The flow is a **"Spend Readiness Check"**: a single CLI request
(`python3 flow.py --amount-usdc X --run-label Y`) triggers

1. **READ** — Chain MCP `tools/call` **by name** on Pharos mainnet (1672),
   all pinned to one block: `get_chain_info`, `get_block_number`,
   `get_balance` (PROS), `eth_call` (USDC `balanceOf`, USDC `decimals`),
   `get_gas_price`.
2. **SKILL** — a preflight skill evaluates the *live MCP values verbatim*
   against `policy.yaml` (four named rules: network, balance, gas,
   freshness). Verdict: `ALLOW` or `BLOCK`.
3. **EXECUTE** — on ALLOW only: a real `estimate_gas` simulation through the
   Chain MCP. **No signing, no broadcast** — mainnet is real funds; this is
   stated in `policy.yaml` (`behavior.no_broadcast: true`), in the code, and
   here — not hidden. On BLOCK: skipped loudly.
4. **VERIFY** — follow-up MCP reads: freshness re-check + verdict
   re-validation against the latest live values.

Skill output **depends on** live Chain MCP data: the same flow with a
different proposed amount on the same live state yields a different verdict
(see §4). Zero raw JSON-RPC against an RPC URL. Zero private keys.

**v1 → v2 note:** v1 (2026-10-16) read Atlantic testnet via `cast` and called
those "Chain MCP-equivalent queries". That rationalization is **withdrawn** —
the Arena reviewers rejected T01–T04 for exactly this pattern. v2 calls the
real Chain MCP. The v1 Atlantic flow (KeeperPing, `ping()` broadcasts) is
superseded; its artifacts were removed from the repo (preserved in the private
archive), not shipped as current claims.

# §2 — The preflight skill (policy)

`policy.yaml` is pre-declared before any run and never edited mid-run. Rules, in evaluation order:

| Rule | What it checks | Fail means |
|---|---|---|
| RULE-NETWORK | live `chainId` == 1672 (the Chain MCP serves mainnet only) | BLOCK |
| RULE-BALANCE | live USDC balance of the watched holder ≥ proposed amount | BLOCK (quotes the live balance verbatim) |
| RULE-GAS | live gas price ≤ 50 gwei | BLOCK |
| RULE-FRESHNESS | verify-block − read-block ≤ 120 (skill time **and** verify time) | BLOCK — stale-packet rejection |

Fail-closed throughout: any unreadable data → BLOCK, never guess.

The watched holder (`0x936564245b69f5a293b42cbd752e0ee3bb68b470`) is a real
USDC holder found via live Chain MCP `get_logs` (Transfer events,
2026-10-20). The skill **reads** this address's balance — never transacts
with it.

# §3 — Call order

```
USER REQUEST  (single command: flow.py --amount-usdc X --run-label Y)
│
├─► READ ........ Chain MCP tools/call BY NAME @ https://mcp.pharos.xyz/mcp
│                 get_chain_info · get_block_number (pin) · get_balance (PROS)
│                 eth_call balanceOf(watch)@block · eth_call decimals()@block
│                 get_gas_price
│
├─► SKILL ....... evaluate(live MCP values verbatim, policy.yaml)
│                 verdict = ALLOW | BLOCK (+ named failing rules)
│
├─► EXECUTE ..... if ALLOW: estimate_gas via Chain MCP (simulation only —
│                 │           no signature, no broadcast; mainnet = real funds)
│                 else:       skipped loudly — nothing simulated, nothing signed
│
└─► VERIFY ...... Chain MCP: get_block_number + eth_call balanceOf() @latest
                  freshness re-check · verdict re-validation (must be STABLE)
```

# §4 — Live contrast runs (dependency proven, 2026-10-20)

Same flow, same watched holder, different proposed amounts → different verdicts.
Every value below came from the Chain MCP live:

**allow-1** — 100 USDC → all 4 rules PASS → **ALLOW**
→ READ @ block 20695075: USDC balance **16,712.740923**, gas **10 gwei**, chain 1672
→ EXECUTE: `estimate_gas` via Chain MCP → **52,679 gas** (simulation only)
→ VERIFY @ block 20695077: balance unchanged, verdict STABLE → OK

**block-1** — 1,000,000 USDC → RULE-BALANCE FAIL → **BLOCK**
→ detail: "live USDC balance=16712740923 base units (16712.740923 USDC)
vs proposed 1000000000000 (1000000 USDC)" — quoting the live balance
→ EXECUTE skipped → VERIFY @ block 20695083: verdict STABLE → OK

Full transcripts with every real value: `run-logs/flow-transcript.jsonl`
(append-only; v1 Atlantic runs retained above the v2 entries as labeled history).
Run manifest: `evidence/run-manifest.json` (`mcp_endpoint`,
`mcp_tools_called`, `raw_rpc_calls: 0`, commit, dirty flag).

# §5 — Requirements → evidence

| # | Official requirement (verbatim) | How met | Evidence |
|---|---|---|---|
| 1 | Skill output depends on LIVE Chain MCP data in the same flow | `flow.py` READ: 6 MCP `tools/call` by name, pinned to one block; values pass verbatim into `evaluate()` — the verdict depends on nothing else | `flow.py:180-230`, `run-logs/flow-transcript.jsonl` (READ phases) |
| 2 | End-to-end from a single user request | `flow.py --amount-usdc X --run-label Y` drives READ → SKILL → EXECUTE → VERIFY | §4 runs above; `flow.py:150-178` |
| 3 | Diagram/write-up of call order | §3 above, with MCP tool names | this file |
| 4 | Demo run showing real data through both tools (composed, not side-by-side) | Contrast pair `allow-1`/`block-1`: same flow, same holder, different amounts → ALLOW+simulation vs BLOCK quoting live balance | `run-logs/flow-transcript.jsonl`, §4 |

# §6 — Reproduce it

```bash
cd tasks/t12-skill-chain-flow
pip install requests          # only dependency (MCP client)
python3 flow.py validate                 # policy sanity check
python3 tests/test_policy.py            # 8 unit tests, no chain needed
python3 flow.py --amount-usdc 100 --run-label allow     # → ALLOW + simulation + verify
python3 flow.py --amount-usdc 1000000 --run-label block # → BLOCK quoting live balance
```

No `.env`, no private keys, no Foundry, no `cast`. The only network touch is
`https://mcp.pharos.xyz/mcp` (public, keyless).

# §7 — Chain & precision notes

- Pharos mainnet **only** (chainId **1672**, native **PROS**); the Chain MCP
  serves no other chain. No testnet, no Atlantic touched by v2.
- USDC: `0xc879c018db60520f4355c26ed1a6d572cdac1815`; decimals read live
  from the contract (6), never hardcoded.
- `get_gas_price` returns `{"gasPriceWei": "<decimal>", ...}`; `get_balance`
  returns `{"balanceWei": "<decimal>", ...}` — parsed as decimals, not hex.
- The MCP endpoint drops ~30–40% of connections; the client retries transport
  errors with backoff (3 attempts). Only `-32000` triggers a re-handshake.
- `estimate_gas` takes a full transaction object; the simulation uses a
  self-transfer (`transfer(watch, amount)`) — a valid gas estimate, labeled
  as a simulation.

# §8 — Risks & honest limits

- **No broadcast, by design.** Mainnet is real funds and the task holds no
  mainnet key. The EXECUTE phase is a real `estimate_gas` simulation, not a
  transaction. If you need a broadcast demo, that belongs on a testnet task.
- The watched holder's balance moves independently of T12; balances are
  recorded per-run in the transcript, never asserted cross-run. If the
  balance ever drops below the contrast amounts, re-pick amounts from the
  live balance — the contrast logic is amount-vs-live-balance, not fixed numbers.
- Skill boundary: the "skill" is the local preflight evaluator driven by
  Chain MCP data (composition with the real Chain MCP); the verdict depends
  on nothing but the live MCP reads + the pre-declared policy.
- v1 Atlantic artifacts were removed from the repo (preserved in the private
  archive); pre-canonical transcript lines moved to `run-logs/v1-superseded.jsonl`.

# §9 — Links

- Evidence: `evidence.md` / `evidence.json`
- Official requirements: `REQUIREMENTS.md` (quoted verbatim)
- Links: `LINKS.md`
- Arena pack: `SUBMISSION.md`
- Chain MCP: `https://mcp.pharos.xyz/mcp` · health: `https://mcp.pharos.xyz/health`
- Mainnet explorer: `https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815`
