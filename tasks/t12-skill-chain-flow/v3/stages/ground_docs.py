#!/usr/bin/env python3
"""T12 v3 stage 2 - GROUND (tasks t13/t04, live Docs MCP grounding).

Asks the Docs MCP about the token standard the proposal relies on and
requires a grounded verdict (a citation carrying a verbatim quote, per
@lightkeeper/docs-grounding) before the policy gate may ALLOW anything.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
sys.path.insert(0, os.path.join(REPO, "packages", "docs-grounding", "py"))
from lightkeeper_docs_grounding import Citation, ground_answer
from lightkeeper_docs_grounding.auditor import DocsMCP


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="outp", required=True)
    ns = ap.parse_args()
    inp = json.load(open(ns.inp))

    docs = DocsMCP().connect()
    question = ("What does the documentation say about the ERC-20 token "
                "standard interface functions balanceOf, transfer, and "
                "decimals on Pharos?")
    answer = docs.ask(question, "Ground an ERC-20 transfer proposal in the docs")
    page = docs.get_page_text(
        "https://docs.pharos.xyz/tooling-and-infrastructure/oracles/chainlink-pe")

    citations = []
    if "balanceOf" in answer or "transfer" in answer:
        citations.append(Citation(
            source_url="https://docs.pharos.xyz/~gitbook/mcp (askQuestion)",
            quote=answer.strip().split("\n")[0][:300]))
    for line in page.splitlines():
        if "latestAnswer" in line and "any on-chain consumer" in line:
            citations.append(Citation(
                source_url="https://docs.pharos.xyz/tooling-and-infrastructure/oracles/chainlink-pe",
                quote=line.strip()[:300]))
            break

    verdict = ground_answer(citations)
    out = dict(inp)
    out.update({
        "stage": "ground",
        "grounded": verdict.value == "grounded",
        "grounding_verdict": verdict.value,
        "citations": [{"source_url": c.source_url, "quote": c.quote}
                      for c in citations],
        "docs_endpoint": "https://docs.pharos.xyz/~gitbook/mcp",
        "docs_server": docs.server_info,
    })
    json.dump(out, open(ns.outp, "w"), indent=2)
    print("ground: verdict=%s citations=%d" % (verdict.value, len(citations)))


if __name__ == "__main__":
    main()
