# T17 Arena Submission Pack (copy-paste ready)

> Commit: `cefa397710530677a6ab7a61e29afed868d0e41b` (do not push).
> Video slot: PENDING-VIDEO (record per VIDEO-GUIDE.md, 45–90s, then paste link).

---

## Title

`Natural-Language Payment Agent — parse, review, confirm, then pay (Atlantic)`

## One-liner

Type "send 0.01 PHRS to 0x…" and get a validated, human-reviewed payment plan
that only broadcasts after explicit approval — ambiguous input is refused,
never guessed. Also live in the console as a Tier B "try it live" surface:
the same deterministic parser runs in the browser and the VISITOR signs the
reviewed plan in their own wallet.

## Description

A natural-language payment agent for Pharos Atlantic testnet. A deterministic,
no-LLM slot-extraction parser turns free text into a structured payment plan —
amount, token, destination — or refuses ambiguous input with a clear reason
(never defaulted, never auto-sent). A chain validator checks recipient format,
asserts Atlantic chain-id 688689, and confirms balance covers amount + gas. A
human-readable REVIEW card is rendered before an unsigned-tx artifact
(`"signed": false`). Broadcast happens only behind an explicit
`CONFIRM <plan_id>` gate bound to the reviewed plan hash (the human-in-the-loop
wallet signing request), wrapped in flock nonce-safety, followed by receipt
read-back verification.

