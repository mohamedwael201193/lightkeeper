# LIGHTKEEPER

**One lighthouse. Twenty-eight lamps.**

LIGHTKEEPER is a single unified agent system built for the **Pharos Season of AI Agent Arena** — one monorepo, one shared console, and sixteen shipped agent tasks (with twelve more on the way), each proven against real chain state and real MCP servers. No mocks. No demo data. Every number traces to a live read.

- **16 lamps lit · 1,900 / 3,200 base points**
- **Live console:** https://lightkeeper-console.vercel.app
- **Status:** T01–T16 publicly open and tryable in the browser — no wallet required for live reads

---

## The sixteen lamps

| Lamp | Agent | Pts | What it proves |
|------|-------|-----|----------------|
| T01 | Read Contract State | 50 | Reads USDC name/symbol/decimals/totalSupply on Pharos mainnet via **Chain MCP** `eth_call`, all pinned to one block |
| T02 | Event/Log Monitor | 50 | Watches live USDC `Transfer` events via **Chain MCP** `get_logs` — chunked, cursor-persistent, reorg-buffered |
| T03 | Docs MCP Onboarding | 50 | 9 verbatim Q&A rounds through the **Developer Docs MCP**, every quote machine-checked against the docs |
| T04 | Doc-Search CLI | 50 | Thin honest wrapper on the **Docs MCP** (`searchDocumentation`/`getPage`/`askQuestion`) with a graceful UNVERIFIED miss path |
| T05 | Threshold Guardian | 100 | Live balance/price threshold alerts with real Telegram delivery |
| T06 | Saga Executor | 200 | Multi-step saga with compensation — proven live: one success run, one forced failure with automatic rollback |
| T07 | Arbitrage Scanner | 200 | Cross-venue price scanning with real on-chain quotes |
| T08 | Dry-Run Executor | 100 | Fork-based dry-run of transactions before signing |
| T09 | Trend Watcher | 200 | Fee-market trend detection on Atlantic: 3-confirmation rule, single-spike rejection proven live |
| T10 | Flotilla — Batch Executor | 100 | 12 transfers in one transaction (11 succeed, 1 isolated failure), 12.5% gas saved vs individual sends |
| T11 | Policy Gatekeeper | 100 | Pre-execution policy engine: 8 checks, hash-chained audit log, forged-stamp and mainnet refusal proven |
| T12 | Skill + Chain MCP Flow | 100 | A skill whose verdict is computed **only** from live **Chain MCP** reads — proven by contrast runs (100 USDC → ALLOW vs 1,000,000 USDC → BLOCK on the same live balance) |
| T13 | Docs MCP + Chain MCP Agent | 100 | Docs explain a function → agent calls **the same function** on-chain via **Chain MCP** → interprets the result; 4 functions, 2 contracts, 154 machine checks |
| T14 | Portfolio Assistant | 200 | Natural-language portfolio Q&A where every number cites its source contract and block; honest "I don't know" on 4 negative probes |
| T15 | Yield Optimizer | 200 | Live on-chain rate cards → net-of-fees optimizer (ALLOCATE vs STAY PUT), unsigned-tx execution for user signature only |
| T16 | Liquidation Watchdog | 100 | Health-factor monitoring with real Telegram alerts and exact restore math per alert |

Twelve more lamps (T17–T28) are built and open on a staged schedule.

## Real integrations, not simulations

- **Pharos Chain MCP** (`https://mcp.pharos.xyz/mcp`) — every mainnet read in T01/T02/T12/T13 is an MCP `tools/call` **by name** (`eth_call`, `get_logs`, `get_balance`, `get_chain_info`, `get_block_number`, `get_gas_price`, `estimate_gas`). Zero direct RPC for those reads — verified by grep and stamped in the run manifests (`rawRpcCalls: 0`).
- **Pharos Developer Docs MCP** (`https://docs.pharos.xyz/~gitbook/mcp`) — T03/T04/T13 query `askQuestion`/`searchDocumentation`/`getPage` live; answers are stored verbatim with citations.
- **Atlantic testnet (chain 688689)** — T05–T11 and T14–T16 execute against real Atlantic contracts with real transaction hashes on the explorer. The console never holds keys: live reads need no wallet; anything that writes is proposed for **you** to sign in your own wallet, or built as an unsigned transaction.

## Try it live

Open any lamp at https://lightkeeper-console.vercel.app — every try module is one of three honest tiers:

- **Tier A** — live reads, no wallet, costs nothing (e.g. T01, T12, T13, T14)
- **Tier B** — propose the transaction, sign it yourself in MetaMask (nothing is ever auto-broadcast)
- **Tier C** — command builder that generates the exact CLI commands with verified addresses

If a control can't do something real, it is disabled with a plain-language reason. Nothing pretends.

## Repository layout

```
apps/console/          # the public console (Vercel) — try modules, MCP proxy, launch control
  api/mcp.ts           # same-origin proxy to the Chain MCP (read-only tools; browsers can't call the MCPs directly)
  src/components/try/  # one flagship try module per lamp
  src/data/launch.ts   # staged launch: which lamps are publicly open
tasks/t01-…-t16-…/     # one folder per lamp: REQUIREMENTS.md, README.md, SUBMISSION.md,
                       # evidence (tx hashes, run manifests, transcripts), runnable code, tests
packages/              # shared libraries used across lamps
```

## Verify it yourself

Every lamp ships a `SUBMISSION.md` (the exact Arena submission pack), an `evidence` folder with real transaction hashes and stamped run manifests, and runnable tests. Spot-check any claim in minutes:

```bash
# T12: the skill's verdict depends only on live Chain MCP data
cd tasks/t12-skill-chain-flow && python3 -m unittest discover -s tests   # 8/8

# T13: docs explain it, Chain MCP executes it — 4 functions, 2 contracts
cd tasks/t13-docs-chain-agent && python3 tests/test_agent.py             # 154/154

# T09: trend math — single spike must NOT fire
cd tasks/t09-trend-watcher && node --test                               # 12/12
```

`SUBMISSION.md` files pin the exact commit hash they were verified against.

## Standard

- Real data or it doesn't ship: live MCP calls, live RPC reads, real transactions — or a stated reason why not.
- Requirements are read literally: when the Arena names an MCP, the code calls that MCP by name.
- Nothing is declared done until it is tested on the real surface.

---

*Built for the Pharos Season of AI Agent Arena. One lighthouse, twenty-eight lamps — sixteen lit.*
