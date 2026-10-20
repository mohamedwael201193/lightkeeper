#!/usr/bin/env python3
"""T08 Dry-Run Executor — the simulation gate, on the REAL Chain MCP.

Pipeline (layered, in order) — EVERY chain read is a named Chain MCP tool
call (https://mcp.pharos.xyz/mcp, Pharos mainnet 1672). There is no `cast`
and no raw eth_* JSON-RPC anywhere in this module: rawRpcCalls = 0.
    1. validate       — address/sig sanity + chain id via MCP get_chain_info
                        (must be 1672 — the only chain the hosted MCP serves)
    2. eth_call       — MCP eth_call surfaces revert reasons without broadcasting
    3. estimateGas    — MCP estimate_gas; failure -> exact revert reason, no gas
    4. gas price      — MCP get_gas_price for the predicted-cost math
    5. state snapshot — MCP get_balance / eth_call before-snapshot,
                        marked "chain unmodified"
    6. receipt        — SimulationReceipt JSON; PASS or FAIL (blocked)

GATE ARCHITECTURE: this module STRUCTURALLY CANNOT broadcast.
It never reads secrets from the environment and holds no key material.
Broadcasting lives in the separate `broadcast.py` (Atlantic-era tickets),
which only acts on a SimulationReceipt whose status is PASS.

Post-mortem mode (--reconcile <txhash>): our prediction-vs-receipt
post-mortem. Fetches the REAL receipt via MCP get_transaction_receipt +
get_transaction, computes actual cost = gasUsed x effectiveGasPrice,
pairs it with the prediction recorded in runs/prediction-ledger.jsonl
(when one exists for that tx) and prints the error %, plus per-asset
balance deltas decoded from the receipt's own ERC-20 Transfer logs.

Usage:
    python3 src/dryrun.py --from ADDR --to ADDR --sig "ping()" \\
        --out runs/receipt-B.json
    python3 src/dryrun.py --reconcile 0xTXHASH [--out runs/reconcile.json]
"""

import argparse
import json
import math
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from mcp import ChainMCP, MCPError  # noqa: E402
from revert_decode import decode_revert_data  # noqa: E402
from Crypto.Hash import keccak  # noqa: E402  (pycryptodome — Ethereum keccak256)

EXPECTED_CHAIN_ID = 1672  # Pharos mainnet — the only chain the Chain MCP serves
GAS_SAFETY_FACTOR = 1.2
WEI_PER_NATIVE = 10**18
NATIVE_SYMBOL = "PROS"
LEDGER = Path(__file__).resolve().parent.parent / "runs" / "prediction-ledger.jsonl"
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

# This module must never gain secret-reading or key-passing capability.
# Runtime tripwire: forbids the dangerous tokens without naming them literally
# (so the guard itself cannot trip the check).
def _guard_no_signer() -> None:
    src = Path(__file__).read_text()
    body = "\n".join(
        ln for ln in src.splitlines()
        if "guard_no_signer" not in ln and not ln.lstrip().startswith("#")
    )
    for tok in ("get" + "env", "os." + "environ", "--private" + "-key"):
        assert tok not in body, f"signer capability leaked into dry-run module: {tok}"


# ------------------------------------------------------------ ABI encoding --
def keccak256_hex(text: str) -> str:
    k = keccak.new(digest_bits=256)
    k.update(text.encode())
    return k.hexdigest()


def parse_sig(sig: str) -> tuple[str, list[str]]:
    """'transfer(address,uint256)' -> ('transfer', ['address','uint256']).
    Output annotations like 'count()(uint256)' yield the input types only."""
    name = sig.split("(", 1)[0].strip()
    inner = sig[sig.index("(") + 1: sig.index(")")]
    types = [t.strip() for t in inner.split(",") if t.strip()] if inner else []
    return name, types


def _is_dynamic(t: str) -> bool:
    return t in ("string", "bytes")


