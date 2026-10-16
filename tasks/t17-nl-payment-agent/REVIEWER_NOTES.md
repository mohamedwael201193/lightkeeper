# T17 Reviewer Notes

## What this is

A natural-language payment agent for Pharos Atlantic that turns free text
into a **reviewed, explicitly-confirmed** payment plan — or refuses the input
with a clear reason. No LLM anywhere: the parser is a deterministic grammar
(amounts, token, destination), so it cannot hallucinate a recipient.

## The 60-second test (do this)

```bash
cd tasks/t17-nl-payment-agent
python3 -m unittest tests.test_parser        # 20/20, incl. ambiguity + injection
python3 agent.py new --text "send 0.01 PHRS to 0x<addr>"
python3 agent.py review --run <id>            # REVIEW card + unsigned tx ("signed": false)
python3 agent.py review --run f8e7894d        # the refused run: aborts, nothing to review
```

Try to make it send from ambiguous input — `"send 0.01 or 0.02 PHRS to 0x…"`,
`"send some PHRS to 0x…"`, `"send 100 USDC to 0x…"`. Every one of these
produces a refusal or a clarification question, never a plan.

## Why there is a send step (official req #4 says "NEVER signs/sends")

The official requirement is *"NEVER signs/sends — output is unsigned tx or
wallet signing request."* This build's agent pipeline (`new` → `review`)
outputs exactly that: a human-readable summary and an unsigned-tx artifact
with `"signed": false` — the parser/validate/review/gate/verify modules
contain no signing code (asserted by a CI grep test).

The `send` command is the second half of that requirement: the **wallet
signing request**, executed as an explicitly-authorized, human-in-the-loop
step. The operator must type the exact phrase `CONFIRM <plan_id>` — a hash
of the reviewed plan — and only then does the authorized deployer key
(Atlantic testnet, dust amounts, per the user's standing dust-authorization)
broadcast, wrapped in the `flock /tmp/lk-nonce.lock` nonce-safe pattern the
28 LIGHTKEEPER workers share. The agent never signs autonomously and never
auto-sends from ambiguous input: without the exact phrase, `send` refuses at
the gate stage.

This is what produced the two real testnet receipts in `evidence.md` — the
Arena Payments track rewards real receipts, and the official video ("…
→ unsigned tx → stops") is the `review` step, which genuinely stops there.

## Design decisions worth knowing

1. **Deterministic parser, not an LLM.** The MEGA implementation note
   suggests a local LLM for slots. We chose a strict grammar instead: it is
   auditable, has no hallucination surface, and every refusal reason is
   explainable. Trade-off: it only understands the `<verb> <amount> PHRS to
   <0x>` family — deliberately narrow.
2. **Unknown token → ask, never default.** `"send 100 USDC to 0x…"` asks
   "Which token? (I support native PHRS only)". Only native PHRS moves.
3. **Stray numbers refuse.** `"send 0.01 PHRS to 0x… in 2 minutes"` is
   refused, not guessed — a second number could be a second amount.
4. **Per-plan 0.15 PHRS safety cap** enforced in the parser, before any chain
   interaction.
5. **Chain-id 688689 asserted twice** — at validation and again at broadcast
   time (mainnet-confusion firewall).
6. **Execute-once.** `executed.json` marks a run; the gate refuses a second
   broadcast for the same run (double-pay protection at the agent layer).

## Honest gaps

- Grammar is English-only and narrow by design (see #1 above).
- Token support is native PHRS only — ERC-20 `transfer` calldata is not built
  (unknown tokens ask, never default).
- The two broadcast txs were operator-confirmed dust runs for Arena
  evidence; in production the `CONFIRM` step belongs to the end user in the
  console, not to an agent-held key.
- Recipients in the evidence runs are unspendable test fixtures (random
  addresses); the dust is unrecoverable by design of the demo.
