#!/usr/bin/env python3
"""T04 accuracy audit — independently verify the docs claims T04 cites.

The rival's edge was an accuracy audit: they compiled the docs' example to
check the docs. This is our own original implementation of that idea, for the
claims T04 actually cites:

  A1  DOC-DRIFT — the deploy guidance T04 cites ("forge script ... --broadcast")
      is still what the live Docs MCP returns for the deploy question.
  A2  DOC CLAIM — the Atlantic Testnet docs page (via the MCP's getPage) still
      claims ChainID 688689 and RPC https://atlantic.dplabs-internal.com.
  A3  LIVE CHECK — the docs' chain-ID claim is verified ON THE WIRE: a real
      eth_chainId JSON-RPC call against the docs-claimed RPC endpoint must
      return 688689.
  A4  LIVE CHECK — the docs' RPC claim is a live endpoint: eth_blockNumber > 0.
  A5  CROSS-CHECK — the cited deploy guidance's "--chain-id 688689" matches
      the live chain ID from A3 (the docs' own example is self-consistent).

Everything is a real executed check: fresh Docs MCP tools/call round-trips
from an independent client implementation (not the pharos-docs CLI), plus
direct JSON-RPC calls to the Atlantic endpoint. No mocks, no fixtures.

Exit 0 only if every check verdicts PASS. Writes accuracy-audit/audit.json.
"""
import datetime
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(BASE)
OUT_JSON = os.path.join(BASE, "audit.json")

DOCS_MCP = "https://docs.pharos.xyz/~gitbook/mcp"
DOCS_PROTOCOL = "2024-11-05"
ATLANTIC_PAGE = "https://docs.pharos.xyz/getting-started/network/atlantic-testnet"


def curl_post(url, body, timeout=60, want_headers=False):
    """POST via curl, not urllib: on this network path the Docs MCP drops
    idle/keep-alive connections and Python's urllib hits IncompleteRead in
    clusters while curl's retry handling rides through. Same JSON-RPC bytes
    on the wire; only the HTTP layer differs. --retry-all-errors covers the
    dropped-connection cases."""
    hdr_path = None
    cmd = [
        "curl", "-sS", "-m", str(timeout), "-X", "POST", url,
        "-H", "Content-Type: application/json",
        "-H", "Accept: application/json, text/event-stream",
        "--retry", "5", "--retry-all-errors", "--retry-delay", "3",
        "-d", json.dumps(body),
    ]
    if want_headers:
        hdr_path = "/tmp/t04_audit_hdr.txt"
        cmd[cmd.index("-d") : cmd.index("-d")] = ["-D", hdr_path]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 60)
    if r.returncode != 0:
        raise RuntimeError(f"curl POST failed: {r.stderr.strip()[:200]}")
    headers = {}
    if hdr_path and os.path.exists(hdr_path):
        for line in open(hdr_path, encoding="utf-8", errors="replace"):
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
    return r.stdout, headers


def post_json(url, body, timeout=60):
    text, _ = curl_post(url, body, timeout=timeout)
    return text


def docs_mcp_call(tool, args):
    """Independent Docs MCP client: initialize -> tools/call, all text blocks."""
    init = post_json(
        DOCS_MCP,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": DOCS_PROTOCOL,
                "capabilities": {},
                "clientInfo": {"name": "t04-accuracy-audit", "version": "1.0"},
            },
        },
    )
    call = post_json(
        DOCS_MCP,
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": tool, "arguments": args},
        },
    )
    texts = []
    for line in call.split("\n"):
        line = line.strip()
        if not line.startswith("data:"):
            continue
        try:
            payload = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        if payload.get("id") != 2:
            continue
        if payload.get("error"):
            raise RuntimeError(f"MCP tool error: {payload['error']}")
        for item in payload.get("result", {}).get("content", []):
            if isinstance(item, dict) and item.get("type") == "text":
                texts.append(item.get("text", ""))
    if not texts:
        raise RuntimeError("No text content blocks in MCP response")
    return texts


def rpc_call(rpc_url, method, params=None, timeout=30, retries=3):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                rpc_url,
                data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=timeout) as res:
                data = json.loads(res.read().decode())
            if "error" in data:
                raise RuntimeError(f"RPC error: {data['error']}")
            return data["result"]
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"RPC {method} failed after {retries} attempts: {last}")


def check(name, claim, method, evidence):
    rec = {"check": name, "claim": claim, "method": method, "evidence": evidence}
    ok = evidence.get("pass") is True
    rec["verdict"] = "PASS" if ok else "FAIL"
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {evidence.get('summary')}", flush=True)
    return rec


