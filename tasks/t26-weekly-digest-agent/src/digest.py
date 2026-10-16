#!/usr/bin/env python3
"""
T26 — Weekly Digest Agent (LIGHTKEEPER / Pharos Agent Arena)

Builds a weekly on-chain digest for a watched address on Pharos Atlantic
testnet (chain ID 688689) and delivers it to a real Telegram channel.

Data sources (ALL REAL — no mocks):
  1. Chain-direct JSON-RPC (eth_getLogs chunked to <=1000 blocks per the
     RPC's own limit, eth_getBlockByNumber for window timestamps).
  2. The PharosScan/SocialScan explorer indexer API
     (https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer) for the
     address transaction list — the same data the explorer frontend shows.
  3. state.json — the persisted previous-period snapshot, used for honest
     current-vs-previous deltas.

Pipeline:
  backfill -> run -> deliver
  1. --backfill : build the PREVIOUS window digest from real chain history
                  and persist it as the baseline snapshot in state.json
                  (honest bootstrap: first-run backfill).
  2. --run      : build the CURRENT window digest, diff it against the
                  baseline snapshot, render markdown + Telegram versions,
                  save digests/*.md.
  3. --deliver  : send the Telegram version via sendMessage (ONE message),
                  record the returned message_id as the delivery receipt.

There is no SkillEngine cron (verified per LIGHTKEEPER-VERDICT): scheduling
is via the provided cron/install-weekly-cron.sh on the operator's machine.

Env (never printed, never committed):
  WATCH_ADDRESS       watched address (default 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3)
  ATLANTIC_RPC_URL    JSON-RPC endpoint (default https://atlantic.dplabs-internal.com)
  EXPLORER_API        explorer indexer base URL
  WINDOW_DAYS         digest window in days (default 7)
  T26_SECTIONS        digest blocks to render, comma-separated ids from
                      top3,volume,gas,whales,tokens,failed (default: all)
  TELEGRAM_BOT_TOKEN  bot token (deliver only)
  TELEGRAM_CHAT_ID    destination chat (deliver only)

Usage:
  python3 src/digest.py --backfill
  python3 src/digest.py --run
  python3 src/digest.py --deliver
"""
import json
import os
import sys
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

# ---------------------------------------------------------------- config
WATCH_ADDRESS = os.environ.get(
    "WATCH_ADDRESS", "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
).lower()
RPC_URL = os.environ.get("ATLANTIC_RPC_URL", "https://atlantic.dplabs-internal.com")
EXPLORER_API = os.environ.get(
    "EXPLORER_API", "https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer"
)
WINDOW_DAYS = int(os.environ.get("WINDOW_DAYS", "7"))
CHAIN_ID = 688689
EXPECTED_CHAIN_ID = 688689
LOG_CHUNK = 1000  # RPC enforces: "block range ... within 1,000 blocks"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_PATH = os.path.join(BASE_DIR, "state", "state.json")
DIGESTS_DIR = os.path.join(BASE_DIR, "digests")
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"  # keccak("Transfer(address,address,uint256)") via cast
PADDED_ADDR = "0x" + "0" * 24 + WATCH_ADDRESS[2:]
ZERO_ADDR_TOPIC = "0x" + "0" * 64

# ---------------------------------------------------------------- digest sections
# The digest is rendered as named blocks. The operator chooses which blocks
# appear via T26_SECTIONS (comma-separated ids, any order — the digest keeps
# its canonical layout). Unset = every section. Unknown/empty = loud failure.
SECTION_IDS = ("top3", "volume", "gas", "whales", "tokens", "failed")
WHALE_THRESHOLD = 0.05  # PHRS: native transfers >= this are "whale moves"


def selected_sections():
    raw = os.environ.get("T26_SECTIONS", "")
    if not raw.strip():
        return list(SECTION_IDS)
    ids = [s.strip().lower() for s in raw.split(",") if s.strip()]
    unknown = [s for s in ids if s not in SECTION_IDS]
    if unknown:
        raise SystemExit(
            f"T26_SECTIONS: unknown section(s) {', '.join(unknown)} — "
            f"valid sections: {', '.join(SECTION_IDS)}"
        )
    if not ids:
        raise SystemExit("T26_SECTIONS is empty — pick at least one section "
                         f"({', '.join(SECTION_IDS)})")
    return [s for s in SECTION_IDS if s in ids]  # canonical order


