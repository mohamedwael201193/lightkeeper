#!/usr/bin/env bash
# T01 · READ CONTRACT STATE — entry point (delegates to the Chain MCP reader).
# All reads go through the REAL Chain MCP (https://mcp.pharos.xyz/mcp):
#   get_chain_info / get_code / get_block_number / eth_call — by tool name.
# No raw JSON-RPC against an RPC URL anywhere in this task.
set -euo pipefail
TASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$TASK_DIR/bin/read-contract-state.py" "$@"
