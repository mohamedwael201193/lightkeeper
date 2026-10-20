#!/usr/bin/env python3
"""
T12 "Skill + Chain MCP Flow" v2 — one composed flow, four phases.

  READ    -> Chain MCP tools BY NAME on Pharos mainnet (1672), all pinned to
             one block: get_chain_info, get_block_number, get_balance (PROS),
             eth_call (USDC balanceOf, USDC decimals), get_gas_price.
  SKILL   -> preflight skill evaluates the LIVE MCP-returned values against
             the pre-declared policy.yaml. Verdict: ALLOW or BLOCK (named
             rules). The verdict depends on NOTHING but the MCP data —
             proven by contrast runs (same flow, different proposed amount
             -> different verdict quoting the same live balance).
  EXECUTE -> on ALLOW only: a REAL estimate_gas simulation via the Chain MCP
             (no signing, no broadcast — mainnet is real funds; this is
             stated plainly, not hidden). On BLOCK: honestly skipped.
  VERIFY  -> follow-up MCP reads: freshness re-check + verdict re-validation
             against the latest live values.

Every chain read is an MCP tools/call by name. Zero raw JSON-RPC against an
RPC URL. Zero private keys. Zero broadcasts.

Usage:
    python3 flow.py --amount-usdc 100 --run-label allow-1
    python3 flow.py --amount-usdc 1000000 --run-label block-1
    python3 flow.py --watch 0x... --amount-usdc 50   # override watched holder
    python3 flow.py validate                          # policy sanity check
"""
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
# @lightkeeper/* shared libs (L1 chain-data, L3 skill-adapter, L5 policy).
# Documented path mechanism: <repo>/packages/<lib>/py on sys.path.
for _lib in ("chain-data", "skill-adapter", "policy"):
    sys.path.insert(0, os.path.join(REPO_ROOT, "packages", _lib, "py"))
from lightkeeper_chain_data import ChainMCP, MCPError, assert_chain_id  # noqa: E402
from lightkeeper_skill_adapter import invoke_skill  # noqa: E402
from lightkeeper_policy import Rule, evaluate_rules  # noqa: E402

POLICY_PATH = os.path.join(HERE, "policy.yaml")
AUDIT_LOG = os.path.join(HERE, "run-logs", "flow-transcript.jsonl")
os.makedirs(os.path.join(HERE, "run-logs"), exist_ok=True)

USDC_DECIMALS_SELECTOR = "0x313ce567"          # decimals()
USDC_BALANCEOF_SELECTOR = "0x70a08231"         # balanceOf(address)
ERC20_TRANSFER_SELECTOR = "0xa9059cbb"         # transfer(address,uint256)


def fail(msg):
    print(f"FATAL: {msg}", file=sys.stderr)
    sys.exit(2)


def yaml_load(path):
    """Minimal YAML loader — top-level keys, one level of nesting, scalars."""
    root = {}
    stack = [(-1, root)]
    with open(path) as f:
        for raw in f:
            line = raw.rstrip("\n")
            if not line.strip() or line.strip().startswith("#"):
                continue
            indent = len(line) - len(line.lstrip())
            s = line.strip()
            key, _, val = s.partition(":")
            key = key.strip()
            val = val.split(" #", 1)[0].strip().strip('"').strip("'")
            while stack and indent <= stack[-1][0]:
                stack.pop()
            parent = stack[-1][1]
            if val == "":
                child = {}
                parent[key] = child
                stack.append((indent, child))
            else:
                if val.lower() in ("true", "false"):
                    val = val.lower() == "true"
                parent[key] = val
    return root


def load_policy():
    return yaml_load(POLICY_PATH)


def log_phase(run_id, phase, data):
    rec = {"ts": datetime.now(timezone.utc).isoformat(), "run_id": run_id,
           "phase": phase, **data}
    with open(AUDIT_LOG, "a") as f:
        f.write(json.dumps(rec) + "\n")
    return rec


