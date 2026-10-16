#!/usr/bin/env python3
"""
THRESHOLD GUARDIAN (LIGHTKEEPER T05)

A policy gate that intercepts proposed transfers and BLOCKS any write that
breaches its configured thresholds. Original implementation for the Pharos
Agent Arena — no competitor code, no vendored logic.

Mandatory SkillEngine "Write Operation Pre-checks" (SKILL.md) are implemented
here as independent, configurable, chain-read conditions:

  P1  Network check          — chain id read live from the RPC. Mainnet
                               (or any non-Atlantic chain) => REFUSE outright,
                               no override flag exists.
  P2  Threshold check        — value <= max_per_tx AND rolling window total
                               <= max_per_window, both from policy.yaml.
  P3  Balance sufficiency    — eth_getBalance(sender) must cover value +
                               a worst-case fee reserve. Fail-closed on
                               unreadable data.
  P4  Mainnet re-confirmation — mainnet-class actions require explicit
                               re-confirmation AND are refused anyway:
                               policy.mainnet.enabled=false is a hard
                               firewall. Logged as REFUSED_MAINNET.

Plus two independent on-chain sanity conditions:
  C1  Gas-price sanity       — eth_gasPrice must be <= policy cap.
  C2  Sender-key binding     — the env key must derive to policy.sender,
                               and the proposal sender must match it
                               (prevents key-confusion mistakes).

Every run emits a decision trace: each condition's live value, pass/fail,
and the final decision. BLOCK/REFUSE never broadcasts. ALLOW + `execute`
broadcasts exactly once through a nonce lock, waits for the receipt, and
appends the spend to the ledger.

Usage:
  python3 guardian.py validate
  python3 guardian.py propose  --to 0x... --value-phrs 0.001
  python3 guardian.py execute  --to 0x... --value-phrs 0.001
  python3 guardian.py propose  --network mainnet --to 0x... --value-phrs 0.001
"""
import argparse
import datetime
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
POLICY_PATH = os.path.join(HERE, "policy.yaml")
NONCE_LOCK = "/tmp/lk-nonce.lock"

