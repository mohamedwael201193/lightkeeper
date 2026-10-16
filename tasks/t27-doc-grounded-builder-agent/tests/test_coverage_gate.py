"""T27 coverage-gate unit tests.

These tests assert the agent's citation discipline, not chain state:
- every step of every covered plan traces to >=1 citation carrying
  (doc_url, retrieved_at, excerpt)
- an uncovered request is REFUSED with a say-so reason (never improvised)
- funds-moving execution is withheld as prepared-for-signature
"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from agent import run_agent, coverage_check, classify  # noqa: E402

COVERED_REQUESTS = [
    "deploy an ERC20 token on the Atlantic testnet and verify the contract",
    "read the ERC-20 balance of my wallet on Atlantic",
    "transfer 10 ERC-20 tokens to 0x000000000000000000000000000000000000dEaD",
]


def test_every_covered_step_has_citation():
    for req in COVERED_REQUESTS:
        log = run_agent(req, mode="plan")
        assert log["coverage_gate"]["gate"] == "PASS", f"gate failed for: {req}"
        for s in log["steps"]:
            if s["status"] == "UNVERIFIED":
                pytest.fail(f"step {s['id']} unverified in request: {req}")
            for c in s["citations"]:
                assert c["discipline"] == "DOC-GROUNDED"
                assert c["doc_url"].startswith("https://docs.pharos.xyz/"), c
                assert "2026-10-16" in c["retrieved_at"], c
                assert len(c["excerpt"]) > 40, c


def test_classification_covers_three_how_do_i_requests():
    kinds = {classify(r) for r in COVERED_REQUESTS}
    assert kinds == {"deploy_token", "read_balance", "transfer"}


def test_uncovered_request_is_refused_with_say_so():
    log = run_agent(
        "make my token confidential with private shielded transactions", mode="execute")
    assert log["verdict"] == "REFUSED"
    reason = log["reason"].lower()
    assert "do not cover" in reason or "does not cover" in reason
    assert "improvise" in reason


def test_uncovered_request_lists_consulted_corpus():
    log = run_agent("deploy a confidential contract with encrypted state", mode="plan")
    assert log["verdict"] == "REFUSED"
    assert "docs.pharos.xyz" in log["reason"]


def test_transfer_withholds_broadcast_but_plan_is_covered():
    log = run_agent(COVERED_REQUESTS[2], mode="execute",
                    token_address="0x0000000000000000000000000000000000000001",
                    transfer_to="0x000000000000000000000000000000000000dEaD",
                    transfer_amount="10")
    assert log["verdict"] == "PREPARED_FOR_SIGNATURE"
    assert log["coverage_gate"]["gate"] == "PASS"
    statuses = {s["id"]: s["status"] for s in log["steps"]}
    assert statuses["T2"] == "POLICY_BLOCKED"
    assert "unsigned_tx" in log["execution"]
    utx = log["execution"]["unsigned_tx"]
    assert utx["chainId"] == 688689
    assert utx["data"].startswith("0xa9059cbb")  # transfer(address,uint256) selector


def test_deploy_plan_uses_documented_chain_id_and_verifier():
    log = run_agent(COVERED_REQUESTS[0], mode="plan")
    steps = {s["id"]: s for s in log["steps"]}
    verify = steps["D8"]
    blob = json.dumps(verify["citations"])
    assert "688689" in blob
    assert "api.socialscan.io/pharos-atlantic-testnet" in blob
    deploy = steps["D7"]
    assert "--broadcast" in json.dumps(deploy["citations"])
