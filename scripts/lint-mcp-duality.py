#!/usr/bin/env python3
"""lint-mcp-duality.py — eth_call duality lint for LIGHTKEEPER (WS1 #5).

`eth_call` is BOTH a live Chain-MCP tool AND a raw JSON-RPC method — by
design. That duality is the one place the two surfaces legitimately share
a name. Everywhere else the surfaces must never mix:

  Rule A (raw-RPC contexts): a string naming an MCP tool (get_balance,
    get_block_number, searchDocumentation, ...) must NEVER appear as an
    argument in a raw-RPC call context (rpc_call / _rpc / .rpc / cast).
    JSON-RPC methods there are eth_* names; eth_call is the sole exception.
  Rule B1 (wrapper-only endpoints): the hosted MCP endpoint URLs may be
    used with real network machinery (fetch/requests/urlopen/curl) only
    inside named client wrappers / the console proxy / sanctioned
    test+evidence harnesses (allowlist below). A string that merely NAMES
    the endpoint — a UI display label, a provenance field in output JSON,
    a citation source, a test assertion — is data, not a bypass, and is
    not flagged; any file pairing the URL with actual network calls is.
  Rule B2 (wrapper-only protocol): a JSON-RPC "tools/call" construction
    may exist only inside the same allowlisted wrapper files.
  Rule C (live names): every tool name used in an MCP-call context must
    exist in the live spec, captured in
    evidence/mcp-watch/baseline-tools.json (refresh via mcp-watch).
    A JSON-RPC eth_* name (other than eth_call) used as an MCP tool name
    is a hard violation — the 2026-10-16 rejection class.

Exit codes: 0 = clean, 1 = violations, 2 = config error (no baseline).
Stdlib only. CI wiring: Child C — invoke as
    python3 scripts/lint-mcp-duality.py
from the repo root (paths are repo-relative; --root overrides).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

CODE_EXTS = {".py", ".ts", ".tsx", ".mjs", ".js", ".sh"}
SKIP_DIRS = {"node_modules", "dist", "__pycache__", ".git"}
SCAN_ROOTS = ["tasks", "apps/console/src", "apps/console/api", "packages", "scripts"]

ENDPOINTS = ["https://mcp.pharos.xyz/mcp", "https://docs.pharos.xyz/~gitbook/mcp"]

# A string that merely NAMES the endpoint (display label, provenance field
# in output JSON, citation URL, test assertion) is not a bypass. A bypass
# is an actual call: the endpoint URL combined with real network machinery
# (fetch / requests.post / urlopen / curl) on the SAME line. That is how a
# direct call is written; a hand-rolled "tools/call" protocol payload is
# caught independently by Rule B2, which has no such carve-out.
NETWORK_CALL = re.compile(
    r"\bfetch\s*\(|requests\.|urlopen|axios|XMLHttpRequest|\.post\s*\(|"
    r"http\.client|\bcurl\b|\bnew\s+Request\s*\(")

# Named wrappers / sanctioned surfaces allowed to touch the raw endpoint or
# construct tools/call payloads. Everything else must go through them:
#   tasks -> their src/ client module or task-root client (monitor.py, flow.py)
#   console -> apps/console/api/mcp.ts proxy via src/hooks/useMcp.ts
WRAPPER_RES = [
    re.compile(r"^apps/console/api/mcp\.ts$"),
    re.compile(r"^apps/console/src/hooks/useMcp\.ts$"),
    re.compile(r"^scripts/"),
    re.compile(r"^tasks/[^/]+/(src|bin|scripts|tests|test|evidence|accuracy-audit)/"),
    re.compile(r"^tasks/[^/]+/(monitor|flow|mcp_client|docs_mcp|mcp)\.py$"),
    re.compile(r"^packages/"),
]

RAW_RPC_CALL = re.compile(r"(rpc_call|_rpc|\.rpc|raw_rpc|json_rpc)\s*\(|\bcast\s+(call|send|rpc)\b")
STRING_LIT = re.compile(r"""[\"']([A-Za-z_][A-Za-z0-9_]*)[\"']""")
TOOLS_CALL_CTOR = re.compile(r"""[\"']method[\"']\s*[:=]\s*[\"']tools/call[\"']""")
MCP_CALL_PATTERNS = [
    re.compile(r"\.(?:call|mcp_call|call_tool)\(\s*[\"']([A-Za-z_]+)[\"']"),
    re.compile(r"\bmcpCall\(\s*[\"'](?:chain|docs)[\"'],\s*[\"']([A-Za-z_]+)[\"']"),
]
ALLOWED_TOOLS_SET = re.compile(r"ALLOWED_TOOLS\s*=\s*\{([^}]*)\}")