def ctx_sections(ctx):
    return ctx.get("sections") or list(SECTION_IDS)


TELEGRAM_API = "https://api.telegram.org"


def log(msg):
    print(f"[t26] {msg}", flush=True)


# ---------------------------------------------------------------- http/json
def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "lightkeeper-t26/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def rpc(method, params, timeout=30, retries=3):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(
                RPC_URL, data=body, headers={"Content-Type": "application/json",
                                             "User-Agent": "lightkeeper-t26/1.0"}
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.loads(r.read().decode())
            if "error" in d:
                last = RuntimeError(f"rpc {method} error: {d['error']}")
                time.sleep(1 + i)
                continue
            return d["result"]
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1 + i)
    raise RuntimeError(f"rpc {method} failed after {retries} tries: {last}")


# ---------------------------------------------------------------- chain window
def _block_ts(block):
    b = rpc("eth_getBlockByNumber", [hex(block), False])
    return int(b["timestamp"], 16)


def find_block_for_ts(target_ts, latest, latest_ts, avg_bt):
    """Latest block with timestamp <= target_ts (walks from a rate estimate).

    Block rate varies, so a pure block-count window drifts off-calendar.
    We converge on the timestamp and label the window with the ACTUAL
    boundary timestamps, honestly."""
    guess = latest - int((latest_ts - target_ts) / max(avg_bt, 0.5))
    guess = max(0, min(guess, latest))
    for _ in range(12):
        ts = _block_ts(guess)
        diff = target_ts - ts
        if abs(diff) <= 120:  # within ~2 min: timestamps are labeled exactly anyway
            return guess, ts
        step = int(diff / avg_bt)
        if step == 0:
            step = 1 if diff > 0 else -1
        guess = max(0, min(latest, guess + step))
    return guess, _block_ts(guess)


def _iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def chain_window(days):
    """Return (start_block, end_block, start_iso, end_iso, avg_block_time)
    for a true calendar `days`-long window ending at the chain head."""
    cid = int(rpc("eth_chainId", []), 16)
    if cid != EXPECTED_CHAIN_ID:
        raise RuntimeError(f"refusing: chain id {cid} != Atlantic {EXPECTED_CHAIN_ID}")
    latest = int(rpc("eth_blockNumber", []), 16)
    latest_ts = _block_ts(latest)
    probe_ts = _block_ts(latest - 1000)
    avg_bt = (latest_ts - probe_ts) / 1000.0
    if avg_bt <= 0:
        raise RuntimeError("non-positive block time measured")
    start, start_ts = find_block_for_ts(latest_ts - days * 86400, latest, latest_ts, avg_bt)
    log(f"window: {days}d -> blocks {start}..{latest} "
        f"({_iso(start_ts)[:10]} -> {_iso(latest_ts)[:10]}, avg block {avg_bt:.2f}s)")
    return start, latest, _iso(start_ts), _iso(latest_ts), avg_bt


# ---------------------------------------------------------------- explorer txs
def fetch_address_txs(address, page_size=100):
    """All txs for address from the explorer indexer (paginated). Real data."""
    out, page = [], 1
    while True:
        url = (f"{EXPLORER_API}/address/{address}/transactions"
               f"?size={page_size}&page={page}")
        d = http_get(url)
        batch = d.get("data", [])
        out.extend(batch)
        total = d.get("total", len(out))
        log(f"explorer: page {page} -> {len(batch)} txs (total {total})")
        if len(out) >= total or not batch:
            break
        page += 1
    return out


def in_window(tx, start_iso, end_iso):
    ts = tx.get("block_timestamp", "")
    return start_iso <= ts <= end_iso


# ---------------------------------------------------------------- chunked logs
def _logs_chunk(args):
    start, end, topic_pos = args
    topics = [TRANSFER_TOPIC, None, None]
    topics[topic_pos] = PADDED_ADDR
    return rpc("eth_getLogs", [{
        "fromBlock": hex(start),
        "toBlock": hex(end),
        "topics": topics,
    }])


