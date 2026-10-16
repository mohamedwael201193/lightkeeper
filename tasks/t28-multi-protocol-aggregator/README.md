<div align="center" style="background:#1414c8;padding:56px 24px;border-radius:14px;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:52px;letter-spacing:14px;font-weight:bold;">MULTI-PROTOCOL<br/>AGGREGATOR</div>
  <div style="color:#ffffff;font-size:17px;margin-top:18px;font-style:italic;">One lighthouse. Twenty-eight lamps. Three venues, one honest ledger.</div>
  <div style="color:#b9c2f5;font-size:12px;margin-top:10px;letter-spacing:3px;">LIGHTKEEPER · TASK T28 · HARD · 200 PTS</div>
</div>

---

## 1. What it is

T28 is a multi-protocol aggregator: **one interface over N fault-isolated
on-chain venues**. It keeps a local protocol registry, pins a single block,
reads every venue's live state at that block (TVL, APYs, share price,
utilization), normalizes the figures into one report, ranks the venues by
capital efficiency and risk, routes deposit/borrow intents to the best venue
**with a written explanation for every decision**, and prepares
deposit/withdraw actions as **unsigned transactions** gated by an eth_call
dry-run. A venue that fails is marked **UNREACHABLE** — never zero-filled —
and one protocol down never breaks the others.

## 2. Official requirements → where each is met

Quoted verbatim in `REQUIREMENTS.md`. In short:

| # | Official requirement | Proven by |
|---|---|---|
| 1 | ≥2 protocols/vaults behind ONE interface | `registry.json` + `aggregate.py run`: 3 live venues (2 vaults + 1 lending pool), one CLI, one pinned block |
| 2 | Queries AND actions prepared for signature | `run` for queries; `prepare --venue … --action …` → unsigned tx JSON + dry-run gate; **never broadcast** |
| 3 | Routes to best venue + EXPLAINS WHY | `route --intent deposit\|borrow`: per-venue verdict lines, every figure traced to a live quote row |
| 4 | One protocol down without breaking others | `chaos`: forced-down venue → UNREACHABLE with reason; rest aggregates and re-ranks |
| 5 | Architecture write-up + video (strongly encouraged) | `ARCHITECTURE.md`; `VIDEO-GUIDE.md` (slot PENDING-VIDEO) |

## 3. The venues (all real, all readable)

Sibling LIGHTKEEPER tasks (T02 emitter, T07 pools, T10 distributor, T15 vault,
T16 lending) had **deployed nothing on-chain** at build time (verified by
sweeping their `evidence.json`/`src`/`broadcast` trees — zero addresses
found), so they sit in the registry as `PENDING` and T28 deployed its own
minimal venue set on Pharos Atlantic (chain 688689):

| Venue | Contract | Address | Deploy tx |
|---|---|---|---|
| T28-VAULT-A · MeridianVault (2.5% target APY) | SimpleVault | `0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9` | `0x3aca9fd7…db2068c` |
| T28-VAULT-B · HalcyonVault (5.2% target APY) | SimpleVault | `0x6F34a6f94f529Bf10313bA77cc34314389Dd204E` | `0xf8dc8203…8024ec204` |
| T28-LEND · TidepoolLending (utilization curve) | SimpleLending | `0x95a16e1898B09CcE5e03765Baa55C8C112cb80C2` | `0xd655bfbb…cc82c08` |

Full hashes + explorer links in `evidence.json` / `LINKS.md`.

## 4. How to run

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a
export PATH="$HOME/.foundry/bin:$PATH"
cd ~/workspace/lightkeeper/tasks/t28-multi-protocol-aggregator

python3 aggregate.py discover                                  # bytecode-verify venues
python3 aggregate.py run                                        # full aggregation @ pinned block
python3 aggregate.py route --intent deposit --amount-wei 1000000000000000
python3 aggregate.py route --intent borrow  --amount-wei 100000000000000
python3 aggregate.py prepare --venue T28-VAULT-B --action deposit --amount-wei 100000000000000
python3 aggregate.py health                                     # circuit breakers
python3 aggregate.py chaos                                       # degraded-mode demo
python3 -m pytest tests/ -q                                     # 10 unit tests
```

`aggregate.py` never signs and never broadcasts — reads only.

## 5. Sample output (real run, block 31482191)

```
== T28 aggregation run — block 31482191 ==

[OK] T28-VAULT-A (vault) 0x5543fb53…7f0D3d9
  TVL: 0.002000001 PHRS | supply APY: 2.50% | share price: 1.000000
[OK] T28-VAULT-B (vault) 0x6F34a6f9…89Dd204E
  TVL: 0.001000001 PHRS | supply APY: 5.20% | share price: 1.000001
[OK] T28-LEND (lending) 0x95a16e18…112cb80C2
  TVL: 0.002500000 PHRS | supply APY: 0.74% | borrow APY: 4.99% | util: 16.66%

-- comparison (ranked by live supply APY) --
  T28-VAULT-B  apy= 5.20% capEff=100.00% tvl=0.001000
  T28-VAULT-A  apy= 2.50% capEff=100.00% tvl=0.002000
  T28-LEND     apy= 0.74% capEff= 16.66% tvl=0.002500

intent=deposit amount=0.001000 PHRS @ block 31482335
winner: T28-VAULT-B
  - T28-VAULT-B: SELECTED — supply APY 5.20% (block 31482335), TVL 0.001000 PHRS
  - T28-VAULT-A: passed-over — supply APY 2.50% (block 31482335), TVL 0.002000 PHRS
  - T28-LEND: passed-over — supply APY 0.74% (block 31482335), TVL 0.002500 PHRS
```

## 6. Evidence

- `evidence.md` / `evidence.json` — 7 real transactions (3 deploys + 4 seeds),
  spend log, curl-tested explorer links, full aggregation run values.
- `runs/` — machine artifacts: `discovery.json`, two pinned-block reports,
  both route transcripts, two prepare transcripts, the chaos demo transcript.
- `LINKS.md` — every link curl-verified (HTTP 200).

## 7. Risks & honest gaps

- Sibling venues are PENDING, not live — the registry says so instead of
  faking integrations. If siblings deploy later, add them and re-run discovery.
- Venues are purpose-built minimal contracts (dust-scale TVL), not production
  protocols — the comparison view is real math on real state, at dust scale.
- Slippage/fees are not modeled; amounts are dust.
- The Atlantic RPC is slow (~10s/call); venue reads are parallelized but a
  full run still takes ~90s.
- Video slot is PENDING-VIDEO (filmed per `VIDEO-GUIDE.md`, never staged).

## 8. Files

```
src/SimpleVault.sol  src/SimpleLending.sol  foundry.toml
registry.json            # protocol registry (3 live + 5 PENDING siblings)
aggregate.py             # discover|run|route|prepare|health|chaos
tests/test_normalize.py  # 10 unit tests
runs/                    # live artifacts (discovery, reports, routes, chaos)
task.yaml  REQUIREMENTS.md  ARCHITECTURE.md  README.md
evidence.md  evidence.json  REVIEWER_NOTES.md  LINKS.md
SUBMISSION.md  VIDEO-GUIDE.md
```

Budget: ≤ 0.15 PHRS total · operator wallet `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` ·
chain: Pharos Atlantic testnet (688689) · testnet only, dust amounts.
