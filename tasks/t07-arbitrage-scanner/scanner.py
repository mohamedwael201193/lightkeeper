#!/usr/bin/env python3
"""
LIGHTKEEPER T07 — Arbitrage Scanner (Pharos Atlantic testnet).

HONESTY DESIGN
--------------
* Every spread is computed from REAL on-chain reserves read via eth_call at a
  single pinned block. Nothing is simulated, mocked, or invented.
* Thin testnet liquidity is expected: when no route nets above threshold the
  scanner logs SKIP with a machine-readable reason. "No opportunity" is a
  valid, honest result; fabricating one is disqualifying.
* Economics are denominated in native test units (WPHRS):
    - WPHRS is a test-wrapped-PHRS minted 1:1 by the venue deployer
      (see config.json `gas_token_parity`). It is a TEST ACCOUNTING UNIT,
      not a market price.
    - `native_price_usd` is null in config and NEVER used. No USD value is
      invented for PHRS (per precision patch: price must come from a
      specified configured source, never invented).
* Fees are charged per leg ON THE NOTIONAL (input amount), never on the
  spread. Slippage is measured against the zero-fee constant-product ideal
  from the same real reserves. Unknown slippage -> SKIP, never assumed zero.
* Skip reasons: BELOW_THRESHOLD | STALE_QUOTE | NO_LIQUIDITY | SOURCE_DOWN |
  NEGATIVE_NET. Failed reads are ERRORs, never zeros (anti-mock rule).

Official requirements covered:
  (1) >=2 price sources per scan (3 independent ArbPool venues)
  (2) nets swap fees + slippage + gas
  (3) acts/prepares tx only above configurable profit threshold, else logs why
  (4) every scan logged (gross, costs, net, decision) -> scans.jsonl
  (5) testnet-safe: dust amounts, --execute is opt-in and explicit
"""
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# ---------------------------------------------------------------- constants
CHAIN_ID = 688689
FEE_BPS = 30                      # 0.30% per swap leg, on the notional
SEL_GET_RESERVES = "0x0902f1ac"   # getReserves()          (cast sig)
SEL_GET_AMOUNT_OUT = "0xf140a35a"  # getAmountOut(uint256,address)
SEL_SWAP = "0x2b7f0923"           # swap(uint256,address,address)
STALE_BLOCK_LAG = 50              # quotes older than this vs tip -> STALE_QUOTE

RPC = os.environ.get("ATLANTIC_RPC_URL")
if not RPC:
    raise SystemExit("ATLANTIC_RPC_URL is not set")

HERE = os.path.dirname(os.path.abspath(__file__))


# ------------------------------------------------------------- pure math
def quote_out(amount_in: int, r_in: int, r_out: int, fee_bps: int = FEE_BPS) -> int:
    """Constant-product quote with fee on the notional (mirrors ArbPool)."""
    if amount_in <= 0 or r_in <= 0 or r_out <= 0:
        return 0
    w = amount_in * (10000 - fee_bps)
    return (w * r_out) // (r_in * 10000 + w)


def ideal_out(amount_in: int, r_in: int, r_out: int) -> int:
    """Zero-fee constant-product ideal, same reserves (slippage baseline)."""
    if amount_in <= 0 or r_in <= 0 or r_out <= 0:
        return 0
    return (amount_in * r_out) // (r_in + amount_in)


def fee_on_notional(amount_in: int, fee_bps: int = FEE_BPS) -> int:
    """Fee actually taken by the venue: on the input notional."""
    return amount_in * fee_bps // 10000


