# T19 — Reviewer Notes

For the Arena judge / coordinator reviewing this task.

## What was built

An invoice-to-payment agent (`agent/`, ~700 lines Python, stdlib only):
parse → validate → payment plan → human REVIEW → explicit confirmation →
real dust broadcast on Atlantic → JSONL paid-stamp → duplicate refusal.

## How to verify in under 5 minutes

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t19-invoice-to-payment-agent

# 1. tests (no network needed)
python3 -m unittest discover -s tests          # expect 19/19 OK

# 2. malformed invoices are flagged, never paid
for f in samples/invoice-bad-*.*; do python3 -m agent.cli parse "$f"; done

# 3. duplicate refusal (invoice INV-2026-001 already paid + stamped)
python3 -m agent.cli stamps
```

For live paths (`review`/`pay`) you need `ATLANTIC_RPC_URL` and
`DEPLOYER_PRIVATE_KEY` in env — the broadcast uses the shared nonce lock
(`flock /tmp/lk-nonce.lock`). Paying the sample invoice again will print
`REFUSED … Double-payment prevented.` without touching the chain.

## Honest limitations (shipped unsoftened)

1. **Invoice reference is not on-chain.** A native PHRS transfer has no memo
   bytes (same is true of standard ERC-20 `transfer`). The reference is bound
   in the review, the unsigned-tx envelope metadata, and the paid-stamp —
   documented in `agent/planner.py`, never faked. This matches the prescribed
   implementation in REQUIREMENTS.md.
2. **Currency scope is PHRS only.** Non-PHRS invoices are flagged, never
   converted. Multi-token support would need per-token decimals + a price
   oracle — out of scope for this task.
3. **Demo payee is the operator wallet.** The 0.001 PHRS payment is a dust
   self-payment so no testnet funds strand; any valid address pays identically.
4. **No SkillEngine cron exists** (confirmed-absent primitive); scheduling is
   out of scope for T19 (it belongs to T18's external scheduler).
5. Paid-stamp is a local JSONL file — sufficient for a single-operator agent;
   a multi-operator deployment would need a shared store.

## Design decisions worth knowing

- Amounts use `Decimal`, never float — no rounding can change what is paid.
- CSV accepts exactly one invoice row per file; a 2-row file is refused
  rather than "picking the first".
- The stamp is appended only after a successful receipt is observed; a failed
  broadcast is never stamped (failed payments can be retried, paid ones cannot
  be repeated).
- No third-party dependencies: stdlib + `cast`. Nothing to install, nothing
  to audit beyond this repo.

## Video status

PENDING-VIDEO — script and shot list are in VIDEO-GUIDE.md (45–90s, real
terminal + real explorer, no staged fakes).
