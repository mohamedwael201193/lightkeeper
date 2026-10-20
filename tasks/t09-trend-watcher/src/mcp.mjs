/**
 * t09-trend-watcher — Chain MCP client (Pharos mainnet).
 *
 * Speaks the real MCP protocol (Streamable HTTP, protocol 2025-03-26)
 * against https://mcp.pharos.xyz/mcp — the SAME named endpoint the
 * resubmitted T01/T02/T12 builds use. initialize -> capture the
 * `mcp-session-id` response header -> notifications/initialized ->
 * tools/call, session header on every POST. Re-handshakes once on
 * -32000 (session lost). Retries transport drops (the upstream drops
 * connections intermittently; every tool used here is an idempotent read).
 *
 * This client is the ONLY chain transport in this task: there is no raw
 * JSON-RPC path anywhere (no `cast`, no eth_* against an RPC URL).
 * `stats.rawRpcCalls` is therefore 0 by construction and asserted by tests.
 */

export const CHAIN_MCP_URL = "https://mcp.pharos.xyz/mcp";
const PROTOCOL_VERSION = "2025-03-26";

export const mcpStats = {
  endpoint: CHAIN_MCP_URL,
  mcpCalls: 0,
  toolsCalled: new Set(),
  rawRpcCalls: 0,
};

let sessionId = null;
let rpcId = 0;
let serverInfo = {};

function nextId() {
  rpcId += 1;
  return rpcId;
}

async function postOnce(payload, expectBody = true) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const resp = await fetch(CHAIN_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const sid = resp.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  if (!expectBody) return null;
  const text = await resp.text();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("data:")) {
      try {
        return JSON.parse(t.slice(5).trim());
      } catch {
        /* keep scanning frames */
      }
    }
  }
  throw new Error(`Chain MCP: no SSE data frame in response (HTTP ${resp.status}): ${text.slice(0, 200)}`);
}

async function post(payload, expectBody = true, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await postOnce(payload, expectBody);
    } catch (err) {
      last = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Chain MCP transport error after ${attempts} attempts: ${last?.message ?? last}`);
}

/** Handshake (idempotent: safe to call when already connected). */
export async function mcpConnect(clientName = "lightkeeper-t09", clientVersion = "2.0.0") {
  if (sessionId) return serverInfo;
  const msg = await post({
    jsonrpc: "2.0",
    id: nextId(),
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientName, version: clientVersion },
    },
  });
  if (msg.error) throw new Error(`Chain MCP initialize failed: ${JSON.stringify(msg.error)}`);
  serverInfo = msg.result?.serverInfo ?? {};
  if (!sessionId) throw new Error("Chain MCP initialize returned no mcp-session-id header");
  try {
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, false);
  } catch {
    /* notification carries no response body; ignore */
  }
  return serverInfo;
}

/**
 * Call a Chain MCP tool BY NAME. Returns the parsed inner JSON object.
 * rawRpcCalls stays 0: this is the only way this task reads the chain.
 */
export async function mcpCall(name, args = {}, _retried = false) {
  await mcpConnect();
  const msg = await post({
    jsonrpc: "2.0",
    id: nextId(),
    method: "tools/call",
    params: { name, arguments: args },
  });
  if (msg.error) {
    const err = msg.error;
    if (err.code === -32000 && !_retried) {
      sessionId = null; // session expired server-side -> re-handshake once
      return mcpCall(name, args, true);
    }
    throw new Error(`Chain MCP tools/call ${name} failed: ${JSON.stringify(err)}`);
  }
  const content = msg.result?.content ?? [];
  const texts = content.filter((c) => c.type === "text").map((c) => c.text ?? "");
  if (!texts.length) throw new Error(`Chain MCP tools/call ${name}: empty content`);
  mcpStats.mcpCalls += 1;
  mcpStats.toolsCalled.add(name);
  try {
    return JSON.parse(texts[0]);
  } catch {
    return { raw: texts[0] };
  }
}

export function mcpClose() {
  sessionId = null;
}
