"""Minimal Streamable-HTTP MCP client for the Pharos Chain MCP.

Speaks the real MCP protocol (initialize -> notifications/initialized ->
tools/call) against https://mcp.pharos.xyz/mcp. No auth, no API key.
Stdlib + requests only. One session per process; re-handshakes on -32000.
"""
from __future__ import annotations

import json
import time

import requests

MCP_URL = "https://mcp.pharos.xyz/mcp"
PROTOCOL_VERSION = "2025-03-26"


class MCPError(RuntimeError):
    pass


class ChainMCP:
    def __init__(self, url: str = MCP_URL, timeout: int = 30,
                 client_name: str = "lightkeeper-t08", client_version: str = "2.0.0"):
        self.url = url
        self.timeout = timeout
        self.client_name = client_name
        self.client_version = client_version
        self.session = requests.Session()
        self._session_id: str | None = None
        self._id = 0
        self.server_info: dict = {}

    # ── low-level ──────────────────────────────────────────────────────────
    def _next_id(self) -> int:
        self._id += 1
        return self._id

    def _headers(self) -> dict:
        h = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self._session_id:
            h["Mcp-Session-Id"] = self._session_id
        return h

    def _post(self, payload: dict, expect_sse: bool = True) -> dict:
        """POST a JSON-RPC message; parse the SSE `data:` line into a dict."""
        resp = self.session.post(self.url, headers=self._headers(),
                                 data=json.dumps(payload), timeout=self.timeout)
        sid = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
        if sid:
            self._session_id = sid
        text = resp.text
        if not expect_sse:
            return {"status": resp.status_code}
        # SSE frames: lines starting with "data: " carry the JSON-RPC message.
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                try:
                    return json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
        raise MCPError(f"no SSE data frame in response (HTTP {resp.status_code}): {text[:300]}")

    def _post_with_retry(self, payload: dict, expect_sse: bool = True,
                         attempts: int = 3) -> dict:
        """POST with backoff on transport-level failures.

        The upstream MCP endpoint intermittently drops connections
        (IncompleteRead / RemoteDisconnected, ~30-40% of calls in
        testing). Transport errors are safe to retry: initialize and
        tools/call are idempotent reads. Non-transport errors
        (MCPError from _post) are raised immediately.
        """
        last: Exception | None = None
        for i in range(attempts):
            try:
                return self._post(payload, expect_sse=expect_sse)
            except requests.exceptions.RequestException as e:
                last = e
                if i < attempts - 1:
                    time.sleep(2 * (i + 1))
        raise MCPError(f"MCP transport error after {attempts} attempts: {last}")

    # ── handshake ──────────────────────────────────────────────────────────
    def connect(self) -> "ChainMCP":
        msg = self._post_with_retry({
            "jsonrpc": "2.0", "id": self._next_id(), "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": self.client_name, "version": self.client_version},
            },
        })
        if "error" in msg:
            raise MCPError(f"initialize failed: {msg['error']}")
        result = msg.get("result", {})
        self.server_info = result.get("serverInfo", {})
        if not self._session_id:
            raise MCPError("initialize returned no mcp-session-id header")
        # notifications/initialized carries no id and no response body expected
        try:
            self._post_with_retry({"jsonrpc": "2.0", "method": "notifications/initialized"},
                                  expect_sse=False)
        except Exception:
            pass
        return self

    def _ensure(self):
        if not self._session_id:
            self.connect()

    # ── tools ──────────────────────────────────────────────────────────────
    def call(self, name: str, arguments: dict, retries: int = 1) -> dict:
        """Call an MCP tool by name; returns the parsed inner JSON object."""
        attempt = 0
        while True:
            self._ensure()
            msg = self._post_with_retry({
                "jsonrpc": "2.0", "id": self._next_id(), "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            })
            if "error" in msg:
                err = msg["error"]
                # session expired server-side -> re-handshake once
                if err.get("code") == -32000 and attempt < retries:
                    self._session_id = None
                    attempt += 1
                    time.sleep(1)
                    continue
                raise MCPError(f"tools/call {name} failed: {err}")
            content = msg.get("result", {}).get("content", [])
            texts = [c.get("text", "") for c in content if c.get("type") == "text"]
            if not texts:
                raise MCPError(f"tools/call {name}: empty content")
            try:
                return json.loads(texts[0])
            except json.JSONDecodeError as e:
                raise MCPError(f"tools/call {name}: inner text is not JSON: {e}")

    def close(self):
        try:
            self.session.close()
        except Exception:
            pass
