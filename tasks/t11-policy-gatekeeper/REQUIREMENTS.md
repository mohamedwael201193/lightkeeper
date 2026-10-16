# T11 — Policy Gatekeeper — Official Requirements (quoted verbatim)

Source: `~/workspace/your_files/pharos-arena-MEGA.md`, §4 task matrix (official
requirements extracted read-only from the live Build pages, 2026-10-15).

## T11 — Policy Gatekeeper (Medium, 100 · SkillEngine)

**OFFICIAL:** (1) Clear policy (allowlists/limits/denylists). (2) Intercepts
action pre-execution and checks. (3) Blocks violations WITH explanation.
(4) Allows valid with check log.

**Implementation:** 8-check pre-execution gate
(action/network/token/recipient/selector/amount-limits/time-window/cooldown)
over versioned `policy.json`; fail-closed on missing policy; gate-stamped
executor (demonstrated no-bypass); append-only `check-log.jsonl`; unsigned-tx
output on PASS; named-rule explanation on BLOCK with proof no SkillEngine
call fired.

**Evidence:** policy.json, check log (PASS + BLOCK cases), no-bypass demo,
share link.

**Video:** valid action → PASS + check log → violating action → BLOCK with
named rule.

**Risks:** policy versioning (hash the policy into the log); bypass paths
(gate-stamp audit).

## The 4 mandatory SkillEngine Write Operation Pre-checks (T05/T11)

Source: `~/workspace/custom-skills/pharos-skill-engine/SKILL.md`,
"Write Operation Pre-checks (Required for All Write Operations)":

> For all operations requiring a private key (transfers, contract calls,
> deployments, airdrops, etc.), the Agent must automatically complete the
> following checks before execution:

### 1. Private Key Check
> Automatically detect whether the `$PRIVATE_KEY` environment variable is set

### 2. Derive Public Address and Confirm with User
> Derive the corresponding public address from the private key via
> `cast wallet address`

### 3. Network Confirmation (Must Clearly Inform User)
> The Agent must clearly inform the user of the target network before
> executing any write operation. [...] If the user specified `mainnet`,
> prominently warn the user: **Current operation targets mainnet, please
> confirm to proceed**

### 4. Automatic Balance Check
> After confirming the account and network, automatically query the balance

MEGA §3.3: "policy injection has 4 mandatory Write Operation Pre-checks
incl. mainnet re-confirmation (T05/T11)".

## Differentiation from T05

T05 (Threshold Guardian) decides on **amount thresholds** (per-tx and
rolling-window value caps). T11 decides on **action policy**: which action
types are allowed at all, which selectors/tokens/destinations, when writes
may happen, and how often — with a named rule on every BLOCK and a
hash-chained audit trail of every decision.
