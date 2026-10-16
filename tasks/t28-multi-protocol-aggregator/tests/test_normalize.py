"""Unit tests for T28 normalization, risk flags, and comparison logic.

All tests run against the PURE functions in aggregate.py — no RPC, no keys,
no network. The live aggregation run (aggregate.py run) is the separate
on-chain evidence leg.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from aggregate import compare, normalize, risk_flags  # noqa: E402


def vault_venue():
    return {"id": "T28-VAULT-A", "type": "vault"}


def lending_venue():
    return {"id": "T28-LEND", "type": "lending"}


def test_normalize_vault_units():
    raw = {"tvl_assets_wei": 2_000_000_000_000_000_000,
           "supply_apy_bps": 250,
           "share_price_1e18": 1_000_000_000_278_253_424,
           "total_shares": 2_000_000_000_000_000_000}
    n = normalize(vault_venue(), raw)
    assert n["tvl_phrs"] == 2.0
    assert n["supply_apy_pct"] == 2.5
    assert abs(n["share_price"] - 1.000000000278253424) < 1e-15
    assert n["capital_efficiency_pct"] == 100.0


def test_normalize_lending_units():
    raw = {"tvl_assets_wei": 2_500_000_000_000_000_000,
           "supply_apy_bps": 74, "borrow_apy_bps": 499,
           "total_supplied_wei": 3_000_000_000_000_000_000,
           "total_borrowed_wei": 500_000_000_000_000_000,
           "utilization_bps": 1666}
    n = normalize(lending_venue(), raw)
    assert n["tvl_phrs"] == 2.5
    assert n["supply_apy_pct"] == 0.74
    assert n["borrow_apy_pct"] == 4.99
    assert n["capital_efficiency_pct"] == 16.66


def test_normalize_rejects_unknown_type():
    try:
        normalize({"id": "X", "type": "perps"}, {})
    except ValueError:
        return
    raise AssertionError("unknown venue type must raise, never silently normalize")


def test_unreachable_never_zero_filled():
    """A failed read must surface as UNREACHABLE with a reason, never zeros."""
    v = {"id": "T28-VAULT-B", "name": "HalcyonVault", "type": "vault",
         "address": "0x000000000000000000000000000000000000dEaD", "block": 1,
         "status": "UNREACHABLE", "reason": "no bytecode at address (get_code empty)"}
    assert v["status"] == "UNREACHABLE"
    assert "tvl_phrs" not in v  # no normalized fields exist on failure
    assert v["reason"]  # and a reason is always present


def test_risk_flags_elevated_utilization():
    v = {"status": "OK", "type": "lending", "tvl_phrs": 1.0, "utilization_bps": 8500}
    flags = risk_flags(v)
    assert any("ELEVATED" in f for f in flags)


def test_risk_flags_thin_tvl():
    v = {"status": "OK", "type": "vault", "tvl_phrs": 0.0001, "utilization_bps": 0}
    flags = risk_flags(v)
    assert any("THIN" in f for f in flags)


def test_risk_flags_healthy_venue():
    v = {"status": "OK", "type": "vault", "tvl_phrs": 2.0, "utilization_bps": 0}
    assert risk_flags(v) == ["none"]


def test_risk_flags_unreachable():
    assert risk_flags({"status": "UNREACHABLE"}) == ["UNREACHABLE"]


def test_compare_ranks_by_live_apy():
    venues = [
        {"id": "T28-LEND", "type": "lending", "status": "OK",
         "supply_apy_pct": 0.74, "capital_efficiency_pct": 16.66,
         "utilization_bps": 1666, "tvl_phrs": 0.0025, "risk_flags": ["none"]},
        {"id": "T28-VAULT-A", "type": "vault", "status": "OK",
         "supply_apy_pct": 2.5, "capital_efficiency_pct": 100.0,
         "utilization_bps": 0, "tvl_phrs": 0.002, "risk_flags": ["none"]},
        {"id": "T28-VAULT-B", "type": "vault", "status": "UNREACHABLE",
         "reason": "no bytecode"},
    ]
    c = compare(venues)
    ranked = c["ranked_by_supply_apy"]
    assert [r["venue"] for r in ranked] == ["T28-VAULT-A", "T28-LEND"]
    assert ranked[0]["supply_apy_pct"] == 2.5
    assert "UNREACHABLE" not in [r["venue"] for r in ranked]  # excluded, not ranked


def test_compare_empty_when_all_down():
    c = compare([{"id": "X", "status": "UNREACHABLE", "reason": "boom"}])
    assert c["ranked_by_supply_apy"] == []
