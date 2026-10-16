<div align="center" style="background:#1414c8;padding:48px 24px;border-radius:4px;">
  <div style="font-family:Georgia,'Times New Roman',serif;color:#d9a821;font-size:42px;letter-spacing:14px;">LIQUIDATION&nbsp;WATCHDOG</div>
  <div style="color:#ffffff;font-size:15px;margin-top:18px;font-style:italic;">The octopus never blinks — one arm on every position, one lamp for every warning.</div>
  <div style="color:#b9c2f5;font-size:12px;margin-top:10px;letter-spacing:3px;">LIGHTKEEPER · T16 · PHAROS ATLANTIC</div>
</div>

---

## 1. What it is

A liquidation watchdog for on-chain lending positions. A minimal lending pool
(`MiniLend`) computes a **real Aave-style health factor on-chain**; an off-chain
watcher reads it live, evaluates it against configurable thresholds, and fires a
**single transition-only Telegram alert** carrying a **concrete action** —
repay $X of debt, or add Y PHRS collateral. Proven end-to-end on Pharos
Atlantic: healthy → real price drop → WARNING alert delivered → real repay →
recovered. No mocks, no simulations, no spam.

## 2. Architecture

```
 ┌──────────────┐  getUserAccountData()   ┌──────────────┐  zone transition   ┌──────────┐
 │   MiniLend   │ ─────────────────────▶  │ watcher/     │ ───────────────▶  │ Telegram │
 │  (Atlantic)  │   collateral/debt/HF    │  watch.py    │  WARNING/CRITICAL │  alert   │
 │  HF on-chain │   price, LT             │  thresholds  │  + concrete $/PHRS│  (1 only)│
 └──────────────┘  via cast call          └──────────────┘  state.json       └──────────┘
        ▲                                        │
        │ setPrice / deposit / borrow / repay     │ watcher.log (timestamps)
        │ (real txs, flock-guarded)              ▼
        └────────────────────────────────  transition-only: no duplicates
```

## 3. The on-chain math

`src/MiniLend.sol` — collateral is native PHRS (wei), debt is USD-denominated
(8 decimals, Chainlink-style), the oracle price is updated **on-chain** by
`setPrice` (emits `PriceUpdated`):

```
HF = (collateralUSD × LT) / debtUSD,   LT = 80%,   1e18 == 1.0
```

Debt-free positions return `type(uint256).max`. Borrowing or withdrawing that
would push HF below 1.0 reverts. Debt is USD-denominated on purpose: it is what
makes the oracle price move the health factor — the realistic
borrow-stable-against-volatile-collateral shape.

## 4. The watcher

`watcher/watch.py` (Python + `cast`, no new dependencies):

- Reads `watcher/config.yaml` — thresholds `warn_hf: 1.3`, `critical_hf: 1.1`,
  action target `target_hf: 1.5` (all configurable, nothing hard-coded).
- Calls `getUserAccountData` live, classifies OK / WARNING / CRITICAL.
- **Transition-only**: `watcher/state.json` stores the last zone; an alert fires
  only on entry into WARNING/CRITICAL. Re-runs in the same zone stay silent;
  recovery logs `RECOVERED` silently.
- `concrete_actions()` computes both fixes for the target HF: repay-$X of debt,
  or add-Y-PHRS collateral — the alert carries both numbers.

## 5. Live detection run (real chain, real alert)

| Time (UTC) | Block | HF | Zone | Event |
|---|---|---|---|---|
| 04:13:33 | 31481623 | 1.6000 | OK | Position opened (0.002 PHRS coll., $0.002 debt) — no alert |
| 04:15:51 | 31481762 | 1.2000 | **WARNING** | `setPrice` $2.00 → $1.50 on-chain → **Telegram alert, message_id 716** |
| 04:16:18 | 31481788 | 1.2000 | WARNING | Re-run — **no duplicate** |
| 04:18:32 | 31481892 | 1.5000 | OK | Real repay of $0.0004 → **RECOVERED**, no alert |

The delivered alert read: *"🟠 LIQUIDATION WATCHDOG — WARNING … Health factor:
1.2000 … Concrete action: repay $0.000400 of debt OR add 0.000267 PHRS
collateral to restore HF ≥ 1.5"* — with position, block, and explorer link.

> **Formula correction (2026-10-16):** the alert's add-collateral leg used the
> original formula (`repay_usd / price`); re-verified on live reads it restores
> HF to only 1.36, not 1.5. The repay leg was exact ($0.0004 → HF 1.5 on-chain).
> `watch.py` and the console try module now use the exact restore-to-target
> solution (`target × debt / lt − collateral` → 0.000500 PHRS at alert-time
> state; both legs provably restore HF = 1.5). See `evidence.md`.

## 6. Run it yourself

```bash
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ~/workspace/lightkeeper/.env; set +a   # secrets stay in env

# unit tests (9 pass)
cd ~/workspace/lightkeeper/tasks/t16-liquidation-watchdog
forge test

# live check (reads chain; sends an alert ONLY on a new WARNING/CRITICAL entry)
python3 watcher/watch.py --dry-run   # prints what it would send
python3 watcher/watch.py              # live
```

To re-run the full demo: `deposit()` → `borrow()` → `setPrice()` →
`watcher/watch.py` → `repay()` → `watcher/watch.py`. All broadcasts go through
`flock /tmp/lk-nonce.lock` (28 workers share one key).

## 7. Repo layout

```
tasks/t16-liquidation-watchdog/
├── src/MiniLend.sol          # pool + on-chain health-factor math
├── test/MiniLend.t.sol        # 9 forge unit tests
├── watcher/watch.py           # the watchdog
├── watcher/config.yaml        # thresholds, contract, watched position
├── watcher/watcher.log        # real detection run
├── watcher/state.json         # last zone (transition-only)
├── lib/forge-std/             # vendored test dependency
├── task.yaml                  # manifest + budget + tx list
├── REQUIREMENTS.md            # official reqs, quoted verbatim + mapping
├── evidence.md / evidence.json# 5 real txs, message_id 716, spend log
├── REVIEWER_NOTES.md          # what to check, trade-offs, honest gaps
├── LINKS.md                   # curl-verified links
├── SUBMISSION.md              # copy-paste Arena pack
└── VIDEO-GUIDE.md             # 45–90s filming guide
```

## 8. Honest limits

- One position watched per config; multi-position is a config loop away.
- WARNING was demonstrated live; CRITICAL (< 1.1) is unit-tested
  (`testCriticalZoneOnDeepDrop`, HF 0.8) through the same code path but was not
  crossed on-chain — the one-alert mandate stopped the demo at WARNING.
- `liquidate()` exists and its guard is tested, but no liquidation was executed.
- Testnet dust only; oracle is operator-updated (labeled, auditable) rather
  than a Chainlink feed, which Atlantic does not offer for this pair.