def _encode_static(t: str, v: str) -> str:
    if t.startswith("uint"):
        return format(int(v, 0), "064x")
    if t.startswith("int"):
        return format(int(v, 0) % (1 << 256), "064x")
    if t == "address":
        a = v.lower().replace("0x", "")
        if len(a) != 40:
            raise ValueError(f"bad address arg: {v}")
        return a.rjust(64, "0")
    if t == "bool":
        return format(1 if v.lower() in ("true", "1") else 0, "064x")
    if t.startswith("bytes"):  # bytesN (static)
        h = v.lower().replace("0x", "")
        return h.ljust(64, "0")
    raise ValueError(f"unsupported static arg type: {t}")


def encode_calldata(sig: str, args: list[str]) -> str:
    """Full 0x-prefixed calldata: 4-byte selector + ABI-encoded args."""
    name, types = parse_sig(sig)
    canonical = f"{name}({','.join(types)})"
    selector = keccak256_hex(canonical)[:8]
    if len(args) != len(types):
        raise ValueError(f"{canonical} takes {len(types)} arg(s), got {len(args)}")
    heads, tails = [], []
    offset = 32 * len(types)
    for t, v in zip(types, args):
        if _is_dynamic(t):
            if t == "string":
                raw = v.encode()
            else:
                raw = bytes.fromhex(v.lower().replace("0x", ""))
            heads.append(format(offset, "064x"))
            tail = format(len(raw), "064x") + raw.hex().ljust(64, "0")
            tails.append(tail)
            offset += len(tail) // 2
        else:
            heads.append(_encode_static(t, v))
    return "0x" + selector + "".join(heads) + "".join(tails)


def decode_uint256(raw_hex: str):
    try:
        return str(int(raw_hex, 16))
    except (ValueError, TypeError):
        return "n/a"


def _to_int(v) -> int:
    if isinstance(v, int):
        return v
    return int(str(v), 16) if str(v).startswith("0x") else int(str(v))


# ------------------------------------------------------------- MCP helpers --
def revert_reason_from_mcp_error(err: dict) -> str:
    """Turn a Chain MCP tool-result {error:{message,data}} into a reason.

    Prefers the decoded revert DATA (Error(string)/Panic via revert_decode);
    falls back to the text after 'execution reverted:'; never invents.
    """
    data = (err or {}).get("data") or ""
    if isinstance(data, str) and data.startswith("0x") and len(data) > 10:
        return decode_revert_data(data)
    msg = ((err or {}).get("message") or "").strip()
    if "execution reverted:" in msg:
        tail = msg.split("execution reverted:", 1)[1].strip()
        return tail or "reverted with no reason"
    return msg or "reverted (reason not parsed)"


def step_validate(mcp: ChainMCP, from_addr: str, to: str, sig: str) -> dict:
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", from_addr or ""):
        raise ValueError(f"invalid --from address: {from_addr}")
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", to or ""):
        raise ValueError(f"invalid --to address: {to}")
    if not sig or "(" not in sig:
        raise ValueError(f"invalid --sig: {sig}")
    info = mcp.call("get_chain_info", {})
    chain_id = _to_int(info.get("chainId", info.get("chain_id")))
    if chain_id != EXPECTED_CHAIN_ID:
        raise RuntimeError(
            f"REFUSED: Chain MCP reports chain id {chain_id}, not Pharos "
            f"mainnet ({EXPECTED_CHAIN_ID}). This executor only dry-runs "
            "through the Chain MCP."
        )
    head = mcp.call("get_block_number", {})
    return {"chainId": chain_id, "blockNumber": _to_int(head["blockNumber"])}


def snapshot_state(mcp: ChainMCP, to: str) -> dict:
    """Read-only before/after snapshot. Probe-style: count() + balance.
    count() is best-effort ('n/a' for contracts without that view)."""
    snap = {}
    try:
        res = mcp.call("eth_call", {
            "transaction": {"to": to, "data": encode_calldata("count()", [])},
            "block": "latest",
        })
        snap["count"] = ("n/a" if "error" in res
                         else decode_uint256(res.get("result", "0x0")))
    except MCPError:
        snap["count"] = "n/a"
    bal = mcp.call("get_balance", {"address": to})
    snap["balanceWei"] = str(bal.get("balanceWei", "n/a"))
    return snap


