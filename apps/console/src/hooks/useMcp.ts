/**
 * useMcp — client for the same-origin MCP proxy (`/api/mcp`, see api/mcp.ts).
 *
 * The browser cannot call the Pharos MCP endpoints directly (no CORS), so
 * try-it-live modules route genuine MCP tool calls through the proxy.
 * In local `vite dev` the proxy doesn't exist — callers get a clear
 * McpProxyUnavailableError instead of a silent fallback, so production
 * behavior (real MCP) is never confused with dev behavior.
 */

export class McpProxyUnavailableError extends Error {
  constructor() {
    super(
      "MCP proxy unavailable in local dev — deploy the console (or a preview) to run live MCP tool calls."
    );
    this.name = "McpProxyUnavailableError";
  }
}

export type McpServer = "chain" | "docs";

interface McpProxyResponse {
  ok: boolean;
  mcp?: string;
  tool?: string;
  result?: unknown;
  error?: string;
}

export async function mcpCall(
  mcp: McpServer,
  tool: string,
  args: Record<string, unknown>
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mcp, tool, arguments: args }),
    });
  } catch (e) {
    throw new Error(
      `MCP proxy unreachable: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (res.status === 404) throw new McpProxyUnavailableError();
  let data: McpProxyResponse;
  try {
    data = (await res.json()) as McpProxyResponse;
  } catch {
    throw new Error(`MCP proxy returned non-JSON (HTTP ${res.status})`);
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `MCP proxy HTTP ${res.status}`);
  }
  return data.result;
}

/** Chain MCP tools (Pharos mainnet, chain 1672) via the proxy. */
export const chainMcp = {
  getChainInfo: () => mcpCall("chain", "get_chain_info", {}),
  getBlockNumber: () =>
    mcpCall("chain", "get_block_number", {}) as Promise<{
      blockNumber: string;
      blockNumberHex: string;
    }>,
  getCode: (address: string, block: string | number) =>
    mcpCall("chain", "get_code", { address, block }),
  ethCall: (
    to: string,
    data: string,
    block: string | number,
    extra?: Record<string, unknown>
  ) =>
    mcpCall("chain", "eth_call", {
      transaction: { to, data, ...(extra ?? {}) },
      block,
    }) as Promise<{ result: string }>,
  getLogs: (args: {
    address: string | string[];
    topics?: (string | string[] | null)[];
    fromBlock: string | number;
    toBlock: string | number;
  }) => mcpCall("chain", "get_logs", args as Record<string, unknown>),
};

/** Docs MCP tools (read-only subset) via the proxy. */
export const docsMcp = {
  searchDocumentation: (query: string) =>
    mcpCall("docs", "searchDocumentation", { query }),
  getPage: (url: string) => mcpCall("docs", "getPage", { url }),
};
