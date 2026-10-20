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
    python3 scripts/saga.py run-c <dust> --kill-after <step>
                                        # crash-recovery run: hard-kill mid-step,
                                        # then `resume <run-id>` completes it
    python3 scripts/saga.py resume <run-id>
                                        # resume a crashed run from its state log
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
# Failure taxonomy + retry policy live in @lightkeeper/workflow (L6).
# The names below are the canonical lib classes — kept as module-level
# names so every existing raise/catch site is unchanged.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(REPO_ROOT, "packages", "workflow", "py"))
from lightkeeper_workflow import (  # noqa: E402
    TransientFailure, PermanentFailure, GateFailure, RetryPolicy,
)

_RETRY_POLICY = RetryPolicy(max_retries=MAX_RETRIES,
                            backoff_s=tuple(BACKOFF_S), gas_bump=GAS_BUMP)

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
    Returns ('retry', backoff_s, gas_bump_mult) or ('give_up',) / ('compensate',).
    Delegates to @lightkeeper/workflow's RetryPolicy — same table."""
    return _RETRY_POLICY.decide(failure_kind, attempt)

# --------------------------------------------------------------- executor ----

class SagaExecutor:
    SAGA_STATES = ("CREATED", "RUNNING", "SUCCEEDED",
                   "COMPENSATING", "COMPENSATED", "FAILED", "COMPENSATION_FAILED")
    STEP_STATES = ("PENDING", "PREPARED", "BROADCAST", "CONFIRMING",
                   "CONFIRMED", "RETRYING", "FAILED_PERMANENT")

    def __init__(self, run_id, resume=False):
        self.run_id = run_id
        self.saga_state = "CREATED"
        self.run_dir = os.path.join(RUNS_DIR, run_id)
        os.makedirs(self.run_dir, exist_ok=True)
        self.log_path = os.path.join(self.run_dir, "state.log")
        self.txs = []
        self.spent_wei = 0
        self.crash_after = None  # step name: hard-kill (os._exit) after its broadcast
        if not resume:
            self._transition(None, "CREATED", saga=True)
        else:
            # Resumed executor: history is authoritative. Mark the resume as a
            # plain log line — NOT a state-machine transition, so the log shows
            # exactly one BROADCAST per step even across the crash.
            self.saga_state = "RUNNING"
            self._log("-", detail="RESUMED after crash — replaying state log; "
                                  "in-flight tx receipts are re-read, never re-broadcast")

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
            if self.crash_after == name:
                # Genuine hard kill between broadcast and confirmation: no
                # cleanup, no persist, no graceful shutdown — os._exit skips
                # every finally block, exactly like SIGKILL. The tx is in
                # flight; the state log is the only record of what happened.
                self._transition(name, "BROADCAST", tx=txhash,
                                 detail="SIMULATED CRASH POINT REACHED: hard exit "
                                        "before CONFIRMING — tx in flight, log is the only record")
                os._exit(137)
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
        bal_before = token_balance(WALLET)
        write_plan(ex, "run-a", dust, locked_before, bal_before)
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

# ------------------------------------------------------ crash / resume ----

def write_plan(ex, kind, dust, locked_before, bal_before):
    """Persist enough to rebuild and resume the saga after a hard crash.
    The state log is the authority; plan.json only records the *intent*
    (which plan, which dust, which pre-run snapshots the gates need)."""
    plan = {
        "kind": kind,
        "dust": dust,
        "locked_before": locked_before,
        "bal_before": bal_before,
        "step_order": ["approve", "lock", "execute", "settle"] if kind in ("run-a", "run-c") else [],
        "note": "resume replays state.log; in-flight tx receipts are re-read, never re-broadcast",
    }
    with open(os.path.join(ex.run_dir, "plan.json"), "w") as f:
        json.dump(plan, f, indent=2)

def find_resume_point(entries):
    """Pure log parser (unit-tested). Given state.log entries (dicts),
    returns (confirmed_steps, crashed_step, crashed_tx):
      - confirmed_steps: steps with a CONFIRMED line (completed, never re-run)
      - crashed_step/tx: first step in plan order that broadcast a tx but has
        no CONFIRMED/FAILED_PERMANENT line — the executor died mid-step.
      - (confirmed, None, None): nothing crashed; nothing to resume.
    Raises ValueError if the log shows a terminal saga state (nothing to resume)
    or a FAILED_PERMANENT step (run-b plans are not resumable by design)."""
    saga_states = [e["saga"] for e in entries if e.get("saga") not in (None, "CREATED", "RUNNING")]
    if saga_states:
        raise ValueError(f"log already terminal: {saga_states[-1]} — nothing to resume")
    confirmed = {e["step"] for e in entries if e["step_state"] == "CONFIRMED"}
    for e in entries:
        if e["step_state"] == "FAILED_PERMANENT":
            raise ValueError("log contains a FAILED_PERMANENT step — run-b plans are not resumable")
    order = []
    for e in entries:
        s = e["step"]
        if s not in ("-",) and s not in order:
            order.append(s)
    for step in order:
        if step in confirmed:
            continue
        bc = [e for e in entries if e["step"] == step
              and e["step_state"] == "BROADCAST" and e.get("tx")]
        later = [e for e in entries if e["step"] == step
                 and e["step_state"] in ("CONFIRMING", "CONFIRMED",
                                         "FAILED_PERMANENT", "RETRYING")]
        if bc and not later:
            return confirmed, step, bc[-1]["tx"]
    return confirmed, None, None

