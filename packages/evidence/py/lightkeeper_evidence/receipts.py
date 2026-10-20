"""@lightkeeper/evidence — independently verifiable receipts (WS3 bet A).

A receipt is a canonical-JSON envelope over:

* inputs (the human/agent intent, with any secrets redacted),
* the exact MCP payloads sent and received,
* the pinned block the reads were pinned to,
* the endpoint + MCP server version + repo commit that produced it,

which is then:

1. hashed with Keccak-256 (pure Python here — the same hash the EVM uses),
2. signed under EIP-191 ("Ethereum Signed Message") with an evidence key
   (secp256k1 ECDSA, RFC-6979 deterministic, pure Python),
3. (optionally) anchored on-chain in a dust transaction carrying the hash.

The verifier (:mod:`lightkeeper_evidence.verify`) recomputes the hash from
the receipt, recovers the signer address from the signature, opens the
anchor transaction when one exists, and RE-ISSUES the recorded MCP calls at
the pinned block, diffing the fresh results against the recorded ones.

The signing/anchor machinery is FULLY implemented; the key is injected via
environment only (``LK_EVIDENCE_KEY``). No key in this tree ships with the
code. Nothing broadcasts without a key: when no key is configured the
anchor field is labelled ``"ABSENT"`` (a real state), never a placeholder
tx hash. The anchor target is the Atlantic testnet (chain 688689) — mainnet
anchoring needs an explicit founder order.

Stdlib only. No eth_keys, no web3, no keccak package.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from dataclasses import dataclass

from . import redact  # noqa: F401  (re-exported for callers)

RECEIPT_VERSION = "lk-receipt/1"
ANCHOR_CHAIN_ID = 688689  # Atlantic testnet — never mainnet without founder word
ANCHOR_LABEL_ABSENT = "ABSENT"
ATLANTIC_RPC_URL = "https://atlantic.dplabs-internal.com"


# --------------------------------------------------------------------------
# Canonical JSON
# --------------------------------------------------------------------------

def canonical_json(obj: dict) -> bytes:
    """Deterministic encoding: sorted keys, no whitespace, UTF-8.

    The ONLY serialization allowed for hashing. If this changes, receipt
    hashes change — which is exactly why the verifier recomputes from the
    same function.
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


# --------------------------------------------------------------------------
# Keccak-256 (pure Python, EIP- compatible: NOT the NIST SHA3 variant)
# --------------------------------------------------------------------------

_KECCAK_ROUND_CONSTANTS = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A,
    0x8000000080008000, 0x000000000000808B, 0x0000000080000001,
    0x8000000080008081, 0x8000000000008009, 0x000000000000008A,
    0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
    0x8000000000008003, 0x8000000000008002, 0x8000000000000080,
    0x000000000000800A, 0x800000008000000A, 0x8000000080008081,
    0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]

_KECCAK_ROTATION_OFFSETS = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
]


def _rotl64(x: int, n: int) -> int:
    n %= 64
    return ((x << n) | (x >> (64 - n))) & 0xFFFFFFFFFFFFFFFF


def _keccak_f1600(state: list[int]) -> None:
    """The Keccak-f[1600] permutation, in place over 25 64-bit lanes."""
    mask = 0xFFFFFFFFFFFFFFFF
    for rc in _KECCAK_ROUND_CONSTANTS:
        # theta
        c = [state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]
             for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rotl64(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] = (state[x + 5 * y] ^ d[x]) & mask
        # rho + pi
        b = [0] * 25
        for x in range(5):
            for y in range(5):
                b[y + 5 * ((2 * x + 3 * y) % 5)] = _rotl64(
                    state[x + 5 * y], _KECCAK_ROTATION_OFFSETS[x][y])
        # chi
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] = (b[x + 5 * y]
                                    ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y])
                                    ) & mask
        state[0] ^= rc


