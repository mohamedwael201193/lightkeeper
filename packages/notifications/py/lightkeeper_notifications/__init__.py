"""@lightkeeper/notifications (L9) — alert/report delivery.

An alert is what + value + link + action. This package owns:

* :class:`Alert` — the typed alert (id, what, value, link, action).
* :func:`format_alert` — the human one-line rendering.
* :class:`Dedup` — file-backed seen ids; no alert goes out twice.
* :func:`send_telegram` — real Telegram Bot API delivery over HTTPS.
  Missing credentials fail LOUDLY (``NotificationError``) — never a
  silent no-op that looks like a sent alert.
* :class:`Notifier` — write-ahead dedup: the id is marked seen (and
  persisted) BEFORE the send, so a kill -9 can neither double-send nor
  lose the fact that it was sent.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field


class NotificationError(RuntimeError):
    """Delivery failed, or was refused for missing credentials."""


@dataclass
class Alert:
    """what happened, the value, where to look, what to do about it."""
    id: str
    what: str
    value: str
    link: str = ""
    action: str = ""
    ts: str = ""
    extra: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.id:
            raise ValueError("Alert requires an id (dedup key)")
        if not self.what:
            raise ValueError("Alert requires 'what'")
        if not self.ts:
            self.ts = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    def to_dict(self) -> dict:
        return {"id": self.id, "ts": self.ts, "what": self.what,
                "value": self.value, "link": self.link, "action": self.action,
                "extra": self.extra}


def format_alert(a: Alert) -> str:
    """One-line human rendering: what + value + link + action.

    Optional ``extra`` keys (block, tx, from, to) are appended when present
    so monitors keep their familiar log shape.
    """
    parts = [a.what]
    e = a.extra or {}
    if "block" in e:
        parts.append(f"block={e['block']}")
    if "tx" in e:
        parts.append(f"tx={e['tx']}")
    if "from" in e and "to" in e:
        parts.append(f"from={e['from']} to={e['to']}")
    parts.append(f"value={a.value}")
    if a.link:
        parts.append(a.link)
    if a.action:
        parts.append(f"action: {a.action}")
    return " ".join(parts)


class Dedup:
    """File-backed seen ids."""

    def __init__(self, path: str | None = None):
        self.path = path
        self._seen: set[str] = set()
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self._seen = set(json.load(f))

    def is_new(self, item_id: str) -> bool:
        """Mark ``item_id`` seen; True iff this is the first time."""
        if item_id in self._seen:
            return False
        self._seen.add(item_id)
        self._persist()
        return True

    def _persist(self):
        if self.path:
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(sorted(self._seen), f)
            os.replace(tmp, self.path)


def send_telegram(bot_token: str | None, chat_id: str | None, text: str,
                  api_base: str = "https://api.telegram.org",
                  timeout: int = 30) -> dict:
    """Deliver ``text`` via the Telegram Bot API. Returns the API result.

    Raises :class:`NotificationError` when credentials are missing or the
    API reports failure — delivery problems are loud, never silent.
    ``api_base`` is overridable so tests can run against a local server.
    """
    if not bot_token or not chat_id:
        raise NotificationError(
            "telegram delivery refused: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID "
            "not configured — refusing to pretend an alert was sent"
        )
    url = f"{api_base.rstrip('/')}/bot{bot_token}/sendMessage"
    body = urllib.parse.urlencode(
        {"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"}
    ).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type":
                                          "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        raise NotificationError(f"telegram delivery failed: {type(e).__name__}: {e}")
    if not payload.get("ok"):
        raise NotificationError(f"telegram API refused the message: {payload}")
    return payload.get("result", {})


class Notifier:
    """Alert delivery with write-ahead dedup."""

    def __init__(self, dedup: Dedup | None = None):
        self.dedup = dedup or Dedup()

    def notify(self, alert: Alert, sender) -> str:
        """Send ``alert`` via ``sender(alert) -> None``.

        The alert id is marked seen (persisted) BEFORE the send — a crash
        between marking and sending can at worst skip a resend, never
        double-send. Returns ``"sent"`` or ``"duplicate"``.
        """
        if not self.dedup.is_new(alert.id):
            return "duplicate"
        sender(alert)  # raises on failure — the id stays marked; no silent retry storm
        return "sent"


__all__ = [
    "NotificationError", "Alert", "format_alert",
    "Dedup", "send_telegram", "Notifier",
]
