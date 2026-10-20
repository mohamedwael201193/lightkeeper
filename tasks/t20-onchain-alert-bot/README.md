<div align="center" style="background:#1414c8;padding:56px 24px;border-radius:14px;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:44px;letter-spacing:14px;">LIGHTKEEPER</div>
  <div style="color:#f4f6ff;font-size:15px;font-style:italic;margin-top:14px;">One lighthouse. Thirty lamps. This arm watches the chain — and calls out when it moves.</div>
  <div style="color:#b9c2f5;font-size:12px;letter-spacing:6px;margin-top:18px;">T20 · ON-CHAIN ALERT BOT · 50 PTS</div>
</div>

# T20 — On-Chain Alert Bot

## 1. What this is

A config-driven on-chain watcher for Pharos Atlantic testnet. It polls block by
block, matches transactions against configurable alert conditions, and delivers
each hit to a real Telegram channel with the tx hash, explorer link, value, and
block number — exactly once per event, never twice.

## 2. How it works

```
config.yaml ──► src/watch.sh ──► match_tx() ──► write-ahead SENDING marker
   (3 conditions)   (block-by-block,      (src/match.sh)      ──► src/alert.sh
                     2-block confirm lag)                        (Telegram sendMessage)
                                                        ──► SENT + dedupe key
```

- **Conditions** (`config.yaml`): `incoming-transfer` (native PHRS into a watched
  address), `large-transfer` (incoming ≥ `minValuePHRS: "0.5"`), `contract-interaction`
  (tx to a watched contract address).
- **Dedupe:** `state/seen` keyed `<condition>:<txhash>`.
- **Crash safety:** the `SENDING` marker is written to `state/alerts.log`
  *before* the Telegram call; on restart, any `SENDING` without a `SENT` is
  treated as delivered and never re-sent (Telegram `sendMessage` has no
  idempotency key — the safe direction is "never duplicate").
- **Chain safety:** every run asserts `eth_chainId == 688689` first; every
  broadcast goes through `flock /tmp/lk-nonce.lock` (shared deployer key).
- **Catchup:** `src/watch.sh --catchup` resumes after an outage with batched
  block fetches (`src/batchscan.py`) — same matching, dedupe and alerting.
- **Self-verifying ledger:** `src/audit.sh` replays every SENT alert against
  the live chain (recipient, value, block, matcher re-verdict); latest run
  210 PASS, 0 FAIL. Every alert carries its own receipt.

## 3. Configuration

Edit `config.yaml`: watched `addresses`, watched `contracts`, the
`large-transfer` threshold, poll `intervalSeconds`, and `confirmBlocks`.
Telegram credentials come **only** from the environment
(`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) — never from config or code.

## 4. Run it

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t20-onchain-alert-bot

bash test/match_test.sh          # 16 unit tests (synthetic fixtures)
bash src/watch.sh --once         # single scan pass from saved cursor
bash src/watch.sh --catchup      # batched resume scan after an outage (same alerting path)
bash src/watch.sh --daemon       # continuous polling
bash src/audit.sh                # replay the alert ledger against the live chain
bash src/trigger.sh              # fire the REAL dust trigger (Atlantic only)
bash src/trigger.sh --amount-phrs 0.5   # larger disclosed self-test (trips large-transfer)
```

## 5. Live evidence (all real, 2026-10-16)

- **Trigger tx:** [`0xe6c9f52c…`](https://atlantic.pharosscan.xyz/tx/0xe6c9f52ceff6219a3659ba8199376cc4e969f67b2f4a707edda6f9cb9ac0e084) —
  0.001 PHRS self-transfer, block **31481424**, status 0x1.
- **Detection:** watcher classified it `incoming-transfer` at 04:19:24Z;
  `large-transfer` correctly did not fire (0.001 < 0.5 PHRS).
- **Delivery:** Telegram `sendMessage` → chat `1434154285`, **message_id 717**
  (my trigger) — one alert per event, with condition, amount, tx hash, explorer
  link, block, timestamp. Seven further genuine events observed on the shared
  key were also each alerted exactly once (message_ids 718, 719, 720, 722, 724,
  725, 726).
- **Threshold proven live:** a second real run fired a disclosed **0.5 PHRS**
  self-transfer —
  [`0x157dc990…`](https://atlantic.pharosscan.xyz/tx/0x157dc99087d62346971261e795f5d5ac417319c8ab528c1d0a6f04c14266924a)
  (block **31486611**, status 0x1) — tripping the `large-transfer` condition
  for the first time on-chain. The watcher matched both `incoming-transfer`
  and `large-transfer` and sent exactly one alert per condition
  (**message_ids 727, 728**). Two conditions on one tx is by design, not spam:
  dedupe is per `<condition>:<txhash>`.
- **Self-verifying ledger:** `src/audit.sh` replays every SENT alert against
  the live chain — recipient, value, block, matcher re-verdict — and fails
  loudly on any mismatch. Latest run: **210 PASS, 0 FAIL** across all 35 alerts.
  Every alert carries its own receipt.
- **No spam:** restarted watcher never re-emitted any event (one SENDING + one
  SENT per txhash in `state/alerts.log`).
- **Spend:** 0.000042000000042 PHRS (two dust/self txs, gas only; budget ≤ 0.15).

Full detail: `evidence.md` / `evidence.json`.

## 6. Tests

`test/match_test.sh` — 16/16 PASS: incoming detection, threshold above/at/below,
unrelated address, contract interaction, contract creation, zero-value exclusion,
checksum-case matching, 256-bit-safe wei comparison, config parsing.
Fixtures are synthetic and labeled as such; live behavior is proven by the
trigger→alert run above, not by the unit tests.

## 7. Safety & honesty

- Atlantic testnet only; dust amounts; no mainnet code path exists.
- Secrets live in `.env` (git-ignored) — the repo contains zero credentials.
- The trigger is a disclosed self-test, labeled in the alert itself.
- `sendMessage` can theoretically succeed while its response is lost; a retry
  could then double-send. This is documented, not hidden — Telegram offers no
  idempotency key. The write-ahead marker covers the crash case.
- Two real bugs were found and fixed during the 2026-10-16 hardening pass:
  `src/trigger.sh` recorded cast's `blockHash` as the tx hash (it now parses
  the `transactionHash` line), and alert amounts rendered as
  `0.001000000000000000` because the trailing-zero strip used `\(...\)`
  grouping inside `sed -E` (parens must be unescaped there). Both documented
  in `evidence.md` §7.

## 8. Submission map

| Artifact | File |
|---|---|
| Official requirements (verbatim) | `REQUIREMENTS.md` |
| Evidence (narrative + machine) | `evidence.md`, `evidence.json` |
| Reviewer notes (paste-ready) | `SUBMISSION.md` → "Notes for the reviewer" |
| Verified links | `LINKS.md` |
| Arena submission pack | `SUBMISSION.md` |
| Video shot list + script | `VIDEO-GUIDE.md` |
| Task manifest | `task.yaml` |
