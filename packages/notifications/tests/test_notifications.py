#!/usr/bin/env python3
"""Tests for @lightkeeper/notifications.

send_telegram is tested against a REAL local HTTP server (no mocks) via
the ``api_base`` override; missing credentials fail loudly.
"""
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "py"))

from lightkeeper_notifications import (
    Alert, Dedup, NotificationError, Notifier, format_alert, send_telegram,
)


class TestAlert(unittest.TestCase):
    def test_requires_id_and_what(self):
        with self.assertRaises(ValueError):
            Alert(id="", what="x", value="1")
        with self.assertRaises(ValueError):
            Alert(id="a", what="", value="1")

    def test_format(self):
        a = Alert(id="1:2", what="Transfer", value="1.5 USDC",
                  link="https://x/tx/0xabc", action="review",
                  extra={"block": 100, "tx": "0xabc",
                         "from": "0xf", "to": "0x1"})
        s = format_alert(a)
        self.assertIn("Transfer", s)
        self.assertIn("block=100", s)
        self.assertIn("tx=0xabc", s)
        self.assertIn("from=0xf to=0x1", s)
        self.assertIn("value=1.5 USDC", s)
        self.assertIn("https://x/tx/0xabc", s)
        self.assertIn("action: review", s)

    def test_format_minimal(self):
        a = Alert(id="i", what="Ping", value="ok")
        self.assertEqual(format_alert(a), "Ping value=ok")


class TestDedup(unittest.TestCase):
    def test_is_new(self):
        d = Dedup()
        self.assertTrue(d.is_new("a"))
        self.assertFalse(d.is_new("a"))

    def test_file_backed(self):
        with tempfile.TemporaryDirectory() as td:
            p = os.path.join(td, "seen.json")
            d = Dedup(p)
            d.is_new("a")
            d2 = Dedup(p)
            self.assertFalse(d2.is_new("a"))


class TelegramHandler(BaseHTTPRequestHandler):
    received = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode()
        TelegramHandler.received.append((self.path, body))
        if "BADTOKEN" in self.path:
            payload = {"ok": False, "description": "Unauthorized"}
        else:
            payload = {"ok": True, "result": {"message_id": 7}}
        data = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


class TestSendTelegram(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), TelegramHandler)
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        TelegramHandler.received = []

    def test_real_delivery_roundtrip(self):
        res = send_telegram("TOKEN123", "999", "hello",
                            api_base=self.base)
        self.assertEqual(res, {"message_id": 7})
        path, body = TelegramHandler.received[0]
        self.assertIn("/botTOKEN123/sendMessage", path)
        self.assertIn("chat_id=999", body)
        self.assertIn("text=hello", body)

    def test_api_refusal_raises(self):
        with self.assertRaises(NotificationError):
            send_telegram("BADTOKEN", "999", "hi", api_base=self.base)

    def test_missing_creds_refuse_loudly(self):
        with self.assertRaises(NotificationError):
            send_telegram(None, "999", "hi", api_base=self.base)
        with self.assertRaises(NotificationError):
            send_telegram("T", None, "hi", api_base=self.base)


class TestNotifier(unittest.TestCase):
    def test_write_ahead_dedup(self):
        sent = []
        n = Notifier()
        a = Alert(id="k1", what="Transfer", value="1 USDC")
        self.assertEqual(n.notify(a, sent.append), "sent")
        self.assertEqual(n.notify(a, sent.append), "duplicate")
        self.assertEqual(len(sent), 1)

    def test_failed_send_stays_marked(self):
        def boom(alert):
            raise NotificationError("down")
        n = Notifier()
        a = Alert(id="k2", what="Transfer", value="1 USDC")
        with self.assertRaises(NotificationError):
            n.notify(a, boom)
        # no silent retry storm: the id stays marked
        self.assertEqual(n.notify(a, lambda x: None), "duplicate")


if __name__ == "__main__":
    unittest.main(verbosity=2)