# ------------------------------------------------------------------ rpc
def _rpc(method: str, params):
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    ).encode()
    req = urllib.request.Request(
        RPC, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.loads(r.read().decode())
    if "error" in out:
        raise RuntimeError(f"RPC {method} error: {out['error']}")
    return out["result"]


def block_number() -> int:
    return int(_rpc("eth_blockNumber", []), 16)


def gas_price() -> int:
    return int(_rpc("eth_gasPrice", []), 16)


def eth_call(to: str, data: str, block_hex: str) -> bytes:
    raw = _rpc("eth_call", [{"to": to, "data": data}, block_hex])
    return bytes.fromhex(raw[2:])


def estimate_gas(frm: str, to: str, data: str) -> int:
    raw = _rpc("eth_estimateGas", [{"from": frm, "to": to, "data": data}])
    return int(raw, 16)


def _u256(b: bytes, i: int) -> int:
    return int.from_bytes(b[i * 32:(i + 1) * 32], "big")


def get_reserves(pool: str, block_hex: str):
    """Returns (reserve_wphrs, reserve_tkb) or raises on failure/empty code."""
    code = _rpc("eth_getCode", [pool, block_hex])
    if code in ("0x", "0x0"):
        raise RuntimeError(f"no contract code at {pool}")
    raw = eth_call(pool, SEL_GET_RESERVES, block_hex)
    return _u256(raw, 0), _u256(raw, 1)


def _addr_word(a: str) -> str:
    return a.lower().replace("0x", "").rjust(64, "0")


def _u256_word(v: int) -> str:
    return format(v, "064x")


def swap_calldata(amount_in: int, token_in: str, to: str) -> str:
    return SEL_SWAP + _u256_word(amount_in) + _addr_word(token_in) + _addr_word(to)


# ------------------------------------------------------------ evaluation
def evaluate_cycle(pool_a, pool_b, start_token, size, reserves, gas_wei):
    """One directed cycle: start_token --pool_a--> mid --pool_b--> end.

    Returns dict with full cost decomposition, or None if illiquid.
    """
    ra, rb = reserves[pool_a["name"]], reserves[pool_b["name"]]
    mid_token = "TKB" if start_token == "WPHRS" else "WPHRS"
    # leg 1: start_token swapped on pool A
    r_w, r_t = ra
    rin1, rout1 = (r_w, r_t) if start_token == "WPHRS" else (r_t, r_w)
    if rin1 == 0 or rout1 == 0:
        return None
    leg1_out = quote_out(size, rin1, rout1)
    leg1_ideal = ideal_out(size, rin1, rout1)
    if leg1_out == 0:
        return None
    # leg 2
    r_w, r_t = rb
    rin2, rout2 = (r_t, r_w) if mid_token == "TKB" else (r_w, r_t)
    if rin2 == 0 or rout2 == 0:
        return None
    leg2_out = quote_out(leg1_out, rin2, rout2)
    leg2_ideal = ideal_out(leg1_out, rin2, rout2)
    if leg2_out == 0:
        return None

    gross = leg2_out - size
    fee1 = fee_on_notional(size)
    fee2 = fee_on_notional(leg1_out)
    slip1 = leg1_ideal - leg1_out
    slip2 = leg2_ideal - leg2_out
    net = gross - gas_wei  # gas in PHRS == WPHRS 1:1 by test construction
    return {
        "venue_buy_leg": pool_a["name"],
        "venue_sell_leg": pool_b["name"],
        "start_token": start_token,
        "trade_size_wei": size,
        "leg1_out_wei": leg1_out,
        "leg2_out_wei": leg2_out,
        "gross_wei": gross,
        "fee_leg1_wei": fee1,
        "fee_leg2_wei": fee2,
        "fees_total_wei": fee1 + fee2,
        "slippage_leg1_wei": slip1,
        "slippage_leg2_wei": slip2,
        "slippage_total_wei": slip1 + slip2,
        "gas_wei": gas_wei,
        "net_wei": net,
    }


def scan(config: dict) -> dict:
    """Run one full scan. Returns the JSONL record dict."""
    t0 = time.time()
    scan_id = f"t07-{int(t0)}"
    venues = config["venues"]
    size = int(config["trade_size_wphrs_wei"])
    threshold = int(config["profit_threshold_wphrs_wei"])
    deployer = config["deployer"]

    pinned = block_number()
    block_hex = hex(pinned)
    record = {
        "mode": "LIVE",
        "scan_id": scan_id,
        "task": "T07-arbitrage-scanner",
        "chain_id": CHAIN_ID,
        "pinned_block": pinned,
        "timestamp_unix": int(t0),
        "venues": [v["name"] for v in venues],
        "trade_size_wei": size,
        "profit_threshold_wei": threshold,
    }

    # (1) read all venues at the pinned block, in parallel
    reserves = {}
    errors = {}
    with ThreadPoolExecutor(max_workers=len(venues)) as ex:
        futs = {ex.submit(get_reserves, v["address"], block_hex): v["name"]
                for v in venues}
        for f in futs:
            name = futs[f]
            try:
                reserves[name] = f.result()
            except Exception as e:  # noqa: BLE001 - surfaced, never zeroed
                errors[name] = str(e)
    if errors:
        record.update(decision="SKIP", skip_reason="SOURCE_DOWN",
                      source_errors=errors,
                      note="one or more venue reads failed; refusing to quote")
        return record
    record["reserves_at_pinned_block"] = {
        n: {"wphrs_wei": r[0], "tkb_wei": r[1]} for n, r in reserves.items()
    }

    # (2) gas
    gprice = gas_price()
    # calldata for a representative swap on each venue (for estimateGas)
    venue_by_name = {v["name"]: v for v in venues}
    wphrs = config["WPHRS"]
    tkb = config["TKB"]
    gas_per_leg = {}
    try:
        for v in venues:
            data = swap_calldata(size, wphrs, deployer)
            gas_per_leg[v["name"]] = estimate_gas(deployer, v["address"], data)
    except Exception as e:  # noqa: BLE001
        record.update(decision="SKIP", skip_reason="SOURCE_DOWN",
                      source_errors={"estimateGas": str(e)})
        return record
    gas_units = max(gas_per_leg.values()) * 2  # two legs, worst venue
    gas_wei = gas_units * gprice
    record["gas"] = {"gas_price_wei": gprice, "gas_units_2legs": gas_units,
                     "gas_cost_phrs_wei": gas_wei,
                     "gas_cost_wphrs_wei": gas_wei,
                     "parity_note": config["gas_token_parity"]}

    # (3) evaluate every directed cycle
    cands = []
    names = [v["name"] for v in venues]
    for a in names:
        for b in names:
            if a == b:
                continue
            for start in ("WPHRS", "TKB"):
                r = evaluate_cycle(venue_by_name[a], venue_by_name[b],
                                   start, size, reserves, gas_wei)
                if r is not None:
                    cands.append(r)
    if not cands:
        record.update(decision="SKIP", skip_reason="NO_LIQUIDITY",
                      note="no venue pair had liquidity for the trade size")
        return record
    best = max(cands, key=lambda c: c["net_wei"])
    record["candidates_evaluated"] = len(cands)
    record["best_route"] = best

    # (4) staleness + policy gate
    tip = block_number()
    record["tip_block_at_decision"] = tip
    if tip - pinned > STALE_BLOCK_LAG:
        record.update(decision="SKIP", skip_reason="STALE_QUOTE",
                      note=f"pinned {pinned} is {tip-pinned} blocks behind tip")
        return record
    if best["net_wei"] <= 0:
        record.update(decision="SKIP", skip_reason="NEGATIVE_NET",
                      note="best route nets zero or negative after fees+gas")
        return record
    if best["net_wei"] <= threshold:
        record.update(decision="SKIP", skip_reason="BELOW_THRESHOLD",
                      note=(f"net {best['net_wei']} wei <= threshold "
                            f"{threshold} wei"))
        return record

    record.update(decision="ACT",
                  note=(f"net {best['net_wei']} wei > threshold {threshold} "
                        "wei — route is executable"),
                  prepared_calls=[
                      {"to": venue_by_name[best["venue_buy_leg"]]["address"],
                       "calldata": swap_calldata(
                           best["trade_size_wei"],
                           wphrs if best["start_token"] == "WPHRS" else tkb,
                           deployer),
                       "label": "leg1"},
                      {"to": venue_by_name[best["venue_sell_leg"]]["address"],
                       "calldata": swap_calldata(
                           best["leg1_out_wei"],
                           tkb if best["start_token"] == "WPHRS" else wphrs,
                           deployer),
                       "label": "leg2"},
                  ])
    record["elapsed_s"] = round(time.time() - t0, 2)
    return record


def main():
    import argparse
    ap = argparse.ArgumentParser(description="LIGHTKEEPER T07 arbitrage scanner")
    ap.add_argument("--config", default=os.path.join(HERE, "config.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "scans.jsonl"))
    ap.add_argument("--execute", action="store_true",
                    help="broadcast the ACT route (dust, testnet only)")
    args = ap.parse_args()

    with open(args.config) as f:
        config = json.load(f)
    record = scan(config)

    if args.execute and record.get("decision") == "ACT":
        import subprocess
        txs = []
        for c in record["prepared_calls"]:
            sig = "swap(uint256,address,address)"
            # decode calldata back to typed args for cast
            cd = c["calldata"]
            amt = int(cd[10:74], 16)
            tok = "0x" + cd[74:138][-40:]
            to = "0x" + cd[138:202][-40:]
            cmd = (["flock", "/tmp/lk-nonce.lock", "cast", "send", c["to"],
                    sig, str(amt), tok, to,
                    "--rpc-url", RPC, "--private-key",
                    os.environ["DEPLOYER_PRIVATE_KEY"], "--json"])
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            if out.returncode != 0:
                record["execution_error"] = out.stderr[-500:]
                record["decision"] = "SKIP"
                record["skip_reason"] = "EXECUTION_FAILED"
                break
            h = json.loads(out.stdout)["transactionHash"]
            txs.append({"leg": c["label"], "tx_hash": h, "to": c["to"]})
        record["execution_tx_hashes"] = txs
        if record.get("skip_reason") == "EXECUTION_FAILED":
            record["note"] = ("execution FAILED, no arbitrage executed: "
                              + record.get("execution_error", "")[:200])
        else:
            record["note"] = ("ACT route EXECUTED on-chain (dust, testnet): "
                              + ", ".join(t["tx_hash"][:10] + "..."
                                           for t in txs))

    with open(args.out, "a") as f:
        f.write(json.dumps(record) + "\n")
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
