#!/usr/bin/env python3
"""
T12 "Skill + Chain MCP Flow" — one composed flow, four phases:

  READ    -> pinned-block live chain queries (block, chainId, balance,
             gas price, contract state: pingCount(), keeper())
  SKILL   -> preflight skill evaluates the LIVE values against the
             pre-declared policy.yaml. Verdict: ALLOW or BLOCK (named rules).
  EXECUTE -> real dust tx ONLY if the skill approved (cast send, flock-wrapped).
  VERIFY  -> follow-up chain queries: pingCount must be pre+1 after an ALLOW
             run, or unchanged after a BLOCK run.

Usage:
    python3 flow.py --amount-phrs 0.0001 --run-label allow-1
    python3 flow.py --amount-phrs 0.1    --run-label block-1
    python3 flow.py validate                      # policy sanity check

Environment (never echoed): DEPLOYER_PRIVATE_KEY, ATLANTIC_RPC_URL.
"""
import argparse, json, os, subprocess, sys, time
from datetime import datetime, timezone
from decimal import Decimal

HERE = os.path.dirname(os.path.abspath(__file__))
POLICY_PATH = os.path.join(HERE, "policy.yaml")
AUDIT_LOG = os.path.join(HERE, "run-logs", "flow-transcript.jsonl")
os.makedirs(os.path.join(HERE, "run-logs"), exist_ok=True)


def fail(msg):
    print(f"FATAL: {msg}", file=sys.stderr)
    sys.exit(2)


def yaml_load(path):
    """Minimal YAML loader — enough for this policy file's simple structure
    (top-level keys, one level of nesting, scalar values)."""
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
            # strip inline comments BEFORE stripping quotes
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


def cast(*args, rpc):
    env = dict(os.environ)
    cmd = ["cast", *args, "--rpc-url", rpc]
    p = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=90)
    if p.returncode != 0:
        fail(f"cast {' '.join(args[:3])} failed: {p.stderr.strip()[:300]}")
    return p.stdout.strip()


def hex_int(s):
    return int(s, 16)


def addr_from_word(word):
    return "0x" + word[-40:].lower()


def log_phase(run_id, phase, data):
    rec = {"ts": datetime.now(timezone.utc).isoformat(), "run_id": run_id,
           "phase": phase, **data}
    with open(AUDIT_LOG, "a") as f:
        f.write(json.dumps(rec) + "\n")
    return rec


