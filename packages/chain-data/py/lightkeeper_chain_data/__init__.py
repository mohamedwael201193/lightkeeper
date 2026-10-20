"""@lightkeeper/chain-data (L1) — the only package that touches RPC/Chain MCP.

Canonical Streamable-HTTP MCP client for the Pharos Chain MCP, the
Atlantic/Pharos network-identity table, fail-on-mismatch chain assertions,
and the <=1,000-block log-chunking helper every log scanner uses.

This consolidates the previously duplicated per-task ``mcp_client.py``
copies (T01, T12) into one canonical implementation: tasks import this
package instead of vendoring their own client.

Stdlib + ``requests`` only.
"""
from __future__ import annotations

import json
import time

import requests

MCP_URL = "https://mcp.pharos.xyz/mcp"
PROTOCOL_VERSION = "2025-03-26"

#: Canonical network table. Fail-on-mismatch: any chain-id reported by a
#: live read that is not the expected entry aborts the run (see
#: :func:`assert_chain_id`).
NETWORKS = {
    "pharos-mainnet": {
        "chain_id": 1672,
        "mcp_url": MCP_URL,
        "via": "chain-mcp",
        "explorer": "https://pharosscan.xyz",
    },
    "atlantic-testnet": {
        "chain_id": 688689,
        "rpc_url": "https://atlantic.dplabs-internal.com",
        "explorer": "https://atlantic.pharosscan.xyz",
    },
}

#: Server-enforced get_logs range cap (blocks per call).
LOGS_MAX_BLOCKS = 1000

#: Client-side pacing defaults (WS3 task 5): sustained 2 req/s, burst 5.
#: Retry-After is honored up to this bound, with this many honored retries,
#: after which RateLimited is raised instead of hammering the server.
DEFAULT_RATE_PER_S = 2.0
DEFAULT_BURST = 5.0
MAX_RETRY_AFTER_S = 120.0
RATE_LIMIT_RETRIES = 3


class MCPError(RuntimeError):
    """Any Chain MCP transport, protocol, or tool error."""


class RateLimited(MCPError):
    """The server answered 429/503 with (or without) a Retry-After hint."""

    def __init__(self, message: str, retry_after_s: float | None = None):
        super().__init__(message)
        self.retry_after_s = retry_after_s


def parse_retry_after(value, now: float | None = None) -> float | None:
    """Parse a ``Retry-After`` header value into seconds-from-now.

    Supports both RFC 9110 forms: a non-negative integer number of seconds
    and an HTTP-date. Returns None when the value is absent/unparsable —
    callers fall back to their own backoff, never to zero.
    """
    if value is None:
        return None
    v = str(value).strip()
    if not v:
        return None
    try:
        return max(0.0, float(v))
    except ValueError:
        pass
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(v)
        if dt is None:
            return None
        import time as _time
        ref = _time.time() if now is None else now
        return max(0.0, dt.timestamp() - ref)
    except Exception:
        return None


class TokenBucket:
    """Client-side token-bucket pacer (WS3 task 5).

    Every outbound MCP request must :meth:`acquire` a token first, so a
    fleet of tasks sharing this client cannot burst the shared endpoint
    past ``rate_per_s`` sustained / ``burst`` instantaneous. The clock and
    sleeper are injectable so the pacing math is unit-testable offline
    with a fake clock — no real sleeping in tests.

    ``acquire`` returns the seconds waited (0.0 when a token was ready).
    """

    def __init__(self, rate_per_s: float = 2.0, burst: float = 5.0,
                 clock=None, sleep=None):
        if rate_per_s <= 0:
            raise ValueError("rate_per_s must be > 0")
        if burst < 1:
            raise ValueError("burst must be >= 1")
        self.rate_per_s = float(rate_per_s)
        self.burst = float(burst)
        self._tokens = float(burst)
        self._clock = clock or time.monotonic
        self._sleep = sleep or time.sleep
        self._last = self._clock()
        self.total_waited_s = 0.0
        self.acquisitions = 0

    def _refill(self) -> None:
        now = self._clock()
        elapsed = max(0.0, now - self._last)
        self._last = now
        self._tokens = min(self.burst, self._tokens + elapsed * self.rate_per_s)

    def acquire(self, tokens: float = 1.0) -> float:
        """Take ``tokens`` from the bucket, sleeping until available."""
        if tokens > self.burst:
            raise ValueError("acquire size exceeds bucket burst capacity")
        self._refill()
        waited = 0.0
        if self._tokens < tokens:
            deficit = tokens - self._tokens
            waited = deficit / self.rate_per_s
            self._sleep(waited)
            self.total_waited_s += waited
            self._refill()
        self._tokens -= tokens
        self.acquisitions += 1
        return waited


def network_for_chain_id(chain_id: int) -> dict:
    """Return the canonical network entry for a chain id, or raise."""
    for name, net in NETWORKS.items():
        if net["chain_id"] == int(chain_id):
            return {"name": name, **net}
    raise MCPError(f"unknown chain id {chain_id}: not in the canonical network table")


