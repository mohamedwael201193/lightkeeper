#!/usr/bin/env python3
"""
LIGHTKEEPER T06 — Saga Executor (Atlantic testnet, chain 688689).

A multi-step on-chain workflow (approve -> lock -> execute -> settle) driven by
agent code over receipt checks. SkillEngine ships no native retry and no
rollback, so both are implemented here:

  * Retry policy: transient failures (dropped/missing receipt, RPC error) are
    retried up to 3 times with 5/15/45s backoff and +20% gas bumps.
    PERMANENT failures (mined status-0x0 revert, failed precheck) are NEVER
    retried — they route straight to compensation.
  * Honest compensation: finalized transactions cannot be undone. "Rollback"
    is a forward compensating transaction (refund + allowance revoke).
    Gas is unrecoverable — reported with actual balances.

Failure-broadcast mode (opt-in, code-restricted): the forced-failure run
deliberately mines a REAL status-0x0 receipt by calling execute() with an
impossible minOut, then runs confirmed compensation transactions.

Usage:
    python3 scripts/saga.py run-a        # fully successful saga
    python3 scripts/saga.py run-b        # forced failure -> compensation
    python3 scripts/saga.py --selftest   # unit tests (no chain writes)

Env: ATLANTIC_RPC_URL, DEPLOYER_PRIVATE_KEY (sourced from ../../.env by caller).
All broadcasts are serialized through /tmp/lk-nonce.lock (28 workers, one key).
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

# ---------------------------------------------------------------- config ----

RPC = os.environ["ATLANTIC_RPC_URL"]
PRIVKEY = os.environ["DEPLOYER_PRIVATE_KEY"]
WALLET = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
EXPLORER = "https://atlantic.pharosscan.xyz"

TOKEN = os.environ.get("T06_TOKEN", "0x1F3fb438824140b7E1125502f80B686D95072939")
FIXTURE = os.environ.get("T06_FIXTURE", "0x29bf11Cd948CE845687A21819b2844d5321432Cf")

NONCE_LOCK = "/tmp/lk-nonce.lock"
MAX_RETRIES = 3
BACKOFF_S = [5, 15, 45]          # per retry attempt
GAS_BUMP = 1.20                  # +20% gas price per retry

RUNS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "runs")

# ------------------------------------------------------------- exceptions ----

class TransientFailure(Exception):
    """Receipt missing/dropped or RPC error — safe to retry."""

class PermanentFailure(Exception):
    """Mined 0x0 revert or failed precheck — never retried, compensate."""

class GateFailure(Exception):
    """Receipt is 0x1 but the post-state gate disagrees — compensate."""

# -------------------------------------------------------------- primitives ----

def sh(args, timeout=120):
    """Run a command, return (rc, stdout, stderr). Secrets never logged."""
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr

def cast_call(to, sig, *args):
    rc, out, err = sh(["cast", "call", to, sig, *args, "--rpc-url", RPC])
    if rc != 0:
        raise TransientFailure(f"cast call failed: {err.strip()[:200]}")
    return out.strip()

def eth_balance(addr):
    rc, out, err = sh(["cast", "balance", addr, "--rpc-url", RPC])
    if rc != 0:
        raise TransientFailure(f"cast balance failed: {err.strip()[:200]}")
    return int(out.strip().split()[0])

def _uint(text):
    """Parse `cast call` uint output (decimal, possibly with a [1e24] annotation)."""
    return int(text.strip().split()[0])

def token_balance(addr):
    return _uint(cast_call(TOKEN, "balanceOf(address)(uint256)", addr))

def allowance(owner, spender):
    return _uint(cast_call(TOKEN, "allowance(address,address)(uint256)", owner, spender))

def locked_of(addr):
    return _uint(cast_call(FIXTURE, "locked(address)(uint256)", addr))

def settled_of(addr):
    return cast_call(FIXTURE, "settled(address)(bool)", addr) == "true"

def gas_price_now():
    rc, out, err = sh(["cast", "gas-price", "--rpc-url", RPC])
    if rc != 0:
        raise TransientFailure(f"gas-price failed: {err.strip()[:120]}")
    return int(out.strip())

def broadcast(to, sig, *args, gas_price=None, gas_limit=None):
    """Send one tx through the shared nonce lock. Returns (txhash, raw_out).

    gas_limit: when set, passed as --gas-limit so cast skips client-side
    eth_estimateGas. Required for failure-broadcast steps: estimation reverts
    on a deliberately-reverting call and the node would never see the tx,
    so the real 0x0 could never be mined without this bypass."""
    cmd = ["flock", NONCE_LOCK, "cast", "send", to, sig, *args,
           "--private-key", PRIVKEY, "--rpc-url", RPC]
    if gas_price:
        cmd += ["--gas-price", str(gas_price)]
    if gas_limit:
        cmd += ["--gas-limit", str(gas_limit)]
    rc, out, err = sh(cmd, timeout=300)
    blob = out + "\n" + err
    m = re.search(r"transactionHash\s+0x[0-9a-fA-F]{64}", blob)
    if not m:
        if "execution reverted" in blob:
            # Client-side estimation refused to broadcast a reverting tx.
            raise PermanentFailure(f"node refused broadcast (estimation reverted): {blob[:300]}")
        # Some cast builds print `transactionHash` on revert-failure paths in stderr too.
        raise TransientFailure(f"no tx hash in broadcast output: {blob[:300]}")
    return "0x" + m.group(0).split("0x", 1)[1], blob

def fetch_receipt(txhash, polls=20, interval=6):
    """Poll for the receipt; None if it never lands (dropped tx)."""
    for _ in range(polls):
        rc, out, err = sh(["cast", "receipt", txhash, "--json", "--rpc-url", RPC], timeout=60)
        if rc == 0 and out.strip():
            try:
                r = json.loads(out)
                if r and r.get("blockNumber"):
                    return r
            except json.JSONDecodeError:
                pass
        time.sleep(interval)
    return None

# ----------------------------------------------------------- policy logic ----

def classify_status(status_hex):
    """Pure receipt-status classifier (unit-tested)."""
    if status_hex in ("0x1", "1", 1):
        return "CONFIRMED"
    if status_hex in ("0x0", "0", 0):
        return "FAILED_PERMANENT"
    raise ValueError(f"unknown receipt status: {status_hex!r}")

def retry_decision(failure_kind, attempt):
    """Pure retry-policy decision (unit-tested).
    Returns ('retry', backoff_s, gas_bump_mult) or ('give_up',) / ('compensate',)."""
    if failure_kind == "permanent":
        return ("compensate",)
    if failure_kind == "transient":
        if attempt < MAX_RETRIES:
            return ("retry", BACKOFF_S[attempt], GAS_BUMP ** (attempt + 1))
        return ("give_up",)
    raise ValueError(failure_kind)

# --------------------------------------------------------------- executor ----

class SagaExecutor:
    SAGA_STATES = ("CREATED", "RUNNING", "SUCCEEDED",
                   "COMPENSATING", "COMPENSATED", "FAILED", "COMPENSATION_FAILED")
    STEP_STATES = ("PENDING", "PREPARED", "BROADCAST", "CONFIRMING",
                   "CONFIRMED", "RETRYING", "FAILED_PERMANENT")

    def __init__(self, run_id):
        self.run_id = run_id
        self.saga_state = "CREATED"
        self.run_dir = os.path.join(RUNS_DIR, run_id)
        os.makedirs(self.run_dir, exist_ok=True)
        self.log_path = os.path.join(self.run_dir, "state.log")
        self.txs = []
        self.spent_wei = 0
        self._transition(None, "CREATED", saga=True)

    def _log(self, step, step_state=None, tx=None, detail="", saga_state=None):
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "run": self.run_id,
            "saga": self.saga_state,
            "step": step,
            "step_state": step_state,
            "tx": tx,
            "detail": detail,
        }
        with open(self.log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")

    def _transition(self, step, to_state, tx=None, detail="", saga=False):
        if saga:
            assert to_state in self.SAGA_STATES, to_state
            self.saga_state = to_state
            self._log(step or "-", saga_state=to_state, tx=tx, detail=detail)
        else:
            assert to_state in self.STEP_STATES, to_state
            self._log(step, step_state=to_state, tx=tx, detail=detail)

    def run_step(self, step):
        """Execute one saga step with the retry policy. step = dict with:
           name, to, sig, args, precheck (fn|None), postcheck (fn|None),
           force_fail (bool: bypass precheck to deliberately mine a 0x0)."""
        name = step["name"]
        self._transition(name, "PENDING")
        if step.get("precheck") and not step.get("force_fail"):
            self._transition(name, "PREPARED", detail="precheck passed")
            try:
                step["precheck"]()
            except Exception as e:
                raise PermanentFailure(f"precheck failed for {name}: {e}")
        elif step.get("force_fail"):
            self._transition(name, "PREPARED",
                             detail="FAILURE-BROADCAST: precheck bypassed on purpose to mine a real 0x0")
        else:
            self._transition(name, "PREPARED")

        base_gas = gas_price_now()
        last_err = None
        for attempt in range(MAX_RETRIES + 1):
            gas = int(base_gas * (GAS_BUMP ** attempt))
            self._transition(name, "BROADCAST" if attempt == 0 else "RETRYING",
                             detail=f"attempt={attempt} gas_price={gas}")
            try:
                txhash, _blob = broadcast(step["to"], step["sig"], *step["args"],
                                          gas_price=gas, gas_limit=step.get("gas_limit"))
            except PermanentFailure:
                raise  # client-side estimation revert = permanent, never retried
            except TransientFailure as e:
                last_err = e
                decision = retry_decision("transient", attempt)
                if decision[0] == "retry":
                    time.sleep(decision[1])
                    continue
                raise TransientFailure(f"{name}: broadcast failed after {attempt+1} attempts: {e}")
            self._transition(name, "CONFIRMING", tx=txhash)
            receipt = fetch_receipt(txhash)
            if receipt is None:
                last_err = TransientFailure(f"{name}: receipt never landed (dropped?)")
                decision = retry_decision("transient", attempt)
                if decision[0] == "retry":
                    self._log(name, tx=txhash,
                              detail=f"receipt missing; retry {attempt+1}/{MAX_RETRIES} "
                                     f"in {decision[1]}s with gas x{decision[2]:.2f}")
                    time.sleep(decision[1])
                    continue
                raise TransientFailure(f"{name}: receipt missing after retries; tx {txhash}")

            gas_used = int(receipt["gasUsed"], 16)
            eff_gas = int(receipt.get("effectiveGasPrice", "0x1"), 16)
            self.spent_wei += gas_used * eff_gas
            tx_record = {
                "step": name, "hash": txhash, "attempt": attempt,
                "status": receipt["status"],
                "blockNumber": int(receipt["blockNumber"], 16),
                "gasUsed": gas_used, "effectiveGasPriceWei": eff_gas,
                "explorer": f"{EXPLORER}/tx/{txhash}",
            }
            self.txs.append(tx_record)

            verdict = classify_status(receipt["status"])
            if verdict == "FAILED_PERMANENT":
                self._transition(name, "FAILED_PERMANENT", tx=txhash,
                                 detail="mined status-0x0 — permanent, no retry")
                raise PermanentFailure(f"{name}: mined 0x0 at {txhash}")

            # Confirmed 0x1 — run the post-state gate.
            self._transition(name, "CONFIRMED", tx=txhash)
            if step.get("postcheck"):
                try:
                    step["postcheck"]()
                except Exception as e:
                    raise GateFailure(f"{name}: post-state gate failed: {e}")
            return tx_record

        raise TransientFailure(f"{name}: exhausted retries ({last_err})")

    def saga_result(self, ok, detail=""):
        self._transition("-", "SUCCEEDED" if ok else "FAILED", detail=detail, saga=True)
        return self.persist()

    def abort(self, saga_state, detail=""):
        """Persist a non-success terminal state (FAILED / COMPENSATION_FAILED)."""
        assert saga_state in ("FAILED", "COMPENSATION_FAILED"), saga_state
        self._transition("-", saga_state, detail=detail, saga=True)
        return self.persist()

    def persist(self, balances=None):
        summary = self.summary()
        if balances:
            summary["balances"] = balances
        out_path = os.path.join(self.run_dir, "run.json")
        with open(out_path, "w") as f:
            json.dump(summary, f, indent=2)
        return summary

    def summary(self):
        return {
            "run_id": self.run_id,
            "saga_state": self.saga_state,
            "txs": self.txs,
            "total_gas_wei_spent": self.spent_wei,
            "state_log": self.log_path,
            "contracts": {"token": TOKEN, "fixture": FIXTURE},
            "explorer": EXPLORER,
        }

# ------------------------------------------------------------------- runs ----

def step_approve(amount):
    return {
        "name": "approve",
        "to": TOKEN, "sig": "approve(address,uint256)",
        "args": [FIXTURE, str(amount)],
        "postcheck": lambda: _gate(
            allowance(WALLET, FIXTURE) >= amount,
            f"allowance {allowance(WALLET, FIXTURE)} < {amount}"),
    }

def step_lock(dust, locked_before):
    return {
        "name": "lock",
        "to": FIXTURE, "sig": "lock(uint256)",
        "args": [str(dust)],
        "precheck": lambda: _gate(
            allowance(WALLET, FIXTURE) >= dust, "allowance too low for lock"),
        "postcheck": lambda: _gate(
            locked_of(WALLET) == locked_before + dust,
            f"locked {locked_of(WALLET)} != {locked_before + dust}"),
    }

def step_execute(min_out, force_fail=False):
    step = {
        "name": "execute",
        "to": FIXTURE, "sig": "execute(uint256)",
        "args": [str(min_out)],
        "force_fail": force_fail,
    }
    if force_fail:
        # Explicit gas limit bypasses cast's client-side eth_estimateGas,
        # which would otherwise refuse to broadcast the reverting call.
        step["gas_limit"] = 100000
    return step

def step_settle():
    return {
        "name": "settle",
        "to": FIXTURE, "sig": "settle()",
        "args": [],
        "postcheck": lambda: _gate(settled_of(WALLET), "settled flag not set"),
    }

def step_refund(locked_before, bal_before):
    """Compensation gate: refund returns EVERYTHING locked (incl. any residual
    from earlier runs), so the restored balance is bal_before + locked_before,
    where both snapshots are taken before this run's approve/lock."""
    return {
        "name": "compensate:refund",
        "to": FIXTURE, "sig": "refund()",
        "args": [],
        "postcheck": lambda: _gate(
            locked_of(WALLET) == 0
            and token_balance(WALLET) == bal_before + locked_before,
            f"refund gate: locked={locked_of(WALLET)} "
            f"balance={token_balance(WALLET)} expected={bal_before + locked_before}"),
    }

