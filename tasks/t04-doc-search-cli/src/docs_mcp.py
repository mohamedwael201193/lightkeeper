#!/usr/bin/env python3
"""Docs MCP client (T04).

Thin stdlib-only client for the REAL Pharos Developer Docs MCP:

    https://docs.pharos.xyz/~gitbook/mcp

Public GitBook MCP endpoint (no auth), verified live 2026-10-19.
Protocol: MCP Streamable HTTP -- JSON-RPC 2.0 over POST, SSE response frames.

Tools used: searchDocumentation, getPage, askQuestion.
NEVER invoke sendFeedback here: it files a real report to the Pharos docs team.

Server quirks (verified live):
- The server is stateless for tools/call: NO initialize handshake is required.
  (initialize works too, but direct tools/call is faster and equally accepted.)
- The endpoint aggressively drops connections mid-stream (RemoteDisconnected /
  IncompleteRead on most attempts under load, sometimes with 0 bytes). This
  client retries with exponential backoff + jitter and salvages partial SSE
  bodies. A complete response is one `data:` frame; partial bodies that
  already contain a full result frame are accepted.
"""

import http.client
import json
import random
import time
import urllib.request

ENDPOINT = "https://docs.pharos.xyz/~gitbook/mcp"
SERVER_TITLE = "docs.pharos.xyz MCP Server"
SERVER_VERSION_EXPECTED = "0.27.2"

_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
}

# Tools this CLI is allowed to call. sendFeedback is deliberately absent:
# it files a real report to the Pharos docs team.
ALLOWED_TOOLS = {"searchDocumentation", "getPage", "askQuestion"}


class DocsMCPError(RuntimeError):
    pass


def _post(payload, timeout=30, tries=10):
    """POST with aggressive retry-on-drop. Returns the raw SSE body (decoded)."""
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(
                ENDPOINT, data=json.dumps(payload).encode(), headers=_HEADERS,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode(errors="replace")
        except http.client.IncompleteRead as e:
            body = e.partial.decode(errors="replace")
            # A complete JSON-RPC result frame survived the truncated stream.
            if '"result"' in body and '"id"' in body and body.rstrip().endswith("}"):
                return body
            last = e
        except (http.client.RemoteDisconnected, ConnectionError, TimeoutError) as e:
            last = e
        except Exception as e:  # e.g. HTTPError with a body
            last = e
        time.sleep(min(2 ** attempt, 30) + random.uniform(0, 2))
    raise DocsMCPError("Docs MCP unreachable after %d tries: %r" % (tries, last))


def _result_frame(body, rid):
    """Extract the JSON-RPC result for request id `rid` from SSE frames."""
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        try:
            msg = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        if msg.get("id") != rid:
            continue
        if "error" in msg:
            raise DocsMCPError("MCP error: %s" % json.dumps(msg["error"]))
        return msg.get("result")
    raise DocsMCPError("no result frame for id %r (body tail: %r)" % (rid, body[-200:]))


class DocsMCP:
    """Stateless client for the GitBook Docs MCP (no handshake needed)."""

    def __init__(self, client_name="pharos-docs", client_version="2.0"):
        self.client_name = client_name
        self.client_version = client_version
        self._rid = 0

    def _next_id(self):
        self._rid += 1
        return self._rid

    def call(self, name, arguments, tool_retries=4):
        """Call a tool by name. Returns the raw `content` blocks list.

        Transient tool-level failures ("Internal Server Error" from the
        GitBook backend) are retried with backoff; anything else raises.
        """
        if name not in ALLOWED_TOOLS:
            raise DocsMCPError("tool %r is not allowed (allowed: %s)"
                               % (name, sorted(ALLOWED_TOOLS)))
        last_err = None
        for attempt in range(tool_retries):
            rid = self._next_id()
            body = _post({
                "jsonrpc": "2.0", "id": rid, "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            })
            result = _result_frame(body, rid)
            if not result.get("isError"):
                return result.get("content", [])
            text = " ".join(b.get("text", "") for b in result.get("content", []))
            last_err = "tool %s error: %s" % (name, text[:500])
            # Transient backend 500s are worth retrying; anything else is final.
            if "internal server error" not in text.lower():
                break
            time.sleep(min(2 ** attempt, 30) + random.uniform(0, 2))
        raise DocsMCPError(last_err)

    @staticmethod
    def content_text(content):
        """Concatenate text blocks from a tools/call result."""
        return "\n".join(b.get("text", "") for b in content if b.get("type") == "text")

    # ---- convenience wrappers ------------------------------------------------

    def search(self, query):
        return self.call("searchDocumentation", {"query": query})

    def get_page(self, url):
        return self.call("getPage", {"url": url})

    def ask(self, question, goal=None):
        args = {"question": question}
        if goal:
            args["goal"] = goal
        return self.call("askQuestion", args)


def parse_search_results(text):
    """Parse searchDocumentation text blocks into [{title, link, content}]."""
    results = []
    # Blocks are separated; each has "Title: ...\\nLink: ...\\nContent: ..."
    # Split on the Title: marker.
    import re
    chunks = re.split(r"(?m)^Title:\s*", text)
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        m_link = re.search(r"(?m)^Link:\s*(\S+)\s*$", chunk)
        m_content = re.search(r"(?m)^Content:\s*", chunk)
        if not m_link:
            continue
        title = chunk[:m_link.start()].strip().splitlines()[0][:200]
        link = m_link.group(1).strip()
        content = chunk[m_content.end():].strip() if m_content else ""
        results.append({"title": title, "link": link, "content": content})
    return results
