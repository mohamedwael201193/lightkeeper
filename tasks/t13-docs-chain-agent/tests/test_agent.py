#!/usr/bin/env python3
"""T13 machine checks (offline): every claim traces to a real artifact.

1. Every transcript's citations are DOC-GROUNDED with a docs.pharos.xyz URL.
2. Every cited URL appears in the verbatim docs answer.
3. Chain calls use ONLY the allowed MCP tool names; no raw-RPC markers.
4. No local doc index remnants (corpus/ must not exist).
5. Manifest stamps both MCP endpoints and rawRpcCalls == 0.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
T = ROOT / "evidence" / "transcripts"
ALLOWED_CHAIN_TOOLS = {"get_chain_info", "get_block_number", "get_code", "eth_call", "get_logs"}

fails = []


def check(name, cond, detail=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f" ({detail})" if detail and not cond else ""))
    if not cond:
        fails.append(name)


rounds = ["totalsupply", "decimals", "balanceof", "price"]
for r in rounds:
    t = json.loads((T / f"{r}.json").read_text())
    check(f"{r}: ok", t.get("ok") is True)
    check(f"{r}: docs tool is askQuestion", t["docs"]["tool"] == "askQuestion")
    check(f"{r}: docs endpoint is the real Docs MCP",
          t["docs"]["endpoint"] == "https://docs.pharos.xyz/~gitbook/mcp")
    cites = t.get("citations", [])
    check(f"{r}: >=1 DOC-GROUNDED citation", len(cites) >= 1, f"found {len(cites)}")
    for c in cites:
        check(f"{r}: citation has docs URL",
              c["label"] == "DOC-GROUNDED" and "docs.pharos.xyz" in c["url"], c.get("url", ""))
        check(f"{r}: cited URL in verbatim answer", c["url"] in t["docs"]["answer"] or
              c["url"].replace("https://docs.pharos.xyz", "") in t["docs"]["answer"],
              c["url"][:60])
    tools = set(t["chain"]["tools_called"])
    check(f"{r}: chain tools subset of allowlist", tools <= ALLOWED_CHAIN_TOOLS, str(tools))
    check(f"{r}: chain endpoint is the real Chain MCP",
          t["chain"]["endpoint"] == "https://mcp.pharos.xyz/mcp")
    check(f"{r}: docs answer names the function", t.get("docs_names_function") is True)
    check(f"{r}: interpretation labelled INFERENCE",
          t.get("interpretation", "").startswith("[INFERENCE]"))

check("no local corpus/", not (ROOT / "corpus").exists())

# price round: the feed address must be DERIVED from the Docs MCP, never hardcoded
price = json.loads((T / "price.json").read_text())
check("price: docs tools include getPage",
      "getPage" in price.get("docs_tools_used", []), str(price.get("docs_tools_used")))
check("price: feed address derived from docs page",
      price.get("feed_address_from_docs", "").lower() == price["address"].lower())
check("price: feed page is the docs Chainlink page",
      "docs.pharos.xyz" in price.get("feed_page", ""))

src = (ROOT / "src" / "doc_agent.py").read_text() + (ROOT / "src" / "mcp.py").read_text()
for marker in ["ATLANTIC_RPC_URL", "atlantic.dplabs-internal.com", "llms", "SOURCES.json",
               "0x3f882C4F2836b1e5C5278ff2B9FccE2502A35C5d"]:
    check(f"no {marker} in src", marker not in src, "found!")

m = json.loads((ROOT / "evidence" / "run-manifest.json").read_text())
check("manifest rawRpcCalls == 0", m.get("rawRpcCalls") == 0)
check("manifest localDocIndex is False", m.get("localDocIndex") is False)
check("manifest chain endpoint", m["chain_mcp"]["endpoint"] == "https://mcp.pharos.xyz/mcp")
check("manifest docs endpoint", m["docs_mcp"]["endpoint"] == "https://docs.pharos.xyz/~gitbook/mcp")
check("manifest chain_id 1672", m.get("chain_id") == 1672)

print(f"RESULT: {'ALL PASS' if not fails else f'{len(fails)} FAILURES'}")
sys.exit(1 if fails else 0)