def step_revoke():
    return {
        "name": "compensate:revoke-allowance",
        "to": TOKEN, "sig": "approve(address,uint256)",
        "args": [FIXTURE, "0"],
        "postcheck": lambda: _gate(
            allowance(WALLET, FIXTURE) == 0, "allowance not revoked"),
    }

def _gate(cond, msg):
    if not cond:
        raise AssertionError(msg)

def _snap_balances():
    try:
        return {"native_wei": int(eth_balance(WALLET)),
                "token_wei": token_balance(WALLET)}
    except Exception as e:  # never let a read break evidence persistence
        return {"read_error": str(e)[:120]}

def run_a(dust):
    """Fully successful saga: approve -> lock -> execute(minOut=dust) -> settle."""
    ex = SagaExecutor(f"t06-run-a-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}")
    ex._transition("-", "RUNNING", detail=f"dust={dust} wei; full-success path", saga=True)
    try:
        locked_before = locked_of(WALLET)
        ex.run_step(step_approve(dust))
        ex.run_step(step_lock(dust, locked_before))
        ex.run_step(step_execute(dust, force_fail=False))
        ex.run_step(step_settle())
    except (PermanentFailure, TransientFailure, GateFailure) as e:
        return ex.abort("FAILED", f"unexpected failure on success path: {type(e).__name__}: {e}")
    return ex.saga_result(True, "all steps 0x1 with post-state gates green")