def collect_transfer_logs(start_block, end_block, workers=None):
    """Chain-direct ERC20 Transfer events where addr is from (pos1) or to (pos2),
    scanned in <=1000-block chunks (RPC-enforced limit)."""
    workers = workers or int(os.environ.get("T26_LOG_WORKERS", "16"))
    chunks = []
    b = start_block
    while b <= end_block:
        e = min(b + LOG_CHUNK - 1, end_block)
        chunks.append((b, e, 1))
        chunks.append((b, e, 2))
        b = e + 1
    log(f"logs: {len(chunks)} chunks of <={LOG_CHUNK} blocks "
        f"({start_block}..{end_block}), {workers} workers")
    events = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(_logs_chunk, c): c for c in chunks}
        for f in as_completed(futs):
            try:
                for l in f.result() or []:
                    events.append(l)
            except Exception as e:  # noqa: BLE001
                log(f"WARN chunk {futs[f]} failed: {e}")
    # de-duplicate by (blockHash, logIndex) — from-side and to-side scans overlap on self-transfers
    seen, uniq = set(), []
    for l in events:
        k = (l.get("blockHash"), l.get("logIndex"))
        if k not in seen:
            seen.add(k)
            uniq.append(l)
    log(f"logs: {len(uniq)} unique Transfer events involving the address")
    return uniq


def _decode_abi_string(h):
    """Decode an eth_call return (hex, no 0x) as a Solidity string or bytes32.

    string  -> word0 = offset (32), word1 = length, then the UTF-8 data.
    bytes32 -> the 32-byte word IS the data (older tokens).
    Returns None when the payload is not decodable text."""
    if len(h) < 64:
        return None
    try:
        offset = int(h[0:64], 16)
        if offset == 32 and len(h) >= 128:
            length = int(h[64:128], 16)
            if 0 < length <= 64 and len(h) >= 128 + length * 2:
                return bytes.fromhex(h[128:128 + length * 2]).decode("utf-8", "replace")
        raw = bytes.fromhex(h[0:64]).rstrip(b"\x00")
        if raw:
            return raw.decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        pass
    return None


def _clean_symbol(s):
    if not s:
        return None
    s = "".join(c for c in s if c.isprintable()).strip()
    return s or None


_token_meta_cache = {}


def token_meta(token_addr):
    """symbol/decimals via real eth_call; cached."""
    if token_addr in _token_meta_cache:
        return _token_meta_cache[token_addr]
    def call(data):
        try:
            return rpc("eth_call", [{"to": token_addr, "data": data}, "latest"])
        except Exception:  # noqa: BLE001
            return "0x"
    sym_raw = call("0x95d89b41")       # symbol()
    dec_raw = call("0x313ce567")       # decimals()
    symbol, decimals = None, 18
    if sym_raw and sym_raw.startswith("0x"):
        # dynamic string OR bytes32 — decode properly, then strip control chars
        symbol = _clean_symbol(_decode_abi_string(sym_raw[2:]))
    try:
        if dec_raw and dec_raw != "0x":
            decimals = int(dec_raw, 16)
    except Exception:  # noqa: BLE001
        pass
    _token_meta_cache[token_addr] = (symbol or token_addr[:10] + "…", decimals)
    return _token_meta_cache[token_addr]


def decode_transfer(lg):
    """Decode a Transfer log into a dict."""
    topics = lg.get("topics", [])
    frm = "0x" + topics[1][2:][-40:] if len(topics) > 1 else None
    to = "0x" + topics[2][2:][-40:] if len(topics) > 2 else None
    raw = int(lg.get("data", "0x"), 16)
    token = lg.get("address", "").lower()
    sym, dec = token_meta(token)
    return {
        "token": token, "symbol": sym, "decimals": dec,
        "from": (frm or "").lower(), "to": (to or "").lower(),
        "raw": raw, "amount": raw / (10 ** dec),
        "block": int(lg.get("blockNumber", "0x0"), 16),
        "tx": lg.get("transactionHash", ""),
    }


