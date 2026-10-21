# T02 — Event/Log Monitor — Arena Submission Pack

(Copy-paste ready. Paste into the Pharos Agent Arena submission form.)

## Resubmission — what changed (2026-10-19)

The first review asked for exactly one thing: *"The task requires Chain MCP log
queries; your code still calls eth_getLogs directly. Switch to Chain MCP get_logs
and resubmit."* This resubmission does that, completely:

- **Every chain read now goes through the Chain MCP tools `get_logs` /
  `get_block_number` BY NAME** (`https://mcp.pharos.xyz/mcp`, Streamable HTTP,
  keyless). No raw `eth_*` JSON-RPC anywhere in the task code — verified by
  inspection; the only HTTP the monitor issues is MCP `tools/call`.
- The hosted Chain MCP serves **mainnet only** ("mainnet is fine" — reviewer's
  own words), so the monitor now watches real **USDC Transfers on Pharos
  mainnet** (`0xc879c018db60520f4355c26ed1a6d572cdac1815`).
- Re-proven on mainnet, for real: deterministic test **TEST PASS** (87 Transfers
  in 1,501 blocks, 2 chunked `get_logs` calls; re-scan byte-identical), **18 live
  catches** while polling, **kill-9 → 0 re-emissions**.
- Stamped proof: `proof/mcp-resubmission.json` (endpoint, tools, commands, git
  commit + dirty flag).
- All v1 Atlantic artifacts preserved in-folder (`*.v1-atlantic.*`,
  `src/LogEmitter.sol`).

## Title

LIGHTKEEPER · T02 Event/Log Monitor

## One-liner

A persistent, reorg-tolerant on-chain event monitor on Pharos mainnet — every
query a Chain MCP `get_logs` tool call, chunked scans, runtime-computed
signatures, full decode, zero duplicates, survives kill -9.

## Description

T02 resubmission: a Python poller (`monitor.py`) that runs continuously and
queries the **Chain MCP `get_logs` tool by name**
(`https://mcp.pharos.xyz/mcp`, MCP Streamable HTTP, keyless, mainnet chain
1672), filtered by contract address (USDC
`0xc879c018db60520f4355c26ed1a6d572cdac1815`) + topic0 (keccak256 of
`Transfer(address,address,uint256)`, computed in code — never hardcoded).
Ranges are chunked at ≤1,000 blocks per call (the MCP server-enforced cap);
dedupe by `blockNumber:logIndex`; state written atomically before every alert
(persist-before-emit); 2-block confirmation lag for reorg tolerance. Decodes
indexed topics + data into readable fields (`from`, `to`, `value` in USDC) with
block number, tx hash, and log index on every alert. Proven on mainnet
2026-10-19: deterministic test over 1,501 blocks asserts exactly 87 Transfers
(`monitor.py test --from-block=20684347 --to-block=20685847 --expect-count=87`
→ TEST PASS, re-scan identical); 18 real USDC Transfers caught LIVE while the
poller ran, fully decoded; kill-9 test — poller killed mid-run, restarted,
cursor restored exactly, 0 re-emissions. Zero spend (keyless reads). Honest
gaps: the Chain MCP serves mainnet only (no testnet instance exists);
confirmation-lag reorg tolerance (no reorg detector); alerts go to local
`alerts.jsonl` (no webhook sink yet).

## Commit-pinned code

https://github.com/mohamedwael201193/lightkeeper/tree/9eca5c9b167b633259850a7623347fa2fe499c70/tasks/t02-event-log-monitor

## Share / demo links

- Contract (USDC, Pharos mainnet): https://pharosscan.xyz/address/0xc879c018db60520f4355c26ed1a6d572cdac1815
- Live catch (fired while polling): https://pharosscan.xyz/tx/0x11ec559e5bef8165df872da5a86bfb549b3e837befe0435386b1f4543130c8b9
- Chain MCP endpoint: https://mcp.pharos.xyz/mcp
- Stamped proof: `proof/mcp-resubmission.json` in the task folder

## Transaction hashes (live catches, all real mainnet txs)

- Live catch #1: `0x11ec559e5bef8165df872da5a86bfb549b3e837befe0435386b1f4543130c8b9` (block 20687008, 19.998000 USDC)
- Live catch #2: `0x1095dbe4ba70f14afb52054226fa8723715cc56bedf2e4835107d9a19e0fd96f` (block 20687012, 78.486418 USDC)
- Live catch #3: `0x65d5dd4bc81ec79f87f99c1183cf0cbfa092bc01959d6f05c0d4ac4caa744d9e` (block 20687018, 78.495210 USDC)
- (15 more in `alerts.jsonl`; deterministic-test sample: `0x53f596fa1a934e3b5d74aedab6be138570c28ee93fe5e633b254ba1cbf23db1e`, block 20684351)

## Interactive console demo

LIGHTKEEPER console "Try it live": `apps/console/src/components/try/event-log-monitor.tsx`
(Tier A — live reads only, no wallet, costs nothing). "Watch any contract live":
contract address + event signature inputs with presets; topic0 computed at runtime;
chunked scans; decoded rows with explorer links; "Caught after you started
watching" (CAUGHT LIVE badge) vs "Historical context"; 2-block reorg-buffer
toggle. **Disclosed architecture:** the browser cannot POST to the Chain MCP
directly (no CORS `Access-Control-Allow-Origin` on `mcp.pharos.xyz/mcp`,
verified 2026-10-19), so the in-browser demo routes through the console's
same-origin proxy (`apps/console/api/mcp.ts`), which issues genuine Chain MCP
`tools/call` requests server-side. All submitted task code calls the Chain MCP
directly.

## Video

REPLACE_WITH_NEW_VIDEO_LINK
<!-- v2 resubmission: the v1 video (Atlantic direct-RPC) is superseded; the new
     recording shows the Chain MCP build catching live USDC Transfers. -->
