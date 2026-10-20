#!/usr/bin/env python3
"""
POLICY GATEKEEPER (LIGHTKEEPER T11)

An original policy engine for AGENT write actions. Differs from T05
(amount thresholds) by deciding on *action policy*: action allowlists,
selector/token allowlists, per-action caps, destination allowlists, time
windows, and cooldowns — plus an append-only, hash-chained audit trail of
EVERY decision (approve AND deny).

Pipeline:  propose -> evaluate -> [APPROVE + gate stamp] -> execute
            (execute is impossible without a fresh, audit-backed stamp:
             demonstrated no-bypass).

The 4 mandatory SkillEngine "Write Operation Pre-checks" are enforced on
the execute path:
  P1 private key present (value never printed)
  P2 derived address == policy.sender (key-confusion firewall)
  P3 network confirmation: chain id read LIVE from the RPC; anything but
     688689 aborts. Mainnet-class actions additionally require
     re-confirmation and are REFUSED outright (policy.mainnet.enabled=false).
  P4 balance sufficiency: balance >= value + fee reserve.

Commands:
  python3 gatekeeper.py evaluate  --action-file A.json   # pure policy check, no broadcast
  python3 gatekeeper.py execute   --action-file A.json --stamp S.json
  python3 gatekeeper.py audit-verify
  python3 gatekeeper.py show-policy

Exit codes: 0 APPROVE/executed, 2 DENY (no broadcast), 3 REFUSE
(mainnet / bypass / fail-closed).
"""
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
POLICY_PATH = os.path.join(HERE, "policy.json")
AUDIT_PATH = os.path.join(HERE, "audit", "check-log.jsonl")
NONCE_LOCK = "/tmp/lk-nonce.lock"
STAMP_TTL_S = 300

EXIT_OK, EXIT_ERR, EXIT_DENY, EXIT_REFUSE = 0, 1, 2, 3


# ---------------------------------------------------------------- helpers ---