# ---------------------------------------------------------------- metrics
def build_metrics(txs, transfers, addr):
    sent = [t for t in txs if (t.get("from_address") or "").lower() == addr]
    recv = [t for t in txs if (t.get("to_address") or "").lower() == addr
            and (t.get("from_address") or "").lower() != addr]
    native_in = sum(float(t.get("value") or 0) for t in recv)
    native_out = sum(float(t.get("value") or 0) for t in sent
                     if (t.get("to_address") or "").lower() != addr)
    gas_spent = sum(float(t.get("transaction_fee") or 0) for t in sent)
    creations = [t for t in sent
                 if not t.get("to_address") or (t.get("method") or "") == "Contract Creation"]
    failed = [t for t in sent if t.get("receipt_status") not in (1, "1")]
    methods = {}
    for t in sent:
        m = t.get("method") or (t.get("method_id") or "?")[:10]
        methods[m] = methods.get(m, 0) + 1
    tok_in = sum(1 for x in transfers if x["to"] == addr and x["from"] != addr)
    tok_out = sum(1 for x in transfers if x["from"] == addr and x["to"] != addr)
    # whale moves: native transfers >= WHALE_THRESHOLD PHRS (sent or received),
    # sorted biggest-first. Real tx data — the "whales" digest section lists these.
    large = []
    for t in sent:
        v = float(t.get("value") or 0)
        to = (t.get("to_address") or "").lower()
        if v >= WHALE_THRESHOLD and to != addr:
            large.append({"direction": "OUT", "value": v,
                          "counterparty": t.get("to_address"),
                          "hash": t.get("hash"), "block": t.get("block_number")})
    for t in recv:
        v = float(t.get("value") or 0)
        if v >= WHALE_THRESHOLD:
            large.append({"direction": "IN", "value": v,
                          "counterparty": t.get("from_address"),
                          "hash": t.get("hash"), "block": t.get("block_number")})
    large.sort(key=lambda x: -x["value"])
    return {
        "tx_total": len(txs), "tx_sent": len(sent), "tx_received": len(recv),
        "native_in_phrs": round(native_in, 9), "native_out_phrs": round(native_out, 9),
        "gas_spent_phrs": round(gas_spent, 9),
        "contract_creations": len(creations),
        "failed_txs": len(failed),
        "methods": methods,
        "token_transfers_in": tok_in, "token_transfers_out": tok_out,
        "token_transfer_events": len(transfers),
        "_sent": sent, "_failed": failed, "_creations": creations, "_recv": recv,
        "_large": large,
    }


# ---------------------------------------------------------------- TOP-3 ranking (deterministic, rule-based)
RANK_RULES = [
    ("failed transaction", 100),
    ("contract creation", 50),
    ("large native transfer (>=0.05 PHRS)", 40),
    ("token transfer", 25),
    ("contract interaction", 10),
    ("native transfer", 5),
]


