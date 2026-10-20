#!/usr/bin/env python3
"""CI live dry-run: the READ + GATE half of the pipeline against live
services, with nothing signed and nothing broadcast.

1. Chain MCP (mainnet 1672): get_chain_info asserts the chain identity and
   get_block_number must be > 0.
2. Docs MCP: getPage on the Atlantic testnet page must still carry the
   chain-id the fleet cites (688689).

Exit 0 only if both live checks pass. This is a read-only smoke test, not
a substitute for the tasks' own audits.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(REPO, "packages", "chain-data", "py"))
sys.path.insert(0, os.path.join(REPO, "packages", "docs-grounding", "py"))

from lightkeeper_chain_data import ChainMCP, assert_chain_id  # noqa: E402
from lightkeeper_docs_grounding.auditor import DocsMCP  # noqa: E402


def main():
    mcp = ChainMCP(client_name="lk-ci").connect()
    try:
        info = mcp.get_chain_info()
        assert_chain_id(info.get("chainId"), 1672, what="CI live chain")
        block = mcp.get_block_number()
    finally:
        mcp.close()
    assert block > 0, "block number must be > 0"
    print(f"chain ok: {info.get('name')} chainId=1672 block={block}")

    docs = DocsMCP().connect()
    page = docs.get_page_text(
        "https://docs.pharos.xyz/getting-started/network/atlantic-testnet")
    assert "688689" in page, "Atlantic page must still cite chain id 688689"
    print("docs ok: Atlantic testnet page carries chain id 688689")
    print("CI live dry-run: PASS (read-only, nothing signed, nothing broadcast)")


if __name__ == "__main__":
    main()
