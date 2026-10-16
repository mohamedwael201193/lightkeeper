# VIDEO-GUIDE.md — T05 Threshold Guardian (45–90 seconds)

No staged fakes. Every shot is a real terminal on the build machine and real
explorer pages. Record in one take if possible; jump-cuts allowed.

## Setup

- Terminal, 120+ cols, in `~/workspace/lightkeeper/tasks/t05-threshold-guardian/`
- Env sourced: `set -a; source ~/workspace/lightkeeper/.env; set +a`
- Browser tab open: https://atlantic.pharosscan.xyz/tx/0xe318dd0af236c292e6a1c21e0c98bd6088dac47fc24a8c0ad5d539912a23048c
- Have `policy.yaml` open in an editor pane for shot 1.

## Shot list

**Shot 1 (0–10s) — the policy.**
Show `policy.yaml` on screen. Spoken: *"One file, plain words. Five-thousandths
of a PHRS per transaction, a two-hundredths rolling window, mainnet hard-disabled.
Nothing is hard-coded in the code."*

**Shot 2 (10–30s) — HOLD.**
Run: `python3 guardian.py propose --to 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --value-phrs 0.05`
Spoken: *"A five-hundredths transfer. Key check passes, network passes —
threshold fails. Decision: BLOCK. Nothing was broadcast, nothing was spent."*
Point at the `DECISION: BLOCK` line and exit code 2.

**Shot 3 (30–55s) — FIRE.**
Run: `python3 guardian.py execute --to 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --value-phrs 0.0001`
Spoken: *"A dust transfer under the threshold. All six checks pass on live
chain data — decision ALLOW — and the guardian broadcasts once."*
Point at the tx hash. Then switch to the explorer tab showing the same hash,
status success, block 31481282.
Spoken: *"Same hash on the explorer. Real transaction, real receipt."*

**Shot 4 (55–75s) — REFUSE.**
Run: `python3 guardian.py propose --network mainnet --to 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --value-phrs 0.0001`
Spoken: *"Now mainnet. The guardian reads the chain ID live — sixteen-seventy-two —
and refuses. Even with explicit re-confirmation, there is no override. Nothing
signed, nothing broadcast."*
Point at `DECISION: REFUSE`, exit code 3.

**Shot 5 (75–90s) — close.**
Show the trace log line / `evidence.json` spend line.
Spoken: *"Six independent conditions, one commented policy, both outcomes on
Atlantic — plus a mainnet refusal. Total spend: three ten-thousandths of a PHRS.
This is lamp five of the LIGHTKEEPER."*

## Rules

- Never retype hashes by hand — paste from the log.
- If a command fails on camera, keep rolling and show the fix; do not re-stage.
- No background music over spoken parts; keep the terminal font large.