def rank_notable(metrics, transfers, addr):
    cands = []
    for t in metrics["_failed"]:
        cands.append((100, "FAILED TX",
                      f"tx {t['hash'][:12]}… reverted/failed (receipt_status={t.get('receipt_status')}) "
                      f"in block {t.get('block_number')}", t))
    for t in metrics["_creations"]:
        ca = t.get("receipt_contract_address") or t.get("to_address") or "?"
        cands.append((50, "CONTRACT CREATION",
                      f"deployed {ca[:12]}… via {t['hash'][:12]}… "
                      f"(block {t.get('block_number')}, fee {t.get('transaction_fee')} PHRS)", t))
    for t in metrics["_sent"]:
        v = float(t.get("value") or 0)
        if v >= 0.05 and (t.get("to_address") or "").lower() != addr:
            cands.append((40, "LARGE NATIVE TRANSFER",
                          f"{v} PHRS -> {(t.get('to_address') or '?')[:12]}… "
                          f"({t['hash'][:12]}…, block {t.get('block_number')})", t))
    for x in transfers:
        if x["from"] == addr or x["to"] == addr:
            direction = "IN" if x["to"] == addr else "OUT"
            cands.append((25, f"TOKEN TRANSFER {direction}",
                          f"{x['amount']:.6g} {x['symbol']} {direction} "
                          f"({x['tx'][:12]}…, block {x['block']})", x))
    for t in metrics["_sent"]:
        if t not in metrics["_failed"] and t not in metrics["_creations"] \
                and float(t.get("value") or 0) < 0.05 and t.get("to_address"):
            cands.append((10, "CONTRACT INTERACTION",
                          f"{t.get('method') or t.get('method_id','?')[:10]} on "
                          f"{(t.get('to_address') or '?')[:12]}… ({t['hash'][:12]}…)", t))
    for t in metrics["_sent"]:
        v = float(t.get("value") or 0)
        to = (t.get("to_address") or "").lower()
        if v > 0 and v < 0.05 and to != addr:
            cands.append((5, "NATIVE TRANSFER (OUT)",
                          f"{v} PHRS -> {to[:12]}… ({t['hash'][:12]}…)", t))
        elif v > 0 and v < 0.05 and to == addr:
            cands.append((5, "NATIVE TRANSFER (SELF)",
                          f"{v} PHRS self-transfer ({t['hash'][:12]}…)", t))
    for t in metrics["_recv"]:
        v = float(t.get("value") or 0)
        frm = (t.get("from_address") or "").lower()
        if v > 0 and v < 0.05:
            cands.append((5, "NATIVE TRANSFER (IN)",
                          f"{v} PHRS from {frm[:12]}… ({t['hash'][:12]}…)", t))
    # deterministic: score desc, block desc, hash asc
    def key(c):
        t = c[3]
        blk = t.get("block_number") if isinstance(t, dict) and "block_number" in t else t.get("block", 0)
        h = t.get("hash", t.get("tx", ""))
        return (-c[0], -(blk or 0), h)
    cands.sort(key=key)
    seen, top = set(), []
    for score, kind, text, t in cands:
        h = t.get("hash", t.get("tx", ""))
        if h in seen:
            continue
        seen.add(h)
        top.append({"score": score, "kind": kind, "text": text})
        if len(top) == 3:
            break
    return top


# ---------------------------------------------------------------- deltas
def delta(cur, prev):
    if prev is None:
        return None
    d = {}
    for k in ("tx_total", "tx_sent", "tx_received", "native_in_phrs",
              "native_out_phrs", "gas_spent_phrs", "contract_creations",
              "failed_txs", "token_transfer_events"):
        c, p = cur.get(k, 0), prev.get(k, 0)
        dd = round(c - p, 9)
        if p == 0:
            pct = "n/a (prev 0)" if c == 0 else f"+{c:g} (prev 0)"
        else:
            pct = f"{dd:+g} ({dd / p * 100:+.1f}%)"
        d[k] = {"current": c, "previous": p, "delta": dd, "fmt": pct}
    return d


# ---------------------------------------------------------------- rendering
def short_addr(a):
    return (a[:6] + "…" + a[-4:]) if a and len(a) > 12 else (a or "?")


# (section_id, row label, metric key) — the Key metrics table shows only
# the rows whose section is selected via T26_SECTIONS.
METRIC_ROWS = [
    ("volume", "Transactions (total)", "tx_total"),
    ("volume", "  ↳ sent", "tx_sent"),
    ("volume", "  ↳ received", "tx_received"),
    ("volume", "Native in (PHRS)", "native_in_phrs"),
    ("volume", "Native out (PHRS)", "native_out_phrs"),
    ("gas", "Gas spent (PHRS)", "gas_spent_phrs"),
    ("failed", "Contract creations", "contract_creations"),
    ("failed", "Failed txs", "failed_txs"),
    ("tokens", "Token transfer events", "token_transfer_events"),
]