def main():
    started = datetime.datetime.now(datetime.timezone.utc)
    records = []

    # A1 — doc-drift on the deploy guidance ---------------------------------
    deploy_hits = []
    try:
        deploy_hits = docs_mcp_call(
            "searchDocumentation", {"query": "how do I deploy a contract on Pharos?"}
        )
        matching = [
            h
            for h in deploy_hits
            if "forge script" in h and "--broadcast" in h
        ]
        first_link = re.search(r"^Link:\s*(\S+)", deploy_hits[0], re.M) if deploy_hits else None
        records.append(
            check(
                "A1",
                "The live Docs MCP still returns the 'forge script ... --broadcast' deploy guidance for the deploy question.",
                "Fresh searchDocumentation round-trip (independent client); substring assertions on the verbatim MCP text.",
                {
                    "pass": len(matching) > 0,
                    "summary": f"{len(deploy_hits)} hit(s) returned; {len(matching)} contain 'forge script' + '--broadcast'",
                    "hits_returned": len(deploy_hits),
                    "matching_hits": len(matching),
                    "top_hit_link": first_link.group(1) if first_link else None,
                    "top_hit_chars": len(deploy_hits[0]) if deploy_hits else 0,
                },
            )
        )
    except Exception as e:  # noqa: BLE001
        records.append(
            check("A1", "deploy guidance doc-drift", "searchDocumentation", {"pass": False, "summary": f"ERROR: {e}"})
        )

    # A2 — the docs' own chain-ID + RPC claims via getPage -------------------
    docs_chain_id = None
    docs_rpc = None
    try:
        pages = docs_mcp_call("getPage", {"url": ATLANTIC_PAGE})
        md = pages[0]
        m_id = re.search(r"ChainID\s*\|\s*(\d+)", md)
        m_rpc = re.search(r"RPC Public Endpoint\s*\|\s*<?(https?://[^>\s|]+)", md)
        docs_chain_id = int(m_id.group(1)) if m_id else None
        docs_rpc = m_rpc.group(1).rstrip(">") if m_rpc else None
        records.append(
            check(
                "A2",
                "The Atlantic Testnet docs page claims ChainID 688689 and RPC https://atlantic.dplabs-internal.com.",
                "Fresh getPage round-trip (independent client); regex extraction from the verbatim page markdown.",
                {
                    "pass": docs_chain_id == 688689
                    and docs_rpc == "https://atlantic.dplabs-internal.com",
                    "summary": f"docs claim: ChainID={docs_chain_id}, RPC={docs_rpc}",
                    "docs_chain_id": docs_chain_id,
                    "docs_rpc": docs_rpc,
                    "page_chars": len(md),
                },
            )
        )
    except Exception as e:  # noqa: BLE001
        records.append(
            check("A2", "docs chain-ID/RPC claims", "getPage", {"pass": False, "summary": f"ERROR: {e}"})
        )

    # A3 — the docs' chain-ID claim, verified on the wire --------------------
    live_chain_id = None
    try:
        if not docs_rpc:
            raise RuntimeError("no RPC URL from A2 — cannot run the live check")
        hex_id = rpc_call(docs_rpc, "eth_chainId")
        live_chain_id = int(hex_id, 16)
        records.append(
            check(
                "A3",
                f"The docs' chain-ID claim (688689) matches the live chain: eth_chainId on {docs_rpc}.",
                "Direct JSON-RPC eth_chainId call to the docs-claimed endpoint (independent of the MCP).",
                {
                    "pass": live_chain_id == 688689 == docs_chain_id,
                    "summary": f"eth_chainId -> {hex_id} = {live_chain_id}",
                    "rpc_url": docs_rpc,
                    "eth_chainId_hex": hex_id,
                    "eth_chainId_dec": live_chain_id,
                },
            )
        )
    except Exception as e:  # noqa: BLE001
        records.append(
            check("A3", "live chain-ID verification", "eth_chainId", {"pass": False, "summary": f"ERROR: {e}"})
        )

    # A4 — the docs' RPC claim is a live endpoint ----------------------------
    try:
        if not docs_rpc:
            raise RuntimeError("no RPC URL from A2 — cannot run the live check")
        hex_block = rpc_call(docs_rpc, "eth_blockNumber")
        block = int(hex_block, 16)
        records.append(
            check(
                "A4",
                "The docs-claimed RPC endpoint is live.",
                "Direct JSON-RPC eth_blockNumber call (independent of the MCP).",
                {
                    "pass": block > 0,
                    "summary": f"eth_blockNumber -> {hex_block} = {block}",
                    "block_number": block,
                },
            )
        )
    except Exception as e:  # noqa: BLE001
        records.append(
            check("A4", "RPC liveness", "eth_blockNumber", {"pass": False, "summary": f"ERROR: {e}"})
        )

    # A5 — cross-consistency: the cited deploy example's chain id ------------
    # Reuses the fresh A1 text (one fewer network round-trip; same evidence).
    try:
        if not deploy_hits:
            raise RuntimeError("no deploy-guidance text from A1 — cannot cross-check")
        blob = "\n".join(deploy_hits)
        cites_live_id = "--chain-id 688689" in blob
        records.append(
            check(
                "A5",
                "The cited deploy guidance's '--chain-id 688689' matches the live chain ID from A3.",
                "Substring assertion on the fresh searchDocumentation text + comparison with the A3 wire result.",
                {
                    "pass": cites_live_id and live_chain_id == 688689,
                    "summary": f"'--chain-id 688689' in deploy guidance: {cites_live_id}; live chain ID: {live_chain_id}",
                    "deploy_example_chain_id": 688689 if cites_live_id else None,
                    "live_chain_id": live_chain_id,
                },
            )
        )
    except Exception as e:  # noqa: BLE001
        records.append(
            check("A5", "deploy-example chain-ID consistency", "searchDocumentation", {"pass": False, "summary": f"ERROR: {e}"})
        )

    finished = datetime.datetime.now(datetime.timezone.utc)
    report = {
        "task": "T04",
        "audit": "accuracy-audit",
        "generated_at": finished.isoformat(),
        "duration_s": round((finished - started).total_seconds(), 1),
        "docs_mcp_endpoint": DOCS_MCP,
        "method": "Independent checks of the docs claims T04 cites: fresh Docs MCP round-trips from an independent client + direct JSON-RPC execution against the docs-claimed Atlantic endpoint. No mocks.",
        "checks": records,
        "all_pass": all(r["verdict"] == "PASS" for r in records),
    }
    with open(OUT_JSON, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nWrote {OUT_JSON} — all_pass={report['all_pass']}", flush=True)
    sys.exit(0 if report["all_pass"] else 1)


if __name__ == "__main__":
    main()
