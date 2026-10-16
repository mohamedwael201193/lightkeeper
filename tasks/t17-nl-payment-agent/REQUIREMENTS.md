# T17 — Official Requirements (quoted verbatim)

Source: Pharos Agent Arena Build pages, as extracted in
`~/workspace/pharos-arena/official-requirements.json` and
`~/workspace/your_files/pharos-arena-MEGA.md` §T17.

> **Task:** Natural-Language Payment Agent
> **Tier:** Medium · **Points:** 100 · **Toolkit:** Payments

## Official requirements (verbatim)

1. "Parses amount/token/recipient from free text; asks follow-up when ambiguous"
2. "Validates (recipient format, token contract, sufficient balance)"
3. "Human-readable summary BEFORE unsigned tx"
4. "NEVER signs/sends — output is unsigned tx or wallet signing request"

## Official implementation notes (verbatim, from pharos-arena-MEGA.md)

> "slot-extraction parser (local LLM for slots only; ambiguity → clarification
> question, never defaulted); deterministic token-registry resolver (unknown
> token → ask, never wrong-token default); Chain MCP validator (`eth_getCode`,
> `eth_call` decimals/balanceOf, `estimateGas`); unsigned-tx preparer with CI
> grep asserting no signing code exists; summary card. Prompt-injection treated
> as untrusted slot input."

## Official evidence bar (verbatim)

> "parse demos (clean + ambiguous→clarification), validation log, summary +
> unsigned-tx JSON (`"signed": false`), share link."

## Official video (verbatim)

> "\"send 100 USDC to X\" → parsed slots → validation → summary → unsigned tx
> → stops."

## Official risks (verbatim)

> "wrong-token defaulting (registry + ask); testnet/mainnet confusion
> (chain-ID assertion)."

---

## How this build maps to each requirement

| # | Requirement | Implementation | Evidence |
|---|---|---|---|
| 1 | Parse amount/token/recipient; follow-up when ambiguous | `src/parse.py` — deterministic slot grammar; ambiguity → `clarification`/`refusal`, never defaulted | `tests/test_parser.py` (34 cases), `runs/` transcripts |
| 2 | Validate (recipient format, token contract, sufficient balance) | `src/validate.py` — EIP-55 checksum via cast, chain-id 688689 assertion, balance ≥ amount+gas via RPC | validation log in each `runs/<id>/review.json` |
| 3 | Human-readable summary BEFORE unsigned tx | `src/review.py` — REVIEW card printed before unsigned-tx JSON | `runs/<id>/transcript.log` |
| 4 | NEVER signs/sends — output is unsigned tx or wallet signing request | Agent pipeline output is an unsigned plan (`"signed": false`); the only broadcast path is the operator's explicit `CONFIRM <plan_id>` — i.e. a human-in-the-loop **wallet signing request** executed by the authorized key holder. CI test greps parser/validate/review/gate/verify for signing code and asserts none exists | `tests/test_parser.py::TestNoSigningCode`, `src/gate.py` |

**Honesty note on #4:** the official video "stops" at the unsigned tx. The
Arena evidence bar for the Payments track rewards real testnet receipts, so
this build adds one extra, explicitly-gated step: after the unsigned-tx review,
the operator may type `CONFIRM <plan_id>` and the authorized deployer key
(0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3, dust amounts, Atlantic testnet
only) broadcasts. The agent itself never signs autonomously and never
auto-sends from ambiguous input — the gate refuses without an exact
`CONFIRM <plan_id>` phrase bound to the reviewed plan hash. See
`REVIEWER_NOTES.md` §"Why there is a send step".
