"""T19 CLI: invoice-to-payment agent.

Usage:
  python3 -m agent.cli parse   <invoice-file> [--format json|csv|txt]
  python3 -m agent.cli review  <invoice-file> [--format json|csv|txt]
  python3 -m agent.cli pay     <invoice-file> [--format json|csv|txt] [--confirm INVOICE_ID]
  python3 -m agent.cli stamps

Env: ATLANTIC_RPC_URL, DEPLOYER_PRIVATE_KEY, DEPLOYER_ADDRESS.
Secrets are read from env only — never printed, never committed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent.parsers import InvoiceError, parse  # noqa: E402
from agent.pay import DoublePaymentRefused, broadcast_payment, load_stamps  # noqa: E402
from agent.planner import (  # noqa: E402
    build_payment_plan,
    build_unsigned_tx,
    envelope_json,
    render_review,
)


def _env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise SystemExit(f"missing required env var {name}")
    return val


def cmd_parse(args) -> int:
    try:
        inv = parse(Path(args.invoice).read_text(), args.format)
    except InvoiceError as exc:
        print(f"FLAGGED: {exc}")
        return 2
    plan = build_payment_plan(inv)
    print(json.dumps(plan, indent=2))
    return 0


def cmd_review(args) -> int:
    try:
        inv = parse(Path(args.invoice).read_text(), args.format)
    except InvoiceError as exc:
        print(f"FLAGGED: {exc}")
        return 2
    plan = build_payment_plan(inv)
    print(render_review(plan))
    rpc = _env("ATLANTIC_RPC_URL")
    from_addr = _env("DEPLOYER_ADDRESS")
    try:
        envelope = build_unsigned_tx(plan, rpc, from_addr)
    except RuntimeError as exc:
        print(f"unsigned-tx build failed (chain unreachable?): {exc}")
        return 3
    print()
    print("UNSIGNED TX (not broadcast — invoice reference bound as metadata):")
    print(envelope_json(envelope))
    return 0


def cmd_pay(args) -> int:
    try:
        inv = parse(Path(args.invoice).read_text(), args.format)
    except InvoiceError as exc:
        print(f"FLAGGED: {exc}")
        return 2
    plan = build_payment_plan(inv)
    print(render_review(plan))
    print()
    try:
        result = broadcast_payment(
            plan,
            rpc_url=_env("ATLANTIC_RPC_URL"),
            private_key=_env("DEPLOYER_PRIVATE_KEY"),
            confirm_token=args.confirm,
        )
    except DoublePaymentRefused as exc:
        print(str(exc))
        return 4
    except RuntimeError as exc:
        print(f"PAYMENT FAILED: {exc}")
        return 5
    if result["status"] == "confirmation-required":
        print(result["message"])
        return 1
    rec = result["record"]
    print(f"PAID: {rec['amount_phrs']} PHRS -> {rec['payee']}")
    print(f"  tx: {rec['tx_hash']}")
    print(f"  explorer: {rec['explorer']}")
    print(f"  paid-stamp appended (invoice '{rec['invoice_id']}' is now final)")
    return 0


def cmd_stamps(_args) -> int:
    stamps = load_stamps()
    if not stamps:
        print("no paid stamps yet")
        return 0
    for inv_id, rec in stamps.items():
        print(f"{inv_id}: {rec['amount_phrs']} PHRS -> {rec['payee']} "
              f"tx {rec['tx_hash']} ({rec['paid_at_utc']})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="T19 invoice-to-payment agent")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("parse", "review", "pay"):
        p = sub.add_parser(name)
        p.add_argument("invoice")
        p.add_argument("--format", choices=["json", "csv", "txt"], default=None)
        if name == "pay":
            p.add_argument("--confirm", default=None)
    sub.add_parser("stamps")
    args = ap.parse_args()
    if args.cmd == "parse":
        return cmd_parse(args)
    if args.cmd == "review":
        return cmd_review(args)
    if args.cmd == "pay":
        return cmd_pay(args)
    return cmd_stamps(args)


if __name__ == "__main__":
    raise SystemExit(main())
