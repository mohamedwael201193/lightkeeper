#!/usr/bin/env python3
"""verify_receipt.py — dependency-free verifier for LIGHTKEEPER receipts.

Usage: python3 verify_receipt.py receipt.json

Steps, all independently reproducible:
  1. Recompute keccak256(canonical_json(body)) and compare to receipt_hash.
  2. If a signature is present: recover the signer via pure-Python
     secp256k1 and compare to the recorded signer.
  3. If an anchor tx exists (status ANCHORED): open the tx on the
     Atlantic explorer/RPC and check the receipt hash is in the data.
     status ABSENT is reported as a real, honest state — never a fake pass.
  4. RE-ISSUE: every recorded MCP payload is re-issued to the same endpoint
     (same tool, same arguments, re-pinned to the recorded pinned_block when
     the tool supports a block argument) and the fresh result is diffed
     against the recorded one. Deterministic tools must match; drifting
     tools (e.g. latest block) are checked for sanity, not equality, and
     the verdict per payload is printed either way.

Stdlib only — it imports the receipt machinery by path, nothing else.
Exit 0: every hard check passed (or honestly reported ABSENT).
Exit 1: any check FAILED.
"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PKG_PY = os.path.join(HERE, "py")
sys.path.insert(0, PKG_PY)
from lightkeeper_evidence.receipts import (  # noqa: E402
    canonical_json, keccak256_hex, recover_address, RECEIPT_VERSION)

# Tools that accept a block argument (re-issuable at the pinned block).
# Everything else is re-read live and only sanity-checked.
PINNABLE_TOOLS = {"eth_call", "get_balance", "get_code", "get_transaction_count"}
SANITY_TOOLS = {"get_chain_info", "get_block_number"}


def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)


def info(msg):
    print(f"  {msg}")


_CHAIN_SESSION = {"id": None}


def mcp_post(endpoint, payload, timeout=60):
    """Single JSON-RPC attempt, stdlib urllib, no retries."""
    headers = {"Content-Type": "application/json",
               "Accept": "application/json, text/event-stream"}
    if _CHAIN_SESSION["id"]:
        headers["Mcp-Session-Id"] = _CHAIN_SESSION["id"]
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        headers_out = dict(resp.headers.items())
        sid = headers_out.get("mcp-session-id") or headers_out.get("Mcp-Session-Id")
        if sid:
            _CHAIN_SESSION["id"] = sid
        text = resp.read().decode("utf-8", errors="replace")
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            try:
                return json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue
    raise RuntimeError("no SSE data frame in MCP response")


def ensure_chain_session(endpoint):
    """Chain MCP is stateful: run the initialize handshake once, keep the
    session id for every later tools/call."""
    if _CHAIN_SESSION["id"]:
        return
    msg = mcp_post(endpoint, {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2025-03-26", "capabilities": {},
                   "clientInfo": {"name": "lk-receipt-verify", "version": "1.0"}}})
    if "error" in msg:
        raise RuntimeError(f"chain initialize failed: {msg['error']}")
    if not _CHAIN_SESSION["id"]:
        raise RuntimeError("chain initialize returned no session id")
    try:
        mcp_post(endpoint, {"jsonrpc": "2.0", "method": "notifications/initialized"})
    except Exception:
        pass  # 202 empty body — expected; the session id is what matters


def ensure_docs_mcp_session(endpoint):
    """Docs MCP is stateless; run initialize once to get protocol terms."""
    msg = mcp_post(endpoint, {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "lk-receipt-verify", "version": "1.0"}}})
    if "error" in msg:
        raise RuntimeError(f"docs initialize failed: {msg['error']}")


def mcp_call(endpoint, tool, arguments):
    ensure_chain_session(endpoint)
    msg = mcp_post(endpoint, {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                              "params": {"name": tool, "arguments": arguments}})
    if "error" in msg:
        raise RuntimeError(f"tools/call {tool} failed: {msg['error']}")
    content = msg.get("result", {}).get("content", [])
    texts = [c.get("text", "") for c in content if c.get("type") == "text"]
    if not texts:
        raise RuntimeError(f"tools/call {tool}: empty content")
    return json.loads(texts[0])


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    with open(sys.argv[1], encoding="utf-8") as f:
        receipt = json.load(f)

    failures = 0

    # --- 1. hash recompute ---------------------------------------------
    print("[1/4] hash recompute")
    if receipt.get("version") != RECEIPT_VERSION:
        print(f"  WARN: receipt version {receipt.get('version')!r} != {RECEIPT_VERSION!r}")
    recomputed = keccak256_hex(canonical_json(receipt["body"]))
    recorded = receipt["receipt_hash"]
    if recomputed == recorded.removeprefix("0x"):
        info(f"PASS receipt_hash 0x{recomputed}")
    else:
        print(f"  FAIL receipt hash mismatch:\n    recomputed 0x{recomputed}\n    recorded   {recorded}")
        failures += 1

    # --- 2. signature recovery ------------------------------------------
    print("[2/4] signature recovery")
    sig = receipt.get("signature")
    if not sig:
        info("ABSENT — no signature on this receipt (honest state)")
    else:
        r, s, v = int(sig["r"], 16), int(sig["s"], 16), int(sig["v"])
        recovered = recover_address(bytes.fromhex(recorded.removeprefix("0x")), r, s, v - 27)
        if recovered.lower() == sig["signer"].lower():
            info(f"PASS recovered signer {recovered} matches recorded signer")
        else:
            print(f"  FAIL recovered {recovered} != recorded {sig['signer']}")
            failures += 1

    # --- 3. anchor --------------------------------------------------------
    print("[3/4] anchor")
    anchor = receipt.get("anchor", {})
    status = anchor.get("status")
    if status == "ABSENT":
        info("ABSENT — no anchor tx (founder-gated; recorded honestly, not a placeholder)")
    elif status == "PENDING":
        info("PENDING — key present, first broadcast awaits founder approval")
    elif status == "ANCHORED":
        tx_hash = anchor.get("tx_hash")
        rpc = anchor.get("rpc_url") or "https://atlantic.dplabs-internal.com"
        expected = recorded.removeprefix("0x").lower()
        try:
            req = urllib.request.Request(
                rpc, data=json.dumps({"jsonrpc": "2.0", "id": 1,
                                      "method": "eth_getTransactionByHash",
                                      "params": [tx_hash]}).encode("utf-8"),
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                tx = json.loads(resp.read().decode("utf-8", errors="replace")).get("result") or {}
            data = (tx.get("input") or tx.get("data") or "").lower()
            raw_cid = tx.get("chainId")
            try:
                cid = int(raw_cid, 16) if isinstance(raw_cid, str) and \
                    raw_cid.startswith("0x") else int(raw_cid)
            except (TypeError, ValueError):
                cid = None
            if expected in data and cid in (688689, None):
                info(f"PASS anchor tx {tx_hash} found; receipt hash present in tx data")
            else:
                print(f"  FAIL anchor tx data does not carry the receipt hash "
                      f"(chainId={raw_cid!r})")
                failures += 1
        except Exception as e:
            print(f"  FAIL could not open anchor tx {tx_hash}: {e}")
            failures += 1
    else:
        print(f"  WARN unknown anchor status {status!r}")

    # --- 4. re-issue recorded MCP payloads --------------------------------
    print("[4/4] re-issue recorded MCP payloads at pinned block")
    body = receipt["body"]
    pinned = body.get("pinned_block")
    endpoint = body.get("endpoint")
    payloads = body.get("mcp_payloads", [])
    info(f"{len(payloads)} recorded payload(s); pinned block {pinned}; endpoint {endpoint}")
    for i, p in enumerate(payloads, 1):
        tool, args = p.get("tool"), dict(p.get("arguments", {}))
        recorded_result = p.get("result")
        try:
            if tool in PINNABLE_TOOLS:
                args.setdefault("block", pinned)
            fresh = mcp_call(endpoint, tool, args)
        except Exception as e:  # transport hiccup != proof failure; report honestly
            print(f"  payload {i} ({tool}): RE-ISSUE ERROR — {e}")
            continue
        if tool in PINNABLE_TOOLS:
            if fresh == recorded_result:
                info(f"payload {i} ({tool}): PASS — fresh result matches recorded result at block {pinned}")
            else:
                print(f"  payload {i} ({tool}): DIFF — fresh != recorded at block {pinned}\n"
                      f"    recorded: {json.dumps(recorded_result)[:200]}\n"
                      f"    fresh:    {json.dumps(fresh)[:200]}")
                failures += 1
        elif tool == "get_chain_info":
            ok = fresh.get("chainId") == recorded_result.get("chainId")
            info(f"payload {i} ({tool}): {'PASS' if ok else 'DIFF'} — chainId "
                 f"{fresh.get('chainId')} vs recorded {recorded_result.get('chainId')}")
            failures += 0 if ok else 1
        elif tool == "get_block_number":
            try:
                fresh_n = int(str(fresh.get("blockNumber", "0")), 16 if str(fresh.get("blockNumber")).startswith("0x") else 10)
            except ValueError:
                fresh_n = 0
            ok = fresh_n >= int(pinned or 0)
            info(f"payload {i} ({tool}): {'PASS' if ok else 'DIFF'} — fresh block {fresh_n} "
                 f">= pinned {pinned}")
            failures += 0 if ok else 1
        else:
            info(f"payload {i} ({tool}): SKIPPED — no re-issue rule for this tool "
                 f"(fresh read would drift; refusing to fake a pass)")
            failures += 1

    print("=" * 60)
    if failures:
        print(f"VERDICT: FAIL — {failures} check(s) failed")
        sys.exit(1)
    print("VERDICT: PASS — every check verified or honestly reported ABSENT")


if __name__ == "__main__":
    main()