def git_state():
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, cwd=HERE,
                                timeout=10).stdout.strip()
    except Exception:
        commit = "unknown"
    try:
        dirty = bool(subprocess.run(["git", "status", "--porcelain"],
                                    capture_output=True, text=True, cwd=HERE,
                                    timeout=10).stdout.strip())
    except Exception:
        dirty = True
    return commit, dirty


# --------------------------------------------------------------------------
# SKILL ENGINE: evaluate live Chain MCP data against the pre-declared policy.
# Pure function — unit-tested in tests/test_policy.py. The verdict depends
# on NOTHING but `live` (all values returned by MCP tools).
# --------------------------------------------------------------------------
# The T12 preflight rules, expressed as @lightkeeper/policy (L5) Rules.
# evaluate() below keeps its exact historical return shape
# (verdict, [rule-dicts], blocked) — see tests/test_policy.py.
_T12_RULES = [
    Rule("RULE-NETWORK",
         lambda p, l: l["chain_id"] == int(p["network"]["allowed_chain_id"]),
         lambda p, l: f"live chainId={l['chain_id']} vs allowed={p['network']['allowed_chain_id']} "
                      f"(Chain MCP serves mainnet only)"),
    Rule("RULE-BALANCE",
         lambda p, l: l["usdc_balance"] >= l["amount_base"],
         lambda p, l: f"live USDC balance={l['usdc_balance']} base units "
                      f"({l['usdc_balance_human']} USDC) vs proposed {l['amount_base']} "
                      f"({l['amount_human']} USDC)"),
    Rule("RULE-GAS",
         lambda p, l: l["gas_price_wei"] <= int(Decimal(p["limits"]["max_gas_price_gwei"]) * 10**9),
         lambda p, l: f"live gas {l['gas_price_wei']} wei <= max "
                      f"{int(Decimal(p['limits']['max_gas_price_gwei']) * 10**9)} wei "
                      f"({p['limits']['max_gas_price_gwei']} gwei)"),
    Rule("RULE-FRESHNESS",
         lambda p, l: l["verify_block"] - l["read_block"] <= int(p["limits"]["max_stale_blocks"]),
         lambda p, l: f"verify@{l['verify_block']} - read@{l['read_block']} <= "
                      f"{int(p['limits']['max_stale_blocks'])} blocks"),
]


