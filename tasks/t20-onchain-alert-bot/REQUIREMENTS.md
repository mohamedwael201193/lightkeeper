# T20 — On-Chain Alert Bot — Official Requirements (quoted VERBATIM)

Source: `~/workspace/your_files/pharos-arena-MEGA.md` §4, **T20 — On-Chain Alert Bot (Easy, 50 · Trading/Monitoring)**,
official requirements extracted read-only from the live Arena Build page on 2026-10-15.

## OFFICIAL requirements

> (1) ≥1 configurable alert condition.
> (2) Delivers to a REAL channel (Telegram/Discord/similar).
> (3) Each alert includes what happened + value + tx/explorer link.
> (4) NO repeat spam for same event.

## Official implementation guidance (from the same entry)

> `config.yaml`-driven conditions; block-by-block poller; dedupe store keyed
> `txhash:logIndex`; **write-ahead "sending" marker persisted BEFORE the Telegram
> send** (QA fix — `sendMessage` has no idempotency key; a crash between send and
> state-save would re-send). Send-failure ordering: mark attempted, retry with
> backoff, never double-alert.

## Official evidence packet

> config, alert with explorer link in the real channel, restart-dedup log
> (zero re-emission), share link.

## Official video outline

> condition config → trigger event → real Telegram alert → restart → no duplicate.

## Official risks

> Telegram token hygiene (env only); trigger event must be a real disclosed testnet transfer.

---

## How this build maps to each requirement

| # | Requirement | Where it is satisfied |
|---|---|---|
| 1 | ≥1 configurable alert condition | `config.yaml`: three conditions — `incoming-transfer`, `large-transfer` (threshold `minValuePHRS: "0.5"`), `contract-interaction` |
| 2 | Real channel delivery | `src/alert.sh` → Telegram `sendMessage` to chat `1434154285`; live `message_id: 717` |
| 3 | Alert has what + value + tx/explorer link | Alert body carries condition, watched address, amount in PHRS, tx hash, full explorer URL, block number, timestamp |
| 4 | No repeat spam | `state/seen` dedupe keyed `<condition>:<txhash>` + write-ahead SENDING marker (`state/alerts.log`) + startup crash-recovery that never re-sends; restart run emitted zero alerts |