def assert_chain_id(reported, expected, *, what: str = "chain") -> int:
    """Fail-on-mismatch chain assertion. Returns the id as int on match.

    A mismatch raises :class:`MCPError` — the caller must abort, never
    continue reading the wrong network.
    """
    try:
        rid = int(str(reported), 0) if isinstance(reported, str) else int(reported)
    except (TypeError, ValueError):
        raise MCPError(f"{what}: unparsable chain id {reported!r}")
    if rid != int(expected):
        raise MCPError(
            f"{what}: chain-id mismatch — live reports {rid}, expected {expected}; "
            "refusing to continue on the wrong network"
        )
    return rid


def chunk_ranges(start: int, end: int, max_size: int = LOGS_MAX_BLOCKS):
    """Yield inclusive ``(from, to)`` block ranges of at most ``max_size``.

    Every log scanner chunks with this — the MCP/RPC servers cap get_logs
    ranges and reject wider ones.
    """
    if max_size < 1:
        raise ValueError("max_size must be >= 1")
    cur = int(start)
    end = int(end)
    while cur <= end:
        nxt = min(cur + max_size - 1, end)
        yield cur, nxt
        cur = nxt + 1


def parse_block(value) -> int:
    """Parse a block number given as int or 0x-hex string."""
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return int(value, 16 if value.startswith(("0x", "0X")) else 10)
    raise MCPError(f"unparsable block number: {value!r}")


def parse_sse(text: str, status_code: int) -> dict:
    """Parse the SSE ``data:`` line of an MCP response into a dict.

    Factored out of the transport so it is unit-testable without network.
    """
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            try:
                return json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue
    raise MCPError(f"no SSE data frame in response (HTTP {status_code}): {text[:300]}")


class ChainMCP:
    """Minimal Streamable-HTTP MCP client for the Pharos Chain MCP.

    Speaks the real MCP protocol (initialize -> notifications/initialized ->
    tools/call) against https://mcp.pharos.xyz/mcp. No auth, no API key.
    One session per process; re-handshakes on -32000.
    """

    def __init__(self, url: str = MCP_URL, timeout: int = 30,
                 client_name: str = "lightkeeper", client_version: str = "2.0.0",
                 rate_per_s: float = 2.0, burst: float = 5.0,
                 pacer: "TokenBucket | None" = None,
                 honor_retry_after: bool = True):
        self.url = url
        self.timeout = timeout
        self.client_name = client_name
        self.client_version = client_version
        self.session = requests.Session()
        self._session_id: str | None = None
        self._id = 0
        self.server_info: dict = {}
        # WS3 pacing: every request passes through the token bucket first.
        self.pacer = pacer if pacer is not None else TokenBucket(
            rate_per_s=rate_per_s, burst=burst)
        self.honor_retry_after = honor_retry_after

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
        """POST a JSON-RPC message; parse the SSE ``data:`` line into a dict.

        Paced by the token bucket. On HTTP 429/503 the server's
        ``Retry-After`` header is honored (sleep exactly what it asks,
        bounded by ``MAX_RETRY_AFTER_S``) and the request retried, up to
        ``RATE_LIMIT_RETRIES`` times; after that :class:`RateLimited`
        is raised — never a silent hammering retry.
        """
        attempt = 0
        while True:
            self.pacer.acquire()
            resp = self.session.post(self.url, headers=self._headers(),
                                     data=json.dumps(payload), timeout=self.timeout)
            sid = resp.headers.get("mcp-session-id") or resp.headers.get("Mcp-Session-Id")
            if sid:
                self._session_id = sid
            if resp.status_code in (429, 503):
                retry_after = parse_retry_after(resp.headers.get("Retry-After"))
                if self.honor_retry_after and attempt < RATE_LIMIT_RETRIES:
                    wait = retry_after if retry_after is not None else 2.0 * (attempt + 1)
                    time.sleep(min(wait, MAX_RETRY_AFTER_S))
                    attempt += 1
                    continue
                raise RateLimited(
                    f"server rate-limited the request (HTTP {resp.status_code}) "
                    f"after {attempt} honored retries",
                    retry_after_s=retry_after,
                )
            if not expect_sse:
                return {"status": resp.status_code}
            return parse_sse(resp.text, resp.status_code)

    def _post_with_retry(self, payload: dict, expect_sse: bool = True,
                         attempts: int = 3) -> dict:
        """POST with backoff on transport-level failures.

        The upstream MCP endpoint intermittently drops connections
        (IncompleteRead / RemoteDisconnected). Transport errors are safe to
        retry: initialize and tools/call are idempotent reads. Non-transport
        MCPError (HTTP errors, tool errors) is raised immediately.
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

    def get_chain_info(self) -> dict:
        return self.call("get_chain_info", {})

    def get_block_number(self) -> int:
        return parse_block(self.call("get_block_number", {}).get("blockNumber", "0x0"))

    def close(self):
        try:
            self.session.close()
        except Exception:
            pass


__all__ = [
    "MCP_URL", "PROTOCOL_VERSION", "NETWORKS", "LOGS_MAX_BLOCKS",
    "DEFAULT_RATE_PER_S", "DEFAULT_BURST", "MAX_RETRY_AFTER_S",
    "RATE_LIMIT_RETRIES",
    "MCPError", "RateLimited", "ChainMCP", "TokenBucket", "parse_retry_after",
    "network_for_chain_id", "assert_chain_id", "chunk_ranges",
    "parse_block", "parse_sse",
]
