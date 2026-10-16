#!/usr/bin/env python3
"""
T21 Whale-Watching Agent (LIGHTKEEPER — Pharos Season of AI Agent Arena).

Scans Atlantic testnet (chain 688689) blocks for large NATIVE PHRS transfers
(native value moves are not emitted as logs, so blocks are read directly) and,
for configured ERC-20 tokens, chunked Transfer-topic log scans for transfers
involving watched addresses.

Reads RPC URL from $ATLANTIC_RPC_URL. Never handles private keys.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

TASK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(TASK_DIR, "src", "config.yaml")
STATE_PATH = os.path.join(TASK_DIR, "state", "seen.json")
REPORTS_DIR = os.path.join(TASK_DIR, "reports")
EXPLORER_TX = "https://atlantic.pharosscan.xyz/tx/"
CHAIN_ID = 688689

TRANSFER_TOPIC = None
try:
    from Crypto.Hash import keccak as _keccak

    _k = _keccak.new(digest_bits=256)
    _k.update(b"Transfer(address,address,uint256)")
    TRANSFER_TOPIC = "0x" + _k.hexdigest()
except ImportError:  # fallback: canonical keccak256("Transfer(address,address,uint256)")
    TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
# NIST hashlib.sha3_256 is NOT keccak: it yields 0xc17a9d92..., which would
# silently match zero real logs. keccak (above) yields 0xddf252ad... verified.


# ---------------------------------------------------------------- RPC

def rpc_call(rpc_url, method, params, timeout=30, retries=3):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                rpc_url, data=payload, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read())
            if "error" in body and body["error"]:
                raise RuntimeError(f"RPC error: {body['error']}")
            return body.get("result")
        except Exception as e:  # noqa: BLE001 - retry transient network failures
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"RPC call {method} failed after {retries} retries: {last_err}")


def rpc_batch(rpc_url, calls, timeout=60, retries=3):
    """Send a JSON-RPC batch. calls = [(method, params), ...]. Returns {id: result}."""
    payload = json.dumps(
        [{"jsonrpc": "2.0", "id": i, "method": m, "params": p} for i, (m, p) in enumerate(calls)]
    ).encode()
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                rpc_url, data=payload, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read())
            out = {}
            for item in body:
                if item.get("error"):
                    raise RuntimeError(f"RPC batch error: {item['error']}")
                out[item["id"]] = item.get("result")
            return out
        except Exception as e:  # noqa: BLE001 - retry transient network failures
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"RPC batch failed after {retries} retries: {last_err}")


# ---------------------------------------------------------------- config

def load_config(path=CONFIG_PATH):
    try:
        import yaml  # type: ignore
    except ImportError:
        print("PyYAML required: pip install pyyaml", file=sys.stderr)
        sys.exit(2)
    with open(path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    errors = validate_config(cfg)
    if errors:
        for e in errors:
            print(f"config error: {e}", file=sys.stderr)
        sys.exit(2)
    return cfg


def validate_config(cfg):
    """Return list of validation error strings (empty = valid)."""
    errors = []
    if not isinstance(cfg, dict):
        return ["config root must be a mapping"]
    wl = cfg.get("watchlist")
    if not isinstance(wl, list) or len(wl) < 5:
        errors.append(f"watchlist must list >=5 addresses (got {len(wl) if isinstance(wl, list) else 0})")
    else:
        for i, w in enumerate(wl):
            # YAML may parse an unquoted 0x... address as an int; coerce safely.
            addr = norm_addr(w.get("address"))
            if not (addr.startswith("0x") and len(addr) == 42
                    and all(c in "0123456789abcdef" for c in addr[2:])):
                errors.append(f"watchlist[{i}]: invalid address")
            if not w.get("label"):
                errors.append(f"watchlist[{i}]: label required (honest labels only, never fabricated)")
    thr = cfg.get("native_threshold_phrs")
    if not isinstance(thr, (int, float)) or thr <= 0:
        errors.append("native_threshold_phrs must be a positive number")
    for i, t in enumerate(cfg.get("tokens") or []):
        if not (isinstance(t.get("contract"), str) and t["contract"].startswith("0x")):
            errors.append(f"tokens[{i}]: invalid contract address")
        if not isinstance(t.get("threshold_tokens"), (int, float)) or t["threshold_tokens"] <= 0:
            errors.append(f"tokens[{i}]: threshold_tokens must be positive")
    return errors


def norm_addr(a):
    """Normalize a config address to lowercase 0x-hex. Tolerates unquoted YAML ints."""
    if isinstance(a, int):
        return ("0x%040x" % a).lower()
    return str(a or "").lower()


def norm_hash(h):
    """Normalize a tx hash to lowercase 0x-hex. Tolerates unquoted YAML ints."""
    if isinstance(h, int):
        return ("0x%064x" % h).lower()
    return str(h or "").lower()


def addr_label(cfg, addr):
    addr = norm_addr(addr)
    for w in cfg.get("watchlist", []):
        if norm_addr(w.get("address")) == addr:
            return w.get("label")
    return None


def display_addr(cfg, addr):
    """Label where known; else shortened address. NEVER invent an identity."""
    if not addr:
        return "(contract creation)"
    label = addr_label(cfg, addr)
    if label:
        return f"{label} ({addr[:6]}…{addr[-4:]})"
    return f"{addr[:6]}…{addr[-4:]} (unlabeled — observed on-chain only)"


def fmt_phrs(wei):
    return f"{wei / 1e18:,.6f} PHRS"


# ---------------------------------------------------------------- state / dedupe

def load_state():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"seen_events": [], "last_scanned_block": None}


def save_state(state):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


# ---------------------------------------------------------------- scanning

def scan_native(rpc_url, cfg, from_block, to_block, state, verbose=True):
    """Read blocks with full transactions; keep native transfers >= threshold."""
    threshold_wei = int(cfg["native_threshold_phrs"] * 1e18)
    self_seeded = {norm_hash(h) for h in (cfg.get("self_seeded_tx_hashes") or [])}
    matches = []
    total_txs = 0
    n = to_block - from_block + 1
    batch_size = 25  # one HTTP round-trip per 25 blocks
    blocks = list(range(from_block, to_block + 1))
    done = 0
    for off in range(0, n, batch_size):
        chunk = blocks[off:off + batch_size]
        if verbose:
            print(f"  native scan: blocks {chunk[0]}-{chunk[-1]} ({done + 1}-{done + len(chunk)}/{n})",
                  flush=True)
        results = rpc_batch(
            rpc_url, [("eth_getBlockByNumber", [hex(b), True]) for b in chunk]
        )
        for i, b in enumerate(chunk):
            blk = results.get(i)
            if not blk:
                continue
            for t in blk.get("transactions") or []:
                total_txs += 1
                value = int(t.get("value", "0x0"), 16)
                if value < threshold_wei:
                    continue
                key = f"native:{norm_hash(t['hash'])}"
                if key in state["seen_events"]:
                    continue
                matches.append(
                    {
                        "kind": "native",
                        "event_key": key,
                        "tx_hash": t["hash"],
                        "block_number": b,
                        "from": norm_addr(t.get("from")),
                        "to": norm_addr(t.get("to")) if t.get("to") else None,
                        "value_wei": str(value),
                        "value_phrs": value / 1e18,
                        "token": "PHRS (native)",
                        "self_seeded": norm_hash(t["hash"]) in self_seeded,
                    }
                )
        done += len(chunk)
    return matches, total_txs


def decode_transfer_log(log):
    """Decode an ERC-20 Transfer log. Returns (from, to, value) or None."""
    topics = log.get("topics") or []
    if len(topics) != 3 or topics[0].lower() != TRANSFER_TOPIC:
        return None
    frm = "0x" + topics[1][-40:]
    to = "0x" + topics[2][-40:]
    value = int(log.get("data", "0x0"), 16)
    return frm.lower(), to.lower(), value


def scan_token_transfers(rpc_url, cfg, from_block, to_block, state, verbose=True):
    """Chunked (<=1000 blocks) Transfer-topic scans for watched addresses."""
    matches = []
    seen_this_run = set()  # a log can match several watched addr/slot queries
    watched = [norm_addr(w["address"]) for w in cfg.get("watchlist", [])]
    padded = ["0x" + "0" * 24 + a[2:] for a in watched]
    for token in cfg.get("tokens") or []:
        contract = token["contract"]
        threshold_units = int(token["threshold_tokens"] * (10 ** token.get("decimals", 18)))
        chunk = from_block
        while chunk <= to_block:
            chunk_to = min(chunk + 999, to_block)
            for slot, topic_list in (("from", padded), ("to", padded)):
                # eth_getLogs has no OR within a topic slot: one call per address
                for addr_topic in topic_list:
                    topics = [TRANSFER_TOPIC, None, None]
                    topics[1 if slot == "from" else 2] = addr_topic
                    flt = {
                        "fromBlock": hex(chunk),
                        "toBlock": hex(chunk_to),
                        "address": contract,
                        "topics": topics,
                    }
                    logs = rpc_call(rpc_url, "eth_getLogs", [flt]) or []
                    for log in logs:
                        dec = decode_transfer_log(log)
                        if not dec:
                            continue
                        frm, to, value = dec
                        if value < threshold_units:
                            continue
                        key = f"token:{log['transactionHash']}:{log['logIndex']}"
                        if key in state["seen_events"] or key in seen_this_run:
                            continue
                        seen_this_run.add(key)
                        matches.append(
                            {
                                "kind": "token",
                                "event_key": key,
                                "tx_hash": log["transactionHash"],
                                "block_number": int(log["blockNumber"], 16),
                                "from": frm,
                                "to": to,
                                "value_raw": str(value),
                                "value_tokens": value / (10 ** token.get("decimals", 18)),
                                "token": token.get("symbol", contract[:10]),
                                "token_contract": contract,
                            }
                        )
            chunk = chunk_to + 1
    if verbose:
        print(f"  token scan: {len(cfg.get('tokens') or [])} token(s) over blocks {from_block}-{to_block}")
    return matches


def rank_matches(matches):
    def val(m):
        return m.get("value_phrs") if m["kind"] == "native" else m.get("value_tokens")
    return sorted(matches, key=val, reverse=True)


# ---------------------------------------------------------------- report

def explain_move(cfg, m):
    frm = display_addr(cfg, m["from"])
    to = display_addr(cfg, m["to"])
    if m["kind"] == "native":
        what = f"Native transfer of **{m['value_phrs']:,.6f} PHRS**"
    else:
        what = f"Token transfer of **{m['value_tokens']:,.6f} {m['token']}** (`{m['token_contract']}`)"
    link = f"{EXPLORER_TX}{m['tx_hash']}"
    return (
        f"{what}\n"
        f"- **From:** {frm}\n"
        f"- **To:** {to}\n"
        f"- **Block:** {m['block_number']} · **Tx:** [{m['tx_hash']}]({link})\n"
        f"- **Explorer:** {link}"
    )


def build_summary(cfg, matches, from_block, to_block):
    watched = [norm_addr(w["address"]) for w in cfg.get("watchlist", [])]
    summary = {}
    for w in cfg.get("watchlist", []):
        a = norm_addr(w["address"])
        summary[a] = {
            "label": w.get("label"),
            "whale_in": 0,
            "whale_out": 0,
            "total_in_phrs": 0.0,
            "total_out_phrs": 0.0,
            "last_block": None,
        }
    for m in matches:
        if m["kind"] != "native":
            continue  # summary view counts native whale moves; token moves listed per-move
        for side, addr in (("whale_out", m["from"]), ("whale_in", m["to"])):
            if addr in summary:
                summary[addr][side] += 1
                if side == "whale_in":
                    summary[addr]["total_in_phrs"] += m["value_phrs"]
                else:
                    summary[addr]["total_out_phrs"] += m["value_phrs"]
                lb = summary[addr]["last_block"]
                summary[addr]["last_block"] = m["block_number"] if lb is None else max(lb, m["block_number"])
    return summary


def render_report(cfg, matches, summary, from_block, to_block, total_txs, threshold_note, generated_ts):
    ranked = rank_matches(matches)
    lines = []
    lines.append("# T21 Whale-Watch Report — Atlantic testnet")
    lines.append("")
    lines.append(f"- **Chain:** Atlantic testnet (chain ID {CHAIN_ID}) · native token PHRS")
    lines.append(f"- **Scanned blocks:** {from_block} → {to_block} ({to_block - from_block + 1} blocks)")
    lines.append(f"- **Transactions inspected:** {total_txs}")
    lines.append(f"- **Whale threshold:** ≥ {cfg['native_threshold_phrs']} PHRS native "
                 f"({threshold_note})")
    lines.append(f"- **Whale events found:** {len(ranked)}")
    lines.append(f"- **Generated (UTC):** {generated_ts}")
    lines.append("")
    lines.append("## Ranked whale moves (largest first)")
    lines.append("")
    if not ranked:
        lines.append("> Quiet window: no native transfer ≥ threshold in the scanned range. "
                     "Honest empty state — nothing fabricated.")
        lines.append("")
    for i, m in enumerate(ranked, 1):
        selfseed = " **[SELF-SEEDED — disclosed test transfer, not organic]**" if m.get("self_seeded") else ""
        lines.append(f"### #{i} — {m['value_phrs']:,.6f} PHRS{selfseed}")
        lines.append("")
        lines.append(explain_move(cfg, m))
        lines.append("")
    lines.append("## Summary view — all watched addresses")
    lines.append("")
    lines.append("| Watched address | Label | Whale in | Whale out | Total in (PHRS) | Total out (PHRS) | Last whale block |")
    lines.append("|---|---|---|---|---|---|---|")
    for w in cfg.get("watchlist", []):
        a = norm_addr(w["address"])
        s = summary[a]
        last = s["last_block"] if s["last_block"] is not None else "—"
        if s["whale_in"] == 0 and s["whale_out"] == 0:
            activity = "no whale activity in window"
        else:
            activity = f"in={s['whale_in']} out={s['whale_out']}"
        lines.append(
            f"| `{a}` | {s['label']} | {s['whale_in']} | {s['whale_out']} | "
            f"{s['total_in_phrs']:,.6f} | {s['total_out_phrs']:,.6f} | {last} |"
        )
    lines.append("")
    lines.append("_Unlabeled counterparties are shown shortened; no identities are invented. "
                 "Self-seeded events are explicitly marked._")
    return "\n".join(lines)


# ---------------------------------------------------------------- commands

def cmd_scan(args, cfg, rpc_url):
    state = load_state()
    tip = int(rpc_call(rpc_url, "eth_blockNumber", []), 16)
    to_block = args.to_block if args.to_block is not None else tip
    from_block = args.from_block if args.from_block is not None else max(0, to_block - args.window)
    if to_block > tip:
        print(f"note: --to-block {to_block} beyond tip {tip}; clamping", flush=True)
        to_block = tip
    print(f"Scanning Atlantic blocks {from_block} → {to_block} (chain {CHAIN_ID})")
    matches, total_txs = scan_native(rpc_url, cfg, from_block, to_block, state)
    matches += scan_token_transfers(rpc_url, cfg, from_block, to_block, state)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    os.makedirs(REPORTS_DIR, exist_ok=True)
    scan_path = os.path.join(REPORTS_DIR, f"scan-{from_block}-{to_block}-{ts}.json")
    summary = build_summary(cfg, matches, from_block, to_block)
    with open(scan_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "chain_id": CHAIN_ID,
                "from_block": from_block,
                "to_block": to_block,
                "transactions_inspected": total_txs,
                "native_threshold_phrs": cfg["native_threshold_phrs"],
                "matches": rank_matches(matches),
                "summary": summary,
                "generated_utc": ts,
            },
            f,
            indent=2,
        )
    if not args.no_commit_state:
        for m in matches:
            if m["event_key"] not in state["seen_events"]:
                state["seen_events"].append(m["event_key"])
        state["last_scanned_block"] = to_block
        save_state(state)
    report_md = render_report(
        cfg, matches, summary, from_block, to_block, total_txs,
        cfg.get("threshold_justification", "see config.yaml"),
        datetime.now(timezone.utc).isoformat(),
    )
    report_path = os.path.join(REPORTS_DIR, f"watch-report-{from_block}-{to_block}-{ts}.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_md)
    print(f"matches: {len(matches)} | txs inspected: {total_txs}")
    print(f"scan JSON: {scan_path}")
    print(f"report:    {report_path}")
    return scan_path, report_path


def cmd_watchlist(args, cfg, rpc_url):
    print(f"Watchlist ({len(cfg['watchlist'])} addresses, threshold ≥ {cfg['native_threshold_phrs']} PHRS):")
    for w in cfg["watchlist"]:
        print(f"  {w['address']}  — {w['label']}")
    if cfg.get("tokens"):
        print("Tokens:")
        for t in cfg["tokens"]:
            print(f"  {t['symbol']} {t['contract']}  ≥ {t['threshold_tokens']}")
    else:
        print("Tokens: none configured (native PHRS coverage only; token scan path is implemented and unit-tested)")


def main():
    ap = argparse.ArgumentParser(description="T21 Whale-Watching Agent — Atlantic testnet")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan", help="scan a block range for whale transfers")
    s.add_argument("--from-block", type=int, default=None)
    s.add_argument("--to-block", type=int, default=None,
                   help="last block to scan (default: current tip)")
    s.add_argument("--window", type=int, default=500, help="blocks back from tip when --from-block omitted")
    s.add_argument("--no-commit-state", action="store_true", help="do not persist dedupe state")
    sub.add_parser("watchlist", help="show the configured watchlist")
    args = ap.parse_args()

    cfg = load_config()
    rpc_url = os.environ.get("ATLANTIC_RPC_URL", "https://atlantic.dplabs-internal.com")
    if args.cmd == "scan":
        cmd_scan(args, cfg, rpc_url)
    elif args.cmd == "watchlist":
        cmd_watchlist(args, cfg, rpc_url)


if __name__ == "__main__":
    main()
