<div align="center" style="background:#1414c8;padding:52px 24px;border-radius:10px;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:44px;letter-spacing:0.32em;">WALLET RISK CHECKER</div>
  <div style="color:#ffffff;font-size:14px;margin-top:14px;letter-spacing:0.22em;">T23 &nbsp;·&nbsp; COMPLIANCE / SECURITY &nbsp;·&nbsp; 100 PTS</div>
  <p style="color:#f4f6ff;font-style:italic;font-family:Georgia,serif;font-size:17px;margin-top:18px;">"Trust nothing. Verify everything — one check at a time."</p>
  <div style="color:#b9c2f5;font-size:12px;margin-top:10px;letter-spacing:0.12em;">ONE LIGHTHOUSE · TWENTY-EIGHT LAMPS · THE KEEPER'S TWENTY-THIRD</div>
</div>

---

## 1. What this is

A **read-only wallet risk checker for Pharos Atlantic testnet**. Give it an address; it runs **8 real on-chain checks** — account age, tx count / funding pattern, native balance, contract-vs-EOA with code-verification status, recent activity window, interaction diversity, approval hygiene, flagged-address watchlist — and prints a **per-check PASS / FLAG / UNKNOWN / N/A report** with raw values and plain-language explanations, plus a **disclosed-heuristic composite risk level (LOW/MED/HIGH)**.

**Verdict-first:** every number is a live chain read (chain ID asserted 688689 before any check). There is no invented "risk score": the composite level is derived from the checks by a formula printed in every report, and every heuristic is labeled **HEURISTIC**. Demonstrated on a real established wallet (MED, 2 hygiene flags disclosed) and a real fresh fixture contract (HIGH, 3 flags) — both with block numbers in `evidence.md`.

## 2. How it works

```
address ──▶ chain-ID assertion (688689, abort otherwise)
            ├─ S1 account age: first-activity block (nonce binary search; EIP-161-aware for contracts) [HEURISTIC]
            ├─ S2 tx count / freshly-funded pattern (idle-but-funded wallets) [HEURISTIC]
            ├─ S3 native balance (informational context, never a risk signal alone)
            ├─ S4 contract vs EOA via eth_getCode; source-verification status [HEURISTIC]
            ├─ S5 recent activity window: effective outbound txs in last 10,000 blocks [HEURISTIC]
            ├─ S6 interaction diversity: distinct counterparties in Transfer logs (10×1,000-block chunks) [HEURISTIC]
            ├─ S7 approval hygiene: Approval logs — unlimited approvals, spender count [HEURISTIC]
            └─ S8 flagged-address watchlist (configurable; N/A when unconfigured — never a fake PASS)
                          │
                          ▼
            COMPOSITE (disclosed heuristic — NOT an authoritative score):
              HIGH if watchlist hit or ≥3 FLAGs
              MED  if 1–2 FLAGs or any UNKNOWN
              LOW  if 0 FLAGs and 0 UNKNOWNs   (N/A checks excluded)
```

Notes the design is honest about: the Atlantic RPC rejects `null` topic positions, so Transfer scans fetch topic0-only and filter client-side; native PHRS transfers are not in logs (stated in every S6 report); the explorer verification API is unreachable, so contract source verification reports UNKNOWN rather than a guess; with no published flagged-address set for Atlantic testnet, S8 is N/A unless you configure one.

## 3. How to run

```bash
# read-only; spends nothing. Needs node ≥18. RPC from env (default: Atlantic).
export ATLANTIC_RPC_URL="https://atlantic.dplabs-internal.com"

node bin/run.mjs <0x-address> [--config signals.yaml] [--json-out report.json] [--block N]

# --block N pins every read to historical block N (deterministic; recommended
# for evidence since the load-balanced RPC diverges on "latest" for hot wallets)

# examples (the two evidence addresses, pinned to block 31482629)
node bin/run.mjs 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 --block 31482629 --json-out report-deployer.json
node bin/run.mjs 0x2459eC8B2ca982a8c2C6188c098701177D63EC43 --block 31482629 --json-out report-fixture.json

# live test suite: checker raw values vs independent `cast` queries (needs cast on PATH)
node test/run-tests.mjs
```

The run aborts unless the node reports chain ID **688689**. No private key is used or needed — the tool cannot sign or broadcast.

## 4. Sample output

Real output, fixture contract `0x2459eC8B2ca982a8c2C6188c098701177D63EC43` @ block 31482629 (pinned; abridged; full JSON in `sample-output/`):