def render_markdown(ctx):
    m, dl, top = ctx["metrics"], ctx["deltas"], ctx["top3"]
    secs = ctx_sections(ctx)
    w = ctx["window"]
    lines = [
        f"# Weekly Digest — {short_addr(ctx['address'])}",
        "",
        f"**Chain:** Pharos Atlantic testnet (688689) · "
        f"**Window:** {w['start_iso'][:10]} → {w['end_iso'][:10]} "
        f"({WINDOW_DAYS}d, blocks {w['start_block']}–{w['end_block']})",
        f"**Generated:** {ctx['generated_iso']} · all figures from real chain reads",
        f"**Sections:** {', '.join(secs)}",
        "",
    ]
    rows = [(label, k) for (sid, label, k) in METRIC_ROWS if sid in secs]
    if rows:
        lines += ["## Key metrics",
                  "",
                  "| Metric | This week | Prev week | Δ |",
                  "|---|---|---|---|"]
        for label, k in rows:
            if dl and k in dl:
                r = dl[k]
                lines.append(f"| {label} | {r['current']} | {r['previous']} | {r['fmt']} |")
            else:
                lines.append(f"| {label} | {m[k]} | — (baseline) | — |")
        lines.append("")
    if "top3" in secs:
        lines += ["## TOP 3 notable events",
                  "", "_Deterministic rule-based ranking: failed tx (100) > contract "
                  "creation (50) > large native ≥0.05 PHRS (40) > token transfer (25) > "
                  "contract interaction (10) > plain transfer (5); ties → newest block._", ""]
        if top:
            for i, e in enumerate(top, 1):
                lines.append(f"{i}. **[{e['kind']}]** {e['text']}")
        else:
            lines.append("_No notable events this week._")
        lines.append("")
    if "whales" in secs:
        lines += [f"## Whale moves (native ≥{WHALE_THRESHOLD:g} PHRS)", ""]
        for e in ctx.get("whales", []):
            lines.append(f"- {e['value']:g} PHRS {e['direction']} "
                         f"{short_addr(e.get('counterparty'))} "
                         f"({(e.get('hash') or '?')[:12]}…, block {e.get('block')})")
        if not ctx.get("whales"):
            lines.append("_No whale-sized moves this week._")
        lines.append("")
    if "tokens" in secs:
        lines += ["## Token transfers (ERC20)", ""]
        flows = ctx.get("token_flows", [])
        if flows:
            for f in flows:
                parts = []
                if f["in_n"]:
                    parts.append(f"{f['in_n']} in ({f['in_amt']:.6g} {f['symbol']})")
                if f["out_n"]:
                    parts.append(f"{f['out_n']} out ({f['out_amt']:.6g} {f['symbol']})")
                lines.append(f"- `{f['token'][:12]}…` {f['symbol']}: "
                             + (", ".join(parts) or "_no directed flow_"))
        else:
            lines.append("_No token transfers this week._")
        lines.append("")
    if "failed" in secs:
        det = ctx.get("detailed", {})
        failed, creations = det.get("failed", []), det.get("creations", [])
        lines += ["## Failures & creations", ""]
        lines.append(f"- Failed txs ({len(failed)}):")
        for e in failed:
            lines.append(f"  - `{(e.get('hash') or '?')[:12]}…` reverted "
                         f"(receipt_status={e.get('status')}) in block {e.get('block')}")
        if not failed:
            lines.append("  - _none_")
        lines.append(f"- Contract creations ({len(creations)}):")
        for e in creations[:8]:
            ca = short_addr(e.get("contract")) if e.get("contract") else "?"
            lines.append(f"  - `{ca}` deployed via {(e.get('hash') or '?')[:12]}… "
                         f"in block {e.get('block')}")
        if len(creations) > 8:
            lines.append(f"  - _…and {len(creations) - 8} more_")
        if not creations:
            lines.append("  - _none_")
        lines.append("")
    lines += ["",
              "## Method breakdown (sent txs)",
              ""]
    if m["methods"]:
        for k_, v_ in sorted(m["methods"].items(), key=lambda kv: -kv[1]):
            lines.append(f"- {k_}: {v_}")
    else:
        lines.append("- none")
    lines += ["",
              f"_Sources: chain-direct eth_getLogs (≤1000-block chunks) + "
              f"explorer indexer API. State: state.json._"]
    return "\n".join(lines) + "\n"