def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def canon(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def policy_hash(policy: dict) -> str:
    scrubbed = {k: v for k, v in policy.items() if k != "_comment"}
    return sha256(canon(scrubbed))


def load_policy(path: str = POLICY_PATH) -> dict:
    """Fail-closed: any problem with the policy file => refusal, never approval."""
    if not os.path.exists(path):
        fail_closed("policy file missing: %s" % path)
    try:
        with open(path) as f:
            policy = json.load(f)
    except Exception as e:
        fail_closed("policy file unreadable: %s" % e)
    for key in ("actions", "rules", "networks", "sender", "version", "policy_id"):
        if key not in policy:
            fail_closed("policy file invalid: missing key '%s'" % key)
    return policy


def fail_closed(reason: str):
    append_audit(policy_id="unknown", policy_hash="unknown",
                 action={}, decision="REFUSE", rule_results=[],
                 reasons=[{"rule": "fail_closed", "result": "REFUSE",
                           "detail": reason}], stamp_hash=None)
    audit_ok, audit_entries = audit_status()
    print(json.dumps({"decision": "REFUSE", "reason": reason,
                      "audit_ok": audit_ok, "audit_entries": audit_entries}, indent=2))
    sys.exit(EXIT_REFUSE)


def append_audit(policy_id, policy_hash, action, decision, rule_results, reasons,
                 stamp_hash):
    os.makedirs(os.path.dirname(AUDIT_PATH), exist_ok=True)
    prev_hash = "GENESIS"
    seq = 1
    if os.path.exists(AUDIT_PATH):
        with open(AUDIT_PATH) as f:
            lines = [l for l in f if l.strip()]
        if lines:
            last = json.loads(lines[-1])
            prev_hash = last["entry_hash"]
            seq = last["seq"] + 1
    entry = {
        "seq": seq,
        "ts": utcnow().isoformat(),
        "decision": decision,
        "policy_id": policy_id,
        "policy_hash": policy_hash,
        "action": action,
        "rule_results": rule_results,
        "reasons": reasons,
        "stamp_hash": stamp_hash,
        "prev_hash": prev_hash,
    }
    entry["entry_hash"] = sha256(canon({k: v for k, v in entry.items()
                                        if k != "entry_hash"}))
    with open(AUDIT_PATH, "a") as f:
        f.write(canon(entry) + "\n")
    return entry


def verify_audit(path: str = None):
    """Recompute the whole hash chain. Returns (ok, message)."""
    path = path or AUDIT_PATH
    if not os.path.exists(path):
        return False, "audit file missing"
    prev = "GENESIS"
    seq = 0
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            seq += 1
            if entry.get("seq") != seq:
                return False, "seq break at line %d" % seq
            if entry.get("prev_hash") != prev:
                return False, "chain break at seq %d" % seq
            expect = sha256(canon({k: v for k, v in entry.items()
                                   if k != "entry_hash"}))
            if entry.get("entry_hash") != expect:
                return False, "tamper detected at seq %d" % seq
            prev = entry["entry_hash"]
    return True, "chain intact, %d entries" % seq


def audit_status(path: str = None):
    """(audit_ok, entry_count) — the self-check stamped into every
    evaluate/execute output: callers see, in the same response, whether the
    hash-chained audit trail that backs the decision still verifies."""
    ok, _msg = verify_audit(path)
    path = path or AUDIT_PATH
    n = 0
    if os.path.exists(path):
        with open(path) as f:
            n = sum(1 for line in f if line.strip())
    return ok, n


def last_approval_ts(action_hash: str = None, path: str = None):
    """Newest APPROVE timestamp (optionally for one action hash). For cooldown."""
    path = path or AUDIT_PATH
    latest = None
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                e = json.loads(line)
                if e.get("decision") != "APPROVE":
                    continue
                if action_hash and e.get("action_hash") != action_hash:
                    continue
                latest = e["ts"]
    return latest


def action_hash_of(action: dict) -> str:
    return sha256(canon(action))


# ------------------------------------------------------------------ engine ---

def evaluate_action(action: dict, policy: dict, now: datetime.datetime = None,
                    last_approved_iso: str = None):
    """Pure policy engine. No RPC, no subprocess, no side effects (except
    nothing). Returns (decision, rule_results, reasons, stamp_dict)."""
    now = now or utcnow()
    phash = policy_hash(policy)
    rule_results = []

    def check(rule, passed, detail):
        rule_results.append({"rule": rule, "result": "PASS" if passed else "FAIL",
                             "detail": detail})
        return passed

    action_type = action.get("type", "")
    to = (action.get("to") or "").lower()
    chain_id = action.get("chain_id")
    value_wei = int(action.get("value_wei", "0") or "0")

    # R0 network firewall (evaluated first so mainnet is refused before anything)
    mainnet_id = policy["networks"]["mainnet"]["chain_id"]
    allowed_chains = policy["networks"]["allowed_chain_ids"]
    if chain_id == mainnet_id or action.get("network") == "mainnet":
        check("network_firewall", False,
              "mainnet-class action refused: policy.mainnet.enabled=false; "
              "re-confirmation would be required and is not granted")
        reasons = [{"rule": "network_firewall", "result": "REFUSED_MAINNET",
                    "detail": "mainnet actions are refused outright by policy"}]
        return "REFUSED_MAINNET", rule_results, reasons, None
    check("network_firewall", chain_id in allowed_chains,
          "chain_id=%s allowed=%s" % (chain_id, allowed_chains))
    if chain_id not in allowed_chains:
        return deny(rule_results, phash, action)

    # R1 action allowlist
    check("action_allowlist", action_type in policy["actions"]["allowed"],
          "action '%s' allowed=%s" % (action_type, policy["actions"]["allowed"]))
    if action_type not in policy["actions"]["allowed"]:
        return deny(rule_results, phash, action)

    # R2 selector allowlist (contract_call only)
    if action_type == "contract_call":
        sel = (action.get("selector") or "").lower()
        allowed_sel = policy["rules"]["selector_allowlist"]["allowed"]
        check("selector_allowlist", sel in allowed_sel,
              "selector %s allowlisted=%s" % (sel, sel in allowed_sel))
        if sel not in allowed_sel:
            return deny(rule_results, phash, action)

    # R3 token allowlist (erc20_transfer only)
    if action_type == "erc20_transfer":
        tok = (action.get("token") or "").lower()
        allowed_tok = policy["rules"]["token_allowlist"]["allowed"]
        check("token_allowlist", tok in allowed_tok,
              "token %s allowlisted=%s" % (tok, tok in allowed_tok))
        if tok not in allowed_tok:
            return deny(rule_results, phash, action)

    # R4 destination allowlist
    dest_allowed = {k.lower(): v for k, v in
                    policy["rules"]["destination_allowlist"]["allowed"].items()}
    check("destination_allowlist", to in dest_allowed,
          "destination %s allowlisted=%s" % (to, to in dest_allowed))
    if to not in dest_allowed:
        return deny(rule_results, phash, action)

    # R5 per-action caps
    cap = int(policy["rules"]["per_action_caps"].get(action_type, {})
              .get("max_value_wei", "0"))
    check("per_action_caps", value_wei <= cap,
          "value_wei=%d cap=%d for %s" % (value_wei, cap, action_type))
    if value_wei > cap:
        return deny(rule_results, phash, action)

    # R6 time window
    start, end = policy["rules"]["time_window"]["allowed_utc_hours"]
    hour = now.hour + now.minute / 60.0
    in_window = start <= hour < end
    check("time_window", in_window,
          "utc_hour=%.2f window=[%d,%d)" % (hour, start, end))
    if not in_window:
        return deny(rule_results, phash, action)

    # R7 cooldown
    cd = policy["rules"]["cooldown"]["min_seconds_between_approvals"]
    if last_approved_iso:
        last = datetime.datetime.fromisoformat(last_approved_iso)
        elapsed = (now - last).total_seconds()
        check("cooldown", elapsed >= cd,
              "%.0fs since last approval, need >=%ds" % (elapsed, cd))
        if elapsed < cd:
            return deny(rule_results, phash, action)
    else:
        check("cooldown", True, "no prior approval on record")

    # APPROVE — mint gate stamp
    ahash = action_hash_of(action)
    issued = now
    expires = now + datetime.timedelta(seconds=STAMP_TTL_S)
    stamp = {
        "policy_id": policy["policy_id"],
        "policy_hash": phash,
        "action_hash": ahash,
        "decision": "APPROVE",
        "issued_at": issued.isoformat(),
        "expires_at": expires.isoformat(),
    }
    stamp["stamp_hash"] = sha256(canon({k: v for k, v in stamp.items()
                                       if k != "stamp_hash"}))
    return "APPROVE", rule_results, [], stamp


def deny(rule_results, phash, action):
    failed = [r for r in rule_results if r["result"] == "FAIL"]
    reasons = [{"rule": r["rule"], "result": "DENY",
                "detail": r["detail"]} for r in failed]
    return "DENY", rule_results, reasons, None


# ------------------------------------------------------------------- rpc ----

def rpc_call(method, params, rpc_url):
    req = urllib.request.Request(
        rpc_url, data=json.dumps(
            {"jsonrpc": "2.0", "id": 1, "method": method,
             "params": params}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        out = json.load(r)
    if "error" in out:
        raise RuntimeError("rpc %s: %s" % (method, out["error"]))
    return out["result"]


def cast(*args, env_extra=None):
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    p = subprocess.run(["cast"] + list(args), capture_output=True, text=True,
                       env=env)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


# --------------------------------------------------------------- commands ---

def cmd_evaluate(args):
    policy = load_policy()
    with open(args.action_file) as f:
        action = json.load(f)
    decision, rule_results, reasons, stamp = evaluate_action(
        action, policy, last_approved_iso=last_approval_ts())
    entry = append_audit(
        policy_id=policy["policy_id"], policy_hash=policy_hash(policy),
        action=action, decision=decision, rule_results=rule_results,
        reasons=reasons, stamp_hash=stamp["stamp_hash"] if stamp else None)
    # Self-check the audit trail behind this decision and stamp the result
    # into the output: the decision and its proof travel together.
    audit_ok, audit_entries = audit_status()
    out = {"decision": decision, "policy_id": policy["policy_id"],
           "policy_hash": policy_hash(policy),
           "audit_seq": entry["seq"], "rule_results": rule_results,
           "reasons": reasons, "stamp": stamp,
           "audit_ok": audit_ok, "audit_entries": audit_entries}
    if args.stamp_out and stamp:
        with open(args.stamp_out, "w") as f:
            json.dump(stamp, f, indent=2)
        out["stamp_file"] = args.stamp_out
    print(json.dumps(out, indent=2))
    sys.exit(EXIT_OK if decision == "APPROVE"
             else EXIT_REFUSE if decision == "REFUSED_MAINNET" else EXIT_DENY)


def valid_stamp(stamp, action, policy, now):
    """Stamp is only valid if it is fresh, binds THIS action and THIS policy,
    and has a matching APPROVE entry in the hash-chained audit log."""
    if not stamp or stamp.get("decision") != "APPROVE":
        return False, "no APPROVE stamp presented"
    if now > datetime.datetime.fromisoformat(stamp["expires_at"]):
        return False, "stamp expired at %s" % stamp["expires_at"]
    if stamp.get("policy_hash") != policy_hash(policy):
        return False, "stamp binds a different policy version"
    if stamp.get("action_hash") != action_hash_of(action):
        return False, "stamp binds a different action"
    expect = sha256(canon({k: v for k, v in stamp.items()
                           if k != "stamp_hash"}))
    if stamp.get("stamp_hash") != expect:
        return False, "stamp signature mismatch (tampered)"
    # audit-backed: an APPROVE entry with this stamp hash must exist
    found = False
    if os.path.exists(AUDIT_PATH):
        with open(AUDIT_PATH) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                e = json.loads(line)
                if (e.get("decision") == "APPROVE"
                        and e.get("stamp_hash") == stamp["stamp_hash"]):
                    found = True
                    break
    if not found:
        return False, "no audit-backed APPROVE entry for this stamp"
    return True, "stamp valid"


def prechecks(action, policy, rpc_url, private_key):
    """The 4 mandatory SkillEngine Write Operation Pre-checks. Returns
    (ok, report_lines). Any failure aborts the write."""
    lines = []
    # P1
    if not private_key:
        return False, ["P1 private key: MISSING — aborting"]
    lines.append("P1 private key: set (value never printed)")
    # P2
    rc, derived, err = cast("wallet", "address", "--private-key", private_key)
    if rc != 0:
        return False, lines + ["P2 address derivation failed: %s" % err]
    sender = policy["sender"]["address"]
    if derived.lower() != sender.lower():
        return False, lines + [
            "P2 sender binding FAILED: key derives to a different address — "
            "refusing (key-confusion firewall)"]
    lines.append("P2 sender binding: key derives to policy.sender — confirmed")
    # P3
    try:
        live_chain = int(rpc_call("eth_chainId", [], rpc_url), 16)
    except Exception as e:
        return False, lines + ["P3 network: RPC unreachable (%s) — aborting" % e]
    if live_chain != 688689:
        return False, lines + [
            "P3 network: RPC reports chain_id=%d, not Atlantic 688689 — "
            "refusing" % live_chain]
    lines.append("P3 network: Atlantic testnet (chain_id=688689) confirmed live")
    if action.get("chain_id") not in policy["networks"]["allowed_chain_ids"]:
        return False, lines + ["P3 network: proposed action targets a "
                               "non-allowlisted chain — refused"]
    # P4
    try:
        bal = int(rpc_call("eth_getBalance", [sender, "latest"], rpc_url), 16)
    except Exception as e:
        return False, lines + ["P4 balance: unreadable (%s) — aborting" % e]
    reserve = int(policy["prechecks"]["fee_reserve_wei"])
    need = int(action.get("value_wei", "0") or "0") + reserve
    if bal < need:
        return False, lines + [
            "P4 balance: %d wei < need %d wei — aborting" % (bal, need)]
    lines.append("P4 balance: %d wei covers value+reserve (%d wei)" % (bal, need))
    # C1 gas sanity
    try:
        gp = int(rpc_call("eth_gasPrice", [], rpc_url), 16)
    except Exception as e:
        return False, lines + ["C1 gas price unreadable (%s) — aborting" % e]
    cap = int(policy["rules"]["gas"]["max_gas_price_gwei"]) * 10 ** 9
    if gp > cap:
        return False, lines + ["C1 gas price %d wei > cap %d — aborting" % (gp, cap)]
    lines.append("C1 gas price: %d wei within cap" % gp)
    return True, lines


def cmd_execute(args):
    policy = load_policy()
    with open(args.action_file) as f:
        action = json.load(f)
    with open(args.stamp) as f:
        stamp = json.load(f)
    now = utcnow()
    ok, why = valid_stamp(stamp, action, policy, now)
    if not ok:
        append_audit(policy["policy_id"], policy_hash(policy), action,
                     "REFUSE", [], [{"rule": "no_bypass", "result": "REFUSE",
                                     "detail": why}], None)
        audit_ok, audit_entries = audit_status()
        print(json.dumps({"decision": "REFUSE", "reason": "no-bypass: " + why,
                          "audit_ok": audit_ok, "audit_entries": audit_entries},
                         indent=2))
        sys.exit(EXIT_REFUSE)
    rpc_url = os.environ.get("ATLANTIC_RPC_URL")
    pk = os.environ.get("DEPLOYER_PRIVATE_KEY")
    ok, report = prechecks(action, policy, rpc_url, pk)
    print("\n".join(report))
    if not ok:
        append_audit(policy["policy_id"], policy_hash(policy), action,
                     "REFUSE", [], [{"rule": "precheck", "result": "REFUSE",
                                     "detail": "; ".join(report)}], None)
        audit_ok, audit_entries = audit_status()
        print(json.dumps({"decision": "REFUSE", "reason": "precheck failed",
                          "audit_ok": audit_ok, "audit_entries": audit_entries},
                         indent=2))
        sys.exit(EXIT_REFUSE)
    # Only native_transfer broadcasts in this demo task; anything else would
    # need calldata construction — honestly refused rather than faked.
    if action["type"] != "native_transfer":
        append_audit(policy["policy_id"], policy_hash(policy), action,
                     "REFUSE", [],
                     [{"rule": "executor_scope", "result": "REFUSE",
                       "detail": "executor only broadcasts native_transfer"}], None)
        audit_ok, audit_entries = audit_status()
        print(json.dumps({"decision": "REFUSE",
                          "reason": "executor only broadcasts native_transfer; "
                                    "%s needs calldata the demo does not "
                                    "build" % action["type"],
                          "audit_ok": audit_ok, "audit_entries": audit_entries},
                         indent=2))
        sys.exit(EXIT_REFUSE)
    to = action["to"]
    value = action["value_wei"]
    print("broadcasting via nonce lock: cast send %s %s wei" % (to, value))
    p = subprocess.run(
        ["flock", NONCE_LOCK, "cast", "send", to, "--value", value,
         "--rpc-url", rpc_url, "--private-key", pk],
        capture_output=True, text=True)
    print(p.stdout)
    if p.returncode != 0:
        print(p.stderr, file=sys.stderr)
        append_audit(policy["policy_id"], policy_hash(policy), action,
                     "REFUSE", [],
                     [{"rule": "broadcast", "result": "REFUSE",
                       "detail": p.stderr[:300]}], stamp["stamp_hash"])
        audit_ok, audit_entries = audit_status()
        print(json.dumps({"decision": "REFUSE", "reason": "broadcast failed",
                          "audit_ok": audit_ok, "audit_entries": audit_entries},
                         indent=2))
        sys.exit(EXIT_ERR)
    txh = None
    for line in p.stdout.splitlines():
        if "transactionHash" in line:
            txh = line.split()[-1].strip()
    append_audit(policy["policy_id"], policy_hash(policy), action,
                 "EXECUTED", [], [], stamp["stamp_hash"])
    audit_ok, audit_entries = audit_status()
    print(json.dumps({"decision": "EXECUTED", "tx_hash": txh,
                      "audit_ok": audit_ok, "audit_entries": audit_entries,
                      "explorer": "https://atlantic.pharosscan.xyz/tx/%s" % txh
                      if txh else None}, indent=2))
    sys.exit(EXIT_OK)


def cmd_audit_verify(_args):
    ok, msg = verify_audit()
    _, entries = audit_status()
    print(json.dumps({"audit_ok": ok, "audit_entries": entries, "message": msg}, indent=2))
    sys.exit(EXIT_OK if ok else EXIT_ERR)


def cmd_show_policy(_args):
    policy = load_policy()
    print(json.dumps({"policy_id": policy["policy_id"],
                      "version": policy["version"],
                      "policy_hash": policy_hash(policy)}, indent=2))


def main():
    ap = argparse.ArgumentParser(description="T11 policy gatekeeper")
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("evaluate")
    e.add_argument("--action-file", required=True)
    e.add_argument("--stamp-out", default=None)
    e.set_defaults(fn=cmd_evaluate)
    x = sub.add_parser("execute")
    x.add_argument("--action-file", required=True)
    x.add_argument("--stamp", required=True)
    x.set_defaults(fn=cmd_execute)
    v = sub.add_parser("audit-verify")
    v.set_defaults(fn=cmd_audit_verify)
    s = sub.add_parser("show-policy")
    s.set_defaults(fn=cmd_show_policy)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
