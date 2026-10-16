<div align="center" style="background:#1414c8; padding:56px 28px; border-radius:14px;">
  <div style="font-family:Georgia,'Times New Roman',serif; color:#d9a821; font-size:44px; letter-spacing:14px; font-weight:bold;">T21 · WHALE-WATCHING AGENT</div>
  <div style="color:#f4f6ff; font-style:italic; margin-top:18px; font-size:17px; line-height:1.7;">One lighthouse. Twenty-eight lamps.<br/>This arm of the octopus never sleeps — it watches the deep water of Atlantic,<br/>and names every leviathan that moves.</div>
  <div style="color:#b9c2f5; margin-top:14px; font-size:13px; letter-spacing:3px;">PHAROS SEASON OF AI · AGENT ARENA · 100 PTS · TRADING / MONITORING</div>
</div>

---

## 1. Overview

The Whale-Watching Agent monitors Atlantic testnet (chain ID **688689**, native token **PHRS**)
for large transfers and produces a **ranked watch report**: every significant move explained
(what moved, how much, from where, to where — labelled where known, never invented), plus a
**summary view across ALL watched addresses**.

Key design facts (from the official risk notes):

- **Native PHRS transfers emit no logs.** The agent reads blocks directly
  (`eth_getBlockByNumber` with full transactions) instead of pretending log scans cover them.
- **ERC-20 Transfer scans are chunked ≤ 1,000 blocks** with a real keccak-256 topic
  (`0xddf252ad…`; Python's `hashlib.sha3_256` is NIST-SHA3 and would match zero real logs —
  this bug was caught and fixed during development, see §7).
- **No USD price feed exists on Atlantic**, so the whale threshold is stated in native PHRS —
  honestly, never converted to fiat.
- Every event is deduped (`state/seen.json`, keyed `txhash` / `txhash:logIndex`) and quiet
  windows produce honest empty states — nothing is fabricated to fill silence.

## 2. Official requirements

Quoted verbatim in [REQUIREMENTS.md](REQUIREMENTS.md). In short:

1. Tracks **≥5 configurable addresses** → `src/config.yaml` `watchlist` (6; fewer than 5 is a hard config error).
2. **Configurable 'significant' threshold** per token or value → `native_threshold_phrs: 0.05`, plus per-token `threshold_tokens`.
3. **Each report explains the move** (what / how much / where to, labelled where known) → `explain_move()`.
4. **Summary view of recent activity across ALL watched addresses** → per-address in/out counts, totals, last whale block.

## 3. Architecture

```
src/
  whale_watch.py      # the agent: config, RPC, native block scan, token log scan,
                      #             dedupe, ranking, explanation, report rendering
  config.yaml         # watchlist (6 addresses + honest labels), thresholds, justification
tests/
  test_thresholds.py  # 16 unit tests: threshold filter, dedupe, ranking, config
                      # validation, label honesty, Transfer-log decode, summary view
state/
  seen.json           # dedupe store (event keys) + last scanned block — persist-before-emit
reports/
  scan-<from>-<to>-<ts>.json    # raw machine-readable scan result
  watch-report-<from>-<to>-<ts>.md  # ranked human-readable report
```

Flow: `scan` → load config → resolve block range → native scan (block-by-block value filter)
→ token log scan (chunked `eth_getLogs`, Transfer topic, watched-address topics) →
dedupe against state → rank largest-first → write scan JSON + markdown report → commit state.

## 4. Configuration

[`src/config.yaml`](src/config.yaml):

```yaml
native_threshold_phrs: 0.05   # whale = native transfer ≥ 0.05 PHRS
threshold_justification: >-
  100-block sample (31481230-31481329): max organic transfer 0.01 PHRS ...
watchlist:                     # 6 addresses, honest labels only
  - address: 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
    label: "LIGHTKEEPER deployer wallet (self, founder-authorized)"
  ...
tokens: []                     # none known on Atlantic; scan path implemented + unit-tested
```

Labels describe only what is verifiable. Unknown counterparties render as
`0x12ab…cdef (unlabeled — observed on-chain only)` — the agent never invents an identity.

## 5. Usage

```bash
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ~/workspace/lightkeeper/.env; set +a   # provides ATLANTIC_RPC_URL
cd ~/workspace/lightkeeper/tasks/t21-whale-watching-agent

python3 src/whale_watch.py watchlist
python3 src/whale_watch.py scan --from-block 31481230 --to-block 31481750
python3 src/whale_watch.py scan --window 500          # last 500 blocks from tip
python3 -m pytest tests/ -q
```

No private keys are used or needed — the agent is read-only.

## 6. Evidence (live run, Atlantic testnet · 2026-10-16)

Full transcript: [evidence.md](evidence.md) / [evidence.json](evidence.json).

- **Scanned:** blocks **31481900 → 31482539** (640 blocks), **62 transactions** inspected
- **Whale events found: 3** (ranked largest-first in `reports/watch-report-31481900-31482539-20261016T045247Z.md`):
  - #1 — **0.05 PHRS, ORGANIC** — block 31482112, tx [`0x5025f6a8…be470`](https://atlantic.pharosscan.xyz/tx/0x5025f6a86ad873b6a8a3eb72a3f4c0a9081e86d29347cd51bc2dc756175be470) (unlabeled parties, shown shortened)
  - #2 — **0.05 PHRS, [SELF-SEEDED]** — block 31482165, tx [`0xf566e34c…ba70`](https://atlantic.pharosscan.xyz/tx/0xf566e34c25ca3c32dc4f6c687b7345501ea8da065398d71e9b87bc246371ba70) — disclosed builder test transfer, never presented as organic
  - #3 — **0.05 PHRS, ORGANIC** — block 31482185, tx [`0x6b9e96a8…7fb237`](https://atlantic.pharosscan.xyz/tx/0x6b9e96a814cc7b0dd8ef2e6e0617351c883ecfb439f0573dd23380535b7fb237) (unlabeled parties, shown shortened)
- **Spend: 0.050021000000021 PHRS** (0.05 transfer + gas; agent is read-only) — within the 0.15 budget

## 7. Testing

- **16 unit tests** (`tests/test_thresholds.py`), all passing: threshold boundary
  (at-threshold = whale, below = excluded, dust excluded), dedupe (no re-emission),
  largest-first ranking, config validation (≥5 addresses, labels required,
  positive thresholds), label honesty (unknown addresses never get invented names),
  Transfer-log decode, summary view, self-seed marking.
- **Live scan run** against Atlantic RPC (§6) — the real test: real blocks, real txs.
- Bug caught by tests during development: `hashlib.sha3_256` ≠ keccak-256
  (wrong Transfer topic); fixed with `Crypto.Hash.keccak` + canonical-constant fallback.

## 8. Submission & links

- Arena pack (copy-paste): [SUBMISSION.md](SUBMISSION.md)
- Reviewer walkthrough: [REVIEWER_NOTES.md](REVIEWER_NOTES.md)
- Verified links: [LINKS.md](LINKS.md)
- Filming guide: [VIDEO-GUIDE.md](VIDEO-GUIDE.md) (video slot: PENDING-VIDEO)