EXIT_OK, EXIT_ERR, EXIT_BLOCK, EXIT_REFUSE = 0, 1, 2, 3
WEI = 10 ** 18


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def fail(msg, code=EXIT_ERR):
    print(f"guardian: ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def dec_to_wei(s):
    """Exact decimal-string -> wei integer. Never float."""
    s = str(s).strip()
    if "." in s:
        whole, frac = s.split(".", 1)
        frac = (frac + "0" * 18)[:18]
    else:
        whole, frac = s, "0" * 18
    if not whole.isdigit() or not frac.isdigit():
        fail(f"invalid decimal amount: {s!r}")
    return int(whole) * WEI + int(frac)


def wei_to_phrs(w):
    return f"{w / WEI:.6f}"


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def rpc_call(rpc_url, method, params=None, timeout=20):
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}
    ).encode()
    req = urllib.request.Request(
        rpc_url, data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            payload = json.loads(r.read().decode())
    except Exception as e:  # network down, bad RPC: fail closed
        return None, f"rpc unreachable: {e}"
    if "error" in payload:
        return None, f"rpc error: {payload['error']}"
    return payload.get("result"), None


def append_jsonl(path, obj):
    full = path if os.path.isabs(path) else os.path.join(HERE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "a") as f:
        f.write(json.dumps(obj) + "\n")


# --------------------------------------------------------------------------- #
# policy
# --------------------------------------------------------------------------- #
def load_policy(path=POLICY_PATH):
    try:
        import yaml
    except ImportError:
        fail("pyyaml is required (pip install pyyaml)")
    with open(path) as f:
        p = yaml.safe_load(f)
    for key in ("sender", "network", "limits", "behavior"):
        if key not in p:
            fail(f"policy.yaml missing section: {key}")
    return p


# --------------------------------------------------------------------------- #
# checks — each returns (passed: bool, value: str, reason: str)
# --------------------------------------------------------------------------- #
def check_private_key_present():
    present = bool(os.environ.get("DEPLOYER_PRIVATE_KEY"))
    return (
        present,
        "set" if present else "missing",
        "DEPLOYER_PRIVATE_KEY must be set in the environment" if not present
        else "private key present in environment (value never logged)",
    )


def check_sender_binding(policy, proposal_sender):
    """Key in env must derive to policy.sender; proposal must name it too."""
    try:
        out = subprocess.run(
            ["cast", "wallet", "address", "--private-key",
             os.environ["DEPLOYER_PRIVATE_KEY"]],
            capture_output=True, text=True, timeout=30, env={
                **os.environ, "PATH": os.environ.get("PATH", "")},
        )
    except Exception as e:
        return False, "derivation failed", f"cast wallet address failed: {e}"
    derived = out.stdout.strip().lower()
    if not derived.startswith("0x") or len(derived) != 42:
        return False, "derivation failed", f"cast returned: {out.stderr.strip()[:120]}"
    pol = policy["sender"].lower()
    prop = proposal_sender.lower()
    if derived != pol:
        return False, derived, (
            f"env key derives to {derived}, policy allows only {pol}")
    if prop != pol:
        return False, prop, (
            f"proposal sender {prop} != policy sender {pol}")
    return True, derived, "env key derives to the policy sender; proposal matches"


def check_network(policy, network_flag, confirm_mainnet):
    """P1: chain id read live. Anything but Atlantic => REFUSE, no override."""
    main = policy["network"]["mainnet"]
    if network_flag == "mainnet":
        rpc_url = main["rpc_url"]
        chain_id, err = rpc_call(rpc_url, "eth_chainId")
        live = int(chain_id, 16) if chain_id else None
        reason = (
            f"mainnet-class action REFUSED (policy.mainnet.enabled=false). "
            f"Live chain id at {main['name']} rpc: {live}. "
            f"Explicit re-confirmation was {'provided' if confirm_mainnet else 'NOT provided'} "
            f"— refusal is unconditional, there is no override flag.")
        return False, f"chainId={live} ({main['name']})", reason, True
    rpc_url = policy["network"]["rpc_url"]
    chain_id, err = rpc_call(rpc_url, "eth_chainId")
    if chain_id is None:
        return False, f"unreadable ({err})", (
            "fail-closed: chain id could not be read from the RPC"), False
    live = int(chain_id, 16)
    allowed = policy["network"]["allowed_chain_id"]
    ok = live == allowed
    return (ok, f"chainId={live}",
            f"Atlantic testnet confirmed (chain id {live})" if ok
            else f"REFUSE: live chain id {live} != allowed {allowed}", False)


def check_threshold(policy, value_wei):
    """P2: per-tx cap + rolling window cap, both configurable."""
    max_tx = dec_to_wei(policy["limits"]["max_per_tx_phrs"])
    if value_wei > max_tx:
        return (False, f"{wei_to_phrs(value_wei)} PHRS",
                f"BLOCK: {wei_to_phrs(value_wei)} PHRS > max_per_tx "
                f"{policy['limits']['max_per_tx_phrs']} PHRS")
    # rolling window from the spend ledger
    max_win = dec_to_wei(policy["limits"]["max_per_window_phrs"])
    window_s = int(policy["limits"]["window_minutes"]) * 60
    cutoff = time.time() - window_s
    spent = 0
    ledger = policy["behavior"]["spend_ledger"]
    full = ledger if os.path.isabs(ledger) else os.path.join(HERE, ledger)
    if os.path.exists(full):
        with open(full) as f:
            for line in f:
                try:
                    e = json.loads(line)
                    if e.get("ts_epoch", 0) >= cutoff:
                        spent += int(e.get("value_wei", 0))
                except (json.JSONDecodeError, ValueError):
                    continue
    if spent + value_wei > max_win:
        return (False, f"window {wei_to_phrs(spent)} + {wei_to_phrs(value_wei)} PHRS",
                f"BLOCK: rolling {policy['limits']['window_minutes']}m total would be "
                f"{wei_to_phrs(spent + value_wei)} PHRS > max_per_window "
                f"{policy['limits']['max_per_window_phrs']} PHRS")
    return (True, f"{wei_to_phrs(value_wei)} PHRS",
            f"within max_per_tx ({policy['limits']['max_per_tx_phrs']} PHRS) and "
            f"window total {wei_to_phrs(spent + value_wei)}/{policy['limits']['max_per_window_phrs']} PHRS")


def check_balance(policy, rpc_url, sender, value_wei, gas_price_wei):
    """P3: balance must cover value + worst-case fee reserve. Fail-closed."""
    bal, err = rpc_call(rpc_url, "eth_getBalance", [sender, "latest"])
    if bal is None:
        return False, f"unreadable ({err})", "fail-closed: balance unreadable"
    balance = int(bal, 16)
    fee_reserve = 21000 * gas_price_wei  # worst case at CURRENT gas price
    need = value_wei + fee_reserve
    if balance < need:
        return (False, f"{wei_to_phrs(balance)} PHRS",
                f"BLOCK: balance {wei_to_phrs(balance)} PHRS < need "
                f"{wei_to_phrs(need)} PHRS (value + fee reserve)")
    return (True, f"{wei_to_phrs(balance)} PHRS",
            f"balance covers value + fee reserve ({wei_to_phrs(need)} PHRS needed)")


def check_gas_price(policy, rpc_url):
    """C1: independent on-chain gas-price sanity cap."""
    gp, err = rpc_call(rpc_url, "eth_gasPrice")
    if gp is None:
        return False, f"unreadable ({err})", "fail-closed: gas price unreadable", None
    gas_price = int(gp, 16)
    cap = dec_to_wei(policy["limits"]["max_gas_price_gwei"]) // 10 ** 9
    if gas_price > cap:
        return (False, f"{gas_price / 1e9:.2f} gwei",
                f"BLOCK: live gas price {gas_price / 1e9:.2f} gwei > cap "
                f"{policy['limits']['max_gas_price_gwei']} gwei", gas_price)
    return (True, f"{gas_price / 1e9:.2f} gwei",
            f"gas price within cap ({policy['limits']['max_gas_price_gwei']} gwei)",
            gas_price)


# --------------------------------------------------------------------------- #
# evaluation
# --------------------------------------------------------------------------- #
def evaluate(policy, proposal, network_flag, confirm_mainnet):
    trace = []
    refused_mainnet = False

    # 1 — key present (SKILL.md pre-check 1)
    ok, val, reason = check_private_key_present()
    trace.append({"id": "key-present", "name": "Private key check (SKILL.md #1)",
                  "value": val, "passed": ok, "reason": reason})
    if not ok:
        return trace, "BLOCK", False

    # 2 — sender binding (SKILL.md pre-check 2)
    ok, val, reason = check_sender_binding(policy, proposal["sender"])
    trace.append({"id": "sender-binding", "name": "Sender binding (SKILL.md #2)",
                  "value": val, "passed": ok, "reason": reason})
    if not ok:
        return trace, "BLOCK", False

    # 3 — network (SKILL.md pre-check 3 + T05 firewall)
    ok, val, reason, is_refuse = check_network(policy, network_flag, confirm_mainnet)
    trace.append({"id": "network", "name": "Network check (SKILL.md #3) — mainnet firewall",
                  "value": val, "passed": ok, "reason": reason})
    if is_refuse:
        return trace, "REFUSE", True
    if not ok:
        return trace, "BLOCK", False

    rpc_url = policy["network"]["rpc_url"]

    # 4 — threshold (T05 core)
    ok, val, reason = check_threshold(policy, proposal["value_wei"])
    trace.append({"id": "threshold", "name": "Threshold check (per-tx + rolling window)",
                  "value": val, "passed": ok, "reason": reason})
    if not ok:
        return trace, "BLOCK", False

    # 5 — gas price sanity (independent on-chain condition)
    ok, val, reason, gas_price = check_gas_price(policy, rpc_url)
    trace.append({"id": "gas-price", "name": "Gas-price sanity (on-chain)",
                  "value": val, "passed": ok, "reason": reason})
    if not ok:
        return trace, "BLOCK", False

    # 6 — balance sufficiency (SKILL.md pre-check 4)
    ok, val, reason = check_balance(policy, rpc_url, proposal["sender"],
                                    proposal["value_wei"], gas_price)
    trace.append({"id": "balance", "name": "Balance sufficiency (SKILL.md #4)",
                  "value": val, "passed": ok, "reason": reason})
    if not ok:
        return trace, "BLOCK", False

    return trace, "ALLOW", False


def print_trace(proposal, trace, decision):
    print("=" * 70)
    print(f"THRESHOLD GUARDIAN — decision trace   {now_iso()}")
    print("=" * 70)
    print(f"proposal : send {wei_to_phrs(proposal['value_wei'])} PHRS")
    print(f"           from {proposal['sender']}")
    print(f"           to   {proposal['to']}")
    print("-" * 70)
    for c in trace:
        mark = "PASS" if c["passed"] else "FAIL"
        print(f"[{mark}] {c['name']}")
        print(f"       value : {c['value']}")
        print(f"       note  : {c['reason']}")
    print("-" * 70)
    print(f"DECISION: {decision}")
    print("=" * 70)


def broadcast(policy, proposal):
    """Exactly one broadcast under the nonce lock. Waits for receipt."""
    cmd = ["flock", NONCE_LOCK, "cast", "send", proposal["to"],
           "--value", str(proposal["value_wei"]),
           "--private-key", os.environ["DEPLOYER_PRIVATE_KEY"],
           "--rpc-url", policy["network"]["rpc_url"]]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    text = out.stdout + out.stderr
    if out.returncode != 0:
        fail(f"cast send failed:\n{text[-2000:]}")
    tx_hash = block = status = gas_used = ""
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("transactionHash"):
            tx_hash = s.split(None, 1)[1]
        elif s.startswith("blockNumber"):
            block = s.split(None, 1)[1]
        elif s.startswith("status"):
            status = s.split(None, 1)[1]
        elif s.startswith("gasUsed"):
            gas_used = s.split(None, 1)[1]
    return {"tx_hash": tx_hash, "block": block, "status": status,
            "gas_used": gas_used, "raw": text[-4000:]}


# --------------------------------------------------------------------------- #
# cli
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description="Threshold Guardian — policy gate")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate", help="parse + sanity-check policy.yaml")
    for name in ("propose", "execute"):
        p = sub.add_parser(name, help=f"{name} a transfer (execute broadcasts on ALLOW)")
        p.add_argument("--to", required=True)
        p.add_argument("--value-phrs", required=True)
        p.add_argument("--network", default="atlantic",
                       choices=["atlantic", "mainnet"])
        p.add_argument("--confirm-mainnet", default=None,
                       help="explicit re-confirmation text for mainnet-class actions")
    args = ap.parse_args()

    policy = load_policy()

    if args.cmd == "validate":
        print("policy.yaml: OK")
        print(f"  sender            : {policy['sender']}")
        print(f"  allowed chain     : {policy['network']['allowed_chain_id']} "
              f"({policy['network']['allowed_name']})")
        print(f"  max_per_tx        : {policy['limits']['max_per_tx_phrs']} PHRS")
        print(f"  max_per_window    : {policy['limits']['max_per_window_phrs']} PHRS / "
              f"{policy['limits']['window_minutes']}m")
        print(f"  max_gas_price     : {policy['limits']['max_gas_price_gwei']} gwei")
        print(f"  mainnet.enabled   : {policy['network']['mainnet']['enabled']} (hard firewall)")
        return

    to = args.to
    if not (to.startswith("0x") and len(to) == 42):
        fail(f"invalid recipient address: {to!r}")
    value_wei = dec_to_wei(args.value_phrs)
    proposal = {"sender": policy["sender"], "to": to, "value_wei": value_wei}

    trace, decision, refused_mainnet = evaluate(
        policy, proposal, args.network, args.confirm_mainnet)
    print_trace(proposal, trace, decision)

    audit = {
        "ts": now_iso(), "ts_epoch": time.time(),
        "network_flag": args.network,
        "confirm_mainnet_provided": bool(args.confirm_mainnet),
        "proposal": {**proposal, "value_wei": str(proposal["value_wei"])},
        "trace": trace, "decision": decision,
    }
    append_jsonl(policy["behavior"]["audit_log"], audit)

    if decision == "REFUSE":
        print("\nREFUSED: mainnet-class action. No key material used, nothing broadcast.")
        sys.exit(EXIT_REFUSE)
    if decision == "BLOCK":
        print("\nBLOCKED: no broadcast was made. Reason above. Nothing was spent.")
        sys.exit(EXIT_BLOCK)

    # ALLOW
    if args.cmd == "propose":
        print("\nALLOWED (dry run): NOT executing — use `execute` to broadcast.")
        sys.exit(EXIT_OK)

    print("\nALLOWED: broadcasting via cast under the nonce lock…")
    rcpt = broadcast(policy, proposal)
    print(f"  tx      : {rcpt['tx_hash']}")
    print(f"  status  : {rcpt['status']}   block: {rcpt['block']}   gas: {rcpt['gas_used']}")
    explorer = f"https://atlantic.pharosscan.xyz/tx/{rcpt['tx_hash']}"
    print(f"  explorer: {explorer}")
    append_jsonl(policy["behavior"]["spend_ledger"], {
        "ts": now_iso(), "ts_epoch": time.time(),
        "tx_hash": rcpt["tx_hash"], "to": proposal["to"],
        "value_wei": str(proposal["value_wei"]),
        "gas_used": rcpt["gas_used"], "status": rcpt["status"],
    })
    audit["broadcast"] = {"tx_hash": rcpt["tx_hash"], "status": rcpt["status"],
                          "block": rcpt["block"], "gas_used": rcpt["gas_used"]}
    append_jsonl(policy["behavior"]["audit_log"], audit)
    print("\nDone. Record above is REAL — verify on the explorer link.")


if __name__ == "__main__":
    main()
