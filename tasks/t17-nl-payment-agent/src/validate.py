"""
T17 validator: on-chain / format checks BEFORE any unsigned tx is prepared.

Checks (all read-only, no signing, no key access):
  1. chain-id assertion — must be Atlantic 688689 (mainnet confusion refused)
  2. recipient address format (0x, 40 hex) via `cast to-checksum-address`
  3. recipient is not the zero address
  4. balance sufficiency — deployer balance >= amount + gas cost estimate

Returns a list of findings; `ok` only when all pass.
"""

import subprocess
from dataclasses import dataclass, field

ATLANTIC_CHAIN_ID = 688689
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

NATIVE_TRANSFER_GAS = 21_000


class ValidationError(Exception):
    pass


def _cast(*args, rpc_url, timeout=30) -> str:
    """Run cast read-only. No key material is ever passed to subprocess here."""
    cmd = ["cast", *args, "--rpc-url", rpc_url]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if p.returncode != 0:
        raise ValidationError(f"cast {' '.join(args[:2])} failed: {p.stderr.strip()[:200]}")
    return p.stdout.strip()


def _cast_local(*args, timeout=30) -> str:
    """Run a cast subcommand that takes no --rpc-url (pure local computation)."""
    cmd = ["cast", *args]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if p.returncode != 0:
        raise ValidationError(f"cast {' '.join(args[:2])} failed: {p.stderr.strip()[:200]}")
    return p.stdout.strip()


@dataclass
class ValidationReport:
    ok: bool
    chain_id: int | None = None
    recipient: str = ""
    recipient_checksummed: str = ""
    balance_wei: int = 0
    gas_price_wei: int = 0
    gas_limit: int = NATIVE_TRANSFER_GAS
    max_fee_wei: int = 0
    amount_wei: int = 0
    total_cost_wei: int = 0
    findings: list = field(default_factory=list)


def validate(plan: dict, deployer: str, rpc_url: str) -> ValidationReport:
    r = ValidationReport(ok=False)
    findings = r.findings

    # 1. chain-id assertion — the firewall against mainnet confusion
    chain_id = int(_cast("chain-id", rpc_url=rpc_url))
    r.chain_id = chain_id
    if chain_id != ATLANTIC_CHAIN_ID:
        findings.append(
            f"REFUSED: connected chain id is {chain_id}, not Atlantic "
            f"({ATLANTIC_CHAIN_ID}). Aborting — this agent never operates on mainnet.")
        return r
    findings.append(f"chain-id OK: {chain_id} (Atlantic testnet)")

    # 2. recipient format
    to = plan["to"]
    if to.lower() == ZERO_ADDRESS:
        findings.append("REFUSED: recipient is the zero address.")
        return r
    try:
        # foundry 1.8.x names this subcommand `to-check-sum-address`;
        # it is a pure local computation (no --rpc-url accepted).
        checksummed = _cast_local("to-check-sum-address", to)
    except ValidationError:
        findings.append(f"REFUSED: '{to}' is not a valid 0x address.")
        return r
    r.recipient = to
    r.recipient_checksummed = checksummed
    findings.append(f"recipient OK: {checksummed}")

    # 3. balance sufficiency (amount + gas)
    amount_wei = int(plan["amount_wei"])
    r.amount_wei = amount_wei
    balance = int(_cast("balance", deployer, rpc_url=rpc_url))
    r.balance_wei = balance
    gas_price = int(_cast("gas-price", rpc_url=rpc_url))
    r.gas_price_wei = gas_price
    max_fee = gas_price * NATIVE_TRANSFER_GAS
    r.max_fee_wei = max_fee
    total = amount_wei + max_fee
    r.total_cost_wei = total
    findings.append(
        f"balance: {balance} wei ({balance/1e18:.6f} PHRS); "
        f"amount {amount_wei} wei + est. fee {max_fee} wei = {total} wei")
    if balance < total:
        findings.append(
            f"REFUSED: insufficient balance — need {total} wei, have {balance} wei.")
        return r
    findings.append("balance OK: amount + estimated fee covered")

    r.ok = True
    return r


def report_to_dict(r: ValidationReport) -> dict:
    return {
        "ok": r.ok,
        "chain_id": r.chain_id,
        "recipient": r.recipient,
        "recipient_checksummed": r.recipient_checksummed,
        "balance_wei": str(r.balance_wei),
        "gas_price_wei": str(r.gas_price_wei),
        "gas_limit": r.gas_limit,
        "max_fee_wei": str(r.max_fee_wei),
        "amount_wei": str(r.amount_wei),
        "total_cost_wei": str(r.total_cost_wei),
        "findings": r.findings,
    }