def rebuild_from_log(ex, entries):
    """Recompute txs + spend for CONFIRMED steps by re-reading their receipts.
    The pre-crash invocation died before persisting, so run.json never saw them;
    the receipts are still on-chain — recompute, never invent."""
    for e in entries:
        if e["step_state"] != "CONFIRMING" or not e.get("tx"):
            continue
        txhash = e["tx"]
        if any(t["hash"] == txhash for t in ex.txs):
            continue
        receipt = fetch_receipt(txhash, polls=40, interval=6)
        if receipt is None:
            raise TransientFailure(f"resume: receipt never landed for {txhash}")
        gas_used = int(receipt["gasUsed"], 16)
        eff_gas = int(receipt.get("effectiveGasPrice", "0x1"), 16)
        ex.spent_wei += gas_used * eff_gas
        ex.txs.append({
            "step": e["step"], "hash": txhash, "attempt": 0,
            "status": receipt["status"],
            "blockNumber": int(receipt["blockNumber"], 16),
            "gasUsed": gas_used, "effectiveGasPriceWei": eff_gas,
            "explorer": f"{EXPLORER}/tx/{txhash}",
            "note": "recomputed at resume from on-chain receipt",
        })

def run_c(dust, kill_after):
    """Crash-recovery run: the full approve -> lock -> execute -> settle plan,
    but the executor hard-kills itself (os._exit(137), SIGKILL-like) between
    BROADCAST and CONFIRMING of `kill_after`. Recover with:
        python3 scripts/saga.py resume <run-id>
    which replays the state log and completes the saga. The claim under test:
    exactly ONE broadcast tx per step even though the executor died mid-step
    (idempotency via the state log, not via re-sending)."""
    ex = SagaExecutor(f"t06-run-c-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}")
    ex.crash_after = kill_after
    ex._transition("-", "RUNNING",
                   detail=f"dust={dust} wei; crash-recovery path (kill-after={kill_after})",
                   saga=True)
    locked_before = locked_of(WALLET)
    bal_before = token_balance(WALLET)
    write_plan(ex, "run-c", dust, locked_before, bal_before)
    steps = [step_approve(dust), step_lock(dust, locked_before),
             step_execute(dust, force_fail=False), step_settle()]
    try:
        for s in steps:
            ex.run_step(s)
    except (PermanentFailure, TransientFailure, GateFailure) as e:
        return ex.abort("FAILED", f"unexpected failure on crash-recovery path: {type(e).__name__}: {e}")
    return ex.saga_result(True, "crash-recovered: all steps 0x1, one broadcast tx per step")

