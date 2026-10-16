<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:12px;">
<h1 style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;letter-spacing:0.35em;font-size:42px;margin:0;">DOCS&nbsp;·&nbsp;CHAIN&nbsp;AGENT</h1>
<p style="color:#ffffff;font-family:Georgia,serif;font-style:italic;font-size:18px;margin:16px 0 0;">It reads the lighthouse log — then dives to touch the sea floor itself.</p>
<p style="color:#b9c2f5;font-size:12px;letter-spacing:0.2em;margin:12px 0 0;">LIGHTKEEPER · T13 · DOCS MCP + CHAIN MCP AGENT · 100 PTS</p>
</div>

## 1. What this is

T13 is the composition loop the Arena asks for: a developer asks a question,
the agent answers it **from the real Pharos docs with labeled citations**
(DOC-GROUNDED = URL + retrieval date + excerpt), then **executes the answered
procedure live on Pharos Atlantic** (real `eth_call` / `eth_estimateGas` /
`eth_getLogs` via `cast`), then **interprets the on-chain result in the
context of the explanation**. If the docs don't cover the question, the agent
says so — `[UNVERIFIED]` — and executes nothing. It never improvises.

## 2. How it maps to the official requirements

| Official bullet | This build |
|---|---|
| (1) Explanation comes from Docs MCP **with sources referenced** | `src/doc_agent.py` retrieves from a local corpus of 6 real docs.pharos.xyz pages (fetched 2026-10-16, `corpus/SOURCES.json`); every answer carries citation objects with URL + retrieval date + verbatim excerpt |
| (2) Agent then calls the **same function** on-chain via Chain MCP | Each transcript executes exactly the procedure the answer describes: Q1 `balanceOf`/`decimals` via `eth_call`, Q2 `transfer` via `eth_estimateGas`, Q3 `eth_getLogs` over a real footprint |
| (3) Interprets result in context of explanation | Every transcript ends with a labeled `[INFERENCE]` interpretation tying the live value back to the cited doc statement |
| (4) Works for ≥2 different functions/contracts | 3 full transcripts (Q1 balance, Q2 gas estimate, Q3 logs) + 1 fail-closed probe — doubly satisfying "≥2" |
| Fails closed on missing sources | Q4 ("live USD price of WPHRS") → `[UNVERIFIED]`, no execution, recorded in `evidence/transcripts/failclosed.json` |

## 3. Quickstart

```bash
cd tasks/t13-docs-chain-agent
set -a; source ~/workspace/lightkeeper/.env; set +a   # ATLANTIC_RPC_URL + DEPLOYER_PRIVATE_KEY
python3 src/doc_agent.py balance     # one Q&A→execution transcript
python3 src/doc_agent.py estimate
python3 src/doc_agent.py logs        # broadcasts 2 dust txs (flock-guarded)
python3 src/doc_agent.py failclosed   # the say-so probe
python3 tests/test_transcripts.py    # 10 tests, read-only re-verification
```

## 4. The four transcripts

| # | Question | Docs answer (cited) | Live execution | Verified result |
|---|---|---|---|---|
| Q1 | How do I read an ERC-20 balance on Pharos Atlantic? | `eth_call` = "message call without creating a transaction"; Token Registry lists WPHRS `0x8388…89471`, 18 decimals | `cast call` `balanceOf(wallet)` + `decimals()` | **0.0025 WPHRS** at block 31482405 |
| Q2 | How do I estimate gas for an ERC-20 transfer? | `eth_estimateGas` = "estimates the gas needed"; Gas Model page: always estimate + add ~20% buffer | `cast estimate` `transfer(self, 0.0001 WPHRS)` | **40,067 gas → buffered limit 48,080**; ~0.0004 PHRS at live gas price |
| Q3 | How do I get event logs (Transfer events)? | `eth_getLogs` filter params; ≤100-block range when rate-limited | Dust `deposit()` + dust `transfer()` broadcast, then `eth_getLogs` Transfer-topic query | **1/1 log matched** the transfer's tx hash |
| Q4 | What is the live USD price of WPHRS? | No corpus page documents a price feed | Nothing executed — `[UNVERIFIED]`, said so | Fail-closed, by design |

Full Q&A text, citations, and raw outputs: `evidence/transcripts/*.json`.

## 5. Citation discipline

Every claim in every transcript is labeled:

- **DOC-GROUNDED** — doc URL + retrieval date (2026-10-16) + verbatim excerpt from the fetched page. The agent quotes the *eth_call* / *eth_estimateGas* / *eth_getLogs* sections and the Token Registry / Gas Model pages verbatim.
- **INFERENCE** — conclusions derived from grounded facts (e.g. "0.0025 WPHRS from 2.5e15 wei at 18 decimals"). Never presented as doc text.
- **UNVERIFIED** — the docs don't cover it. The agent states this and executes nothing.

## 6. Evidence

- Real transactions (Atlantic testnet, dust): 2 — see `evidence/evidence.json` and `evidence.md`.
  - Deposit 0.0005 PHRS → WPHRS: [`0x36564924…abf16b`](https://atlantic.pharosscan.xyz/tx/0x36564924532bfe15be4871f40bf533c0ceecbc045592dc348d60fad5faabf16b) (block 31482314)
  - Transfer 0.0001 WPHRS self→self: [`0xf7f35529…2da0a7`](https://atlantic.pharosscan.xyz/tx/0xf7f35529e142acf7dfe2a07225a68e7411182121445d51dc2b5395a56e2da0a7) (block 31482328)
- Spend: **0.0000559 PHRS** of the 0.15 PHRS budget. Q1/Q2/Q4 are read-only (zero gas).
- Tests: **10/10 pass** (`tests/test_transcripts.py`), including live read-only re-verification of all three procedures.

## 7. Composition note (Docs MCP + Chain MCP, honestly)

The portal-embedded Docs MCP and the hosted Chain MCP are logged-in/mainnet-gated
surfaces a subagent cannot reach (see LIGHTKEEPER-VERDICT §2: Chain MCP hosted
endpoint is mainnet-1672-only; Docs MCP `?ask=` 403s plain GETs). This agent
implements the *same loop* with public surfaces: retrieval over the real
docs.pharos.xyz corpus (fetched 2026-10-16) composed in one session with live
Atlantic execution via `cast` against the official Atlantic RPC. Same
dependency, same verdict shape — documented in REVIEWER_NOTES.md rather than
faked with screenshots.

## 8. Limits & honesty

- The corpus is 6 pages (JSON-RPC methods, gas model, Atlantic network, token
  registry, first-token guide, llms.txt index) — deliberately small and
  verifiable; anything outside it is answered `[UNVERIFIED]`.
- WPHRS's `deposit()` emits a `Deposit` event only (no `Transfer`), so Q3
  broadcasts a real dust transfer to produce the Transfer log it queries.
  This is disclosed in the transcript and evidence.
- Gas-price fluctuations mean the PHRS cost figures are point-in-time; the
  gas *amounts* are exact.
- Video: PENDING-VIDEO (see VIDEO-GUIDE.md for the 45–90s shot plan).