# --------------------------------------------------------------------------
# SKILL ENGINE: evaluate live chain data against the pre-declared policy.
# Pure function — unit-tested in tests/test_policy.py.
# --------------------------------------------------------------------------
def evaluate(policy, live):
    rules = []
    lim = policy["limits"]
    max_tx_wei = int(Decimal(lim["max_per_tx_phrs"]) * 10**18)
    max_gas_wei = int(Decimal(lim["max_gas_price_gwei"]) * 10**9)
    max_stale = int(lim["max_stale_blocks"])

    def rule(name, passed, detail):
        rules.append({"rule": name, "verdict": "PASS" if passed else "FAIL",
                      "detail": detail})
        return passed

    ok = True
    ok &= rule("RULE-NETWORK", live["chain_id"] == int(policy["network"]["allowed_chain_id"]),
               f"live chainId={live['chain_id']} vs allowed={policy['network']['allowed_chain_id']}")
    ok &= rule("RULE-DEST", live["target"].lower() == policy["target"]["contract"].lower(),
               f"target={live['target']}")
    ok &= rule("RULE-KEEPER-CONSISTENCY",
               live["keeper_onchain"].lower() == policy["target"]["expected_keeper"].lower(),
               f"on-chain keeper()={live['keeper_onchain']}")
    ok &= rule("RULE-AMOUNT", live["value_wei"] <= max_tx_wei,
               f"proposed {live['value_wei']} wei <= max {max_tx_wei} wei "
               f"({lim['max_per_tx_phrs']} PHRS)")
    ok &= rule("RULE-GAS", live["gas_price_wei"] <= max_gas_wei,
               f"live gas {live['gas_price_wei']} wei <= max {max_gas_wei} wei "
               f"({lim['max_gas_price_gwei']} gwei)")
    ok &= rule("RULE-FRESHNESS",
               live["execute_block"] - live["read_block"] <= max_stale,
               f"execute@{live['execute_block']} - read@{live['read_block']} <= {max_stale} blocks")
    blocked = [r["rule"] for r in rules if r["verdict"] == "FAIL"]
    return ("ALLOW" if ok else "BLOCK"), rules, blocked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--amount-phrs", default=None)
    ap.add_argument("--run-label", default="run")
    ap.add_argument("validate", nargs="?", default=None)
    args = ap.parse_args()

    policy = load_policy()
    run_id = f"{args.run_label}-{int(time.time())}"

    if args.validate == "validate":
        need = ["sender", "network", "target", "limits"]
        missing = [k for k in need if k not in policy]
        assert not missing, f"policy missing: {missing}"
        assert int(policy["network"]["allowed_chain_id"]) == 688689
        assert Decimal(policy["limits"]["max_per_tx_phrs"]) > 0
        assert Decimal(policy["behavior"]["budget_phrs"]) == Decimal("0.15")
        print("policy.yaml OK: all required sections present, chain 688689, budget 0.15 PHRS")
        return

    if args.amount_phrs is None:
        fail("--amount-phrs is required")

    rpc = os.environ.get("ATLANTIC_RPC_URL") or fail("ATLANTIC_RPC_URL not set")
    priv = os.environ.get("DEPLOYER_PRIVATE_KEY") or fail("DEPLOYER_PRIVATE_KEY not set")
    sender = policy["sender"]
    contract = policy["target"]["contract"]
    value_wei = int(Decimal(args.amount_phrs) * 10**18)

    print(f"== T12 composition flow [{run_id}]  amount={args.amount_phrs} PHRS")

    # ---- PHASE 1: READ (pinned-block live queries) -------------------------
    read_block = int(cast("block-number", rpc=rpc))
    chain_id = int(cast("chain-id", rpc=rpc))
    balance_wei = int(cast("balance", sender, "--block", str(read_block), rpc=rpc))
    gas_price_wei = int(cast("gas-price", rpc=rpc))
    ping_before = int(cast("call", contract, "pingCount()",
                           "--block", str(read_block), rpc=rpc), 16)
    keeper_onchain = addr_from_word(
        cast("call", contract, "keeper()", "--block", str(read_block), rpc=rpc))
    read_rec = log_phase(run_id, "READ", {
        "read_block": read_block, "chain_id": chain_id,
        "balance_wei": balance_wei, "balance_phrs": str(Decimal(balance_wei) / 10**18),
        "gas_price_wei": gas_price_wei, "gas_price_gwei": gas_price_wei / 10**9,
        "contract": contract, "pingCount_before": ping_before,
        "keeper_onchain": keeper_onchain, "proposed_value_wei": value_wei,
    })
    print(f"[READ]  block={read_block} chain={chain_id} balance={read_rec['balance_phrs']} PHRS "
          f"gas={gas_price_wei/10**9:.3f} gwei pingCount={ping_before} keeper={keeper_onchain}")

    # ---- PHASE 2: SKILL (preflight evaluation on the live values) -----------
    # The skill evaluates the pinned reads; freshness is enforced here against
    # read_block AND re-checked at broadcast time (defense in depth).
    verdict, rules, blocked = evaluate(policy, {
        "chain_id": chain_id, "target": contract, "keeper_onchain": keeper_onchain,
        "value_wei": value_wei, "gas_price_wei": gas_price_wei,
        "read_block": read_block, "execute_block": read_block,
    })
    log_phase(run_id, "SKILL", {"verdict": verdict, "rules": rules, "blocked_by": blocked})
    for r in rules:
        mark = "PASS" if r["verdict"] == "PASS" else "FAIL"
        print(f"[SKILL] {r['rule']}: {mark} — {r['detail']}")
    print(f"[SKILL] VERDICT: {verdict}")

    # ---- PHASE 3: EXECUTE (only on ALLOW) ----------------------------------
    tx_hash, receipt = None, None
    if verdict == "ALLOW":
        # Broadcast-time freshness gate: fail closed if the pinned reads went
        # stale while the skill was evaluating.
        max_stale = int(policy["limits"]["max_stale_blocks"])
        pre_broadcast_block = int(cast("block-number", rpc=rpc))
        if pre_broadcast_block - read_block > max_stale:
            log_phase(run_id, "EXECUTE", {"broadcast": False,
                      "reason": f"RULE-FRESHNESS at broadcast: {pre_broadcast_block}-{read_block} > {max_stale}"})
            print(f"[EXECUTE] refused at broadcast gate — reads stale "
                  f"({pre_broadcast_block}-{read_block} > {max_stale} blocks); no tx")
            verdict = "BLOCK"
    if verdict == "ALLOW":
        # cast send --value takes WEI as an integer (no decimals).
        cmd = ["flock", "/tmp/lk-nonce.lock", "cast", "send", contract, "ping()",
               "--value", str(value_wei), "--rpc-url", rpc, "--private-key", priv]
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if p.returncode != 0:
            fail(f"broadcast failed: {p.stderr.strip()[:400]}")
        for line in p.stdout.splitlines():
            if line.strip().startswith("transactionHash"):
                tx_hash = line.split()[-1].strip().strip('"')
        if not tx_hash:  # fallback: parse any 0x hash on stdout
            for tok in p.stdout.split():
                if tok.startswith("0x") and len(tok) == 66:
                    tx_hash = tok
                    break
        if not tx_hash:
            fail("broadcast succeeded but no tx hash found in output")
        receipt = json.loads(cast("receipt", tx_hash, "--json", rpc=rpc))
        log_phase(run_id, "EXECUTE", {
            "broadcast": True, "tx_hash": tx_hash,
            "status": int(receipt.get("status", "0x0"), 16),
            "block": int(receipt.get("blockNumber", "0x0"), 16),
            "gas_used": int(receipt.get("gasUsed", "0x0"), 16),
        })
        print(f"[EXECUTE] broadcast tx={tx_hash} status={int(receipt['status'],16)} "
              f"block={int(receipt['blockNumber'],16)} gasUsed={int(receipt['gasUsed'],16)}")
    else:
        log_phase(run_id, "EXECUTE", {"broadcast": False, "reason": f"BLOCKED by {blocked}"})
        print(f"[EXECUTE] skipped — skill blocked the action: {blocked}")

    # ---- PHASE 4: VERIFY (follow-up chain queries) -------------------------
    verify_block = int(cast("block-number", rpc=rpc))
    ping_after = int(cast("call", contract, "pingCount()", rpc=rpc), 16)
    expected = ping_before + (1 if (verdict == "ALLOW" and tx_hash) else 0)
    verify_ok = (ping_after == expected)
    log_phase(run_id, "VERIFY", {
        "verify_block": verify_block, "pingCount_after": ping_after,
        "expected": expected, "verify_ok": verify_ok,
        "tx_hash": tx_hash,
    })
    print(f"[VERIFY] block={verify_block} pingCount: {ping_before} -> {ping_after} "
          f"(expected {expected}) => {'OK' if verify_ok else 'MISMATCH'}")
    if not verify_ok:
        fail("verify step mismatch")

    print(f"== flow complete: verdict={verdict} verify={'OK' if verify_ok else 'FAIL'}")
    return run_id, verdict, tx_hash, ping_before, ping_after


if __name__ == "__main__":
    main()
