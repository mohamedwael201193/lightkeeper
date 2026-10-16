#!/usr/bin/env python3
"""
T28 Multi-Protocol Aggregator — one interface over N fault-isolated venues.

Design (honest-by-construction):
  - Every figure traces to a cast eth_call at a PINNED block (all venues read
    at the same block, so the report is internally consistent).
  - A venue that fails any read is marked UNREACHABLE — never zero-filled.
  - Each venue is fault-isolated: one venue's failure cannot abort the run.
  - Routing scores venues with a transparent policy and EXPLAINS every
    decision with the exact numbers that produced it.
  - Actions are PREPARED for signature only: unsigned tx + eth_call dry-run
    revert gate. Nothing is broadcast by this script. Ever.

Usage:
  aggregate.py discover                      # bytecode-verify every venue
  aggregate.py run            [--out DIR]     # full aggregation run -> report
  aggregate.py route --intent deposit --amount-wei N
  aggregate.py prepare --venue ID --action deposit --amount-wei N
  aggregate.py health
  aggregate.py chaos           # degraded-mode demo: one venue forced down

Env: ATLANTIC_RPC_URL (required). DEPLOYER_PRIVATE_KEY only needed for nothing
here — this script never signs.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
REGISTRY = os.path.join(HERE, "registry.json")
EXPLORER = "https://atlantic.pharosscan.xyz"
def _rpc():
    rpc = os.environ.get("ATLANTIC_RPC_URL")
    if not rpc:
        raise RuntimeError("ATLANTIC_RPC_URL is not set")
    return rpc


def cast(*args, timeout=60):
    """Run cast, return (ok, stdout_stripped, stderr_stripped)."""
    try:
        p = subprocess.run(
            ["cast"] + list(args) + ["--rpc-url", _rpc()],
            capture_output=True, text=True, timeout=timeout,
        )
        return p.returncode == 0, p.stdout.strip(), p.stderr.strip()
    except Exception as e:  # noqa: BLE001 - isolation, never abort the run
        return False, "", str(e)


def load_registry():
    with open(REGISTRY) as f:
        return json.load(f)


def active_venues(reg, chaos_down=None):
    """Venues with a real address (skip PENDING siblings). chaos_down forces one down."""
    out = []
    for v in reg["venues"]:
        if v.get("status") == "PENDING" or not v.get("address"):
            continue
        vv = dict(v)
        if chaos_down and v["id"] == chaos_down:
            vv["address"] = "0x000000000000000000000000000000000000dEaD"
            vv["_chaos"] = True
        out.append(vv)
    return out


def venue_reachable(address):
    ok, out, _ = cast("code", address)
    return ok and out not in ("", "0x", "0x0")


def read_venue(venue, block):
    """Fault-isolated read of one venue at pinned block. Returns normalized dict."""
    result = {"id": venue["id"], "name": venue["name"], "type": venue["type"],
              "address": venue["address"], "block": block}
    if venue.get("_chaos"):
        result["status"] = "UNREACHABLE"
        result["reason"] = "CHAOS TEST: address overridden to dead address"
        return result
    if not venue_reachable(venue["address"]):
        result["status"] = "UNREACHABLE"
        result["reason"] = "no bytecode at address (get_code empty)"
        return result
    raw = {}
    for key, sig in venue["queries"].items():
        ok, out, err = cast("call", venue["address"], sig, "--block", str(block))
        if not ok:
            result["status"] = "UNREACHABLE"
            result["reason"] = f"eth_call failed for {sig}: {err[:120]}"
            return result
        try:
            raw[key] = int(out.split()[0], 0)
        except (ValueError, IndexError):
            result["status"] = "UNREACHABLE"
            result["reason"] = f"undecodable return for {sig}: {out[:80]}"
            return result
    result["status"] = "OK"
    result["raw"] = raw
    result.update(normalize(venue, raw))
    return result


def normalize(venue, raw):
    """Raw wei/bps -> human units. Pure function (unit-tested)."""
    n = {}
    if venue["type"] == "vault":
        n["tvl_phrs"] = raw["tvl_assets_wei"] / 1e18
        n["supply_apy_pct"] = raw["supply_apy_bps"] / 100.0
        n["share_price"] = raw["share_price_1e18"] / 1e18
        n["capital_efficiency_pct"] = 100.0  # vault: all TVL deployed in strategy
        n["utilization_bps"] = 0
    elif venue["type"] == "lending":
        n["tvl_phrs"] = raw["tvl_assets_wei"] / 1e18
        n["supply_apy_pct"] = raw["supply_apy_bps"] / 100.0
        n["borrow_apy_pct"] = raw["borrow_apy_bps"] / 100.0
        n["utilization_bps"] = raw["utilization_bps"]
        n["capital_efficiency_pct"] = raw["utilization_bps"] / 100.0
    else:
        raise ValueError(f"unknown venue type: {venue['type']}")
    return n


def risk_flags(v):
    """Risk annotations computed from real reads. Pure function (unit-tested)."""
    flags = []
    if v["status"] != "OK":
        return ["UNREACHABLE"]
    if v.get("utilization_bps", 0) > 8000:
        flags.append("ELEVATED: utilization >80% — withdrawal liquidity thin")
    if v["tvl_phrs"] < 0.0005:
        flags.append("THIN: TVL < 0.0005 PHRS — dust-scale venue")
    if v["type"] == "vault" and v["tvl_phrs"] < 0.001:
        flags.append("NOTE: small vault TVL — slippage not modeled")
    return flags or ["none"]


def run_aggregation(chaos_down=None, out_dir=None):
    reg = load_registry()
    ok, block_out, _ = cast("block-number")
    if not ok:
        sys.exit(f"could not fetch block number: {block_out}")
    block = int(block_out)
    ts = datetime.now(timezone.utc).isoformat()

    venues = active_venues(reg, chaos_down)
    # Fault-isolated AND parallel: one venue's slowness/failure never blocks others.
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=max(1, len(venues))) as pool:
        venues = list(pool.map(lambda v: read_venue(v, block), venues))
    for v in venues:
        v["risk_flags"] = risk_flags(v)

    ok_n = sum(1 for v in venues if v["status"] == "OK")
    report = {
        "task": "T28",
        "chain_id": 688689,
        "network": "pharos-atlantic-testnet",
        "block": block,
        "timestamp_utc": ts,
        "explorer_block": f"{EXPLORER}/block/{block}",
        "venues": venues,
        "summary": {
            "venues_total": len(venues),
            "venues_ok": ok_n,
            "venues_unreachable": len(venues) - ok_n,
            "chaos_mode": bool(chaos_down),
        },
        "comparison": compare(venues),
    }
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f"aggregation-report-block-{block}.json")
        with open(path, "w") as f:
            json.dump(report, f, indent=2)
        report["_saved"] = path
    return report


def compare(venues):
    """Comparison view: capital efficiency / risk across venues, from real reads."""
    okv = [v for v in venues if v["status"] == "OK"]
    rows = []
    for v in okv:
        rows.append({
            "venue": v["id"],
            "type": v["type"],
            "supply_apy_pct": v["supply_apy_pct"],
            "capital_efficiency_pct": round(v["capital_efficiency_pct"], 2),
            "utilization_bps": v.get("utilization_bps", 0),
            "tvl_phrs": round(v["tvl_phrs"], 9),
            "risk": "; ".join(v["risk_flags"]),
        })
    rows.sort(key=lambda r: r["supply_apy_pct"], reverse=True)
    return {"ranked_by_supply_apy": rows,
            "note": "Ranked by live on-chain supply APY. Capital efficiency = "
                    "utilization for lending (share of supplied capital earning), "
                    "100% for vaults (all TVL deployed in strategy)."}


def route(intent, amount_wei):
    """Policy-weighted router. Every figure traces to a live quote row."""
    rep = run_aggregation()
    okv = [v for v in rep["venues"] if v["status"] == "OK"]
    explanations = []
    scored = []
    for v in okv:
        if intent == "deposit":
            score = v["supply_apy_pct"]
            metric = f"supply APY {v['supply_apy_pct']:.2f}%"
        elif intent == "borrow":
            if v["type"] != "lending":
                explanations.append(f"{v['id']}: REJECTED — borrow intent needs a "
                                    f"lending venue, {v['id']} is a {v['type']}")
                continue
            score = -v["borrow_apy_pct"]  # lower borrow cost wins
            metric = f"borrow APY {v['borrow_apy_pct']:.2f}%"
        else:
            sys.exit(f"unknown intent: {intent}")
        # risk penalty: elevated utilization costs 0.5pp of score
        penalty = 0.5 if any("ELEVATED" in f for f in v["risk_flags"]) else 0.0
        net = score - penalty
        scored.append((net, v, metric, penalty))
    scored.sort(key=lambda s: s[0], reverse=True)
    for net, v, metric, penalty in scored:
        tag = "SELECTED" if net == scored[0][0] else "passed-over"
        why = (f"{v['id']}: {tag} — {metric} (block {rep['block']})"
               + (f", -0.50pp utilization-risk penalty" if penalty else "")
               + f", TVL {v['tvl_phrs']:.6f} PHRS")
        explanations.append(why)
    down = [v for v in rep["venues"] if v["status"] != "OK"]
    for v in down:
        explanations.append(f"{v['id']}: UNAVAILABLE — {v.get('reason','unknown')} "
                            f"(excluded from routing, did not break the run)")
    return {"intent": intent, "amount_wei": amount_wei,
            "amount_phrs": amount_wei / 1e18,
            "block": rep["block"],
            "winner": scored[0][1]["id"] if scored else None,
            "explanations": explanations}


def prepare_action(venue_id, action, amount_wei):
    """Prepare an UNSIGNED action for signature + eth_call dry-run revert gate."""
    reg = load_registry()
    venue = next((v for v in active_venues(reg) if v["id"] == venue_id), None)
    if not venue:
        sys.exit(f"unknown venue: {venue_id}")
    spec = venue["actions"].get(action)
    if not spec:
        sys.exit(f"action {action} not supported by {venue_id}")
    addr = venue["address"]
    value = amount_wei if spec["payable"] else 0
    # 1) calldata via cast (no signer needed)
    cd_args = ["calldata", spec["sig"]]
    if "(uint256)" in spec["sig"]:
        cd_args.append(str(amount_wei))
    cp = subprocess.run(["cast"] + cd_args, capture_output=True, text=True, timeout=60)
    if cp.returncode != 0:
        sys.exit(f"could not build calldata: {cp.stderr.strip()[:200]}")
    data = cp.stdout.strip()
    sender = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
    # 2) gas estimate (read-only)
    est_args = ["estimate", "--rpc-url", _rpc(), "--from", sender, addr, spec["sig"]]
    if "(uint256)" in spec["sig"]:
        est_args.append(str(amount_wei))
    if spec["payable"]:
        est_args += ["--value", str(amount_wei)]
    ep = subprocess.run(["cast"] + est_args, capture_output=True, text=True, timeout=60)
    gas_est = ep.stdout.strip().split()[0] if ep.returncode == 0 else "unknown"
    unsigned = {
        "from": sender,
        "to": addr,
        "value_wei": value,
        "value_hex": hex(value),
        "data": data,
        "chainId": 688689,
        "gas_estimate": gas_est,
        "note": "UNSIGNED — hand to wallet for signature; never broadcast by this tool",
    }
    # dry-run revert gate: eth_call the same payload from our address
    call_args = ["call", "--rpc-url", _rpc(), "--from", sender, addr, spec["sig"]]
    if "(uint256)" in spec["sig"]:
        call_args.append(str(amount_wei))
    if spec["payable"]:
        call_args += ["--value", str(amount_wei)]
    dp = subprocess.run(["cast"] + call_args, capture_output=True, text=True, timeout=60)
    dry = {"passed": dp.returncode == 0,
           "detail": (dp.stdout.strip() or dp.stderr.strip())[:200]}
    return {"venue": venue_id, "action": action, "to": addr,
            "amount_wei": amount_wei, "value_wei": value,
            "unsigned_tx": unsigned,
            "dry_run": dry,
            "broadcast": "NOT BROADCAST — unsigned payload prepared for signature only"}


def cmd_discover(out_dir=None):
    reg = load_registry()
    rows = []
    for v in reg["venues"]:
        if v.get("status") == "PENDING" or not v.get("address"):
            rows.append({"id": v["id"], "status": "PENDING",
                         "detail": v.get("note", "no on-chain deployment yet")})
            continue
        ok = venue_reachable(v["address"])
        rows.append({"id": v["id"], "status": "REACHABLE" if ok else "UNREACHABLE",
                     "address": v["address"],
                     "explorer": f"{EXPLORER}/address/{v['address']}",
                     "detail": "bytecode present" if ok else "get_code empty"})
    result = {"chain_id": 688689, "timestamp_utc": datetime.now(timezone.utc).isoformat(),
              "venues": rows}
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        p = os.path.join(out_dir, "discovery.json")
        json.dump(result, open(p, "w"), indent=2)
        result["_saved"] = p
    return result


def print_report(rep):
    print(f"\n== T28 aggregation run — block {rep['block']} "
          f"({rep['explorer_block']}) ==")
    for v in rep["venues"]:
        print(f"\n[{v['status']}] {v['id']} ({v['type']}) {v['address']}")
        if v["status"] != "OK":
            print(f"  reason: {v.get('reason')}")
            continue
        print(f"  TVL: {v['tvl_phrs']:.9f} PHRS | supply APY: {v['supply_apy_pct']:.2f}%", end="")
        if v["type"] == "lending":
            print(f" | borrow APY: {v['borrow_apy_pct']:.2f}% | util: {v['utilization_bps']/100:.2f}%", end="")
        else:
            print(f" | share price: {v['share_price']:.6f}", end="")
        print(f"\n  risk: {'; '.join(v['risk_flags'])}")
    print("\n-- comparison (ranked by live supply APY) --")
    for r in rep["comparison"]["ranked_by_supply_apy"]:
        print(f"  {r['venue']:12s} apy={r['supply_apy_pct']:5.2f}% "
              f"capEff={r['capital_efficiency_pct']:6.2f}% tvl={r['tvl_phrs']:.6f} | {r['risk']}")
    s = rep["summary"]
    print(f"\nsummary: {s['venues_ok']}/{s['venues_total']} venues OK, "
          f"{s['venues_unreachable']} unreachable")


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "run"
    out = os.path.join(HERE, "runs")
    if cmd == "discover":
        r = cmd_discover(out)
        for v in r["venues"]:
            print(f"{v['status']:12s} {v['id']:14s} {v.get('address','-'):42s} {v['detail']}")
        print(f"saved: {r.get('_saved')}")
    elif cmd == "run":
        rep = run_aggregation(out_dir=out)
        print_report(rep)
        print(f"saved: {rep.get('_saved')}")
    elif cmd == "chaos":
        rep = run_aggregation(chaos_down="T28-VAULT-B", out_dir=out)
        print("*** CHAOS TEST — T28-VAULT-B forced down (dead address). "
              "All other venues must still aggregate. ***")
        print_report(rep)
        print(f"saved: {rep.get('_saved')}")
    elif cmd == "health":
        r = cmd_discover()
        for v in r["venues"]:
            state = "CLOSED(ok)" if v["status"] == "REACHABLE" else "OPEN(tripped)"
            print(f"{v['id']:14s} circuit: {state} — {v['detail']}")
    elif cmd == "route":
        import argparse
        ap = argparse.ArgumentParser()
        ap.add_argument("--intent", required=True, choices=["deposit", "borrow"])
        ap.add_argument("--amount-wei", required=True, type=int)
        a = ap.parse_args(argv[2:])
        r = route(a.intent, a.amount_wei)
        print(f"\nintent={r['intent']} amount={r['amount_phrs']:.6f} PHRS @ block {r['block']}")
        print(f"winner: {r['winner']}")
        for e in r["explanations"]:
            print(f"  - {e}")
    elif cmd == "prepare":
        import argparse
        ap = argparse.ArgumentParser()
        ap.add_argument("--venue", required=True)
        ap.add_argument("--action", required=True)
        ap.add_argument("--amount-wei", required=True, type=int)
        a = ap.parse_args(argv[2:])
        r = prepare_action(a.venue, a.action, a.amount_wei)
        print(json.dumps(r, indent=2))
        print("STATUS: prepared for signature — NOT broadcast")
    else:
        sys.exit(f"unknown command: {cmd}")


if __name__ == "__main__":
    main(sys.argv)
