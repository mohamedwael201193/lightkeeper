# T16 — Official Requirements (quoted verbatim)

Source: `~/workspace/your_files/pharos-arena-MEGA.md`, section
**"### T16 — Liquidation Watchdog (Medium, 100 · DeFi)"**.

---

### T16 — Liquidation Watchdog (Medium, 100 · DeFi)

**OFFICIAL:** (1) Reads collateral/debt/health factor from chain. (2) Configurable thresholds (e.g. warn 1.3, critical 1.1). (3) Alerts via ≥1 channel (Telegram/Discord/email/console with timestamps). (4) Each alert suggests a CONCRETE action ('repay X or add Y collateral').

**Implementation:** lending-protocol reader (Aave-style `getUserAccountData` — verify the actual view function live per protocol; test lending fixture only as labeled fallback); configurable thresholds; transition-only daemon (alert on crossing, cooldown, `state.json`); `concreteActions()` computing repay-X / add-Y amounts.

**Evidence:** config, alert log with timestamps + concrete actions, a threshold-crossing demo, share link.

**Video:** healthy position → threshold config → simulated/real dip → alert with "repay X or add Y".

**Risks:** protocol view-function differences (verify live); no live positions (labeled test fixture).

---

## How this build satisfies each official requirement

| # | Official requirement | Where it is met |
|---|---|---|
| 1 | Reads collateral/debt/health factor from chain | `watcher/watch.py` calls `MiniLend.getUserAccountData(address)` live on Atlantic via `cast call`; the HF itself is computed **on-chain** in `src/MiniLend.sol` (`healthFactor`) |
| 2 | Configurable thresholds (e.g. warn 1.3, critical 1.1) | `watcher/config.yaml`: `warn_hf: 1.3`, `critical_hf: 1.1`, `target_hf: 1.5` |
| 3 | Alerts via ≥1 channel (Telegram/… with timestamps) | Real Telegram alert, message_id **716**, plus timestamped `watcher/watcher.log` |
| 4 | Each alert suggests a CONCRETE action ('repay X or add Y collateral') | `concrete_actions()` in `watch.py`; the delivered alert read: *"repay $0.000400 of debt OR add 0.000267 PHRS collateral to restore HF ≥ 1.5"* |

Beyond the letter of the spec (per the MEGA implementation note): the threshold
crossing was driven by a **real on-chain state change** (`setPrice` $2.00 → $1.50),
not a simulation — the risk line "no live positions (labeled test fixture)" is
answered by deploying our own labeled lending pool and opening a real dust
position in it.