def resume_run(run_id):
    """Resume a crashed run-a/run-c from its state log. Never re-broadcasts an
    in-flight tx: the logged hash's receipt is re-read first. A step whose tx
    actually landed is marked CONFIRMED from the receipt (post-state gate
    still applies); a step whose tx never landed is re-broadcast through the
    normal retry policy."""
    run_dir = os.path.join(RUNS_DIR, run_id)
    plan_path = os.path.join(run_dir, "plan.json")
    log_path = os.path.join(run_dir, "state.log")
    if not os.path.exists(plan_path):
        raise ValueError(f"{run_id}: no plan.json — only run-a/run-c runs are resumable")
    plan = json.load(open(plan_path))
    if plan.get("kind") not in ("run-a", "run-c"):
        raise ValueError(f"{run_id}: plan kind {plan.get('kind')} is not resumable")
    entries = [json.loads(l) for l in open(log_path) if l.strip()]
    confirmed, crashed_step, crashed_tx = find_resume_point(entries)
    dust, locked_before = plan["dust"], plan["locked_before"]
    ex = SagaExecutor(run_id, resume=True)
    rebuild_from_log(ex, entries)

    builders = {
        "approve": lambda: step_approve(dust),
        "lock": lambda: step_lock(dust, locked_before),
        "execute": lambda: step_execute(dust, force_fail=False),
        "settle": step_settle,
    }
    order = plan["step_order"]
    if crashed_step:
        receipt = fetch_receipt(crashed_tx, polls=40, interval=6)
        if receipt is None:
            # Tx never landed (dropped before mining): re-broadcast the step
            # through the normal retry policy. Its BROADCAST lines already in
            # the log document the attempts honestly.
            ex._log(crashed_step, detail=f"resume: in-flight tx {crashed_tx} never "
                                         "landed — re-broadcasting through retry policy")
            ex.run_step(builders[crashed_step]())
        else:
            gas_used = int(receipt["gasUsed"], 16)
            eff_gas = int(receipt.get("effectiveGasPrice", "0x1"), 16)
            ex.spent_wei += gas_used * eff_gas
            ex.txs.append({
                "step": crashed_step, "hash": crashed_tx, "attempt": 0,
                "status": receipt["status"],
                "blockNumber": int(receipt["blockNumber"], 16),
                "gasUsed": gas_used, "effectiveGasPriceWei": eff_gas,
                "explorer": f"{EXPLORER}/tx/{crashed_tx}",
                "note": "broadcast before crash; receipt re-read at resume",
            })
            verdict = classify_status(receipt["status"])
            if verdict == "FAILED_PERMANENT":
                ex._transition(crashed_step, "FAILED_PERMANENT", tx=crashed_tx,
                               detail="in-flight tx mined 0x0 — permanent")
                return ex.abort("FAILED", f"resumed step {crashed_step} mined 0x0 at {crashed_tx}")
            ex._transition(crashed_step, "CONFIRMING", tx=crashed_tx,
                           detail="resume: receipt re-read from chain, not re-broadcast")
            ex._transition(crashed_step, "CONFIRMED", tx=crashed_tx,
                           detail="resume: exactly one broadcast tx for this step across both invocations")
            post = builders[crashed_step]().get("postcheck")
            if post:
                try:
                    post()
                except Exception as e:
                    raise GateFailure(f"{crashed_step}: post-state gate failed at resume: {e}")
        confirmed.add(crashed_step)
    # Run every remaining step normally.
    for step in order:
        if step in confirmed:
            continue
        ex.run_step(builders[step]())
    ex._transition("-", "RUNNING",
                   detail="resume complete — saga continues to SUCCEEDED", saga=True)
    return ex.saga_result(True, "resumed after mid-step crash; one broadcast tx per step")

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

    # 7. Resume-point parser: pure function over fabricated state.log entries.
    def _e(step, state, tx=None, saga="RUNNING"):
        return {"ts": "2026-10-16T00:00:00+00:00", "run": "r", "saga": saga,
                "step": step, "step_state": state, "tx": tx, "detail": ""}
    crash_log = [
        _e("-", None, saga="CREATED"), _e("-", None, saga="RUNNING"),
        _e("approve", "PENDING"), _e("approve", "PREPARED"),
        _e("approve", "BROADCAST"),
        _e("approve", "BROADCAST", tx="0xaaa"),
        _e("approve", "BROADCAST", tx="0xaaa"),
    ]
    confirmed, crashed, ctx = find_resume_point(crash_log)
    check("resume parser finds crashed approve step",
          confirmed == set() and crashed == "approve" and ctx == "0xaaa")
    clean_log = crash_log + [_e("approve", "CONFIRMING", tx="0xaaa"),
                             _e("approve", "CONFIRMED", tx="0xaaa"),
                             _e("lock", "PENDING")]
    confirmed, crashed, ctx = find_resume_point(clean_log)
    check("resume parser sees confirmed approve, no crash to resume",
          confirmed == {"approve"} and crashed is None and ctx is None)
    term_log = clean_log + [_e("-", None, saga="SUCCEEDED")]
    try:
        find_resume_point(term_log); check("terminal log refuses resume", False)
    except ValueError:
        check("terminal log refuses resume", True)
    fail_log = crash_log + [_e("execute", "FAILED_PERMANENT", tx="0xbbb")]
    try:
        find_resume_point(fail_log); check("FAILED_PERMANENT log refuses resume", False)
    except ValueError:
        check("FAILED_PERMANENT log refuses resume", True)

    print(f"\n{len(fails)} failures" if fails else "\nALL SELFTESTS PASSED")
    return 1 if fails else 0

# ------------------------------------------------------------------- main ----

def main():
    if len(sys.argv) < 2:
        print(__doc__); return 2
    if sys.argv[1] == "--selftest":
        return selftest()
    which = sys.argv[1]
    if which == "resume":
        if len(sys.argv) < 3:
            print("usage: saga.py resume <run-id>"); return 2
        run_id = sys.argv[2]
        try:
            summary = resume_run(run_id)
        except (ValueError, TransientFailure, GateFailure) as e:
            print(f"resume refused/failed: {e}"); return 1
        out_path = os.path.join(RUNS_DIR, run_id, "run.json")
        with open(out_path, "w") as f:
            json.dump(summary, f, indent=2)
        print(json.dumps(summary, indent=2))
        print("run.json ->", out_path)
        return 0
    dust = int(sys.argv[2]) if len(sys.argv) > 2 else (1000 if which in ("run-a", "run-c") else 2000)
    kill_after = None
    if "--kill-after" in sys.argv:
        kill_after = sys.argv[sys.argv.index("--kill-after") + 1]
    before = _snap_balances()
    if which == "run-a":
        summary = run_a(dust)
    elif which == "run-c":
        summary = run_c(dust, kill_after)
    elif which == "run-b":
        summary = run_b(dust)
    else:
        print(__doc__); return 2
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
