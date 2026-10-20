<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:12px;">
<h1 style="font-family:Georgia,serif;color:#d9a821;letter-spacing:0.35em;">LIGHTKEEPER</h1>
<p style="font-family:Georgia,serif;color:#e8c766;font-style:italic;">One lighthouse. Thirty lamps. One octopus to tend them.</p>
<p style="color:#b9c2f5;">T02 · Event/Log Monitor · the second lamp is lit</p>
</div>

# T02 — Event/Log Monitor

**Live on Pharos mainnet (chain 1672), via the Chain MCP.** A persistent,
reorg-tolerant event monitor that issues **every chain read through the Chain MCP
tools `get_logs` / `get_block_number` by name** (`https://mcp.pharos.xyz/mcp`,
MCP Streamable HTTP, keyless) — no raw `eth_*` JSON-RPC anywhere in this task.
It watches real USDC `Transfer` events, decodes each into readable fields, never
duplicates, and survives a `kill -9` without re-emission.

> **Resubmission note (2026-10-19):** the first submission queried the Atlantic
> RPC directly and was returned with *"Switch to Chain MCP get_logs and
> resubmit."* This build does exactly that — on mainnet, which the reviewer
> explicitly allowed ("mainnet is fine"). All v1 Atlantic artifacts
> (`src/LogEmitter.sol`, `state.v1-atlantic.json`, `poll.v1-atlantic.log`,
> `alerts.v1-atlantic.jsonl`, `run.v1-atlantic.out`) are preserved in this
> folder for the record.

---

## 1. What it is

A Python monitor (`monitor.py`) watching USDC
`0xc879c018db60520f4355c26ed1a6d572cdac1815` on Pharos mainnet. It scans block
ranges with the **Chain MCP `get_logs` tool** (chunked ≤1,000 blocks per call —
the server-enforced cap), filters by address + topic0 (computed from the event
signature at runtime via keccak256 — never hardcoded), decodes into readable
fields (`from`, `to`, `value` in USDC), and appends alerts to `alerts.jsonl`
with block number, tx hash, and log index.

## 2. The target contract

USDC on Pharos mainnet — a token real users hold:

| | |
|---|---|
| Contract | `0xc879c018db60520f4355c26ed1a6d572cdac1815` |
| Event | `Transfer(address indexed from, address indexed to, uint256 value)` |
| topic0 | `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` (computed at runtime, `monitor.py topics`) |
| Decimals | 6 (verified via MCP `eth_call` `decimals()`) |

Explorer: https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815

## 3. How to run

No API key, no private key, no RPC URL — the Chain MCP is keyless:

```bash
cd tasks/t02-event-log-monitor

# print the topic0 signature (computed at runtime, never hardcoded)
python3 monitor.py topics

# continuous poller (8s cycles; cursor persists in state.json)
python3 monitor.py run

# deterministic test: scan a known range, assert the exact event count
python3 monitor.py test --from-block=20684347 --to-block=20685847 --expect-count=87
```

State files: `state.json` (chain_id + cursor + seen set), `poll.log`
(per-cycle log), `alerts.jsonl` (decoded alerts).

## 4. Sample output (real run, 2026-10-19)

```
$ python3 monitor.py test --from-block=20684347 --to-block=20685847 --expect-count=87
connected: chain-mcp @ https://mcp.pharos.xyz/mcp (chain 1672)
scanned blocks 20684347..20685847 via chain-mcp:get_logs: found 87 Transfer event(s)
  Transfer block=20684351 tx=0x53f596fa1a934e3b5d74aedab6be138570c28ee93fe5e633b254ba1cbf23db1e logIndex=0x0 from=0x912c9ade24d44d8922f086d8dcb079f1363f647 to=0x936564245b69f5a293b42cbd752e0ee3bb68b470 value=157.463529 USDC
  Transfer block=20684416 tx=0xa61fd3c1ee1dd802b158ad215c8f3950fe75cdf10efec0bb49e217a77bba1a5a logIndex=0x1 from=0x0000000000000000000000000000000000000000 to=0x2166d3a311a848d7713b6ef7a46e70f75d36fd67 value=22000.000000 USDC
  ... and 77 more
determinism check: re-scan returned the identical 87 event(s)
TEST PASS: exactly 87 Transfer event(s) in range
```

Every read in that run was a `get_logs` **tool call on the Chain MCP** —
1,501 blocks scanned in 2 chunked calls (≤1,000 blocks each, the server cap).

## 5. Continuous-operation evidence (mainnet, 2026-10-19)

- The poller ran 5-second cycles against `chain-mcp:get_logs`, logging every
  cycle to `poll.log`.