def render_telegram(ctx):
    m, dl, top = ctx["metrics"], ctx["deltas"], ctx["top3"]
    secs = ctx_sections(ctx)
    w = ctx["window"]
    L = [f"📊 Weekly Digest — {short_addr(ctx['address'])}",
         f"Atlantic testnet · {w['start_iso'][:10]} → {w['end_iso'][:10]}",
         ""]
    def row(label, k, unit=""):
        if dl and k in dl:
            r = dl[k]
            L.append(f"{label}: {r['current']}{unit} ({r['fmt']})")
        else:
            L.append(f"{label}: {m[k]}{unit} (baseline)")
    if "volume" in secs:
        row("Txs", "tx_total")
        L.append(f"Sent: {m['tx_sent']} · Received: {m['tx_received']}")
        L.append(f"Native in/out: {m['native_in_phrs']}/{m['native_out_phrs']} PHRS")
    if "gas" in secs:
        L.append(f"Gas spent: {m['gas_spent_phrs']} PHRS")
    parts = []
    if "failed" in secs:
        parts += [f"Creations: {m['contract_creations']}",
                  f"Failed: {m['failed_txs']}"]
    if "tokens" in secs:
        parts.append(f"Token xfers: {m['token_transfer_events']}")
    if parts:
        L.append(" · ".join(parts))
    L.append("")
    if "top3" in secs:
        L.append("TOP 3 notable:")
        if top:
            for i, e in enumerate(top, 1):
                L.append(f"{i}. [{e['kind']}] {e['text']}")
        else:
            L.append("— quiet week, no notable events —")
        L.append("")
    if "whales" in secs:
        L.append("Whale moves:")
        for e in ctx.get("whales", []):
            L.append(f"- {e['value']:g} PHRS {e['direction']} "
                     f"{short_addr(e.get('counterparty'))} "
                     f"({(e.get('hash') or '?')[:12]}…)")
        if not ctx.get("whales"):
            L.append("— none —")
        L.append("")
    L.append("Full digest: see LIGHTKEEPER t26 deliverable.")
    txt = "\n".join(L)
    assert len(txt) <= 4000, f"telegram text too long: {len(txt)}"
    return txt


# ---------------------------------------------------------------- state
def load_state():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return {"baseline": None, "history": []}


def save_state(st):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w") as f:
        json.dump(st, f, indent=2)


def public_metrics(m):
    return {k: v for k, v in m.items() if not k.startswith("_")}


# ---------------------------------------------------------------- flows
def build_window_digest(start_block, end_block, start_iso, end_iso, label):
    log(f"{label}: blocks {start_block}..{end_block} ({start_iso} -> {end_iso})")
    all_txs = fetch_address_txs(WATCH_ADDRESS)
    txs = [t for t in all_txs if in_window(t, start_iso, end_iso)]
    log(f"{label}: {len(txs)}/{len(all_txs)} txs inside window")
    logs = collect_transfer_logs(start_block, end_block)
    transfers = [decode_transfer(l) for l in logs]
    metrics = build_metrics(txs, transfers, WATCH_ADDRESS)
    top = rank_notable(metrics, transfers, WATCH_ADDRESS)
    # section payloads (public, JSON-safe) — the renderers pick blocks by T26_SECTIONS
    token_flows = {}
    for x in transfers:
        f = token_flows.setdefault(
            x["token"], {"token": x["token"], "symbol": x["symbol"],
                         "in_n": 0, "out_n": 0, "in_amt": 0.0, "out_amt": 0.0})
        if x["to"] == WATCH_ADDRESS and x["from"] != WATCH_ADDRESS:
            f["in_n"] += 1
            f["in_amt"] += x["amount"]
        elif x["from"] == WATCH_ADDRESS and x["to"] != WATCH_ADDRESS:
            f["out_n"] += 1
            f["out_amt"] += x["amount"]
    detailed = {
        "failed": [{"hash": t.get("hash"), "block": t.get("block_number"),
                    "status": t.get("receipt_status")}
                   for t in metrics["_failed"]],
        "creations": [{"hash": t.get("hash"), "block": t.get("block_number"),
                       "contract": t.get("receipt_contract_address") or "",
                       "fee": t.get("transaction_fee")}
                      for t in metrics["_creations"]],
    }
    return {
        "address": WATCH_ADDRESS,
        "label": label,
        "window": {"start_block": start_block, "end_block": end_block,
                   "start_iso": start_iso, "end_iso": end_iso,
                   "days": WINDOW_DAYS, "chain_id": CHAIN_ID},
        "metrics": public_metrics(metrics),
        "whales": metrics["_large"],
        "token_flows": sorted(token_flows.values(),
                              key=lambda f: -(f["in_n"] + f["out_n"])),
        "detailed": detailed,
        "tx_hashes": [t["hash"] for t in txs],
        "top3": top,
        "generated_iso": datetime.now(timezone.utc).isoformat(),
        "source": "real chain reads: eth_getLogs (<=1000-block chunks) + "
                  "explorer indexer API + eth_getBlockByNumber",
    }