# -------------------------------------------------------------- reconcile ---
def compute_reconcile(receipt: dict, tx: dict, prediction: dict | None) -> dict:
    """Prediction-vs-receipt post-mortem math (pure; unit-tested).

    Actual cost = gasUsed x effectiveGasPrice. Per-asset deltas are decoded
    from the receipt's ERC-20 Transfer logs (net in/out per asset+address),
    plus the native (PROS) leg: sender pays value + gas, `to` receives value.
    Error % is signed: (predicted - actual) / actual x 100.
    """
    gas_used = _to_int(receipt["gasUsed"])
    price = _to_int(receipt.get("effectiveGasPrice") or tx.get("gasPrice", 0))
    actual_cost_wei = gas_used * price
    value_wei = _to_int(tx.get("value", 0))
    status_ok = receipt.get("status") in (1, "1", "0x1")

    deltas: dict = {}
    for lg in receipt.get("logs", []) or []:
        topics = lg.get("topics") or []
        if len(topics) < 3 or topics[0].lower() != TRANSFER_TOPIC:
            continue
        asset = lg["address"].lower()
        frm = "0x" + topics[1][-40:]
        to_ = "0x" + topics[2][-40:]
        amount = _to_int(lg.get("data", "0x0"))
        deltas.setdefault((asset, frm), 0)
        deltas.setdefault((asset, to_), 0)
        deltas[(asset, frm)] -= amount
        deltas[(asset, to_)] += amount

    out = {
        "txHash": receipt.get("transactionHash") or tx.get("hash"),
        "blockNumber": _to_int(receipt["blockNumber"]),
        "status": "success" if status_ok else "failure",
        "from": (tx.get("from") or receipt.get("from") or "").lower(),
        "to": (tx.get("to") or receipt.get("to") or ""),
        "actual": {
            "gasUsed": gas_used,
            "effectiveGasPriceWei": price,
            "actualCostWei": actual_cost_wei,
            "actualCostPROS": actual_cost_wei / WEI_PER_NATIVE,
            "valueWei": value_wei,
        },
        "nativeDeltasPROSwei": {
            "senderGasAndValue": -(actual_cost_wei + value_wei),
            "recipientValue": value_wei,
        },
        "erc20Deltas": [
            {"asset": a, "address": addr, "deltaRaw": d}
            for (a, addr), d in sorted(deltas.items()) if d != 0
        ],
    }
    if prediction:
        p = prediction.get("prediction", prediction)
        pred_cost_wei = round(float(p.get("predictedCostPHRS", 0)) * WEI_PER_NATIVE)
        pred_gas = p.get("gasEstimate")
        gas_limit = p.get("gasLimit")
        def err_pct(pred, actual):
            return None if not actual else round((pred - actual) / actual * 100, 2)
        out["prediction"] = {
            "gasEstimate": pred_gas,
            "gasLimit": gas_limit,
            "predictedCostWei": pred_cost_wei,
            "dryRunBlock": p.get("dryRunBlock"),
        }
        out["match"] = {
            "gasErrorPct": err_pct(pred_gas, gas_used) if pred_gas else None,
            "costErrorPct": err_pct(pred_cost_wei, actual_cost_wei),
            "gasWithinSafetyLimit": gas_used <= gas_limit if gas_limit else None,
            "statusMatchesPrediction": status_ok,
        }
    else:
        out["prediction"] = None
        out["match"] = None
    return out


def find_prediction(tx_hash: str) -> dict | None:
    if not LEDGER.exists():
        return None
    for line in LEDGER.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if (entry.get("txHash") or "").lower() == tx_hash.lower():
            return entry
    return None


