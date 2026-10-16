# VIDEO-GUIDE — T11 Policy Gatekeeper (45–90 seconds)

Film the REAL terminal and REAL explorer pages. No staged fakes: every
command shown must actually run, every page shown must actually load.

## Shot list

**0:00–0:08 — Title card (OCTOPUS style)**
Deep blue `#1414c8` background, gold serif text: "POLICY GATEKEEPER — T11".
Voice: *"The arm that says no. Before any agent writes to the chain, the
policy speaks."*

**0:08–0:25 — The violating action → DENY (real terminal)**
Run live:
```
python3 gatekeeper.py evaluate --action-file run-logs/action-deny.json
```
Show the output: `"decision": "DENY"`, named rule `destination_allowlist`.
Voice: *"A transfer to a stranger address. The gate denies it, names the
rule — destination allowlist — and nothing is broadcast. The denial is
written to the audit trail."*

**0:25–0:40 — The compliant action → APPROVE + stamp (real terminal)**
Run live:
```
python3 gatekeeper.py evaluate --action-file run-logs/action-approve.json
```
Show: `"decision": "APPROVE"`, all 8 rules PASS, stamp minted.
Voice: *"Same action type, allowlisted destination, inside the time window.
Approved — with a gate stamp the executor must present."*

**0:40–0:55 — The real broadcast (real terminal + real explorer)**
Run live `execute` (pre-checks P1–P4 print, then the broadcast). Then open
the REAL explorer page:
https://atlantic.pharosscan.xyz/tx/0xc471c8f7aa4d8cb0963f80335d190607a883ab749d2058f0d047d476678159bb
Show: 0.001 PHRS to `0x0000…dEaD`, status success, block 31481699.
Voice: *"Approved — so it executes for real. One dust transaction on
Atlantic, receipt on the explorer."*

**0:55–1:10 — Audit trail (real terminal)**
Run live:
```
python3 gatekeeper.py audit-verify
cat audit/check-log.jsonl
```
Show the 5 chained entries: DENY → APPROVE → REFUSE (forged stamp) →
REFUSED_MAINNET → EXECUTED.
Voice: *"Every decision is chained and verifiable — including the mainnet
refusal and the blocked bypass attempt."*

**1:10–1:20 — Close**
Show `policy.json` briefly. Voice: *"Clear policy. Named denials. No
bypass. That's the gatekeeper."*

## Spoken script (full, ~75 s at natural pace)

> "The arm that says no. Before any agent writes to the chain, the policy
> speaks. Watch: a transfer to a stranger address — the gate denies it,
> names the rule, destination allowlist, and nothing is broadcast. Same
> action type, allowlisted destination, inside the time window — approved,
> with a gate stamp. Approved means it executes for real: one dust
> transaction on Atlantic, receipt on the explorer. A forged stamp? Refused
> — and the refusal is logged too. Every decision is hash-chained and
> verifiable with one command. Clear policy. Named denials. No bypass.
> That's the gatekeeper."

## Filming notes
- Terminal font ≥ 16pt; zoom the explorer page to 125%.
- Keep the real command prompts visible — reviewers check for fakes.
- If the time window has passed when filming, the approve shot will
  honestly DENY on `time_window` — film the unit tests instead for the
  PASS path, and say so on camera.