def is_comment(line: str) -> bool:
    s = line.lstrip()
    return s.startswith(("#", "//", "*", "/*"))


def is_wrapper(relpath: str) -> bool:
    return any(r.search(relpath) for r in WRAPPER_RES)


def iter_code_files(root: str):
    for sr in SCAN_ROOTS:
        base = os.path.join(root, sr)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                if os.path.splitext(fn)[1] in CODE_EXTS:
                    yield os.path.join(dirpath, fn)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--baseline", default=None)
    args = ap.parse_args()
    root = args.root
    baseline_path = args.baseline or os.path.join(
        root, "evidence", "mcp-watch", "baseline-tools.json")
    try:
        with open(baseline_path) as f:
            base = json.load(f)
        mcp_names = {t["name"] for t in base["chain"]["tools"]} | \
                    {t["name"] for t in base["docs"]["tools"]}
    except Exception as e:
        print(f"lint-mcp-duality: cannot load live tool baseline "
              f"{baseline_path}: {e}", file=sys.stderr)
        return 2

    violations = []
    for path in iter_code_files(root):
        rel = os.path.relpath(path, root)
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                lines = f.read().splitlines()
        except OSError:
            continue
        wrapper = is_wrapper(rel)
        for i, line in enumerate(lines, 1):
            if is_comment(line):
                continue
            # Rule A — MCP tool names inside raw-RPC call contexts
            if RAW_RPC_CALL.search(line):
                for name in STRING_LIT.findall(line):
                    if name in mcp_names and name != "eth_call":
                        violations.append(
                            f"{rel}:{i} [mcp-tool-name-in-raw-rpc] "
                            f"'{name}' passed to a raw-RPC call — MCP tool names "
                            f"never belong on the raw JSON-RPC surface")
            # Rule B1 — endpoint URL + network call on the same line, outside wrappers
            if (not wrapper and NETWORK_CALL.search(line)
                    and any(ep in line for ep in ENDPOINTS)):
                violations.append(
                    f"{rel}:{i} [mcp-endpoint-outside-wrapper] hosted MCP "
                    f"endpoint reached with network machinery outside a "
                    f"named client wrapper — route it through the wrapper")
            # Rule B2 — tools/call construction outside named wrappers
            if not wrapper and TOOLS_CALL_CTOR.search(line):
                violations.append(
                    f"{rel}:{i} [raw-tools-call-outside-wrapper] JSON-RPC "
                    f"tools/call constructed outside a named client wrapper")
            # Rule C — tool names in MCP-call context must be live
            for pat in MCP_CALL_PATTERNS:
                for name in pat.findall(line):
                    if name not in mcp_names:
                        violations.append(
                            f"{rel}:{i} [unknown-mcp-tool] '{name}' is not in "
                            f"the live MCP spec (baseline {base.get('capturedAtUtc')})")
                    elif name.startswith("eth_") and name != "eth_call":
                        violations.append(
                            f"{rel}:{i} [jsonrpc-as-mcp-tool] '{name}' is a "
                            f"JSON-RPC method, not an MCP tool name")
        # ALLOWED_TOOLS sets (Rule C, whole-file)
        text = "\n".join(lines)
        for m in ALLOWED_TOOLS_SET.finditer(text):
            for name in STRING_LIT.findall(m.group(1)):
                if name not in mcp_names:
                    violations.append(
                        f"{rel} [unknown-mcp-tool] ALLOWED_TOOLS contains "
                        f"'{name}', not in the live MCP spec")

    if violations:
        print(f"lint-mcp-duality: {len(violations)} violation(s)")
        for v in violations:
            print(" -", v)
        return 1
    print(f"lint-mcp-duality: clean — {len(mcp_names)} live MCP tool names, "
          f"eth_call duality respected, wrappers only.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