```
[FLAG] S1 Account age (first activity)  (HEURISTIC)
        first_activity_block: 31481833
        age_blocks: 796
        basis: contract creation block (EIP-161: new contracts start at nonce 1, so first nonce>0 block = creation)
        -> First activity was ~796 blocks ago (block 31481833) — under the 50,000-block
           heuristic threshold. Young accounts deserve extra scrutiny... (HEURISTIC)
[UNKNOWN] S4 Account type / code verification  (HEURISTIC)
        type: contract
        bytecode_bytes: 343
        source_verified: unknown — explorer verification API unreachable
        -> ...Unverifiable logic is a real risk factor: treat interactions with extra caution.
           (UNKNOWN is not treated as safe. HEURISTIC)
------------------------------------------------------------------------
COMPOSITE (HEURISTIC, disclosed formula): HIGH
basis   : 3 checks flagged (>=3)
formula : HIGH if watchlist hit or >=3 FLAGs; MED if 1-2 FLAGs or any UNKNOWN;
          LOW if 0 FLAGs and 0 UNKNOWNs (N/A checks excluded)
note    : HEURISTIC composite derived from the checks above by the printed formula.
          It is NOT an authoritative risk score and must never be presented as one.
```

## 5. Evidence & verification

- `evidence.md` — full narrative: both reports, block numbers, tx hashes, spend log (≥300 words).
- `evidence.json` — machine-readable evidence: reports, deployment + funding txs, chain assertions, spend.
- `sample-output/report-deployer.json`, `sample-output/report-fixture.json` — the exact JSON the checker emitted.
- Re-verify any claim: `node bin/run.mjs <address>` reproduces the report; `node test/run-tests.mjs` cross-checks every raw value against independent `cast` queries.

Demo pair:
| Example | Address | Result (heuristic) | Why |
|---|---|---|---|
| A — established wallet | `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` | **MED** | 168-day-old EOA, 66 txs; flags: 2 token counterparties in window (S6), 1 unlimited approval (S7) — both disclosed, plain-language |
| B — risky pattern | `0x2459eC8B2ca982a8c2C6188c098701177D63EC43` (T23RiskFixture, self-deployed test fixture) | **HIGH** | 32 blocks old (S1), freshly funded & idle (S2), unverifiable bytecode (S4), 0 counterparties (S6) |

Example B is an explicitly labeled **test fixture** demonstrating flag mechanics — never an accusation against a third party.

## 6. Configuration

`signals.yaml` — every threshold documented, all heuristics:

| Key | Default | Meaning |
|---|---|---|
| `young_account_blocks` | 50000 | first activity < this many blocks ago → S1 FLAG |
| `activity_window_blocks` | 10000 | lookback window for S5/S6/S7 |
| `burst_outbound_txs` | 500 | outbound txs in window above this → S5 FLAG |
| `low_diversity_max_peers` | 2 | distinct counterparties ≤ this → S6 FLAG |
| `max_approval_spenders` | 5 | distinct approval spenders above this → S7 FLAG |
| `watchlist` | `[]` | flagged addresses; empty → S8 is N/A (check not applicable on Atlantic testnet) |

Thresholds tune caution, never the raw values. The composite formula is fixed and printed in every report.

## 7. Limits & honesty notes

- **Heuristics, not verdicts on people.** A FLAG means "this on-chain pattern is statistically worth a second look", never "this wallet is malicious". The fixture demo exists precisely to show the mechanics on a known-benign contract.
- **No invented score.** The composite is a disclosed aggregation of the checks. It must never be quoted without its formula and its HEURISTIC label.
- **Coverage boundaries are printed in the reports:** native transfers are invisible to the Transfer-log scan; approval history outside the 10,000-block window is not covered; first-activity for never-active addresses is UNKNOWN; contract source verification depends on an explorer API that is currently unreachable.
- **Atlantic testnet only.** The chain-ID assertion refuses any other network. The flagged-address check needs a configured watchlist to mean anything (e.g. a sanctions list for mainnet use).
- **Read-only.** No signer, no broadcast path, no state changes. The only spends in this task were the fixture deployment + funding (dust, logged in `evidence.json`).

## 8. Submission

- **Proof:** this repo + `evidence.md`/`evidence.json` (share-link slot reserved in `SUBMISSION.md`).
- **Repo:** `https://github.com/mohamedwael201193/lightkeeper/tree/<commit>/tasks/t23-wallet-risk-checker` (commit-pinned at submission).
- **Reviewer notes:** `REVIEWER_NOTES.md` (how to run the 30-second test).
- **Video:** slot reserved — see `VIDEO-GUIDE.md` (45–90s, real terminal output, no staged fakes).
