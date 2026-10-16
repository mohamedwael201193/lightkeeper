# T25 — Video Guide (45–90 seconds, shot-by-shot)

**Rule: NO staged fakes.** Every number on screen comes from a real terminal run against Pharos Atlantic. Re-run the commands below to capture; do not type expected output by hand.

## Setup (before recording)

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a
cd ~/workspace/lightkeeper/tasks/t25-dapp-support-agent
# terminal font large, window 1280x720
```

## Shot list

### Shot 1 — The failure (0:00–0:12)
**Show:** terminal, run:
`python3 src/support_agent.py diagnose 0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf`
**Say:** "A user pastes a failed transaction hash. The support agent pulls the real receipt from Atlantic — status zero, and gas used equals the gas limit: one hundred twenty thousand. That's out of gas."

### Shot 2 — The explanation + fix (0:12–0:30)
**Show:** scroll the same output to the plain-language paragraph and the Citation block.
**Say:** "It explains it in plain words, suggests resending with one-point-five to two times the limit, and cites the Pharos FAQ — source URL, fetch date, and the exact excerpt. No improvisation."

### Shot 3 — A different failure type (0:30–0:45)
**Show:** run:
`python3 src/support_agent.py diagnose 0x405295cd89ef7469ded00bf6fe1ba99ab42739bc9154b10b9ed9641185c0ca23`
**Say:** "Second failure type: a contract revert. The agent replays the call, decodes the revert reason — 'intentional revert with reason' — and tells the user to fix the input the message names."

### Shot 4 — The honest 'I don't know' (0:45–1:05)
**Show:** run:
`python3 src/support_agent.py ask "How do I run a confidential transaction on Pharos?"`
**Say:** "And when the docs don't cover a question, it says so — labeled unverified — instead of inventing an answer. Three real failure types, real receipts, real citations."

### Shot 5 — Proof strip (1:05–1:20, optional if under 90s)
**Show:** browser on `https://atlantic.pharosscan.xyz/tx/0x31993dc871fea0f0788d2f8647f9f45749b0f4a5793053ddfcd9ae12d1f3f5cf` — status "Failed", gas used 120000.
**Say:** "Every claim is checkable on the Atlantic explorer."

### Shot 6 — The interactive console panel (1:20–1:45)
**Show:** the LIGHTKEEPER console, lamp T25 panel: click the "Out of gas" preset — the diagnosis card appears live. Then paste a DIFFERENT hash (your own failed Atlantic tx, or the panic preset) and diagnose again.
**Say:** "And it's live in the console: paste any Atlantic hash — including your own failed transaction — and get the same honest diagnosis. No wallet, no signature, costs nothing."

### Shot 7 — The unknown path (1:45–1:55, optional)
**Show:** diagnose a hash whose cause the engine can't pin down; scroll to "Unknown cause — here is the raw receipt."
**Say:** "When it can't pin down the cause, it says so and shows the raw receipt — it never invents a diagnosis."

## Spoken script (full, ~75s)

> "This is the dApp Support Agent, lamp twenty-five. A user pastes a failed transaction hash. The agent pulls the real receipt from the Atlantic testnet — status zero, gas used equals the gas limit: out of gas. It explains that in plain words, suggests a higher limit, and cites the Pharos FAQ with the source URL and the exact excerpt. A second hash: a contract revert — the agent replays the call and decodes the reason, telling the user exactly which input to fix. And when the docs don't cover a question, it says so instead of improvising. Three real failure types, real receipts, checkable on the explorer. That's the lamp."

## Capture checklist

- [ ] All three commands re-run live during capture (no pasted output)
- [ ] Explorer page visibly shows matching block/gas numbers
- [ ] No secrets visible (`$DEPLOYER_PRIVATE_KEY` never echoed; env file never opened on screen)
- [ ] Total runtime 45–90s