- **Live catch:** 18 real mainnet USDC Transfers were caught **while the poller
  was running** — each decoded (`from`/`to`/`value_usdc`) in the next cycle,
  e.g. block 20687008 tx
  `0x11ec559e5bef8165df872da5a86bfb549b3e837befe0435386b1f4543130c8b9`
  (19.998000 USDC; the same tx also carried a burn leg to `0x0000…0000`).
  Explorer: https://pharosscan.xyz/tx/0x11ec559e5bef8165df872da5a86bfb549b3e837befe0435386b1f4543130c8b9
- **Kill-9 test:** the poller was killed with `kill -9` mid-run and restarted.
  The cursor was restored exactly (20687108) from `state.json` (atomic write
  before every alert): **0 re-emissions** of the 13 pre-kill alerts, and 5
  genuinely new alerts were caught in the cycles after restart.
  Pre-kill alerts archived in `proof/alerts.pre-kill.jsonl`; poller logs in
  `proof/live-demo.out` / `proof/live-demo2.out`.

## 6. Design decisions

- **Chain MCP tools by name** — `get_block_number` for the tip, `get_logs` for
  every scan. The MCP session handshake (initialize → session id →
  `Mcp-Session-Id` header) is implemented in `ChainMCP`; a lost session
  re-handshakes once and retries.
- **Chunked get_logs (≤1,000 blocks/call)** — the MCP server enforces the cap
  (`Block range too large` past 1,000); the scanner chunks client-side too.
- **Dedupe by `blockNumber:logIndex`** — survives overlapping scans and restarts.
- **Persist-before-emit** — state.json is written (atomically, via tmp+rename)
  before any alert is emitted; a crash can never cause a duplicate alert or a
  skipped block.
- **2-block confirmation lag** — reorg tolerance; only confirmed blocks are scanned.
- **topic0 computed in code** (keccak256 via pycryptodome, byte-equal to the
  canonical `0xddf252ad…`) — no hardcoded hashes to drift.
- **Zero spend** — the hosted Chain MCP is keyless; reads cost nothing and need
  no wallet.

## 7. Requirements → evidence

| # | Official requirement (verbatim) | How it is met | Evidence |
|---|---|---|---|
| (1) | Chain MCP log queries filtered by contract address + event signature | `get_logs()` calls the **Chain MCP `get_logs` tool by name** with `address` = USDC and `topics` = [topic0(`Transfer(address,address,uint256)`)] computed at runtime | `monitor.py` `ChainMCP.call("get_logs", …)`; `proof/mcp-resubmission.json` (endpoint + tools); `monitor.py test` output §4 |
| (2) | Runs CONTINUOUSLY (polling/block-by-block); reports only NEW events, no duplicates | `cmd_run()` — poll loop; seen-set dedupe; `poll.log` cycles; **kill-9 test: 0 re-emissions** | `poll.log`; `proof/live-demo.out`, `proof/live-demo2.out`; `proof/alerts.pre-kill.jsonl`; §5 |
| (3) | Decodes events into readable fields (from/to/amount/tx/block) | `decode_transfer()` — indexed topics + data → `from`/`to`/`value_usdc` | `alerts.jsonl` (every alert carries from, to, value_usdc, block, tx, logIndex); §4 |
| (4) | Demonstrated catching ≥1 live or test event | **18 real mainnet USDC Transfers caught live** while the poller ran (2026-10-19) | `alerts.jsonl`; sample: https://pharosscan.xyz/tx/0x11ec559e5bef8165df872da5a86bfb549b3e837befe0435386b1f4543130c8b9 |

## 8. Interactive console (Tier A — live reads)

`apps/console/src/components/try/event-log-monitor.tsx` — "Watch any contract live".
**Honest limitation (verified 2026-10-19):** the browser cannot call the Chain MCP
directly — `https://mcp.pharos.xyz/mcp` answers the CORS preflight (HTTP 200) but
returns **no `Access-Control-Allow-Origin` header**, so the browser blocks the
cross-origin POST. The in-browser demo therefore routes through the console's
same-origin proxy (`apps/console/api/mcp.ts`), which issues genuine Chain MCP
`tools/call` requests server-side — zero direct RPC anywhere in the demo path.
All submitted task code in this folder calls the Chain MCP directly.

## 9. Honest gaps

- The Chain MCP serves **mainnet only** — there is no Atlantic/testnet instance
  ("one chain per instance"), so this build watches mainnet USDC by design.
- Poll history is a continuous session log, not yet a multi-day archive — the
  cursor and seen-set are durable; long-term retention is a deployment choice.
- Alerts go to a local `alerts.jsonl`; there is no webhook/notification sink yet
  (the arena requirement is "reports", not "notifies").
- Reorg handling is a 2-block confirmation lag — sufficient on Pharos mainnet,
  not a full reorg-proof reorg-detector.

---

*Built for the Pharos Season of AI Agent Arena — T02 (Easy, 50 pts).*
*Deep royal blue `#1414c8`, gold `#d9a821` — the OCTOPUS art direction.*
