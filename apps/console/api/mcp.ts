/**
 * Same-origin MCP proxy — Vercel serverless function.
 *
 * Why this exists: browsers cannot call the Pharos MCP endpoints directly
 * (neither sends Access-Control-Allow-Origin, and the Chain MCP requires the
 * custom Mcp-Session-Id header, which triggers a blocked preflight). The
 * console's try-it-live modules POST here; this function issues genuine MCP
 * tool calls server-side (initialize → tools/call, SSE parsing) and returns
 * the parsed tool result.
 *
 * READ-ONLY tools only. `send_raw_transaction` (chain) and `sendFeedback`
 * (docs) are deliberately NOT exposed — this proxy can never broadcast a
 * transaction or file a report. `askQuestion` (docs) is excluded because its
 * 20–75s latency exceeds serverless timeouts; the Tier C modules that need
 * it are command builders, not live callers.
 *
 * No auth, no secrets: both upstream MCP endpoints are public and keyless.
 */

const CHAIN_MCP = "https://mcp.pharos.xyz/mcp";
const DOCS_MCP = "https://docs.pharos.xyz/~gitbook/mcp";

const CHAIN_PROTOCOL = "2025-03-26";
const DOCS_PROTOCOL = "2024-11-05";

interface AllowEntry {
  endpoint: string;
  protocol: string;
  tools: Set<string>;
}

const ALLOWLIST: Record<string, AllowEntry> = {
  chain: {
    endpoint: CHAIN_MCP,
    protocol: CHAIN_PROTOCOL,
    tools: new Set([
      "get_chain_info",
      "get_block_number",
      "get_balance",
      "get_transaction_count",
      "get_gas_price",
      "get_block",
      "get_transaction",
      "get_transaction_receipt",
      "get_code",
      "get_storage_at",
      "eth_call",
      "estimate_gas",
      "get_logs",
    ]),
  },
  docs: {
    endpoint: DOCS_MCP,
    protocol: DOCS_PROTOCOL,
    tools: new Set(["searchDocumentation", "getPage"]),
  },
};

const UPSTREAM_TIMEOUT_MS = 9000;

async function postUpstream(
  endpoint: string,
  headers: Record<string, string>,
  body: unknown
): Promise<{ text: string; sessionId: string | null }> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upstream MCP HTTP ${res.status}`);
  }
  return { text, sessionId: res.headers.get("mcp-session-id") };
}

function parseSseCallResponse(text: string, id: number): unknown {
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    let payload: any;
    try {
      payload = JSON.parse(line.slice(5).trim());
    } catch {
      continue;
    }
    if (payload.id !== id) continue;
    if (payload.error) {
      throw new Error(
        typeof payload.error.message === "string"
          ? payload.error.message
          : "MCP tool error"
      );
    }
    const contentText = payload?.result?.content?.[0]?.text;
    if (typeof contentText === "string") {
      try {
        return JSON.parse(contentText);
      } catch {
        return contentText;
      }
    }
    return payload.result;
  }
  throw new Error("No matching MCP response frame");
}

async function mcpToolCall(
  entry: AllowEntry,
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  // 1. initialize — the Chain MCP is stateful and returns an mcp-session-id
  //    that every later call must carry. The Docs MCP is stateless; the
  //    handshake is harmless there.
  const init = await postUpstream(entry.endpoint, baseHeaders, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: entry.protocol,
      capabilities: {},
      clientInfo: { name: "lightkeeper-console", version: "1.0" },
    },
  });

  const headers: Record<string, string> = { ...baseHeaders };
  if (init.sessionId) headers["Mcp-Session-Id"] = init.sessionId;

  // 2. notifications/initialized — best effort
  try {
    await postUpstream(entry.endpoint, headers, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
  } catch {
    /* non-fatal */
  }

  // 3. the actual tool call
  const call = await postUpstream(entry.endpoint, headers, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: tool, arguments: args },
  });
  return parseSseCallResponse(call.text, 2);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }
  const body = req.body ?? {};
  const { mcp, tool } = body;
  const args = body.arguments;

  const entry =
    typeof mcp === "string" && Object.hasOwn(ALLOWLIST, mcp)
      ? ALLOWLIST[mcp]
      : undefined;
  if (!entry || typeof tool !== "string" || !entry.tools.has(tool)) {
    res.status(400).json({ ok: false, error: "Tool not allowed" });
    return;
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    res.status(400).json({ ok: false, error: "arguments object required" });
    return;
  }

  try {
    const result = await mcpToolCall(
      entry,
      tool,
      args as Record<string, unknown>
    );
    res.status(200).json({ ok: true, mcp, tool, result });
  } catch (e: any) {
    res
      .status(502)
      .json({ ok: false, error: e?.message ?? "MCP call failed" });
  }
}
