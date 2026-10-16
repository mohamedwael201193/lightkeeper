# VIDEO-GUIDE — T23 Wallet Risk Checker (45–90 seconds)

One unique slot for T23. Real terminal output only — no staged fakes, no
mock runs. Record the terminal (and only the terminal) at 1080p, monospace
font ≥16pt.

## Shot list

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
