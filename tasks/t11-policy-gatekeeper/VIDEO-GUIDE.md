# VIDEO-GUIDE — T11 Policy Gatekeeper (60–100 seconds)

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

**0:55–1:10 — The second recipient → APPROVE + broadcast (real terminal + real explorer)**
The allowlist has TWO entries. Run live:
```
python3 gatekeeper.py evaluate --action-file run-logs/action-approve-self.json --stamp-out run-logs/stamp-runC2.json
python3 gatekeeper.py execute --action-file run-logs/action-approve-self.json --stamp run-logs/stamp-runC2.json
```
Show: APPROVE (all 8 rules PASS), pre-checks P1–P4 print, the broadcast, then
the REAL explorer page:
https://atlantic.pharosscan.xyz/tx/0x42c4a35d024c2bfc16807d04f2f3478ac96b3d06a99349cf9ac86f98e05b6329
Show: 0.001 PHRS to `0xf76e…bC71a3` (the deployer itself — the other
allowlisted recipient), status success, block 31486909.
Voice: *"Same gate, second recipient. The policy allows two destinations —
the sink and the deployer. Both proven with real transactions."*

**1:10–1:25 — Audit trail (real terminal)**
Run live:
```
python3 gatekeeper.py audit-verify
cat audit/check-log.jsonl
```
Show the 7 chained entries: DENY → APPROVE → REFUSE (forged stamp) →
REFUSED_MAINNET → EXECUTED → APPROVE → EXECUTED.
Voice: *"Every decision is chained and verifiable — including the mainnet
refusal and the blocked bypass attempt."*

**1:25–1:35 — Close**
Show `policy.json` briefly. Voice: *"Clear policy. Named denials. No
bypass. That's the gatekeeper."*

## NEW — console interactive demo shots (film on the live console after deploy)

Film the REAL console page, a REAL connected wallet on Atlantic testnet, and the
REAL explorer. Every number on the trace must come from a live RPC read.

**Shot C1 — the violating address → DENY with named rule (console, ~15 s)**
On the T11 "Try it live" panel: connect your wallet, click "Stranger address
(BLOCK demo)", then "Run the gate". Show the trace: six conditions PASS with
live numbers, and the recipient row BLOCK — rule `destination_allowlist`, the
exact non-allowlisted address, plain-language reason. Show that NO "Propose transfer"
button appears — the gate refuses to propose.
Voice: *"A stranger address. Six checks pass on live numbers — but the
recipient is not allowlisted, so the gate denies, names the rule, and refuses
to propose anything."*

**Shot C2 — mainnet preview → unconditional REFUSE (console, ~10 s)**
Tick "Preview: evaluate as mainnet (chain 1672)", "Run the gate" again. Show the
REFUSED_MAINNET banner: rule `network_firewall`, mainnet.enabled=false,
re-confirmation never granted, no broadcast path exists.
Voice: *"And mainnet? Refused outright — the policy will not touch chain
1672, unconditionally."*

**Shot C3 — the allowlisted dust transfer → all PASS → sign yourself
(console + wallet + explorer, ~30 s)**
Click "Dust sink (allowlisted)", value `0.001`, untick the mainnet preview, "Run
the gate". Show all seven rows PASS with exact live numbers (chain 688689, gas
price in gwei, your balance covering value + reserve, recipient allowlisted).
Click "Propose transfer"
→ the MANDATORY review panel (to, value, your-wallet notice) → "Sign in my
wallet" → approve in MetaMask → "Your tx — signed in your wallet" → open the
REAL explorer link and show the confirmed receipt.
Voice: *"Allowlisted destination, dust amount, live balance covers it — all seven
conditions pass, with the numbers on screen. Propose, review, and I sign in my
own wallet. Confirmed — my transaction, my keys, the gate's approval."*

**Shot C4 — the policy receipt (console, ~5 s)**
Scroll to the decision JSON code block (policy id, decision, named rule, action).
Voice: *"Every decision ships as a receipt: policy version, decision, the rule
that fired. That's the gatekeeper."*

## Spoken script (full, ~95 s at natural pace)> "The arm that says no. Before any agent writes to the chain, the policy
> speaks. Watch: a transfer to a stranger address — the gate denies it,
> names the rule, destination allowlist, and nothing is broadcast. Same
> action type, allowlisted destination — approved, with a gate stamp.
> Approved means it executes for real: dust transactions on Atlantic, receipts
> on the explorer — one to each allowlisted recipient. A forged stamp? Refused
> — and the refusal is logged too. Every decision is hash-chained and
> verifiable with one command. Clear policy. Named denials. No bypass.
> That's the gatekeeper."

## Filming notes
- Terminal font ≥ 16pt; zoom the explorer page to 125%.
- Keep the real command prompts visible — reviewers check for fakes.
- If the time window has passed when filming, the approve shot will
  honestly DENY on `time_window` — film the unit tests instead for the
  PASS path, and say so on camera.
