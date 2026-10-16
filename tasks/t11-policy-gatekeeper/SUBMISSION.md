# SUBMISSION PACK — T11 Policy Gatekeeper (copy-paste into the Arena form)

## Title
LIGHTKEEPER T11 — Policy Gatekeeper: pre-execution policy engine with named-rule DENY and hash-chained audit trail

## One-liner
A versioned policy engine that intercepts agent write actions pre-execution —
action/selector/token/destination allowlists, per-action caps, time windows,
cooldowns — returning APPROVE with a gate stamp or DENY with the named rule,
and logging every decision to an append-only hash-chained audit trail.

## Description
T11 is LIGHTKEEPER's "arm that says no" — the pre-execution gate every agent
write action must pass. It evaluates a proposed action against a versioned,
hash-stamped `policy.json` (8 named rules: action allowlist, network
firewall, selector allowlist, token allowlist, destination allowlist,
per-action caps, time window, cooldown) and returns APPROVE (with a fresh,
audit-backed gate stamp) or DENY (with the exact rule that fired). The 4
mandatory SkillEngine Write Operation Pre-checks (private-key presence,
sender binding, live network confirmation, balance sufficiency) are enforced
on the execute path; mainnet-class actions are REFUSED outright
(`mainnet.enabled=false` — re-confirmation required, never granted). The
executor cannot be bypassed: a forged or expired stamp is refused and the
refusal itself is audit-logged. Every decision — approve, deny, refuse — is
appended to a hash-chained audit trail verifiable with one command.

Evidence on Atlantic testnet: one violating action DENIED (destination
`0x1111…1111` not allowlisted — no broadcast, honestly logged) and TWO
compliant actions APPROVED then executed as real dust transactions
(RUN B: 0.001 PHRS → `0x0000…dEaD`, tx
0xc471c8f7aa4d8cb0963f80335d190607a883ab749d2058f0d047d476678159bb, block
31481699; RUN C: 0.001 PHRS → the *other* allowlisted recipient, deployer
self `0xf76e…bC71a3`, tx
0x42c4a35d024c2bfc16807d04f2f3478ac96b3d06a99349cf9ac86f98e05b6329, block
31486909 — the destination allowlist has two live entries, both proven).
Audit trail: 7 hash-chained entries (DENY → APPROVE → REFUSE →
REFUSED_MAINNET → EXECUTED → APPROVE → EXECUTED), verified with one
command. Unit tests: 22/22 covering every rule type, fail-closed policy
handling, mainnet refusal purity, stamp no-bypass, and audit tamper
detection. Total spend: 0.00204200042 PHRS of the 0.15 budget.

## Repo link (commit-pinned)
https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t11-policy-gatekeeper

## Share / demo links
- Tx (RUN B): https://atlantic.pharosscan.xyz/tx/0xc471c8f7aa4d8cb0963f80335d190607a883ab749d2058f0d047d476678159bb
- Wallet: https://atlantic.pharosscan.xyz/address/0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
- Interactive console demo (Tier B): the LIGHTKEEPER console's T11 "Try it live"
  panel — `apps/console/src/components/try/policy-gatekeeper.tsx`. Visitors propose
  a native transfer; the policy engine evaluates it client-side against LIVE Atlantic
  reads (chain id, gas price, their wallet balance) and renders all seven gate
  conditions as a PASS/BLOCK trace with exact numbers — including the
  destination allowlist as its own named-rule row. ALLOW path: propose →
  mandatory review → the visitor signs in their own wallet. BLOCK path: the named
  blocking rule, the exact breached number, and refusal to propose — including a
  mainnet (1672) preview that demonstrates the unconditional REFUSE.

## Transaction hashes
- `0xc471c8f7aa4d8cb0963f80335d190607a883ab749d2058f0d047d476678159bb` — APPROVED dust broadcast (RUN B, dust sink; Atlantic, block 31481699, status 0x1)
- `0x42c4a35d024c2bfc16807d04f2f3478ac96b3d06a99349cf9ac86f98e05b6329` — APPROVED dust broadcast (RUN C, deployer self; Atlantic, block 31486909, status 0x1)
- (no hash for RUN A — DENIED actions are never broadcast, by design)

## Video
PENDING-VIDEO (filming guide: VIDEO-GUIDE.md in the same directory)
