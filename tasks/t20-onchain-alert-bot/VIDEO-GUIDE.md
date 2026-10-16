# VIDEO GUIDE — T20 On-Chain Alert Bot (45–90 seconds)

**Rule: REAL terminal + REAL Telegram message on screen. NO staged fakes.**
Record the screen as you run the commands; do not re-enact or mock anything.
The trigger tx, the watcher log, and the Telegram message already exist —
this video replays the flow honestly with fresh terminal output where noted.

## Shot list

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Terminal: `cat config.yaml` (conditions visible) | "T20, the on-chain alert bot. Three configurable conditions: incoming transfer, large transfer over half a PHRS, and contract interaction — all watching this Atlantic testnet wallet." |
| 2 | 8–20s | Terminal: `bash src/trigger.sh` — REAL dust tx fires (or show the already-mined tx on the explorer) | "I fire a real dust transfer — one-thousandth of a PHRS — to the watched address. This is a genuine on-chain event, disclosed as a self-test." |
| 3 | 20–30s | Explorer page: the tx `0xe6c9f52c…` at block 31481424 | "Mined at block 31481424. Status success." |
| 4 | 30–45s | Terminal: `bash src/watch.sh --once` → log line `ALERT SENT … message_id=717` | "The watcher polls block by block, matches it as an incoming transfer, and sends exactly one Telegram alert." |
| 5 | 45–60s | Telegram app: the REAL delivered message (condition, 0.001 PHRS, tx hash, explorer link, block) | "Here it is in Telegram — what happened, the value, the transaction, and the explorer link. One alert, no spam." |
| 6 | 60–75s | Terminal: restart `bash src/watch.sh --once` → scan completes, no `ALERT SENT` for the same tx | "Restart the watcher — the same event is never alerted twice. Dedupe by condition and transaction hash, with a write-ahead marker so even a crash can't cause a duplicate." |
| 7 | 75–90s | Terminal: `bash test/match_test.sh` → `PASS=16 FAIL=0` | "Sixteen unit tests green. Total on-chain spend for the whole demo: about two hundred-thousandths of a PHRS. Done." |

| 1a | 0–8s (alt) | Console: `lightkeeper-console.vercel.app/#/task/onchain-alert-bot` — rule builder generating `config.yaml` + copy | "Or build the rule in the LIGHTKEEPER console: toggle the conditions, set the threshold, copy the exact config the watcher reads." |

## Recording notes

- Keep the wallet address as-is (`0xf76e…71a3`) — it is a public testnet address.
- NEVER show `.env`, private keys, or the bot token on screen. If the terminal
  history contains a sourced env, clear it before recording.
- The Telegram message shown must be the real one (message_id 717) — scroll to
  it in the actual chat; do not fabricate a message.
- If re-running the trigger for the video, it will send a second real alert —
  that is honest, but note it as a second demo event; do not pretend it is the first.
- Export at 1080p, upload unlisted, paste the link into SUBMISSION.md's video slot.