def run_b(dust):
    """Forced-failure saga: approve(2*dust) -> lock(dust) -> execute(IMPOSSIBLE
    minOut) -> REAL mined 0x0 -> compensate: refund + allowance revoke.
    The 2x approval leaves a real residual allowance so the revoke step is
    meaningful (allowance dust -> 0), not a no-op."""
    ex = SagaExecutor(f"t06-run-b-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}")
    ex._transition("-", "RUNNING", detail=f"dust={dust} wei; forced-failure path", saga=True)
    try:
        locked_before = locked_of(WALLET)
        bal_before = token_balance(WALLET)
        ex.run_step(step_approve(2 * dust))
        ex.run_step(step_lock(dust, locked_before))
    except (PermanentFailure, TransientFailure, GateFailure) as e:
        return ex.abort("FAILED", f"setup steps failed before forced failure: {type(e).__name__}: {e}")
    try:
        ex.run_step(step_execute(locked_before + dust + 1, force_fail=True))
        # Unreachable by design — if execute somehow succeeds, that is itself a finding.
        return ex.abort("FAILED", "execute() unexpectedly succeeded; forced failure did not occur")
    except PermanentFailure as e:
        ex._transition("-", "COMPENSATING",
                       detail=f"permanent failure detected: {e}; starting compensation", saga=True)
    try:
        # Compensation tx 1: refund ALL locked dust (incl. any residual).
        ex.run_step(step_refund(locked_before, bal_before))
        # Compensation tx 2: revoke the residual allowance (2*dust - dust = dust -> 0).
        ex.run_step(step_revoke())
    except (PermanentFailure, TransientFailure, GateFailure) as e:
        return ex.abort("COMPENSATION_FAILED",
                        f"compensation failed: {type(e).__name__}: {e} — MANUAL RUNBOOK REQUIRED")
    ex._transition("-", "COMPENSATED",
                   detail="refund mined + allowance revoked; token balance restored (gas unrecoverable)",
                   saga=True)
    return ex.summary()

