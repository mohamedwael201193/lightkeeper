<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:8px;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:42px;letter-spacing:14px;">T17</div>
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:20px;letter-spacing:6px;margin-top:12px;">NATURAL-LANGUAGE PAYMENT AGENT</div>
  <div style="color:#f4f6ff;font-size:14px;margin-top:16px;font-style:italic;">One lamp of twenty-eight — the octopus reads your words, and never moves a coin it was not told to move.</div>
</div>

---

## 1. What it is

A natural-language payment agent for **Pharos Atlantic testnet** (chain id
688689). You type `send 0.01 PHRS to 0x…`; the agent parses it into a
structured plan, validates it against the chain, shows you a human-readable
**REVIEW** card, and only moves funds after you type the exact phrase
`CONFIRM <plan_id>`. Ambiguous input is **refused with a clear reason** —
never guessed, never defaulted, never auto-sent.

There is **no LLM** in this agent. The parser is a small deterministic grammar
(amounts, token, destination). It cannot hallucinate a recipient.

## 2. How it works — the pipeline

```
new      "send 0.01 PHRS to 0x…"   →  plan | clarification | refusal
review   --run <id>                →  chain validation + REVIEW card + unsigned tx
confirm  --run <id> --phrase "…"   →  explicit CONFIRM <plan_id> gate
send     --run <id>                →  broadcast (confirmed only) + receipt read-back
```

Each stage is a separate command with inspectable artifacts in `runs/<id>/`:
`parse.json`, `review.json`, `confirmed.json`, `executed.json`,
`receipt.json`, and a full `transcript.log`.

## 3. Quickstart

```bash
cd tasks/t17-nl-payment-agent
export PATH="$HOME/.foundry/bin:$PATH"

# 1. Parse free text into a plan
python3 agent.py new --text "send 0.01 PHRS to 0x0b0da9286706fa44be3d845b1ecf2cdd8df93625"
# → run id: <id>, PARSED OK — plan_id <hash>

# 2. Review: validation + human-readable card + unsigned tx ("signed": false)
python3 agent.py review --run <id>

# 3. Confirm explicitly (phrase must match the plan hash exactly)
python3 agent.py confirm --run <id> --phrase "CONFIRM <plan_id>"

# 4. Broadcast (refuses without the confirmation above) + verify receipt
export ATLANTIC_DEPLOYER_KEY="<key-from-env-only>"
python3 agent.py send --run <id>

# Run the unit tests (20 cases: valid/invalid/ambiguous/injection/no-signing)
python3 -m unittest tests.test_parser
```

Try the refusal path: `python3 agent.py new --text "send 0.01 PHRS or 0.02 PHRS to 0x709d6964e15d52b392ad17e7fff848c9733fa329"`
then `python3 agent.py review --run <id>` — it aborts; there is no plan to review.

## 4. The grammar (what it understands)

A plan is produced **only** when the input contains exactly one of each:

| Slot | Rule |
|---|---|
| Verb | one of `send pay transfer remit wire` (case-insensitive); two different verbs → refusal |
| Amount | exactly one `<number> PHRS` (up to 18 decimals, exact integer wei math, no floats); `0` or negative → refusal; > 0.15 PHRS → refusal (per-plan safety cap) |
| Token | must be PHRS; any other unit (`USDC`, …) → clarification question, never a wrong-token default |
| Destination | exactly one `0x` + 40 hex; bare 40-hex without `0x` → refusal; two addresses → refusal; zero address → refusal |

Anything else — no verb, no amount, stray numbers (`"in 2 minutes"`), or
instruction-like phrases (`"ignore previous instructions…"`, treated as
untrusted slot input) — yields a **clarification** or a **refusal**, and the
pipeline stops. Ambiguity never becomes a transaction.

## 5. Safety model

- **Parser, validator, reviewer, gate, and verifier contain no signing code**
  (CI test greps them and asserts none exists). The unsigned-tx artifact
  carries `"signed": false`.
- **The confirmation phrase is the plan hash.** `CONFIRM <plan_id>` binds to
  the exact reviewed plan; editing the plan invalidates the confirmation.
- **Chain-id 688689 asserted twice** — at validation and again at broadcast
  time. Any other chain refuses (mainnet-confusion firewall).
- **Balance re-checked at broadcast** with a fresh gas price.
- **Nonce-safe broadcast**: every `cast send` runs under
  `flock /tmp/lk-nonce.lock` (the 28 LIGHTKEEPER workers share one key).
- **Execute-once**: a run broadcasts at most one tx; the gate refuses repeats.
- **Key hygiene**: the key comes from `ATLANTIC_DEPLOYER_KEY` env only — never
  in argv logs, transcripts, repo files, or evidence.

## 6. Evidence (real, on Atlantic)

- **Run 1** — `send 0.01 PHRS to 0x0b0d…93625` → full flow →
  [tx 0xd95016…dbc6fd](https://atlantic.pharosscan.xyz/tx/0xd950168ce39280b16726967eed1d7224b92f616da1fcb9e4f5cefb74dbc6fd6f),
  receipt status 0x1, 4/4 read-back checks PASS.
- **Run 2** — `send 0.01 PHRS or 0.02 PHRS to 0x709d…3fa329` → **REFUSED**
  ("Multiple PHRS amounts found: 0.01, 0.02. I will not pick one.").
  No confirmation possible, no broadcast, no tx. 0 PHRS spent.
- **Run 3** — `pay 0.015 phrs to 0x709d…3fa329` → full flow →
  [tx 0x80300f…5043bd](https://atlantic.pharosscan.xyz/tx/0x80300f73c6ab82fe33c850ad306599c3c1d4350ff5435a57197c612205043bd2),
  receipt status 0x1, 4/4 read-back checks PASS.
- **Spend: 0.025042 PHRS** of the 0.15 budget (dust 0.025 + gas 0.000042).
- Full transcripts: `runs/<id>/transcript.log`. Machine-readable: `evidence.json`.

## 7. Files

```
tasks/t17-nl-payment-agent/
├── agent.py              # CLI orchestrator: new / review / confirm / send
├── src/
│   ├── parse.py          # deterministic intent parser (no LLM, no signing)
│   ├── validate.py       # chain validation via cast (checksum, chain-id, balance)
│   ├── review.py         # REVIEW card + unsigned-tx artifact
│   ├── gate.py           # CONFIRM <plan_id> gate
│   ├── broadcast.py      # confirmed-only, flock-wrapped broadcaster
│   └── verify.py         # receipt read-back verification
├── tests/test_parser.py  # 20 unit tests
├── runs/                 # real runs: 27845082 ✓, f8e7894d (refused), 4cd4dfc6 ✓
├── task.yaml  REQUIREMENTS.md  README.md  evidence.md  evidence.json
├── REVIEWER_NOTES.md  LINKS.md  SUBMISSION.md  VIDEO-GUIDE.md
```

## 8. Honest limits

- English-only, narrow grammar by design; ERC-20 tokens not supported (they
  ask, never default); recipients in the evidence runs are unspendable test
  fixtures. In production the `CONFIRM` step belongs to the end user in the
  console, not to an agent-held key. See `REVIEWER_NOTES.md` for the full
  accounting, including why a `send` step exists alongside the official
  "NEVER signs/sends" requirement.
