#!/usr/bin/env python3
"""T01 · READ CONTRACT STATE — "The keeper reads the stone before lighting the lamp."

Reads typed state from one live contract on Pharos mainnet (chain 1672)
through the REAL Chain MCP (https://mcp.pharos.xyz/mcp) — every read is an
MCP tools/call by name (get_chain_info / get_code / get_block_number /
eth_call). The READER issues no raw JSON-RPC against an RPC URL anywhere —
its four values come only from named Chain MCP tool calls. (The test suite's
§3 independently re-reads the same values via raw JSON-RPC as an
openly-labeled verification control — that is the test harness, not the reader.)

Gates (fail LOUD, never silent):
  1. chain-id assertion — abort unless the MCP reports the expected chain
  2. bytecode check     — abort with ERROR on no-code addresses (get_code)
  3. block pinning      — every value read at the SAME pinned block
  4. empty-return check — a view returning 0x is an ERROR, not a zero

Usage:
  bin/read-contract-state.py [--contract ADDR] [--block N] [--negative]
      [--manifest PATH] [--labels PATH]

  --negative   run the negative-path suite (no-code address + unknown
               selector); exit 0 iff both fail LOUDLY as designed.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import subprocess
import sys

TASK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(os.path.dirname(TASK_DIR))
# @lightkeeper/chain-data (L1): the canonical Chain MCP client + network table.
# Documented shared-lib path mechanism: <repo>/packages/<lib>/py on sys.path.
sys.path.insert(0, os.path.join(REPO_ROOT, "packages", "chain-data", "py"))
from lightkeeper_chain_data import (  # noqa: E402
    MCP_URL, ChainMCP, MCPError, assert_chain_id,
)
USDC_MAINNET = "0xc879c018db60520f4355c26ed1a6d572cdac1815"
BURN_ADDR = "0x000000000000000000000000000000000000dEaD"  # code-less

# well-known ERC-20 selectors (verified by decoding live responses)
SELECTORS = {
    "name": "0x06fdde03",
    "symbol": "0x95d89b41",
    "decimals": "0x313ce567",
    "totalSupply": "0x18160ddd",
}


def err(msg: str) -> int:
    print(f"ERROR: {msg}", file=sys.stderr)
    return 1


def decode_uint(word_hex: str) -> int:
    return int(word_hex, 16)


def decode_string(data_hex: str) -> str:
    b = bytes.fromhex(data_hex[2:])
    if len(b) < 64:
        raise ValueError(f"short dynamic-string payload: {data_hex[:66]}")
    offset = int.from_bytes(b[0:32], "big")
    length = int.from_bytes(b[offset:offset + 32], "big")
    raw = b[offset + 32:offset + 32 + length]
    return raw.decode("utf-8")


def fmt_supply(raw_int: int, decimals: int) -> str:
    whole, frac = divmod(raw_int, 10 ** decimals)
    return f"{whole:,}.{frac:0{decimals}d}".rstrip("0").rstrip(".")


def label_of(addr: str, labels: dict) -> str:
    a = addr.lower()
    if a == "0x0000000000000000000000000000000000000000":
        return "zero address"
    return labels.get(a, "unlabeled address")


def git_info() -> tuple[str, bool]:
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                                cwd=TASK_DIR, capture_output=True,
                                text=True).stdout.strip()
    except Exception:
        commit = "unknown"
    try:
        dirty = subprocess.run(["git", "status", "--porcelain"],
                               cwd=TASK_DIR, capture_output=True,
                               text=True).stdout.strip() != ""
    except Exception:
        dirty = True
    return commit, dirty


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--contract", default=USDC_MAINNET)
    ap.add_argument("--block", default=None)
    ap.add_argument("--negative", action="store_true")
    ap.add_argument("--manifest", default=None)
    ap.add_argument("--labels", default=os.path.join(TASK_DIR, "config", "labels.json"))
    ap.add_argument("--expect-chain-id", default=os.environ.get("EXPECT_CHAIN_ID", "1672"))
    args = ap.parse_args()

    contract = args.contract
    if not (contract.startswith("0x") and len(contract) == 42):
        return err(f"not an address: {contract}")
    labels = json.load(open(args.labels)) if os.path.exists(args.labels) else {}
    expect_chain = int(args.expect_chain_id)

    tools_called: list[str] = []

    def call(name: str, arguments: dict) -> dict:
        tools_called.append(name)
        return mcp.call(name, arguments)

    mcp = ChainMCP(url=MCP_URL, client_name="lightkeeper-t01",
                   client_version="2.0.0").connect()
    print(f"mcp              {MCP_URL}")
    print(f"mcp server       {mcp.server_info.get('name')} {mcp.server_info.get('version')}")

    # ── Gate 1: chain-id assertion ─────────────────────────────────────────
    info = call("get_chain_info", {})
    try:
        chain_id = assert_chain_id(info["chainId"], expect_chain, what="chain")
    except MCPError as e:
        return err(str(e))
    print(f"chain            {chain_id} (Pharos mainnet) — asserted via get_chain_info")

    # ── Gate 2: bytecode check ─────────────────────────────────────────────
    code = call("get_code", {"address": contract, "block": "latest"})["code"]
    if code in ("0x", "", None):
        return err(f"no contract code at {contract} — refusing to read state "
                    f"from an empty address.")
    print(f"contract         {contract}  ({label_of(contract, labels)})")
    print(f"code length      {(len(code) - 2) // 2} bytes — get_code non-empty")

    # ── Gate 3: pin the block ──────────────────────────────────────────────
    block = args.block or call("get_block_number", {})["blockNumber"]
    print(f"block read at    {block}  (all reads pinned here)")

    def read_view(name: str) -> str:
        """eth_call at the pinned block; ERROR on revert or empty return (Gate 4)."""
        try:
            res = call("eth_call", {"transaction": {"to": contract,
                                                   "data": SELECTORS[name]},
                                    "block": int(block)})
        except MCPError as e:
            print(f"ERROR: eth_call failed for {name}(): {e}", file=sys.stderr)
            sys.exit(13)
        if "error" in res:
            print(f"ERROR: eth_call reverted for {name}(): "
                  f"{res['error'].get('message')}", file=sys.stderr)
            sys.exit(13)
        out = res.get("result")
        if out in ("0x", "", None):
            print(f"ERROR: empty return for {name}() — treating as failure, "
                  f"not zero.", file=sys.stderr)
            sys.exit(13)
        return out

    # ── Negative path ──────────────────────────────────────────────────────
    if args.negative:
        print("═══ NEGATIVE-PATH SUITE (via Chain MCP tools) ═══")
        loud = 0
        print(f"── case A: get_code on a no-code address ({BURN_ADDR})")
        code_a = call("get_code", {"address": BURN_ADDR, "block": "latest"})["code"]
        if code_a in ("0x", "", None):
            print("OK-LOUD: no code at address → reader would ERROR here (verified empty).")
            loud += 1
        else:
            print(f"ERROR: unexpected code at burn address: {code_a[:20]}",
                  file=sys.stderr)
        print("── case B: eth_call with an unknown selector on the real contract")
        loud_b = False
        try:
            res_b = call("eth_call", {"transaction": {"to": contract,
                                                     "data": "0xdeadbeef"},
                                      "block": int(block)})
            if "error" in res_b:  # EVM revert surfaced inside the tool result
                loud_b = True
                print(f"OK-LOUD: unknown selector reverts on-chain "
                      f"({res_b['error'].get('message', '').strip() or 'reverted'}) "
                      f"→ reader reports ERROR, never a fabricated value.")
        except MCPError as e:
            loud_b = True
            print(f"OK-LOUD: unknown selector fails → reader reports ERROR, "
                  f"never a fabricated value. ({str(e)[:90]})")
        if loud_b:
            loud += 1
        else:
            print("ERROR: unexpected: unknown selector did not revert.",
                  file=sys.stderr)
        print(f"═══ RESULT: {'PASS' if loud == 2 else 'FAIL'} "
              f"({loud}/2 fail loudly) ═══")
        mcp.close()
        return 0 if loud == 2 else 1

    # ── Reads ──────────────────────────────────────────────────────────────
    print("═══ LIGHTKEEPER · T01 · READ CONTRACT STATE (Chain MCP) ═══")
    values = []
    decimals_raw = read_view("decimals")
    decimals = decode_uint(decimals_raw)
    symbol_raw = read_view("symbol")
    symbol = decode_string(symbol_raw)
    name_raw = read_view("name")
    name = decode_string(name_raw)
    supply_raw = read_view("totalSupply")
    supply = decode_uint(supply_raw)

    rows = [
        ("name", "string", name_raw, name, f'"{name}"'),
        ("symbol", "string", symbol_raw, symbol, f'"{symbol}"'),
        ("decimals", "uint8", decimals_raw, str(decimals),
         f"{decimals} — human-formatting scale (read from the contract, never assumed)"),
        ("totalSupply", "uint256", supply_raw, str(supply),
         f"{fmt_supply(supply, decimals)} {symbol}"),
    ]
    for fname, ftype, raw, decoded, human in rows:
        print(f"▸ {fname:<11} · {ftype:<7} · selector {SELECTORS[fname]}")
        print(f"    raw     {raw[:20]}…{raw[-8:]}")
        print(f"    decoded {decoded}")
        print(f"    human   {human}")
        values.append({"name": fname, "type": ftype,
                       "selector": SELECTORS[fname], "raw": raw,
                       "decoded": decoded, "human": human})
    print(f"reads            {len(values)} values · {len(set(tools_called))} MCP tools "
          f"({', '.join(sorted(set(tools_called)))}) · 0 raw-RPC calls")

    # ── Manifest ───────────────────────────────────────────────────────────
    if args.manifest:
        commit, dirty = git_info()
        manifest = {
            "task": "t01-read-contract-state",
            "contract": contract,
            "chainId": chain_id,
            "mcpEndpoint": MCP_URL,
            "mcpServer": f"{mcp.server_info.get('name')} {mcp.server_info.get('version')}",
            "mcpToolsCalled": sorted(set(tools_called)),
            "blockReadAt": int(block),
            "values": values,
            "rawRpcCalls": 0,
            "gitCommit": commit,
            "gitDirty": dirty,
            "command": "bin/read-contract-state.sh --manifest evidence/run-manifest.json",
            "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        with open(args.manifest, "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"manifest         {args.manifest}")
    mcp.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