def cmd_backfill():
    start, latest, s_iso, e_iso, bt = chain_window(WINDOW_DAYS)
    # previous window: the WINDOW_DAYS immediately before the current one,
    # anchored on real timestamps (not block counts).
    p_end = start - 1
    p_end_ts = _block_ts(p_end)
    p_start, p_start_ts = find_block_for_ts(
        p_end_ts - WINDOW_DAYS * 86400, p_end, p_end_ts, bt)
    p_start_iso = _iso(p_start_ts)
    p_end_iso = _iso(p_end_ts)
    d = build_window_digest(p_start, p_end, p_start_iso, p_end_iso, "backfill/previous")
    st = load_state()
    st["baseline"] = d
    save_state(st)
    os.makedirs(DIGESTS_DIR, exist_ok=True)
    ctx = dict(d, deltas=None, sections=selected_sections())
    md = render_markdown(ctx)
    path = os.path.join(DIGESTS_DIR, "digest-previous-baseline.md")
    with open(path, "w") as f:
        f.write(md)
    log(f"baseline saved to state.json + {path}")
    print(md)


def cmd_run():
    start, end, s_iso, e_iso, bt = chain_window(WINDOW_DAYS)
    d = build_window_digest(start, end, s_iso, e_iso, "current")
    st = load_state()
    prev = st.get("baseline")
    dl = delta(d["metrics"], prev["metrics"] if prev else None)
    ctx = dict(d, deltas=dl, sections=selected_sections())
    md = render_markdown(ctx)
    tg = render_telegram(ctx)
    os.makedirs(DIGESTS_DIR, exist_ok=True)
    stamp = e_iso[:10]
    md_path = os.path.join(DIGESTS_DIR, f"digest-{stamp}.md")
    tg_path = os.path.join(DIGESTS_DIR, f"digest-{stamp}.telegram.txt")
    with open(md_path, "w") as f:
        f.write(md)
    with open(tg_path, "w") as f:
        f.write(tg)
    d["rendered_markdown"] = md
    d["rendered_telegram"] = tg
    d["deltas"] = dl
    d["markdown_path"] = md_path
    d["telegram_path"] = tg_path
    st["latest"] = d
    save_state(st)
    log(f"digest saved: {md_path} (+ telegram text {len(tg)} chars)")
    print(md)
    print("=" * 60)
    print(tg)


def cmd_deliver():
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat:
        raise SystemExit("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set (env only)")
    st = load_state()
    latest = st.get("latest")
    if not latest or "rendered_telegram" not in latest:
        raise SystemExit("no digest built — run --run first")
    # validate token (getMe) — print only non-secret fields
    me = http_get(f"{TELEGRAM_API}/bot{token}/getMe")
    if not me.get("ok"):
        raise SystemExit(f"getMe failed: {me}")
    log(f"bot validated: @{me['result'].get('username')} (id {me['result'].get('id')})")
    text = latest["rendered_telegram"]
    data = urllib.parse.urlencode(
        {"chat_id": chat, "text": text, "disable_web_page_preview": "true"}
    ).encode()
    req = urllib.request.Request(
        f"{TELEGRAM_API}/bot{token}/sendMessage", data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read().decode())
    if not resp.get("ok"):
        raise SystemExit(f"sendMessage failed: {resp}")
    mid = resp["result"]["message_id"]
    log(f"DELIVERED: message_id={mid}")
    latest["telegram_message_id"] = mid
    latest["delivered_iso"] = datetime.now(timezone.utc).isoformat()
    st["latest"] = latest
    st.setdefault("history", []).append({
        "window": latest["window"], "message_id": mid,
        "delivered_iso": latest["delivered_iso"]})
    save_state(st)
    print(f"MESSAGE_ID={mid}")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("--backfill", "--run", "--deliver"):
        sys.exit("usage: digest.py --backfill | --run | --deliver")
    {"--backfill": cmd_backfill, "--run": cmd_run, "--deliver": cmd_deliver}[sys.argv[1]]()
