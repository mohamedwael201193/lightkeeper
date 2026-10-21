#!/usr/bin/env python3
"""T16 Liquidation Watchdog — reads a MiniLend position's health factor live
from Atlantic, evaluates it against configurable thresholds, and delivers a
single Telegram alert on each transition into WARNING or CRITICAL, with a
CONCRETE action (repay X USD of debt, or add Y PHRS collateral).

Transition-only: state.json records the last zone; re-running in the same
zone never re-alerts. No mocks — every number comes from a real eth_call.
"""
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HF_SCALE = 10**18
USD_DP = 10**8


def sh(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout.strip()


def load_config():
    cfg = {}
    with open(os.path.join(BASE, "watcher", "config.yaml")) as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if not line or ":" not in line:
                continue
            k, v = line.split(":", 1)
            v = v.strip().strip('"')
            try:
                v = float(v) if "." in v else int(v)
            except ValueError:
                pass
            cfg[k.strip()] = v
    return cfg


def get_account_data(cfg):
    """Real eth_call to MiniLend.getUserAccountData(user)."""
    out = sh(
        "cast", "call", str(cfg["contract"]),
        "getUserAccountData(address)(uint256,uint256,uint256,int256,uint256)",
        str(cfg["watched_user"]),
        "--rpc-url", str(cfg["rpc_url"]),
    )
    # cast prints "400000 [4e5]" per line — take the first (plain decimal) token
    vals = [int(line.split()[0]) for line in out.splitlines() if line.strip()]
    coll_usd, debt_usd, hf, price_raw, lt = vals[0], vals[1], vals[2], vals[3], vals[4]
    # price is int256; handle two's complement if needed
    if price_raw >= 2**255:
        price_raw -= 2**256
    return {
        "collateral_usd": coll_usd / USD_DP,
        "debt_usd": debt_usd / USD_DP,
        "hf": hf / HF_SCALE if hf < 2**255 else float("inf"),
        "price": price_raw / USD_DP,
        "lt_bps": lt,
    }


def zone_of(hf, cfg):
    if hf < cfg["critical_hf"]:
        return "CRITICAL"
    if hf < cfg["warn_hf"]:
        return "WARNING"
    return "OK"


def concrete_actions(data, cfg):
    """Amounts that restore HF to target_hf. Returns (repay_usd, add_phrs)."""
    target = cfg["target_hf"]
    lt = data["lt_bps"] / 10000.0
    coll, debt = data["collateral_usd"], data["debt_usd"]
    repay_usd = max(0.0, debt - coll * lt / target) if debt > 0 else 0.0
    need_coll_usd = max(0.0, target * debt / lt - coll) if debt > 0 else 0.0
    add_phrs = need_coll_usd / data["price"] if data["price"] > 0 else 0.0
    return repay_usd, add_phrs


def send_telegram(text):
    """Send via Telegram. Returns (sent: bool, info: str).

    Missing credentials DISABLE alerts with a plain-language note —
    they never crash the watcher and never fake a delivery.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat:
        return (False,
                "alerts disabled: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — "
                "transition logged locally, no message sent")
    payload = urllib.parse.urlencode({"chat_id": chat, "text": text}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage", data=payload
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.load(r)
    mid = resp["result"]["message_id"]
    return (True, f"telegram_message_id={mid}")


def log(cfg, line):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    entry = f"[{ts}] {line}\n"
    with open(os.path.join(BASE, str(cfg["log_file"])), "a") as f:
        f.write(entry)
    print(entry, end="")


def load_state(cfg):
    p = os.path.join(BASE, str(cfg["state_file"]))
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return {"last_zone": "UNKNOWN"}


def save_state(cfg, state):
    with open(os.path.join(BASE, str(cfg["state_file"])), "w") as f:
        json.dump(state, f, indent=2)


def main():
    dry_run = "--dry-run" in sys.argv
    cfg = load_config()
    block = sh("cast", "block-number", "--rpc-url", str(cfg["rpc_url"]))
    data = get_account_data(cfg)
    z = zone_of(data["hf"], cfg)
    state = load_state(cfg)
    last = state.get("last_zone", "UNKNOWN")

    repay_usd, add_phrs = concrete_actions(data, cfg)
    log(cfg, f"block={block} hf={data['hf']:.4f} zone={z} (was {last}) "
              f"collateral=${data['collateral_usd']:.6f} debt=${data['debt_usd']:.6f} "
              f"price=${data['price']:.2f}")

    alert_zones = ("WARNING", "CRITICAL")
    if z in alert_zones and last != z:
        # Transition into a danger zone -> exactly one alert per transition.
        emoji = "🟠" if z == "WARNING" else "🔴"
        msg = (
            f"{emoji} LIQUIDATION WATCHDOG — {z}\n"
            f"Time: {datetime.now(timezone.utc).isoformat(timespec='seconds')}\n"
            f"Position: {cfg['watched_user']}\n"
            f"Health factor: {data['hf']:.4f} "
            f"({'below warn ' + str(cfg['warn_hf']) if z == 'WARNING' else 'below critical ' + str(cfg['critical_hf'])})\n"
            f"Collateral: ${data['collateral_usd']:.6f} | Debt: ${data['debt_usd']:.6f}\n"
            f"Block: {block}\n"
            f"Concrete action: repay ${repay_usd:.6f} of debt "
            f"OR add {add_phrs:.6f} PHRS collateral to restore HF ≥ {cfg['target_hf']}\n"
            f"{cfg['explorer_addr']}{cfg['contract']}\n"
            f"#LIGHTKEEPER T16"
        )
        if dry_run:
            log(cfg, "DRY-RUN alert (not sent):\n" + msg)
        else:
            sent, info = send_telegram(msg)
            log(cfg, f"ALERT {'SENT' if sent else 'SKIPPED'} zone={z} {info}")
            print(f"TELEGRAM_ALERT_SENT={sent} {info}")
    elif z == "OK" and last in alert_zones:
        log(cfg, f"RECOVERED: position back to OK (hf={data['hf']:.4f}); no alert sent")
    else:
        log(cfg, f"no transition ({last} -> {z}); no alert sent")

    state["last_zone"] = z
    save_state(cfg, state)


if __name__ == "__main__":
    main()
