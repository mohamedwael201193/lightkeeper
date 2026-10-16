#!/usr/bin/env python3
"""
T22 tier-computation unit tests.

Run: python3 tests/test_tiers.py

Each test case is labeled:
  REAL-SNAPSHOT   — numbers polled live from Atlantic testnet (tests/real_snapshot_1.json)
  SYNTHETIC       — hand-built numbers, used only for boundary/logic checks
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from gas_optimizer import compute_tiers, recommend_price  # noqa: E402

HERE = Path(__file__).resolve().parent
REAL_SNAP = json.loads((HERE / "real_snapshot_1.json").read_text())

PASSED = []
FAILED = []


def check(name, cond, detail=""):
    (PASSED if cond else FAILED).append(name)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name} {detail}")


# ---- REAL-SNAPSHOT tests ----
snap = REAL_SNAP["samples"]
assert REAL_SNAP["label"] == "REAL-SNAPSHOT", "test fixture must be a real snapshot"

print("REAL-SNAPSHOT (Atlantic, blocks %d-%d)" % (snap[0]["block"], snap[-1]["block"]))
t = compute_tiers(snap)
check("real: all tiers equal on flat testnet",
      t["tiers"]["slow"] == t["tiers"]["standard"] == t["tiers"]["fast"] == 10_000_000_000,
      f"(got {t['tiers']})")
check("real: sample_count matches", t["sample_count"] == len(snap))
check("real: min_block <= max_block", t["min_block"] <= t["max_block"],
      f"({t['min_block']}..{t['max_block']})")
check("real: method documented", "p25" in t["method"] and "p50" in t["method"] and "p75" in t["method"])
p, tier = recommend_price(t["tiers"], "medium")
check("real: medium recommends standard tier", p == t["tiers"]["standard"] and tier == "standard")
p, tier = recommend_price(t["tiers"], "low")
check("real: low recommends slow tier", tier == "slow")

# ---- SYNTHETIC boundary tests (logic only, labeled as synthetic) ----
print("SYNTHETIC")
def mk(*prices):
    base = 1000
    return [{"block": base + i, "gas_price_wei": w} for i, w in enumerate(prices)]

t = compute_tiers(mk(1, 2, 3, 4))
check("synthetic: quartiles of [1,2,3,4]",
      t["tiers"]["slow"] == 1 and t["tiers"]["standard"] == 2 and t["tiers"]["fast"] == 3,
      f"(got {t['tiers']})")
t = compute_tiers(mk(10_000_000_000))
check("synthetic: single sample -> all tiers equal it",
      t["tiers"]["slow"] == t["tiers"]["standard"] == t["tiers"]["fast"] == 10_000_000_000)
t = compute_tiers(mk(5, 100, 5, 5, 100))
check("synthetic: bimodal window order-independent",
      t["tiers"]["slow"] == 5 and t["tiers"]["standard"] == 5 and t["tiers"]["fast"] == 100,
      f"(got {t['tiers']})")
try:
    compute_tiers([])
    check("synthetic: empty window raises", False)
except ValueError:
    check("synthetic: empty window raises", True)
try:
    recommend_price({"slow": 1, "standard": 2, "fast": 3}, "panic")
    check("synthetic: bad urgency raises", False)
except ValueError:
    check("synthetic: bad urgency raises", True)
for u, want in (("low", "slow"), ("medium", "standard"), ("high", "fast")):
    _, got = recommend_price({"slow": 1, "standard": 2, "fast": 3}, u)
    check(f"synthetic: urgency {u} -> {want}", got == want)

# ---- deadline fail-safe logic (pure decision rule, mirrors run_job) ----
print("DEADLINE-LOGIC")
def should_submit(px, threshold, elapsed, deadline, margin):
    if px <= threshold:
        return "favorable_window"
    if elapsed >= deadline - margin:
        return "deadline_reached_forced_submit"
    return "hold"

check("logic: favorable submits", should_submit(5, 10, 0, 30, 10) == "favorable_window")
check("logic: holds before margin", should_submit(20, 10, 10, 30, 10) == "hold")
check("logic: forced at margin", should_submit(20, 10, 20, 30, 10) == "deadline_reached_forced_submit")
check("logic: never silently holds past deadline",
      should_submit(999, 10, 31, 30, 10) == "deadline_reached_forced_submit")

print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
sys.exit(1 if FAILED else 0)