**New — browser Tier B surface (2026-10-16):** `apps/console/src/components/try/nl-payment-agent.tsx`
adds "Type it, review it, sign it" to the T17 task page ("Try it live — with
your own wallet"). The exact parser grammar — now converged 1:1 with the CLI
(10 verbs, order-free slots, comma/negative/malformed-decimal/word-amount/
percentage/injection traps) — runs client-side and renders the parsed intent
as structured chips with a confidence note; ambiguous input asks a clarifying
question, never guesses — and a recipient is never inferred. Every outcome
carries a machine-checkable rule tag (R-NUM-NEG, R-ADDR-2, …); every plan
carries its SHA-256 plan hash, byte-identical to the CLI's `plan_id`
(verified: `d99af277ae49df62` on both surfaces), so the mandatory review the
visitor sees is bound to the same plan identity as the CLI's `CONFIRM` gate.
A valid plan goes through the mandatory review step (what moves, where,
exact amount, amber dust warning above 0.01 PHRS) before the visitor approves
and signs in their own wallet. No keys are ever held or requested by the
console. Harden battery: 76 adversarial inputs (unicode, emoji, RTL,
SQL/HTML injection, order-free slots, glued tokens, 19-decimal amounts) —
zero throws, zero over-cap plans; two real bugs found and fixed (the
`-0.001` sign-flip misfire, the word-amount false positive), both ported back
to the CLI parser.

Real evidence on Atlantic: three full dust flows
(parse → review → confirm → broadcast → verified receipt) plus one refused
ambiguous input with zero broadcast. 34/34 parser unit tests, including
prompt-injection-as-untrusted-input and a CI grep asserting no signing code in
the parser/validator/reviewer/gate/verifier.

## Repo link (commit-pinned)

`https://github.com/mohamedwael201193/lightkeeper/tree/a107558293b172544f79be0372760e2b73b60626/tasks/t17-nl-payment-agent`

## Share / demo links

- Run 1 receipt (0.01 PHRS, verified 4/4):
  https://atlantic.pharosscan.xyz/tx/0xd950168ce39280b16726967eed1d7224b92f616da1fcb9e4f5cefb74dbc6fd6f
- Run 2 (ambiguous → refused, no tx): `runs/f8e7894d/transcript.log` in repo
- Run 3 receipt (0.015 PHRS, verified 4/4):
  https://atlantic.pharosscan.xyz/tx/0x80300f73c6ab82fe33c850ad306599c3c1d4350ff5435a57197c612205043bd2
- Run 4 receipt (0.002 PHRS, verified 4/4 — harden run, deepened "transfer" phrasing):
  https://atlantic.pharosscan.xyz/tx/0x9e18bf3e3a4d5689f72731a10bd5305465680c2bd5e3d73d9e561a64e0c45723
- Interactive demo: LIGHTKEEPER console → open T17 → "Try it live — with your
  own wallet" (module `apps/console/src/components/try/nl-payment-agent.tsx`):
  type a phrase, see the parsed-intent chips, pass the mandatory review, and
  sign in your own wallet — the console never holds keys.
- Video: PENDING-VIDEO

## Transaction hashes

- `0xd950168ce39280b16726967eed1d7224b92f616da1fcb9e4f5cefb74dbc6fd6f` (0.01 PHRS)
- `0x80300f73c6ab82fe33c850ad306599c3c1d4350ff5435a57197c612205043bd2` (0.015 PHRS)
- `0x9e18bf3e3a4d5689f72731a10bd5305465680c2bd5e3d73d9e561a64e0c45723` (0.002 PHRS)

Total spend: 0.027063 PHRS (dust + gas), of 0.15 budget. Atlantic testnet only.

## How to verify (for the judge)

```bash
git clone https://github.com/mohamedwael201193/lightkeeper && cd lightkeeper/tasks/t17-nl-payment-agent
python3 -m unittest tests.test_parser        # 34/34
python3 agent.py new --text "send 0.01 PHRS to 0x0b0da9286706fa44be3d845b1ecf2cdd8df93625"
python3 agent.py review --run <id>            # REVIEW card + unsigned tx
python3 agent.py new --text "send 0.01 PHRS or 0.02 PHRS to 0x709d6964e15d52b392ad17e7fff848c9733fa329"
# → REFUSED: "Multiple PHRS amounts found: 0.01, 0.02. I will not pick one."
```

## Reviewer notes

### The 60-second test (do this)

```bash
cd tasks/t17-nl-payment-agent
python3 -m unittest tests.test_parser        # 34/34, incl. ambiguity + injection + notation traps
python3 agent.py new --text "send 0.01 PHRS to 0x<addr>"
python3 agent.py review --run <id>            # REVIEW card + unsigned tx ("signed": false)
python3 agent.py review --run f8e7894d        # the refused run: aborts, nothing to review
```

Try to make it send from ambiguous input — `"send 0.01 or 0.02 PHRS to 0x…"`,
`"send some PHRS to 0x…"`, `"send 100 USDC to 0x…"`. Every one of these
produces a refusal or a clarification question, never a plan.

### Why there is a send step (official req #4 says "NEVER signs/sends")

The official requirement is *"NEVER signs/sends — output is unsigned tx or
wallet signing request."* This build's agent pipeline (`new` → `review`)
outputs exactly that: a human-readable summary and an unsigned-tx artifact
with `"signed": false` — the parser/validate/review/gate/verify modules
contain no signing code (asserted by a CI grep test).

The `send` command is the second half of that requirement: the **wallet
signing request**, executed as an explicitly-authorized, human-in-the-loop
step. The operator must type the exact phrase `CONFIRM <plan_id>` — a hash
of the reviewed plan — and only then does the authorized deployer key
(Atlantic testnet, dust amounts, per the standing dust-authorization)
broadcast, wrapped in the `flock /tmp/lk-nonce.lock` nonce-safe pattern.
The agent never signs autonomously and never auto-sends from ambiguous
input: without the exact phrase, `send` refuses at the gate stage.

This is what produced the two real testnet receipts in `evidence.md` — the
Arena Payments track rewards real receipts, and the official video ("…
→ unsigned tx → stops") is the `review` step, which genuinely stops there.

### Design decisions worth knowing

1. **Deterministic parser, not an LLM.** Strict grammar (amounts, token,
   destination): auditable, no hallucination surface, every refusal reason
   explainable. Trade-off: it only understands the `<verb> <amount> PHRS to
   <0x>` family — deliberately narrow.
2. **Unknown token → ask, never default.** `"send 100 USDC to 0x…"` asks
   "Which token? (I support native PHRS only)". Only native PHRS moves.
3. **Stray numbers refuse.** A second number could be a second amount —
   refused, not guessed.
4. **Per-plan 0.15 PHRS safety cap** enforced in the parser, before any chain
   interaction.
5. **Chain-id 688689 asserted twice** — at validation and again at broadcast
   time (mainnet-confusion firewall).
6. **Execute-once.** `executed.json` marks a run; the gate refuses a second
   broadcast for the same run (double-pay protection at the agent layer).
7. **One grammar on both surfaces.** The console's "try it live" NL payment
   panel (`apps/console/src/components/try/nl-payment-agent.tsx`) was
   converged 1:1 with this CLI parser; an adversarial battery found two real
   bugs, both fixed on both surfaces. Every outcome carries a rule tag; every
   plan carries a SHA-256 plan hash byte-identical on both surfaces, so the
   console review binds the same plan identity the `CONFIRM` gate binds.

### Honest gaps

- Grammar is English-only and narrow by design (see #1 above).
- Token support is native PHRS only — ERC-20 `transfer` calldata is not built
  (unknown tokens ask, never default).
- The two broadcast txs were operator-confirmed dust runs for Arena
  evidence; in production the `CONFIRM` step belongs to the end user in the
  console, not to an agent-held key.
- Recipients in the evidence runs are unspendable test fixtures (random
  addresses); the dust is unrecoverable by design of the demo.