def cmd_reconcile(tx_hash: str) -> dict:
    mcp = ChainMCP(client_name="lightkeeper-t08").connect()
    try:
        receipt = mcp.call("get_transaction_receipt", {"hash": tx_hash})
        tx = mcp.call("get_transaction", {"hash": tx_hash})
    finally:
        mcp.close()
    if not receipt or receipt.get("transactionHash") is None and not receipt.get("gasUsed"):
        raise RuntimeError(
            f"no receipt for {tx_hash} on Pharos mainnet via the Chain MCP "
            "(the MCP serves mainnet 1672 only — an Atlantic tx hash has no "
            "receipt here)"
        )
    pred = find_prediction(tx_hash)
    report = compute_reconcile(receipt, tx, pred)
    report["via"] = "chain-mcp:get_transaction_receipt+get_transaction"
    report["rawRpcCalls"] = 0
    return report


def print_reconcile(r: dict) -> None:
    a = r["actual"]
    print(f"[reconcile] tx {r['txHash']} block {r['blockNumber']} status {r['status']}")
    print(f"[reconcile] actual: gasUsed={a['gasUsed']} effectiveGasPrice={a['effectiveGasPriceWei']} wei "
          f"cost={a['actualCostPROS']:.8f} {NATIVE_SYMBOL}")
    if r["prediction"]:
        m = r["match"]
        print(f"[reconcile] predicted: gasEstimate={r['prediction']['gasEstimate']} "
              f"gasLimit(1.2x)={r['prediction']['gasLimit']} "
              f"predictedCost={r['prediction']['predictedCostWei']} wei")
        print(f"[reconcile] error: gas {m['gasErrorPct']:+.2f}% | cost {m['costErrorPct']:+.2f}% | "
              f"within safety limit: {m['gasWithinSafetyLimit']}")
    else:
        print("[reconcile] prediction: none recorded for this tx in runs/prediction-ledger.jsonl "
              "(external tx — actuals and deltas only, nothing invented)")
    for d in r["erc20Deltas"]:
        print(f"[reconcile] delta asset {d['asset']} address {d['address']}: {d['deltaRaw']:+d} (raw units)")
    print(f"[reconcile] native: sender {r['nativeDeltasPROSwei']['senderGasAndValue']} wei (gas+value), "
          f"recipient +{r['nativeDeltasPROSwei']['recipientValue']} wei")


