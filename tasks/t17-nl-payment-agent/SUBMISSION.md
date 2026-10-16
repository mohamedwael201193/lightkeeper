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
your own wallet"). The exact parser grammar (deepened: 10 verbs, order-free
slots, comma-number/word-amount/percentage/injection traps → refusal) runs
client-side and renders the parsed intent as structured chips with a
confidence note; ambiguous input asks a clarifying question, never guesses —
and a recipient is never inferred. A valid plan goes through the mandatory
review step (what moves, where, exact amount, amber dust warning above 0.01
PHRS) before the visitor approves and signs in their own wallet. No keys are
ever held or requested by the console.

Real evidence on Atlantic: two full dust flows
(parse → review → confirm → broadcast → verified receipt) plus one refused
ambiguous input with zero broadcast. 20/20 parser unit tests, including
prompt-injection-as-untrusted-input and a CI grep asserting no signing code in
the parser/validator/reviewer/gate/verifier.

## Repo link (commit-pinned)

`https://github.com/mohamedwael201193/lightkeeper/tree/cefa397710530677a6ab7a61e29afed868d0e41b/tasks/t17-nl-payment-agent`

## Share / demo links

- Run 1 receipt (0.01 PHRS, verified 4/4):
  https://atlantic.pharosscan.xyz/tx/0xd950168ce39280b16726967eed1d7224b92f616da1fcb9e4f5cefb74dbc6fd6f
- Run 2 (ambiguous → refused, no tx): `runs/f8e7894d/transcript.log` in repo
- Run 3 receipt (0.015 PHRS, verified 4/4):
  https://atlantic.pharosscan.xyz/tx/0x80300f73c6ab82fe33c850ad306599c3c1d4350ff5435a57197c612205043bd2
- Interactive demo: LIGHTKEEPER console → open T17 → "Try it live — with your
  own wallet" (module `apps/console/src/components/try/nl-payment-agent.tsx`):
  type a phrase, see the parsed-intent chips, pass the mandatory review, and
  sign in your own wallet — the console never holds keys.
- Video: PENDING-VIDEO

## Transaction hashes

- `0xd950168ce39280b16726967eed1d7224b92f616da1fcb9e4f5cefb74dbc6fd6f` (0.01 PHRS)
- `0x80300f73c6ab82fe33c850ad306599c3c1d4350ff5435a57197c612205043bd2` (0.015 PHRS)

Total spend: 0.025042 PHRS (dust + gas), of 0.15 budget. Atlantic testnet only.

## How to verify (for the judge)

```bash
git clone https://github.com/mohamedwael201193/lightkeeper && cd lightkeeper/tasks/t17-nl-payment-agent
python3 -m unittest tests.test_parser        # 20/20
python3 agent.py new --text "send 0.01 PHRS to 0x0b0da9286706fa44be3d845b1ecf2cdd8df93625"
python3 agent.py review --run <id>            # REVIEW card + unsigned tx
python3 agent.py new --text "send 0.01 PHRS or 0.02 PHRS to 0x709d6964e15d52b392ad17e7fff848c9733fa329"
# → REFUSED: "Multiple PHRS amounts found: 0.01, 0.02. I will not pick one."
```
