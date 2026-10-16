# VIDEO-GUIDE — T23 Wallet Risk Checker (45–90 seconds)

One unique slot for T23. Real terminal output only — no staged fakes, no
mock runs. Record the terminal (and only the terminal) at 1080p, monospace
font ≥16pt.

## New interactive shot (console surface — the demo that sells it)

| # | Time | Shot | Spoken script |
|---|---|---|---|
| A | 0–10s | Console at `#/task/wallet-risk-checker`: "X-ray any wallet"; click "Established wallet", "Run live scan"; show MED composite banner + S7 unlimited-approval flag with its plain-language "why / what to do" box | "And it lives in the LIGHTKEEPER console. Paste any Atlantic address — no wallet, no signature, no gas. The established wallet scores MED, and the flag teaches: what an unlimited approval means, and exactly what to do about it." |
| B | 10–28s | Click "Fresh fixture contract", re-scan; show the young-account FLAG, funded-but-idle FLAG, unverifiable-code UNKNOWN, composite banner | "Now the fresh fixture — a young contract I deployed for this demo. Funded but idle, unverifiable bytecode. Each flag is explained in plain language with a next step — the report teaches, not just scores." |

Record the new shots at 1080p; then append the original 45–90s terminal
slot (shots 1–5) for the full 8-check CLI proof. Title the upload `T23
Wallet Risk Checker — lightkeeper`. Use this slot for T23 only.

## Shot list (original terminal slot — keep, append after the new shots)

| # | Time | Shot | Spoken script |
|---|---|---|---|
| 1 | 0–8s | Terminal; `cd tasks/t23-wallet-risk-checker && head -30 README.md` showing the OCTOPUS header + section 1 | "T23 Wallet Risk Checker. Eight real on-chain checks per address, every heuristic labeled, no invented risk score." |
| 2 | 8–30s | `node bin/run.mjs 0x2459eC8B2ca982a8c2C6188c098701177D63EC43` — live run on the fresh fixture contract; scroll through the S1 FLAG (32 blocks old), S4 UNKNOWN (unverifiable code), composite HIGH | "First, a fresh contract I deployed for this demo. Thirty-two blocks old, unverified bytecode, freshly funded, zero counterparties — the checker flags each one in plain language and lands on HIGH, by the formula printed right there." |
| 3 | 30–52s | `node bin/run.mjs 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` — live run on the established wallet; show S1 PASS (168 days), S7 FLAG (one unlimited approval), composite MED | "Now the established wallet: a hundred and sixty-eight days old, active — but it surfaces a real unlimited token approval and thin recent counterparties, so MED, with the reasons spelled out." |
| 4 | 52–70s | `node test/run-tests.mjs` — tail of the run showing `ALL TESTS PASSED` | "And the tests don't trust the checker: every raw value is cross-checked against independent cast queries against the same node." |
| 5 | 70–80s | `cat evidence.json \| head -40` — tx hashes, block numbers, spend log | "Evidence is on-chain: deployment and funding transactions, block numbers, and a spend log — about a thousandth of a PHRS total." |

## Rules for the recording

- Run every command LIVE during the recording. If a command fails, keep the
  take and narrate the failure honestly — a recovered failure beats a fake.
- Never paste pre-written output and pretend it is live. The reviewer can
  re-run every command shown.
- Keep it under 90 seconds. Title the upload `T23 Wallet Risk Checker —
  lightkeeper` and use this slot for T23 only (no reused videos/links).
