#!/usr/bin/env python3
"""anchor_live_receipt.py — the canonical anchored receipt (WS3 bet A).

Builds a receipt from REAL Chain MCP calls (get_chain_info, get_block_number)
pinned to one block, signs it with the founder-approved evidence key
(env-only: ``LK_EVIDENCE_KEY``), broadcasts the dust anchor tx on the
Atlantic testnet, and writes ``anchor-receipt.json`` recording the REAL
tx hash + block. Then hands off to the dependency-free verifier
(``verify_receipt.py``), which re-issues the recorded MCP payloads and
opens the anchor tx independently.

Exit 0 only if the verifier passes. Nothing here invents a hash: if the
broadcast fails, no anchor-receipt.json is written and the exit is 1.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, "packages", "chain-data", "py"))
sys.path.insert(0, os.path.join(HERE, "py"))

from lightkeeper_chain_data import ChainMCP, assert_chain_id  # noqa: E402
from lightkeeper_evidence.receipts import (  # noqa: E402
    address_from_privkey, broadcast_anchor, build_receipt, load_evidence_key,
    sign_receipt)

OUT = os.path.join(HERE, "anchor-receipt.json")


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
        print("refusing: LK_EVIDENCE_KEY unset — the anchor broadcast is "
              "founder-gated", file=sys.stderr)
        sys.exit(2)

    mcp = ChainMCP(client_name="lk-anchor-receipt").connect()
    try:
        info = mcp.get_chain_info()
        assert_chain_id(info.get("chainId"), 1672, what="anchor receipt chain")
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
        inputs={"intent": "canonical anchored receipt: chain identity read, "
                          "hash pinned on Atlantic"},
        mcp_payloads=payloads, pinned_block=block,
        endpoint="https://mcp.pharos.xyz/mcp", server_version=server_version,
        commit=git_commit(), task="ws3-verifiable-receipts",
        notes="signed with the founder-approved evidence key (env-injected, "
              "never committed); anchor broadcast on Atlantic testnet "
              "(688689) once funded — tx hash recorded in the anchor block")
    sign_receipt(receipt, key)
    broadcast_anchor(receipt)  # real broadcast; raises on failure
    if receipt.anchor.get("status") != "ANCHORED":
        print(f"anchor did not land: {receipt.anchor}", file=sys.stderr)
        sys.exit(1)
    receipt.save(OUT)

    print(f"receipt hash : {receipt.receipt_hash}")
    print(f"signer       : {receipt.signature['signer']}")
    print(f"expected     : {address_from_privkey(key)} (evidence key)")
    print(f"anchor       : ANCHORED tx {receipt.anchor['tx_hash']} "
          f"block {receipt.anchor['block']}")
    print(f"saved        : {OUT}")
    print("handing off to verify_receipt.py ...")
    sys.stdout.flush()
    r = subprocess.run([sys.executable,
                        os.path.join(HERE, "verify_receipt.py"), OUT],
                       timeout=300)
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