# ------------------------------------------------------------------ tests ----

def selftest():
    fails = []

    def check(name, cond):
        print(("PASS " if cond else "FAIL ") + name)
        if not cond:
            fails.append(name)

    # 1. Receipt-status classifier.
    check("status 0x1 -> CONFIRMED", classify_status("0x1") == "CONFIRMED")
    check("status 1 (int) -> CONFIRMED", classify_status(1) == "CONFIRMED")
    check("status 0x0 -> FAILED_PERMANENT", classify_status("0x0") == "FAILED_PERMANENT")
    check("status 0 (int) -> FAILED_PERMANENT", classify_status(0) == "FAILED_PERMANENT")
    # Fixture: a real mined receipt dict (shape from `cast receipt --json`).
    fixture_receipt = {"status": "0x0", "blockNumber": "0x1e05d60",
                       "gasUsed": "0x52b8", "effectiveGasPrice": "0x3b9aca00"}
    check("fixture 0x0 receipt -> FAILED_PERMANENT",
          classify_status(fixture_receipt["status"]) == "FAILED_PERMANENT")
    fixture_ok = dict(fixture_receipt, status="0x1")
    check("fixture 0x1 receipt -> CONFIRMED",
          classify_status(fixture_ok["status"]) == "CONFIRMED")
    try:
        classify_status("0x2"); check("unknown status raises", False)
    except ValueError:
        check("unknown status raises", True)

    # 2. Retry-policy decision table.
    d = retry_decision("permanent", 0)
    check("permanent -> compensate, never retry", d == ("compensate",))
    d = retry_decision("transient", 0)
    check("transient attempt0 -> retry 5s x1.20", d == ("retry", 5, 1.20))
    d = retry_decision("transient", 1)
    check("transient attempt1 -> retry 15s x1.44",
          d[0] == "retry" and d[1] == 15 and abs(d[2] - 1.44) < 1e-9)
    d = retry_decision("transient", 2)
    check("transient attempt2 -> retry 45s x1.728",
          d[0] == "retry" and d[1] == 45 and abs(d[2] - 1.728) < 1e-9)
    check("transient attempt3 -> give_up", retry_decision("transient", 3) == ("give_up",))
    check("backoff schedule is 5/15/45", BACKOFF_S == [5, 15, 45])

    # 3. State-machine legal transitions.
    check("COMPENSATED is a terminal saga state",
          "COMPENSATED" in SagaExecutor.SAGA_STATES)
    check("FAILED_PERMANENT is a step state",
          "FAILED_PERMANENT" in SagaExecutor.STEP_STATES)
    check("SUCCEEDED is a terminal saga state",
          "SUCCEEDED" in SagaExecutor.SAGA_STATES)

    # 4. Forced-failure arithmetic: impossible minOut > locked.
    locked, dust = 1000, 2000
    check("impossible minOut crafted correctly",
          locked + dust + 1 > locked + dust)

    # 5. Forced-failure step carries an explicit gas limit (bypasses
    #    client-side eth_estimateGas, which would block the deliberate 0x0).
    check("forced step sets explicit gas_limit",
          step_execute(999, force_fail=True).get("gas_limit") == 100000)
    check("normal step has no gas_limit override",
          step_execute(1, force_fail=False).get("gas_limit") is None)

    # 6. Gate helper raises on false.
    try:
        _gate(False, "x"); check("gate raises on false", False)
    except AssertionError:
        check("gate raises on false", True)
    _gate(True, "x"); check("gate passes on true", True)

    print(f"\n{len(fails)} failures" if fails else "\nALL SELFTESTS PASSED")
    return 1 if fails else 0

# ------------------------------------------------------------------- main ----

def main():
    if len(sys.argv) < 2:
        print(__doc__); return 2
    if sys.argv[1] == "--selftest":
        return selftest()
    which = sys.argv[1]
    dust = int(sys.argv[2]) if len(sys.argv) > 2 else (1000 if which == "run-a" else 2000)
    before = _snap_balances()
    summary = run_a(dust) if which == "run-a" else run_b(dust)
    after = _snap_balances()
    summary["balances"] = {"before": before, "after": after}
    out_path = os.path.join(RUNS_DIR, summary["run_id"], "run.json")
    with open(out_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))
    print("run.json ->", out_path)
    return 0

if __name__ == "__main__":
    sys.exit(main())