def keccak256(data: bytes) -> bytes:
    """Keccak-256 digest of ``data`` (Ethereum keccak, not NIST SHA3-256)."""
    rate = 136  # bytes per block for 256-bit output
    state = [0] * 25
    # padding: 0x01 ... 0x80 (keccak pad10*1)
    padded = bytearray(data)
    padded.append(0x01)
    while len(padded) % rate != rate - 1:
        padded.append(0x00)
    padded.append(0x80)
    for off in range(0, len(padded), rate):
        block = padded[off:off + rate]
        for i in range(0, rate, 8):
            lane = int.from_bytes(block[i:i + 8], "little")
            state[i // 8] ^= lane
        _keccak_f1600(state)
    return b"".join(state[i].to_bytes(8, "little") for i in range(4))


def keccak256_hex(data: bytes) -> str:
    return keccak256(data).hex()


# --------------------------------------------------------------------------
# secp256k1 ECDSA (pure Python): RFC-6979 sign + public-key recovery
# --------------------------------------------------------------------------

_SECP256K1_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
_SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
_SECP256K1_GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
_SECP256K1_GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8


def _inv_mod(a: int, m: int) -> int:
    return pow(a, m - 2, m)


def _point_add(p1, p2):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and (y1 + y2) % _SECP256K1_P == 0:
        return None
    if p1 == p2:
        lam = (3 * x1 * x1) * _inv_mod(2 * y1, _SECP256K1_P) % _SECP256K1_P
    else:
        lam = (y2 - y1) * _inv_mod((x2 - x1) % _SECP256K1_P, _SECP256K1_P) % _SECP256K1_P
    x3 = (lam * lam - x1 - x2) % _SECP256K1_P
    y3 = (lam * (x1 - x3) - y1) % _SECP256K1_P
    return (x3, y3)


def _point_mul(k: int, p=(_SECP256K1_GX, _SECP256K1_GY)):
    k %= _SECP256K1_N
    result = None
    addend = p
    while k:
        if k & 1:
            result = _point_add(result, addend)
        addend = _point_add(addend, addend)
        k >>= 1
    return result


def _rfc6979_nonce(priv: bytes, msg_hash: bytes) -> int:
    """Deterministic nonce per RFC 6979 (HMAC-SHA256)."""
    v = b"\x01" * 32
    k = b"\x00" * 32
    k = hmac.new(k, v + b"\x00" + priv + msg_hash, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()
    k = hmac.new(k, v + b"\x01" + priv + msg_hash, hashlib.sha256).digest()
    v = hmac.new(k, v, hashlib.sha256).digest()
    while True:
        v = hmac.new(k, v, hashlib.sha256).digest()
        cand = int.from_bytes(v, "big")
        if 1 <= cand < _SECP256K1_N:
            return cand
        k = hmac.new(k, v + b"\x00", hashlib.sha256).digest()
        v = hmac.new(k, v, hashlib.sha256).digest()


def eip191_hash(receipt_hash: bytes) -> bytes:
    """EIP-191 prefix over the 32-byte receipt hash, then keccak."""
    msg = b"\x19Ethereum Signed Message:\n32" + receipt_hash
    return keccak256(msg)


def sign_receipt_hash(receipt_hash: bytes, privkey: bytes) -> dict:
    """Sign ``receipt_hash`` (EIP-191 wrapped) with a 32-byte private key.

    Returns {"r", "s", "v" (27/28), "signer"} — deterministic (RFC 6979),
    canonical low-s, no randomness. Raises ValueError on a bad key.
    """
    if len(privkey) != 32:
        raise ValueError("private key must be 32 bytes")
    d = int.from_bytes(privkey, "big")
    if not 1 <= d < _SECP256K1_N:
        raise ValueError("private key out of range")
    e = int.from_bytes(eip191_hash(receipt_hash), "big")
    while True:
        k = _rfc6979_nonce(privkey, eip191_hash(receipt_hash))
        r_point = _point_mul(k)
        r = r_point[0] % _SECP256K1_N
        if r == 0:
            continue
        s = (_inv_mod(k, _SECP256K1_N) * (e + d * r)) % _SECP256K1_N
        if s == 0:
            continue
        if s > _SECP256K1_N // 2:  # canonical low-s
            s = _SECP256K1_N - s
        break
    signer = address_from_privkey(privkey)
    for recid in (0, 1):
        if recover_address(receipt_hash, r, s, recid) == signer:
            return {"r": hex(r), "s": hex(s), "v": recid + 27, "signer": signer}
    raise RuntimeError("internal: recovery id not found for own signature")


def _decompress_point(x: int, y_parity: int):
    y_sq = (pow(x, 3, _SECP256K1_P) + 7) % _SECP256K1_P
    y = pow(y_sq, (_SECP256K1_P + 1) // 4, _SECP256K1_P)
    if (y % 2) != y_parity:
        y = _SECP256K1_P - y
    return (x, y)


def recover_address(receipt_hash: bytes, r: int, s: int, recid: int) -> str:
    """Recover the signer address from an EIP-191 signature (pure Python)."""
    e = int.from_bytes(eip191_hash(receipt_hash), "big")
    x = r + (recid // 2) * _SECP256K1_N
    if x >= _SECP256K1_P:
        raise ValueError("invalid recovery id / r")
    r_point = _decompress_point(x, recid % 2)
    r_inv = _inv_mod(r, _SECP256K1_N)
    u1 = (_SECP256K1_N - e % _SECP256K1_N) * r_inv % _SECP256K1_N
    u2 = s * r_inv % _SECP256K1_N
    q = _point_add(_point_mul(u1), _point_mul(u2, r_point))
    if q is None:
        raise ValueError("recovery produced point at infinity")
    return _pubkey_to_address(q)


def _pubkey_to_address(point) -> str:
    x, y = point
    h = keccak256(x.to_bytes(32, "big") + y.to_bytes(32, "big"))
    return "0x" + h[-20:].hex()


def address_from_privkey(privkey: bytes) -> str:
    """EIP-55 non-checksummed (lowercase) address from a 32-byte key."""
    d = int.from_bytes(privkey, "big")
    return _pubkey_to_address(_point_mul(d))


def load_evidence_key() -> bytes | None:
    """Evidence key from the environment ONLY (``LK_EVIDENCE_KEY``).

    Returns None when unset — the receipt machinery ships and works with
    no key; only signing and anchoring are disabled, honestly labelled.
    The value is never printed, logged, or returned anywhere else.
    """
    raw = os.environ.get("LK_EVIDENCE_KEY", "").strip()
    if not raw:
        return None
    raw = raw[2:] if raw.lower().startswith("0x") else raw
    try:
        key = bytes.fromhex(raw)
    except ValueError:
        raise ValueError("LK_EVIDENCE_KEY is not valid hex")
    if len(key) != 32 or not 1 <= int.from_bytes(key, "big") < _SECP256K1_N:
        raise ValueError("LK_EVIDENCE_KEY is not a valid secp256k1 private key")
    return key


# --------------------------------------------------------------------------
# Receipts
# --------------------------------------------------------------------------

@dataclass
class Receipt:
    """A signed, independently verifiable proof envelope."""
    body: dict            # canonical payload (inputs, mcp_payloads, ...)
    receipt_hash: str     # keccak256(canonical_json(body))
    signature: dict | None  # {"r","s","v","signer"} or None
    anchor: dict          # {"status": "ANCHORED"|"ABSENT"|"PENDING", ...}

    def to_dict(self) -> dict:
        return {
            "version": RECEIPT_VERSION,
            "body": self.body,
            "receipt_hash": self.receipt_hash,
            "signature": self.signature,
            "anchor": self.anchor,
        }

    def save(self, path: str) -> None:
        import os as _os
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
        _os.replace(tmp, path)


def build_receipt(inputs: dict, mcp_payloads: list[dict], pinned_block: int,
                  endpoint: str, server_version: str, commit: str,
                  task: str, notes: str = "") -> Receipt:
    """Assemble the canonical receipt body and hash it.

    ``inputs`` are redacted (no secrets land in a receipt). ``mcp_payloads``
    are the exact {"tool","arguments","result"} triples. This function never
    touches a key: it hashes only. Signing is a separate, explicit step.
    """
    body = {
        "version": RECEIPT_VERSION,
        "task": task,
        "inputs": json.loads(redact(json.dumps(inputs, default=str))),
        "mcp_payloads": mcp_payloads,
        "pinned_block": pinned_block,
        "endpoint": endpoint,
        "server_version": server_version,
        "commit": commit,
        "notes": notes,
    }
    receipt_hash = keccak256_hex(canonical_json(body))
    return Receipt(body=body, receipt_hash=receipt_hash, signature=None,
                   anchor={"status": ANCHOR_LABEL_ABSENT,
                           "reason": "no evidence key configured (LK_EVIDENCE_KEY unset) — "
                                     "anchor machinery ready, broadcast founder-gated"})


def sign_receipt(receipt: Receipt, privkey: bytes) -> Receipt:
    """Attach an EIP-191 signature to a built receipt."""
    receipt.signature = sign_receipt_hash(bytes.fromhex(receipt.receipt_hash), privkey)
    return receipt


def anchor_receipt_tx(receipt_hash_hex: str, sender: str) -> dict:
    """Build the anchor transaction (Atlantic testnet) — unsigned, honest.

    The tx carries the raw receipt hash in its data field, prefixed with an
    ASCII tag (``LK-RECEIPT-ANCHOR:``) so the hash is findable in the
    calldata — that is exactly what the dependency-free verifier checks.
    Sending 0 value to the sender's own address is the minimal dust anchor.
    This returns the UNSIGNED transaction object only. Broadcasting happens
    only when a key is configured AND the founder has approved funding —
    ``broadcast_anchor`` enforces that by refusing without
    ``LK_EVIDENCE_KEY``.
    """
    data = "0x" + (b"LK-RECEIPT-ANCHOR:"
                   + bytes.fromhex(receipt_hash_hex)).hex()
    return {
        "chain_id": ANCHOR_CHAIN_ID,
        "to": sender,
        "from": sender,
        "value": "0x0",
        "data": data,
        "receipt_hash": "0x" + receipt_hash_hex,
        "note": "anchor carries receipt hash; broadcast requires LK_EVIDENCE_KEY "
                "and founder approval (Atlantic testnet only)",
    }


def broadcast_anchor(receipt: Receipt, rpc_url: str = ATLANTIC_RPC_URL,
                     wait_timeout_s: int = 300) -> Receipt:
    """Sign and broadcast the anchor tx on the Atlantic testnet. FOUNDER-GATED.

    Without ``LK_EVIDENCE_KEY`` this is a documented no-op: the receipt keeps
    anchor.status == "ABSENT". It NEVER invents a tx hash. With a key
    configured (founder approved + funded), this builds the dust tx, signs
    it (legacy EIP-155, chain 688689, pure Python), submits it via
    ``eth_sendRawTransaction``, waits for the receipt, and records
    anchor.status == "ANCHORED" with the real tx hash and block. Any
    broadcast failure raises — the receipt keeps its previous state and no
    fake ANCHORED record is written.
    """
    key = load_evidence_key()
    if key is None:
        receipt.anchor = {
            "status": ANCHOR_LABEL_ABSENT,
            "reason": "LK_EVIDENCE_KEY unset — founder has not approved a funded "
                      "keypair; receipt is complete and verifiable without the anchor",
        }
        return receipt
    sender = (receipt.signature["signer"] if receipt.signature
              else address_from_privkey(key))
    unsigned = anchor_receipt_tx(receipt.receipt_hash.removeprefix("0x"), sender)
    tx_hash, block = _submit_anchor_tx(unsigned, key, rpc_url=rpc_url,
                                       wait_timeout_s=wait_timeout_s)
    receipt.anchor = {
        "status": "ANCHORED",
        "tx_hash": tx_hash,
        "chain_id": ANCHOR_CHAIN_ID,
        "block": block,
        "rpc_url": rpc_url,
        "data": unsigned["data"],
        "note": "receipt hash embedded in calldata; independently checkable on "
                "the Atlantic explorer",
    }
    return receipt


# --------------------------------------------------------------------------
# Raw transaction broadcast (stdlib only): RLP + EIP-155 signing + JSON-RPC
# --------------------------------------------------------------------------

def _rlp_encode(item) -> bytes:
    if isinstance(item, int):
        if item < 0:
            raise ValueError("negative int in RLP")
        item = b"" if item == 0 else item.to_bytes((item.bit_length() + 7) // 8, "big")
    elif isinstance(item, str):
        item = bytes.fromhex(item[2:] if item.startswith("0x") else item)
    if isinstance(item, bytes):
        if len(item) == 1 and item[0] < 0x80:
            return item
        return _rlp_len(len(item), 0x80) + item
    if isinstance(item, (list, tuple)):
        payload = b"".join(_rlp_encode(x) for x in item)
        return _rlp_len(len(payload), 0xC0) + payload
    raise TypeError(f"cannot RLP-encode {type(item)}")


def _rlp_len(length: int, offset: int) -> bytes:
    if length <= 55:
        return bytes([offset + length])
    len_bytes = length.to_bytes((length.bit_length() + 7) // 8, "big")
    return bytes([offset + 55 + len(len_bytes)]) + len_bytes


def _sign_tx_155(fields: list, chain_id: int, privkey: bytes) -> bytes:
    """Sign a legacy transaction with EIP-155 replay protection (v = recid
    + chainId*2 + 35). ``fields`` = [nonce, gasPrice, gasLimit, to, value,
    data]; returns the RLP of the signed transaction, ready for
    eth_sendRawTransaction."""
    sig_hash = keccak256(_rlp_encode(fields + [chain_id, 0, 0]))
    d = int.from_bytes(privkey, "big")
    e = int.from_bytes(sig_hash, "big")
    k = _rfc6979_nonce(privkey, sig_hash)  # deterministic per RFC 6979
    r_point = _point_mul(k)
    r = r_point[0] % _SECP256K1_N
    if r == 0:
        raise RuntimeError("degenerate nonce (r=0)")
    s = (_inv_mod(k, _SECP256K1_N) * (e + d * r)) % _SECP256K1_N
    if s == 0:
        raise RuntimeError("degenerate nonce (s=0)")
    if s > _SECP256K1_N // 2:  # canonical low-s
        s = _SECP256K1_N - s
    sender = address_from_privkey(privkey)
    for recid in (0, 1):
        # recover on the EIP-191 wrap would be wrong here; verify by checking
        # that recid produces the sender via the raw ECDSA recovery path
        # (recompute pubkey from (r, recid) the same way recover_address does
        # but over sig_hash instead of the EIP-191 wrap)
        q = _recover_pubkey_raw(sig_hash, r, s, recid)
        if q is not None and _pubkey_to_address(q) == sender:
            v = recid + chain_id * 2 + 35
            return _rlp_encode(fields + [v, r, s])
    raise RuntimeError("could not find valid recovery id for tx signature")


def _recover_pubkey_raw(sig_hash: bytes, r: int, s: int, recid: int):
    """Recover the public key point for a raw (non-EIP-191) ECDSA signature."""
    e = int.from_bytes(sig_hash, "big")
    x = r + (recid // 2) * _SECP256K1_N
    if x >= _SECP256K1_P:
        return None
    r_point = _decompress_point(x, recid % 2)
    r_inv = _inv_mod(r, _SECP256K1_N)
    u1 = (_SECP256K1_N - e % _SECP256K1_N) * r_inv % _SECP256K1_N
    u2 = s * r_inv % _SECP256K1_N
    return _point_add(_point_mul(u1), _point_mul(u2, r_point))


def _rpc(rpc_url: str, method: str, params, timeout: int = 60):
    import urllib.request
    import urllib.error
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                          "params": params}).encode("utf-8")
    req = urllib.request.Request(rpc_url, data=payload,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"RPC {method} HTTP {exc.code}: "
                           f"{exc.read()[:300]!r}")
    if body.get("error"):
        raise RuntimeError(f"RPC {method} error: {body['error']}")
    return body.get("result")


def _submit_anchor_tx(unsigned: dict, privkey: bytes, rpc_url: str,
                      wait_timeout_s: int) -> tuple[str, int]:
    """Submit the unsigned anchor tx and wait for its receipt.

    Returns (tx_hash, block_number). Raises on any failure — callers must
    not record ANCHORED unless this returns cleanly.
    """
    sender = address_from_privkey(privkey)
    data_bytes = bytes.fromhex(unsigned["data"].removeprefix("0x"))
    nonce = int(_rpc(rpc_url, "eth_getTransactionCount", [sender, "pending"]), 16)
    gas_price = int(_rpc(rpc_url, "eth_gasPrice", []), 16)
    try:
        gas_limit = int(_rpc(rpc_url, "eth_estimateGas",
                             [{"from": sender, "to": sender,
                               "value": "0x0",
                               "data": unsigned["data"]}]), 16)
    except Exception:
        gas_limit = 100_000  # fallback; unused gas is refunded
    gas_limit = max(gas_limit, 100_000)
    fields = [nonce, gas_price, gas_limit, sender, 0, unsigned["data"]]
    raw = _sign_tx_155(fields, ANCHOR_CHAIN_ID, privkey)
    tx_hash = "0x" + keccak256(raw).hex()
    submitted = _rpc(rpc_url, "eth_sendRawTransaction",
                     ["0x" + raw.hex()])
    if not isinstance(submitted, str) or submitted.lower() != tx_hash.lower():
        raise RuntimeError(f"node returned unexpected tx hash: {submitted!r} "
                           f"(expected {tx_hash})")
    import time
    deadline = time.time() + wait_timeout_s
    while time.time() < deadline:
        receipt = _rpc(rpc_url, "eth_getTransactionReceipt", [tx_hash])
        if receipt:
            status = receipt.get("status")
            block = int(receipt.get("blockNumber", "0x0"), 16)
            if status not in ("0x1", 1):
                raise RuntimeError(f"anchor tx mined with failing status: {status}")
            return tx_hash, block
        time.sleep(5)
    raise TimeoutError(f"anchor tx {tx_hash} not mined within {wait_timeout_s}s")


__all__ = [
    "RECEIPT_VERSION", "ANCHOR_CHAIN_ID", "ANCHOR_LABEL_ABSENT",
    "canonical_json", "keccak256", "keccak256_hex",
    "eip191_hash", "sign_receipt_hash", "recover_address",
    "address_from_privkey", "load_evidence_key", "redact",
    "Receipt", "build_receipt", "sign_receipt",
    "anchor_receipt_tx", "broadcast_anchor",
]
