#!/usr/bin/env python3
"""
TIDE — Recurring Payment Agent (T18, LIGHTKEEPER)

A schedule-driven, idempotent payment agent for Pharos Atlantic testnet.

One cron tick (or manual run) performs AT MOST ONE due installment as a real
on-chain native-PHRS transfer. Idempotency is enforced at two levels:

  1. Local state (state/state.jsonl): an installment moves to `paid` only after
     an observed on-chain receipt with status 0x1. Any later tick sees the
     `paid` record and SKIPS — it never re-broadcasts.
  2. Chain verification on recovery: a `broadcast` record (tx sent, process
     died before receipt was recorded) is reconciled via `cast receipt`
     before any decision is made. An on-chain success becomes `paid`; an
     on-chain revert becomes `failed` (safe to retry — nothing was paid);
     an unknown tx hash is left as `broadcast-unknown` and NEVER auto-retried.

SkillEngine has NO native cron/scheduling (confirmed-absent primitive G1).
The external scheduler is the operator's system cron — see
scripts/install-cron.sh (instructions only, installs nothing itself).

Level-triggered design: it is safe to run `tick` every minute; only due,
unpaid installments are ever paid, exactly once.

Env (from repo-root .env, never committed):
  ATLANTIC_RPC_URL, DEPLOYER_PRIVATE_KEY
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

# ---------------------------------------------------------------- constants

TASK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(TASK_DIR, "config", "schedule.json")
STATE_PATH = os.path.join(TASK_DIR, "state", "state.jsonl")
AUDIT_PATH = os.path.join(TASK_DIR, "state", "audit.log")
NONCE_LOCK = "/tmp/lk-nonce.lock"

ATLANTIC_CHAIN_ID = 688689
EXPLORER_TX = "https://atlantic.pharosscan.xyz/tx/"

INTERVAL_SECONDS = {
    "weekly": 7 * 24 * 3600,
    "monthly": 30 * 24 * 3600,  # 30-day month, documented (calendar months vary)
}

NATIVE_TRANSFER_GAS = 21000
ADDR_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")


class TideError(Exception):
    pass


# ---------------------------------------------------------------- utilities

def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_ts(s: str) -> int:
    """ISO-8601 (or epoch int/str) -> epoch seconds. 'Z' suffix handled."""
    if isinstance(s, (int, float)):
        return int(s)
    t = str(s).strip()
    if t.isdigit():
        return int(t)
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    return int(datetime.fromisoformat(t).timestamp())


def fmt_ts(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat(timespec="seconds")


def run(cmd, timeout=120, check=False):
    """Run a subprocess; never log argv containing the private key."""
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and p.returncode != 0:
        raise TideError(f"command failed ({p.returncode}): {p.stderr.strip()[:300]}")
    return p


def cast(*args, timeout=120):
    return run(["cast", *args], timeout=timeout)


def audit(msg: str):
    os.makedirs(os.path.dirname(AUDIT_PATH), exist_ok=True)
    with open(AUDIT_PATH, "a") as f:
        f.write(f"{utcnow_iso()} {msg}\n")


# ---------------------------------------------------------------- schedule

def load_schedule() -> dict:
    if not os.path.exists(CONFIG_PATH):
        raise TideError(f"schedule file missing: {CONFIG_PATH}")
    with open(CONFIG_PATH) as f:
        sched = json.load(f)
    # minimal schema validation
    for field in ("schedule_id", "recipient", "amount_phrs", "interval", "start_time", "max_runs"):
        if field not in sched:
            raise TideError(f"schedule.json missing required field: {field}")
    if not ADDR_RE.match(sched["recipient"]):
        raise TideError(f"invalid recipient address: {sched['recipient']}")
    if sched.get("token_type", "native") != "native":
        raise TideError("only native PHRS transfers are supported by this agent")
    try:
        amt = float(sched["amount_phrs"])
    except (TypeError, ValueError):
        raise TideError(f"amount_phrs is not numeric: {sched['amount_phrs']}")
    if amt <= 0:
        raise TideError("amount_phrs must be > 0")
    if sched["interval"] not in INTERVAL_SECONDS:
        raise TideError(f"interval must be one of {list(INTERVAL_SECONDS)}")
    if int(sched["max_runs"]) <= 0:
        raise TideError("max_runs must be >= 1")
    return sched


def save_schedule(sched: dict):
    with open(CONFIG_PATH, "w") as f:
        json.dump(sched, f, indent=2)
        f.write("\n")


def installment_due_at(sched: dict, n: int) -> int:
    return parse_ts(sched["start_time"]) + n * INTERVAL_SECONDS[sched["interval"]]


# ---------------------------------------------------------------- state

def load_state() -> list:
    records = []
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return records


def append_state(rec: dict):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    rec = {"ts": utcnow_iso(), **rec}
    with open(STATE_PATH, "a") as f:
        f.write(json.dumps(rec) + "\n")
    return rec


def records_for(records: list, schedule_id: str, n: int) -> list:
    return [r for r in records
            if r.get("schedule_id") == schedule_id and r.get("installment") == n]


def latest_status(records: list, schedule_id: str, n: int):
    """Newest terminal-ish status for an installment, or None."""
    rs = records_for(records, schedule_id, n)
    if not rs:
        return None
    # paid is terminal; failed-broadcast-unknown blocks auto-retry
    order = {"paid": 3, "broadcast-unknown": 2, "failed": 1, "broadcast": 1, "skipped": 0}
    rs_sorted = sorted(rs, key=lambda r: (order.get(r.get("status"), 0),
                                          r.get("ts", "")))
    return rs_sorted[-1]["status"]


# ---------------------------------------------------------------- chain ops

def env_or_die(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise TideError(f"env var {name} is not set — source the repo .env first")
    return v


def chain_id(rpc: str) -> int:
    p = cast("chain-id", "--rpc-url", rpc)
    if p.returncode != 0:
        raise TideError(f"could not read chain id: {p.stderr.strip()[:200]}")
    return int(p.stdout.strip())


def wallet_address() -> str:
    key = env_or_die("DEPLOYER_PRIVATE_KEY")
    p = cast("wallet", "address", "--private-key", key)
    if p.returncode != 0:
        raise TideError("could not derive wallet address from DEPLOYER_PRIVATE_KEY")
    return p.stdout.strip()


def balance_wei(rpc: str, addr: str) -> int:
    p = cast("balance", addr, "--rpc-url", rpc)
    if p.returncode != 0:
        raise TideError(f"could not read balance: {p.stderr.strip()[:200]}")
    return int(p.stdout.strip())


def gas_price_wei(rpc: str) -> int:
    p = cast("gas-price", "--rpc-url", rpc)
    if p.returncode != 0:
        raise TideError(f"could not read gas price: {p.stderr.strip()[:200]}")
    return int(p.stdout.strip())


def amount_to_wei(amount_phrs: str) -> int:
    p = cast("to-wei", str(amount_phrs), "ether")
    if p.returncode != 0:
        raise TideError(f"bad amount for to-wei: {amount_phrs}")
    return int(p.stdout.strip())


def tx_status(rpc: str, tx_hash: str):
    """Return (status, block_number) or (None, None) if the tx is unknown."""
    p = cast("receipt", tx_hash, "--rpc-url", rpc, "--json")
    if p.returncode != 0:
        return None, None
    try:
        r = json.loads(p.stdout)
    except json.JSONDecodeError:
        return None, None
    status = r.get("status")
    block = r.get("blockNumber")
    return status, (int(block, 16) if isinstance(block, str) else block)


def broadcast_native(rpc: str, key: str, to: str, amount_wei: int) -> str:
    """
    Broadcast ONE native transfer under the shared nonce flock.
    cast waits for the receipt by default; returns the tx hash.
    """
    cmd = ["flock", NONCE_LOCK, "cast", "send", to,
           "--value", str(amount_wei),
           "--rpc-url", rpc, "--private-key", key, "--json"]
    p = run(cmd, timeout=300)
    if p.returncode != 0:
        raise TideError(f"broadcast failed: {p.stderr.strip()[:400]}")
    try:
        out = json.loads(p.stdout)
    except json.JSONDecodeError:
        raise TideError(f"broadcast returned non-JSON: {p.stdout.strip()[:200]}")
    tx_hash = out.get("transactionHash") or out.get("transaction_hash")
    if not tx_hash:
        raise TideError(f"broadcast gave no tx hash: {p.stdout.strip()[:200]}")
    return tx_hash

# ---------------------------------------------------------------- decisions

def due_installment(sched: dict, records: list, now: int):
    """
    Return the earliest installment number that is (a) past its due time,
    (b) within max_runs / expiry, and (c) not in a terminal state.
    Returns None when nothing is actionable.
    Terminal: paid. Retryable: failed (nothing was paid on-chain).
    Blocked: broadcast-unknown (needs human eyes, never auto-retried).
    """
    sid = sched["schedule_id"]
    max_runs = int(sched["max_runs"])
    expires = sched.get("stop_conditions", {}).get("expires_at")
    if expires and now > parse_ts(expires):
        return None  # stop condition: schedule expired — nothing further payable
    for n in range(max_runs):
        due_at = installment_due_at(sched, n)
        if expires and due_at > parse_ts(expires):
            return None  # beyond expiry: nothing further is actionable
        st = latest_status(records, sid, n)
        if st == "paid":
            continue
        if st == "broadcast-unknown":
            return None  # unresolved broadcast — human must reconcile first
        if now >= due_at:
            return n
    return None


def check_control(sched: dict):
    ctrl = sched.get("control", {})
    if ctrl.get("cancelled"):
        return "cancelled"
    if ctrl.get("paused"):
        return "paused"
    return None


def validate_payment(sched: dict, rpc: str, sender: str):
    """
    T17-equivalent validation pipeline, run immediately before preparation:
    recipient format, chain id == Atlantic, amount>0, balance covers
    amount + gas AND leaves the configured floor. Raises TideError.
    """
    if not ADDR_RE.match(sched["recipient"]):
        raise TideError(f"invalid recipient: {sched['recipient']}")
    cid = chain_id(rpc)
    if cid != ATLANTIC_CHAIN_ID:
        raise TideError(
            f"CHAIN-ID GUARD: rpc reports {cid}, expected Atlantic {ATLANTIC_CHAIN_ID} "
            f"— refusing to broadcast (mainnet guard)")
    amount_wei = amount_to_wei(sched["amount_phrs"])
    if amount_wei <= 0:
        raise TideError("amount must be > 0 wei")
    gp = gas_price_wei(rpc)
    fee_wei = NATIVE_TRANSFER_GAS * gp
    bal = balance_wei(rpc, sender)
    if bal < amount_wei + fee_wei:
        raise TideError(
            f"INSUFFICIENT BALANCE: have {bal} wei, need {amount_wei + fee_wei} wei "
            f"(amount {amount_wei} + est. fee {fee_wei}) — installment marked failed, "
            f"nothing broadcast")
    floor = sched.get("stop_conditions", {}).get("min_balance_after_phrs")
    if floor is not None:
        floor_wei = amount_to_wei(str(floor))
        if bal - amount_wei < floor_wei:
            raise TideError(
                f"BALANCE FLOOR: payment would leave {bal - amount_wei} wei, "
                f"below floor {floor_wei} wei — installment marked failed, nothing broadcast")
    return amount_wei, fee_wei, bal


# ---------------------------------------------------------------- tick

def cmd_tick(_args):
    rpc = env_or_die("ATLANTIC_RPC_URL")
    key = env_or_die("DEPLOYER_PRIVATE_KEY")
    sched = load_schedule()
    sid = sched["schedule_id"]

    blocked = check_control(sched)
    if blocked:
        msg = f"SKIP: schedule '{sid}' is {blocked} — no tick performed"
        print(msg)
        audit(f"tick {sid}: skipped ({blocked})")
        append_state({"schedule_id": sid, "installment": None,
                      "status": "skipped", "note": blocked})
        return 0

    records = load_state()
    now = int(time.time())

    # Reconcile any dangling `broadcast` records before deciding (crash recovery).
    for r in [x for x in records
              if x.get("schedule_id") == sid and x.get("status") == "broadcast"]:
        h = r.get("tx_hash")
        status, block = tx_status(rpc, h) if h else (None, None)
        n = r.get("installment")
        if status in ("0x1", "1", 1):
            append_state({"schedule_id": sid, "installment": n, "status": "paid",
                          "tx_hash": h, "block": block,
                          "amount_phrs": sched["amount_phrs"],
                          "recipient": sched["recipient"],
                          "note": "reconciled after restart: on-chain success"})
            print(f"RECOVERED: installment {n} already paid on-chain ({EXPLORER_TX}{h})")
            audit(f"tick {sid}: recovered installment {n} as paid ({h})")
        elif status in ("0x0", "0", 0):
            append_state({"schedule_id": sid, "installment": n, "status": "failed",
                          "tx_hash": h, "note": "reconciled after restart: on-chain revert"})
            print(f"RECOVERED: installment {n} reverted on-chain ({h}) — marked failed")
            audit(f"tick {sid}: recovered installment {n} as failed ({h})")
        else:
            append_state({"schedule_id": sid, "installment": n, "status": "broadcast-unknown",
                          "tx_hash": h,
                          "note": "tx hash not found on chain — operator must reconcile manually; auto-retry DISABLED"})
            print(f"WARNING: installment {n} broadcast {h} not found on chain — "
                  f"marked broadcast-unknown, auto-retry disabled")
            audit(f"tick {sid}: installment {n} broadcast-unknown ({h})")
        records = load_state()  # refresh after reconciliation

    n = due_installment(sched, records, now)
    if n is None:
        nxt = next_payment(sched, records, now)
        msg = ("SKIP: no installment due" +
               (f" — next payment: installment {nxt[0]} at {fmt_ts(nxt[1])}" if nxt
                else " — schedule complete/exhausted"))
        print(msg)
        audit(f"tick {sid}: no installment due")
        return 0

    due_at = installment_due_at(sched, n)
    sender = wallet_address()

    # Validation BEFORE any broadcast (never double-pay on validation failure).
    try:
        amount_wei, fee_wei, bal = validate_payment(sched, rpc, sender)
    except TideError as e:
        append_state({"schedule_id": sid, "installment": n, "due_at": fmt_ts(due_at),
                      "status": "failed", "amount_phrs": sched["amount_phrs"],
                      "recipient": sched["recipient"], "note": str(e)})
        print(f"FAILED: installment {n} — {e}")
        audit(f"tick {sid}: installment {n} failed ({str(e)[:120]})")
        return 2

    print(f"TICK: installment {n} due (due {fmt_ts(due_at)}) — "
          f"paying {sched['amount_phrs']} PHRS to {sched['recipient']}")
    audit(f"tick {sid}: broadcasting installment {n} "
          f"({sched['amount_phrs']} PHRS -> {sched['recipient']})")

    try:
        tx_hash = broadcast_native(rpc, key, sched["recipient"], amount_wei)
    except TideError as e:
        append_state({"schedule_id": sid, "installment": n, "due_at": fmt_ts(due_at),
                      "status": "failed", "amount_phrs": sched["amount_phrs"],
                      "recipient": sched["recipient"], "note": str(e)})
        print(f"FAILED: installment {n} broadcast error — {e}")
        audit(f"tick {sid}: installment {n} broadcast error")
        return 2

    # cast waited for the receipt; verify it explicitly before marking paid.
    status, block = tx_status(rpc, tx_hash)
    if status in ("0x1", "1", 1):
        append_state({"schedule_id": sid, "installment": n, "due_at": fmt_ts(due_at),
                      "status": "paid", "tx_hash": tx_hash, "block": block,
                      "amount_phrs": sched["amount_phrs"], "recipient": sched["recipient"],
                      "fee_wei": str(fee_wei),
                      "note": "observed on-chain, status 0x1"})
        print(f"PAID: installment {n} -> {EXPLORER_TX}{tx_hash} (block {block})")
        audit(f"tick {sid}: installment {n} PAID {tx_hash} block {block}")
        return 0
    else:
        append_state({"schedule_id": sid, "installment": n, "due_at": fmt_ts(due_at),
                      "status": "failed", "tx_hash": tx_hash,
                      "amount_phrs": sched["amount_phrs"], "recipient": sched["recipient"],
                      "note": f"on-chain status {status} — reverted, nothing paid"})
        print(f"FAILED: installment {n} reverted on-chain ({tx_hash})")
        audit(f"tick {sid}: installment {n} reverted {tx_hash}")
        return 2


def next_payment(sched: dict, records: list, now: int):
    """(installment, due_epoch) of the next unpaid future installment, or None."""
    sid = sched["schedule_id"]
    for n in range(int(sched["max_runs"])):
        if latest_status(records, sid, n) == "paid":
            continue
        due_at = installment_due_at(sched, n)
        if due_at > now:
            return n, due_at
    return None


# ---------------------------------------------------------------- status

def cmd_status(_args):
    sched = load_schedule()
    sid = sched["schedule_id"]
    records = load_state()
    now = int(time.time())
    print(f"== TIDE schedule '{sid}' ==")
    print(f"  label      : {sched.get('label', '-')}")
    print(f"  recipient  : {sched['recipient']}")
    print(f"  amount     : {sched['amount_phrs']} PHRS (native)")
    print(f"  interval   : {sched['interval']} "
          f"({INTERVAL_SECONDS[sched['interval']]}s)")
    print(f"  max_runs   : {sched['max_runs']}")
    print(f"  control    : paused={sched.get('control', {}).get('paused', False)} "
          f"cancelled={sched.get('control', {}).get('cancelled', False)}")
    print(f"  stop conds : {json.dumps(sched.get('stop_conditions', {}))}")
    blocked = check_control(sched)
    print()
    print("  # | due_at (UTC)           | status            | tx / note")
    print("  --+------------------------+-------------------+----------")
    for n in range(int(sched["max_runs"])):
        due_at = installment_due_at(sched, n)
        st = latest_status(records, sid, n)
        if st is None:
            st = blocked.upper() if blocked else ("DUE" if now >= due_at else "scheduled")
        detail = ""
        rs = [r for r in records_for(records, sid, n) if r.get("status") == st]
        if rs and rs[-1].get("tx_hash"):
            detail = EXPLORER_TX + rs[-1]["tx_hash"]
        elif rs and rs[-1].get("note"):
            detail = rs[-1]["note"][:60]
        print(f"  {n} | {fmt_ts(due_at)} | {st:<17} | {detail}")
    print()
    if blocked:
        print(f"  NEXT PAYMENT: none (schedule {blocked})")
    else:
        nxt = next_payment(sched, records, now)
        if nxt:
            print(f"  NEXT PAYMENT: installment {nxt[0]} at {fmt_ts(nxt[1])} UTC")
        else:
            print("  NEXT PAYMENT: none (schedule complete or exhausted)")
    return 0


# ---------------------------------------------------------------- control

def set_control(paused: bool, cancelled: bool, verb: str):
    sched = load_schedule()
    ctrl = sched.setdefault("control", {})
    ctrl["paused"] = paused
    ctrl["cancelled"] = cancelled
    save_schedule(sched)
    sid = sched["schedule_id"]
    append_state({"schedule_id": sid, "installment": None,
                  "status": "skipped", "note": f"operator: {verb}"})
    audit(f"operator {verb} schedule {sid}")
    print(f"OK: schedule '{sid}' {verb}")
    return 0


def cmd_pause(_a):   return set_control(True, False, "paused")
def cmd_resume(_a):  return set_control(False, False, "resumed")
def cmd_cancel(_a):  return set_control(False, True, "cancelled")


# ---------------------------------------------------------------- main

def main(argv=None):
    ap = argparse.ArgumentParser(prog="tide.py",
                                 description="TIDE — recurring payment agent (T18)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("tick", help="pay the single due installment, if any (idempotent)")
    sub.add_parser("status", help="payment history + next scheduled payment")
    sub.add_parser("history", help="alias of status")
    sub.add_parser("pause", help="pause the schedule (ticks skip)")
    sub.add_parser("resume", help="resume a paused schedule")
    sub.add_parser("cancel", help="cancel the schedule permanently")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "tick":
            return cmd_tick(args)
        if args.cmd in ("status", "history"):
            return cmd_status(args)
        if args.cmd == "pause":
            return cmd_pause(args)
        if args.cmd == "resume":
            return cmd_resume(args)
        if args.cmd == "cancel":
            return cmd_cancel(args)
    except TideError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        audit(f"error: {e}")
        return 3
    except FileNotFoundError as e:
        print(f"ERROR: required binary missing ({e}) — is foundry on PATH?", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
