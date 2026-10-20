#!/usr/bin/env python3
"""WS3 bet A — live end-to-end receipt demo (real MCP, real hash, real sign).

Makes two REAL Chain MCP calls (get_chain_info, get_block_number) pinned to
one block, builds a canonical receipt, signs it with the env-injected key
(demo only: a throwaway local key exported in the shell — never a real
wallet, never committed), and hands off to verify_receipt.py.

Exit 0 only if the verifier's independent re-issue matches the recorded
results. The anchor stays ABSENT (founder has not approved a funded keypair)
and the demo says so plainly.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(REPO, "packages", "chain-data", "py"))
sys.path.insert(0, os.path.join(REPO, "packages", "evidence", "py"))

from lightkeeper_chain_data import ChainMCP, assert_chain_id  # noqa: E402
from lightkeeper_evidence.receipts import (  # noqa: E402
    address_from_privkey, broadcast_anchor, build_receipt, load_evidence_key,
    sign_receipt)

OUT = os.path.join(HERE, "live-receipt.json")


def git_commit():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True, cwd=REPO,
                              timeout=10).stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def main():
    key = load_evidence_key()
    if key is None:
        print("refusing: set LK_EVIDENCE_KEY (demo throwaway, env-only) "
              "to run the signed demo", file=sys.stderr)
        sys.exit(2)

    mcp = ChainMCP(client_name="lk-receipt-demo").connect()
    try:
        info = mcp.get_chain_info()
        assert_chain_id(info.get("chainId"), 1672, what="demo chain")
        block = mcp.get_block_number()
        server_version = f"{mcp.server_info.get('name', '?')} " \
                         f"{mcp.server_info.get('version', '?')}"
    finally:
        mcp.close()

    payloads = [
        {"tool": "get_chain_info", "arguments": {}, "result": info},
        {"tool": "get_block_number", "arguments": {},
         "result": {"blockNumber": hex(block)}},
    ]
    receipt = build_receipt(
        inputs={"intent": "demo: live-receipt end-to-end, chain identity read"},
        mcp_payloads=payloads, pinned_block=block,
        endpoint="https://mcp.pharos.xyz/mcp", server_version=server_version,
        commit=git_commit(), task="t-ws3-receipt-demo",
        notes="signed with a throwaway demo key (env-injected); anchor ABSENT — "
              "no funded keypair approved by the founder")
    sign_receipt(receipt, key)
    broadcast_anchor(receipt)  # keeps ABSENT without founder approval path
    receipt.save(OUT)

    print(f"receipt hash : {receipt.receipt_hash}")
    print(f"signer       : {receipt.signature['signer']}")
    print(f"expected     : {address_from_privkey(key)} (throwaway demo key)")
    print(f"anchor       : {receipt.anchor['status']} — {receipt.anchor.get('reason', '')}")
    print(f"saved        : {OUT}")
    print("handing off to verify_receipt.py ...")
    sys.stdout.flush()
    r = subprocess.run([sys.executable,
                        os.path.join(HERE, "..", "verify_receipt.py"), OUT],
                       timeout=300)
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
