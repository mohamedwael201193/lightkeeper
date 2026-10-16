# SUBMISSION PACK — T23 Wallet Risk Checker (copy-paste into the Arena form)

## Title

T23 — Wallet Risk Checker (lightkeeper)

## One-liner

Read-only risk checker for Atlantic: 8 real on-chain checks per address with
per-check PASS/FLAG reports and a disclosed-heuristic LOW/MED/HIGH level —
no invented scores.

## Description

For any Pharos Atlantic address, `node bin/run.mjs <address>` runs 8 live
on-chain checks — account age (first-activity block), tx count / freshly-funded
pattern, native balance, contract-vs-EOA with code-verification status, recent
activity window, interaction diversity from Transfer logs, approval hygiene
from Approval logs, flagged-address watchlist — and prints a per-check
PASS / FLAG / UNKNOWN / N/A report with raw values and plain-language
explanations, plus a disclosed-heuristic composite (HIGH if watchlist hit or
≥3 FLAGs; MED if 1–2 FLAGs or any UNKNOWN; LOW if 0 FLAGs and 0 UNKNOWNs).
Every heuristic is labeled HEURISTIC; the composite formula is printed in
every report and is never presented as an authoritative score.

Demonstrated on two real Atlantic addresses: the established deployer wallet
`0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` (168-day-old EOA → MED with one
genuine unlimited-approval hygiene flag disclosed) and a fresh self-deployed
test fixture `0x2459eC8B2ca982a8c2C6188c098701177D63EC43` (32 blocks old,
unverifiable bytecode, freshly funded, zero counterparties → HIGH).
The fixture is explicitly labeled a test fixture demonstrating flag mechanics
on a known-benign contract — never an accusation.

Tests (`node test/run-tests.mjs`) run the checker live on both addresses and
assert every raw value matches independent `cast` queries (block-pinned for
determinism): ALL TESTS PASSED. Read-only — no signer, no broadcasts; total
spend ~0.00127 PHRS (fixture deployment + funding dust).

## Interactive demo (LIVE surface, no install)

The LIGHTKEEPER console hosts an interactive Tier-A surface for this task —
paste any Atlantic address and the report renders live in the page:

**https://lightkeeper-console.vercel.app/#/task/wallet-risk-checker**

What it does (all live reads, zero signatures, zero spend): all 8 checks —
native balance (`eth_getBalance`), tx count (`eth_getTransactionCount`),
EOA-vs-contract (`eth_getCode`), first-activity age via nonce binary search
with real block timestamps (funding-age probe for never-outbound wallets,
like the CLI), recent activity burst from the nonce delta, interaction
diversity from `Transfer` logs, and approval hygiene from `Approval` logs in
the last 10,000 blocks — now including the actual token → spender grant
pairs ("who can drain this wallet"), each linked to the explorer. Per-check
PASS / FLAG / UNKNOWN / N/A chips, raw values, the disclosed-heuristic
composite formula printed with every report, and — the differentiator — a
plain-language "why this flag exists / what to do" box on every flag.
Coverage boundaries are printed honestly on the page (native transfers are
invisible in logs; approval hygiene covers the last 10,000 blocks only;
the explorer verification API is unreachable, so contract source reports
UNKNOWN). Demo buttons pre-fill the two evidence addresses (established
wallet → MED; fresh test fixture → flags explained).

## Proof link

Repo + evidence (evidence.md / evidence.json with tx hashes, block numbers,
spend log): see Repo link below. Live re-verification: `node bin/run.mjs
<address>` reproduces any report.

## Repo link (commit-pinned)

https://github.com/mohamedwael201193/lightkeeper/tree/d9ef4d7f02542483734fef43cb58b20c6fcc6cbc/tasks/t23-wallet-risk-checker

## Video link

PENDING-VIDEO — slot reserved; filming guide in VIDEO-GUIDE.md (45–90s, real
terminal output, no staged fakes).

## Notes for the reviewer

See REVIEWER_NOTES.md (verbatim): 30-second test commands, what broke
(honest notes: RPC null-topic limitation, unreachable explorer verification
API, empty Atlantic watchlist → S8 N/A, superseded first fixture deployment,
~0.00127 PHRS total spend).
