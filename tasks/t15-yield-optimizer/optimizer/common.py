"""Shared read-only RPC helpers for the T15 Yield Optimizer.

READ-ONLY by construction: this module never signs, never broadcasts, never
touches secret key material. All reads go through `cast` subprocess calls.
"""
import json
import subprocess

CHAIN_ID = 688689
EXPLORER_TX = "https://atlantic.pharosscan.xyz/tx/"

# OctopusVault view selectors (verified against src/OctopusVault.sol ABI)
SIGS = {
    "name": "name()(string)",
    "rewardPerBlock": "rewardPerBlock()(uint256)",
    "entryFeeBps": "entryFeeBps()(uint256)",
    "exitFeeBps": "exitFeeBps()(uint256)",
    "minHoldBlocks": "minHoldBlocks()(uint256)",
    "totalStaked": "totalStaked()(uint256)",
    "rewardPool": "rewardPool()(uint256)",
    "runwayBlocks": "runwayBlocks()(uint256)",
    "startBlock": "startBlock()(uint256)",
    "pendingReward": "pendingReward(address)(uint256)",
    "staked": "staked(address)(uint256)",
    "stake": "stake()",
    "claim": "claim()",
}


def _rpc_url():
    import os
    url = os.environ.get("ATLANTIC_RPC_URL")
    if not url:
        raise RuntimeError("ATLANTIC_RPC_URL not set (source ~/workspace/lightkeeper/.env)")
    return url


def _cast(*args):
    out = subprocess.run(
        ["cast", *args, "--rpc-url", _rpc_url()],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"cast {' '.join(args)} failed: {out.stderr.strip()}")
    return out.stdout.strip()


def chain_id():
    return int(_cast("chain-id"))


def block_number():
    return int(_cast("block-number"))


def block_timestamp(block):
    return int(_cast("block", str(block), "timestamp"))


def gas_price_wei():
    return int(_cast("gas-price"))


def code_len(address):
    res = rpc_batch([("eth_getCode", [address, "latest"])])[0]
    return max(0, (len(res) - 2) // 2)


def call_view(address, sig, args=(), block="latest"):
    """eth_call a view function at a pinned block; returns decoded value string."""
    cmd = ["call", address, sig, *args, "--block", str(block)]
    return _cast(*cmd)


def call_uint(address, sig, args=(), block="latest"):
    return int(call_view(address, sig, args, block))


def balance_wei(address, block="latest"):
    return int(_cast("balance", address, "--block", str(block)))


def estimate_gas(to, sig, value_wei=0, from_addr=None):
    args = ["estimate", to, sig]
    if value_wei:
        args += ["--value", str(value_wei)]
    if from_addr:
        args += ["--from", from_addr]
    return int(_cast(*args))


def measured_block_time_s(samples=5):
    """Measure mean block time from the last `samples` blocks. Never assumed."""
    latest = block_number()
    ts = [block_timestamp(b) for b in range(latest - samples, latest + 1)]
    deltas = [b - a for a, b in zip(ts, ts[1:]) if b > a]
    return sum(deltas) / len(deltas) if deltas else None


def rpc_batch(requests):
    """Send a JSON-RPC batch in ONE http roundtrip.

    requests: list of (method, params). Returns list of results in order.
    Uses only the stdlib (urllib) — no new dependencies.
    """
    import urllib.request
    payload = json.dumps([
        {"jsonrpc": "2.0", "id": i, "method": m, "params": p}
        for i, (m, p) in enumerate(requests)
    ]).encode()
    req = urllib.request.Request(
        _rpc_url(), data=payload,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as resp:
        items = json.loads(resp.read().decode())
    by_id = {}
    for it in items:
        if "error" in it:
            raise RuntimeError(f"batch rpc error: {it['error']}")
        by_id[it["id"]] = it["result"]
    return [by_id[i] for i in range(len(requests))]


def _cast_local(*args):
    """cast without --rpc-url (pure offline computations: sig, calldata, keccak)."""
    out = subprocess.run(["cast", *args], capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(f"cast {' '.join(args)} failed: {out.stderr.strip()}")
    return out.stdout.strip()


def batch_calldata(sig, *args):
    """Build calldata OFFLINE (no RPC). No-arg sigs via `cast sig`, else `cast calldata`."""
    if args:
        return _cast_local("calldata", sig, *args).strip()
    return _cast_local("sig", sig).strip()