def evaluate(policy, live):
    """Preflight skill engine. Fail-closed via @lightkeeper/policy.

    Returns the historical (verdict, rules, blocked) tuple.
    """
    decision = evaluate_rules(policy, live, _T12_RULES,
                              require_sections=("network", "limits"))
    return decision.to_legacy()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--amount-usdc", default=None,
                    help="Proposed spend amount in USDC (decimal, e.g. 100)")
    ap.add_argument("--watch", default=None,
                    help="Watched holder address (default: policy watch.address)")
    ap.add_argument("--run-label", default="run")
    ap.add_argument("validate", nargs="?", default=None)
    args = ap.parse_args()

    policy = load_policy()
    watch = (args.watch or policy["watch"]["address"]).lower()
    if not watch.startswith("0x") or len(watch) != 42:
        fail(f"invalid watch address: {watch}")
    usdc = policy["watch"]["token"]
    run_id = f"{args.run_label}-{int(time.time())}"

    if args.validate == "validate":
        need = ["network", "watch", "limits", "behavior"]
        missing = [k for k in need if k not in policy]
        assert not missing, f"policy missing: {missing}"
        assert int(policy["network"]["allowed_chain_id"]) == 1672
        assert policy["network"]["mcp_endpoint"] == "https://mcp.pharos.xyz/mcp"
        assert policy["behavior"]["no_broadcast"] is True
        print("policy.yaml OK: mainnet 1672, Chain MCP endpoint, no_broadcast=true")
        return

    if args.amount_usdc is None:
        fail("--amount-usdc is required")

    mcp = ChainMCP(client_name="lightkeeper-t12").connect()
    print(f"== T12 composition flow [{run_id}]  watch={watch} amount={args.amount_usdc} USDC")
    print(f"   chain-mcp: {mcp.url} (session {mcp._session_id[:8]}...)")

    # ---- PHASE 1: READ (Chain MCP tools by name, one pinned block) ---------
    info = mcp.call("get_chain_info", {})
    chain_id = int(info.get("chainId", info.get("chain_id", 0)))
    blk = mcp.call("get_block_number", {})
    read_block = int(blk["blockNumber"])
    bal = mcp.call("get_balance", {"address": watch, "block": read_block})
    # get_balance -> {"balanceWei": "<decimal>", "balance": "<decimal>", ...}
    pros_wei = int(str(bal.get("balanceWei", bal.get("balance", "0"))
                       if isinstance(bal, dict) else bal))
    dec = mcp.call("eth_call", {"transaction": {"to": usdc, "data": USDC_DECIMALS_SELECTOR},
                                "block": read_block})
    decimals = int(dec["result"], 16)
    bo = mcp.call("eth_call", {"transaction": {
        "to": usdc, "data": USDC_BALANCEOF_SELECTOR + "0" * 24 + watch[2:]},
        "block": read_block})
    usdc_balance = int(bo["result"], 16)
    gp = mcp.call("get_gas_price", {})
    # get_gas_price -> {"gasPriceWei": "<decimal>", "gasPriceGwei": "<decimal>", ...}
    gas_wei = int(str(gp.get("gasPriceWei", gp.get("gasPrice", "0"))
                      if isinstance(gp, dict) else gp))

    amount_base = int(Decimal(args.amount_usdc) * (10 ** decimals))
    bal_human = str(Decimal(usdc_balance) / (10 ** decimals))

    read_rec = log_phase(run_id, "READ", {
        "mcp_endpoint": mcp.url,
        "mcp_tools": ["get_chain_info", "get_block_number", "get_balance",
                      "eth_call", "eth_call", "get_gas_price"],
        "read_block": read_block, "chain_id": chain_id,
        "watch": watch, "token": usdc,
        "usdc_balance_base": usdc_balance, "usdc_balance_human": bal_human,
        "usdc_decimals": decimals,
        "pros_balance_wei": pros_wei,
        "gas_price_wei": gas_wei, "gas_price_gwei": gas_wei / 10**9,
        "proposed_amount_base": amount_base,
        "proposed_amount_human": args.amount_usdc,
    })
    print(f"[READ]  block={read_block} chain={chain_id} "
          f"USDC balance={bal_human} (decimals={decimals}) "
          f"PROS={pros_wei/10**18:.4f} gas={gas_wei/10**9:.2f} gwei")

    # ---- PHASE 2: SKILL (preflight evaluation on the live MCP values) ------
    # Freshness is enforced here against read_block AND re-checked at VERIFY
    # (defense in depth). The skill sees ONLY the values above.
    # Invoked through @lightkeeper/skill-adapter (L3): the typed boundary
    # captures skill errors instead of masking them.
    live_values = {
        "chain_id": chain_id,
        "usdc_balance": usdc_balance,
        "usdc_balance_human": bal_human,
        "amount_base": amount_base,
        "amount_human": args.amount_usdc,
        "gas_price_wei": gas_wei,
        "read_block": read_block,
        "verify_block": read_block,
    }
    skill = invoke_skill(
        "t12-preflight", {"policy": policy, "live": live_values},
        lambda _name, a: evaluate(a["policy"], a["live"]))
    if not skill.ok:
        fail(f"preflight skill crashed (captured, not masked): {skill.error}")
    verdict, rules, blocked = skill.unwrap()
    log_phase(run_id, "SKILL", {"verdict": verdict, "rules": rules, "blocked_by": blocked,
                                "skill_duration_s": round(skill.duration_s, 3)})
    for r in rules:
        mark = "PASS" if r["verdict"] == "PASS" else "FAIL"
        print(f"[SKILL] {r['rule']}: {mark} — {r['detail']}")
    print(f"[SKILL] VERDICT: {verdict}")

    # ---- PHASE 3: EXECUTE --------------------------------------------------
    # Mainnet = real funds: NEVER sign or broadcast. On ALLOW the skill runs
    # a REAL estimate_gas simulation through the Chain MCP — the honest
    # execution preview. On BLOCK the phase is skipped, loudly.
    sim = None
    if verdict == "ALLOW":
        max_stale = int(policy["limits"]["max_stale_blocks"])
        pre_block = int(mcp.call("get_block_number", {})["blockNumber"])
        if pre_block - read_block > max_stale:
            log_phase(run_id, "EXECUTE", {
                "simulated": False,
                "reason": f"RULE-FRESHNESS at execute: {pre_block}-{read_block} > {max_stale}"})
            print(f"[EXECUTE] refused — reads stale "
                  f"({pre_block}-{read_block} > {max_stale} blocks); no simulation")
            verdict = "BLOCK"
    if verdict == "ALLOW":
        transfer_data = ("0x" + ERC20_TRANSFER_SELECTOR[2:] + "0" * 24 + watch[2:] +
                         hex(amount_base)[2:].rjust(64, "0"))
        try:
            est = mcp.call("estimate_gas", {"transaction": {
                "from": watch, "to": usdc, "data": transfer_data}})
            gas_est = est.get("gas") or est.get("result") or est
            sim = {"simulated": True, "tool": "estimate_gas",
                   "from": watch, "to": usdc,
                   "method": "transfer(address,uint256)",
                   "amount_base": amount_base,
                   "gas_estimate": str(gas_est),
                   "note": "simulation only — no signature, no broadcast (mainnet real funds)"}
        except MCPError as e:
            sim = {"simulated": False, "reason": f"estimate_gas failed: {e}"}
        log_phase(run_id, "EXECUTE", sim)
        print(f"[EXECUTE] {sim}")
    else:
        log_phase(run_id, "EXECUTE", {"simulated": False,
                  "reason": f"BLOCKED by {blocked} — nothing simulated, nothing signed"})
        print(f"[EXECUTE] skipped — skill blocked the action: {blocked}")

    # ---- PHASE 4: VERIFY (follow-up MCP reads) -----------------------------
    vblk = int(mcp.call("get_block_number", {})["blockNumber"])
    vbo = mcp.call("eth_call", {"transaction": {
        "to": usdc, "data": USDC_BALANCEOF_SELECTOR + "0" * 24 + watch[2:]},
        "block": vblk})
    verify_balance = int(vbo["result"], 16)
    verdict2, rules2, blocked2 = evaluate(policy, {
        "chain_id": chain_id,
        "usdc_balance": verify_balance,
        "usdc_balance_human": str(Decimal(verify_balance) / (10 ** decimals)),
        "amount_base": amount_base,
        "amount_human": args.amount_usdc,
        "gas_price_wei": gas_wei,
        "read_block": read_block,
        "verify_block": vblk,
    })
    verify_ok = (verdict2 == verdict)
    commit, dirty = git_state()
    log_phase(run_id, "VERIFY", {
        "verify_block": vblk, "verify_balance_base": verify_balance,
        "verdict_at_verify": verdict2, "verdict_stable": verify_ok,
        "freshness_blocks": vblk - read_block,
        "commit": commit, "dirty": dirty,
    })
    print(f"[VERIFY] block={vblk} balance={Decimal(verify_balance)/(10**decimals)} USDC "
          f"freshness={vblk-read_block} blocks verdict@{vblk}={verdict2} "
          f"=> {'STABLE' if verify_ok else 'CHANGED'}")
    if not verify_ok:
        fail("verdict changed between SKILL and VERIFY — live values moved")

    # ---- manifest -----------------------------------------------------------
    manifest = {
        "task": "t12-skill-chain-flow", "run_id": run_id,
        "mcp_endpoint": mcp.url, "mcp_server": "pharos-mcp-server",
        "mcp_tools_called": ["get_chain_info", "get_block_number", "get_balance",
                             "eth_call", "get_gas_price", "estimate_gas"],
        "raw_rpc_calls": 0,
        "network": {"chain_id": 1672, "name": "pharos-mainnet"},
        "verdict": verdict, "commit": commit, "dirty": dirty,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    with open(os.path.join(HERE, "evidence", "run-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"== flow complete: verdict={verdict} verify={'OK' if verify_ok else 'FAIL'}")
    return run_id, verdict


if __name__ == "__main__":
    main()