# -------------------------------------------------------------------- main --
def main() -> int:
    _guard_no_signer()
    ap = argparse.ArgumentParser(description="T08 dry-run executor (Chain MCP, simulation only)")
    ap.add_argument("--from", dest="from_addr")
    ap.add_argument("--to")
    ap.add_argument("--sig")
    ap.add_argument("--args", nargs="*", default=[], help="extra sig args")
    ap.add_argument("--value", default="0", help="wei to send with the call")
    ap.add_argument("--out", help="SimulationReceipt JSON path (or reconcile report path)")
    ap.add_argument("--reconcile", metavar="TXHASH",
                    help="prediction-vs-receipt post-mortem for a mined mainnet tx")
    a = ap.parse_args()

    if a.reconcile:
        try:
            report = cmd_reconcile(a.reconcile)
        except Exception as exc:  # noqa: BLE001 - reconcile must fail loudly, never fabricate
            print(f"[reconcile] FAILED: {exc}")
            return 1
        print_reconcile(report)
        if a.out:
            out = Path(a.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(report, indent=2) + "\n")
            print(f"[reconcile] report -> {out}")
        return 0

    if not (a.from_addr and a.to and a.sig and a.out):
        ap.error("--from, --to, --sig and --out are required for a dry run")

    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    receipt: dict = {
        "tool": "t08-dry-run-executor",
        "schema": "SimulationReceipt/1",
        "startedUtc": started,
        "from": a.from_addr,
        "to": a.to,
        "sig": a.sig,
        "sigArgs": a.args,
        "valueWei": a.value,
        "gasSafetyFactor": GAS_SAFETY_FACTOR,
        "chainModified": False,  # dry-run NEVER modifies chain state
        "transport": "chain-mcp",
        "mcpEndpoint": "https://mcp.pharos.xyz/mcp",
        "rawRpcCalls": 0,
        "nativeSymbol": NATIVE_SYMBOL,
    }

    mcp = ChainMCP(client_name="lightkeeper-t08").connect()
    tools_used: set[str] = set()
    try:
        # 1. validation (MCP get_chain_info + get_block_number)
        net = step_validate(mcp, a.from_addr, a.to, a.sig)
        tools_used.update(("get_chain_info", "get_block_number"))
        receipt.update(net)

        data = encode_calldata(a.sig, a.args)
        receipt["calldata"] = data
        tx_obj = {"to": a.to, "data": data, "from": a.from_addr}
        if a.value != "0":
            tx_obj["value"] = hex(int(a.value))

        # 2. eth_call via MCP — surfaces the revert reason without broadcasting
        res = mcp.call("eth_call", {"transaction": tx_obj, "block": "latest"})
        tools_used.add("eth_call")
        if "error" in res:
            receipt["callOk"] = False
            receipt["callError"] = revert_reason_from_mcp_error(res["error"])
            receipt["callStdout"] = ""
        else:
            receipt["callOk"] = True
            receipt["callStdout"] = str(res.get("result", ""))[:200]

        before = snapshot_state(mcp, a.to)
        tools_used.update(("get_balance",))
        receipt["stateBefore"] = before
        receipt["stateBeforeNote"] = "on-chain read via Chain MCP; chain unmodified by dry-run"

        # 3. estimate_gas via MCP — failure carries the exact revert reason
        est = mcp.call("estimate_gas", {"transaction": tx_obj})
        tools_used.add("estimate_gas")

        if "error" not in est:
            gas_est = _to_int(est["gas"])
            gas_limit = math.ceil(gas_est * GAS_SAFETY_FACTOR)
            gp = mcp.call("get_gas_price", {})
            tools_used.add("get_gas_price")
            gas_price = _to_int(gp["gasPriceWei"])
            cost_wei = gas_limit * gas_price
            receipt["status"] = "PASS"
            receipt["gasEstimate"] = gas_est
            receipt["gasLimit"] = gas_limit
            receipt["gasPriceWei"] = gas_price
            receipt["predictedCostWei"] = cost_wei
            receipt["predictedCostPHRS"] = cost_wei / WEI_PER_NATIVE
            receipt["revertReason"] = None
            receipt["stateAfterProjected"] = {
                **before,
                "note": "projected from the dry-run call semantics; "
                        "the chain itself is unmodified",
            }
        else:
            reason = revert_reason_from_mcp_error(est["error"])
            # eth_call may have carried the precise reason even if estimate differs
            if receipt.get("callError") and reason in ("", "reverted with no reason"):
                reason = receipt["callError"]
            receipt["status"] = "FAIL"
            receipt["gasEstimate"] = None
            receipt["gasLimit"] = None
            receipt["gasPriceWei"] = None
            receipt["predictedCostWei"] = None
            receipt["predictedCostPHRS"] = None
            receipt["revertReason"] = reason or "reverted (reason not parsed)"
            receipt["stateAfterProjected"] = {
                **before,
                "note": "projected: revert -> state unchanged",
            }

        receipt["stateAfterNote"] = "projection only; chain unmodified by dry-run"
        receipt["mcpToolsCalled"] = sorted(tools_used)
    except Exception as exc:  # noqa: BLE001 - a dry-run must always emit a receipt
        receipt["status"] = "ERROR"
        receipt["error"] = str(exc)
    finally:
        mcp.close()

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(receipt, indent=2) + "\n")

    status = receipt.get("status")
    if status == "PASS":
        print(f"[dry-run] PASS  gas={receipt['gasEstimate']} "
              f"limit(1.2x)={receipt['gasLimit']} "
              f"predictedCost={receipt['predictedCostPHRS']:.8f} {NATIVE_SYMBOL}")
    elif status == "FAIL":
        print(f"[dry-run] FAIL  revert reason: {receipt['revertReason']}")
        print("[dry-run] GATE: execution BLOCKED — no broadcast will be attempted.")
    else:
        print(f"[dry-run] {status}: {receipt.get('error')}")
    print(f"[dry-run] receipt -> {out}")
    return 0 if status in ("PASS", "FAIL") else 1


if __name__ == "__main__":
    raise SystemExit(main())
