"""Dual MCP client for T13: Pharos Chain MCP + Developer Docs MCP.

Both speak real MCP Streamable HTTP (initialize -> notifications/initialized
-> tools/call). No auth on either. Retry-with-backoff is MANDATORY: both
endpoints intermittently drop connections (~30-40% in testing).

- Chain: https://mcp.pharos.xyz/mcp (protocol 2025-03-26, STATEFUL session
  via mcp-session-id header, mainnet 1672 ONLY)
- Docs:  https://docs.pharos.xyz/~gitbook/mcp (protocol 2024-11-05,
  stateless; NEVER invoke sendFeedback — it files a real report)

Stdlib + requests only.
"""
from __future__ import annotations

import json
import time

import requests

CHAIN_MCP_URL = "https://mcp.pharos.xyz/mcp"
CHAIN_PROTOCOL = "2025-03-26"
DOCS_MCP_URL = "https://docs.pharos.xyz/~gitbook/mcp"
DOCS_PROTOCOL = "2024-11-05"


class MCPError(RuntimeError):
    pass


class _BaseMCP:
    url: str = ""
    protocol: str = ""
    client_name: str = "lightkeeper-t13"

    def __init__(self, timeout: int = 60):
        self.timeout = timeout
        self.session = requests.Session()
        self._session_id: str | None = None
        self._id = 0
        self.server_info: dict = {}

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
        resp = self.session.post(self.url, headers=self._headers(),
                                 data=json.dumps(payload), timeout=self.timeout)
        sid = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
        if sid:
            self._session_id = sid
        text = resp.text
        if not expect_sse:
            return {"status": resp.status_code}
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("data:"):
                try:
                    return json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
        raise MCPError(f"no SSE data frame (HTTP {resp.status_code}): {text[:300]}")

    def _post_with_retry(self, payload: dict, expect_sse: bool = True,
                         attempts: int = 4) -> dict:
        # The Docs MCP drops ~40% of streams mid-JSON (2026-10-20 flake
        # class): retry transport errors AND parse-level truncations
        # ("no SSE data frame"). Genuine protocol rejections (initialize /
        # tools-call errors) are raised immediately and never retried.
        last: Exception | None = None
        for i in range(attempts):
            try:
                return self._post(payload, expect_sse=expect_sse)
            except requests.exceptions.RequestException as e:
                last = e
            except MCPError as e:
                if not str(e).startswith("no SSE data frame"):
                    raise
                last = e
            if i < attempts - 1:
                time.sleep(2 * (i + 1))
        raise MCPError(f"MCP transport error after {attempts} attempts: {last}")

    def connect(self) -> "_BaseMCP":
        msg = self._post_with_retry({
            "jsonrpc": "2.0", "id": self._next_id(), "method": "initialize",
            "params": {
                "protocolVersion": self.protocol,
                "capabilities": {},
                "clientInfo": {"name": self.client_name, "version": "2.0.0"},
            },
        })
        if "error" in msg:
            raise MCPError(f"initialize failed: {msg['error']}")
        self.server_info = msg.get("result", {}).get("serverInfo", {})
        try:
            self._post_with_retry({"jsonrpc": "2.0", "method": "notifications/initialized"},
                                  expect_sse=False)
        except Exception:
            pass
        return self

    def _ensure(self):
        # Chain MCP is stateful: needs the session. Docs MCP is stateless:
        # connect() is cheap and harmless; call it lazily once.
        if not self._session_id and not getattr(self, "_connected", False):
            self.connect()
            self._connected = True

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
                if err.get("code") == -32000 and attempt < retries:
                    self._session_id = None
                    self._connected = False
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
            except json.JSONDecodeError:
                # Docs MCP tools return plain strings (markdown / prose),
                # not JSON — return the raw text honestly.
                return {"text": texts[0]}

    def tools_list(self) -> list:
        self._ensure()
        msg = self._post_with_retry({
            "jsonrpc": "2.0", "id": self._next_id(), "method": "tools/list",
            "params": {},
        })
        if "error" in msg:
            raise MCPError(f"tools/list failed: {msg['error']}")
        return msg.get("result", {}).get("tools", [])

    def close(self):
        try:
            self.session.close()
        except Exception:
            pass


class ChainMCP(_BaseMCP):
    url = CHAIN_MCP_URL
    protocol = CHAIN_PROTOCOL


class DocsMCP(_BaseMCP):
    url = DOCS_MCP_URL
    protocol = DOCS_PROTOCOL

    def connect(self) -> "DocsMCP":
        # Docs MCP is stateless: initialize may not return a session id.
        # Do not hard-fail on a missing session header.
        msg = self._post_with_retry({
            "jsonrpc": "2.0", "id": self._next_id(), "method": "initialize",
            "params": {
                "protocolVersion": self.protocol,
                "capabilities": {},
                "clientInfo": {"name": self.client_name, "version": "2.0.0"},
            },
        })
        if "error" in msg:
            raise MCPError(f"initialize failed: {msg['error']}")
        self.server_info = msg.get("result", {}).get("serverInfo", {})
        self._connected = True
        return self
