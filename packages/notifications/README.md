# @lightkeeper/notifications (L9)

Alert/report delivery. An alert is what + value + link + action
(`Alert`, `format_alert`). `Dedup` is file-backed (no alert goes out twice).
`send_telegram` delivers over the real Telegram Bot API — missing
credentials fail LOUDLY (`NotificationError`), never a silent no-op.
`Notifier` does write-ahead dedup: the id is marked seen (persisted) BEFORE
the send, so a crash can neither double-send nor lose the send.

## API (`lightkeeper_notifications`)

- `Alert(id, what, value, link="", action="", extra={})`, `format_alert(alert)`
- `Dedup(path=None)` — `.is_new(id)`
- `send_telegram(bot_token, chat_id, text, api_base=...)` — real HTTPS POST
- `Notifier(dedup)` — `.notify(alert, sender)` → `"sent"`/`"duplicate"`

## Consumers

- `tasks/t02-event-log-monitor/monitor.py` — `emit_alert` builds a lib `Alert`; `alerts.jsonl` schema unchanged

## Test

`python3 tests/test_notifications.py` — 10 tests; `send_telegram` is tested
against a real local HTTP server via the `api_base` override (no mocks).
