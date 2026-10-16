# T17 Evidence — Natural-Language Payment Agent

All amounts are dust on **Pharos Atlantic testnet** (chain id 688689). Nothing
touched mainnet. Machine-readable companion: `evidence.json`.

## Run 1 — clean parse → review → confirm → broadcast → verified receipt

- **Input:** `send 0.01 PHRS to 0x0b0da9286706fa44be3d845b1ecf2cdd8df93625`
- **Run dir:** `runs/27845082/` (parse.json, review.json, confirmed.json, executed.json, receipt.json, transcript.log)
- **Plan id:** `ce4ba5f352f56718` — 0.01 PHRS → 0x0b0Da9286706fa44Be3d845b1eCf2cDD8df93625
- **Tx:** [0xd950168ce39280b16726967eed1d7224b92f616da1fcb9e4f5cefb74dbc6fd6f](https://atlantic.pharosscan.xyz/tx/0xd950168ce39280b16726967eed1d7224b92f616da1fcb9e4f5cefb74dbc6fd6f)
- **Receipt:** status 0x1, block 0x1e05fd7, gas 21000 @ 0x3b9aca01 wei
- **Read-back verification:** 4/4 PASS (status, to == plan recipient, value == plan amount, mined blockNumber)

Honesty note: the first verification pass of this run exposed a bug — cast
1.8.5 wraps `tx --json` in a `{"success":true,"data":{...}}` envelope, so
`to`/`value` read as null and verification failed. The bug was root-caused
and fixed in `src/verify.py` (envelope unwrapping), and the run was
re-verified to 4/4 PASS. Both the failure and the corrected re-run are in
`runs/27845082/transcript.log` — the record was not rewritten.

## Run 2 — ambiguous input REFUSED, no broadcast

- **Input:** `send 0.01 PHRS or 0.02 PHRS to 0x709d6964e15d52b392ad17e7fff848c9733fa329`
- **Run dir:** `runs/f8e7894d/` (transcript.log)
- **Outcome:** parser returned `refusal` — "Multiple PHRS amounts found: 0.01,
  0.02. I will not pick one." A subsequent `review` on the run aborts
  ("Cannot review: parse kind is 'refusal'"). **No confirmation possible, no
  broadcast attempted, no tx exists.** Zero PHRS spent.

## Run 3 — second full flow, different phrasing

- **Input:** `pay 0.015 phrs to 0x709d6964e15d52b392ad17e7fff848c9733fa329`
- **Run dir:** `runs/4cd4dfc6/` (parse.json, review.json, confirmed.json, executed.json, receipt.json, transcript.log)
- **Plan id:** `ac03460074cdc321` — 0.015 PHRS → 0x709d6964E15D52b392Ad17e7fFF848C9733FA329
- **Tx:** [0x80300f73c6ab82fe33c850ad306599c3c1d4350ff5435a57197c612205043bd2](https://atlantic.pharosscan.xyz/tx/0x80300f73c6ab82fe33c850ad306599c3c1d4350ff5435a57197c612205043bd2)
- **Receipt:** status 0x1, block 0x1e060b1, gas 21000 @ 0x3b9aca01 wei
- **Read-back verification:** 4/4 PASS

## Spend log (total 0.025042 PHRS ≤ 0.15 budget)

| Item | PHRS |
|---|---|
| Run 1 dust transfer | 0.010000 |
| Run 1 gas (21000 @ 1000000001 wei) | 0.000021 |
| Run 3 dust transfer | 0.015000 |
| Run 3 gas (21000 @ 1000000001 wei) | 0.000021 |
| Run 2 (refused, no broadcast) | 0.000000 |
| **Total** | **0.025042** |

## Unit tests

`tests/test_parser.py` — **20/20 PASS**: valid parses (canonical, verb
synonyms, case-insensitivity, exact wei math, plan-id stability/binding),
invalid inputs (empty, zero amount, over 0.15 cap, bare-hex address, short
address), ambiguous inputs (no amount, no destination, unknown token, two
amounts, two addresses, conflicting verbs, no verb, stray numbers),
prompt-injection treated as untrusted slot input, and the CI no-signing-code
grep over parser/validate/review/gate/verify.

## What was NOT done

- No LLM was used or claimed (the MEGA doc suggests a local LLM for slots;
  this build uses a deterministic grammar instead — stricter, auditable, and
  it cannot hallucinate a recipient).
- No broadcast ever happens from `new`/`review`; `send` refuses without an
  exact `CONFIRM <plan_id>` bound to the reviewed plan.
- Recipients are unspendable test fixtures (random addresses, no keys held).
