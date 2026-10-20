#!/usr/bin/env python3
"""T08 Chain-MCP migration tests.

Pure unit tests: no network, no private key, no chain.
- calldata encoding (selector + ABI types) against values that `cast
  calldata` produces for the same signatures (recorded constants below).
- revert_reason_from_mcp_error against REAL Chain MCP error shapes
  (captured 2026-10-20 from https://mcp.pharos.xyz/mcp).
- compute_reconcile (prediction-vs-receipt post-mortem math) against the
  REAL Atlantic ledger entry tx 0xd294... (recorded prediction/reality),
  proving the error-% math reproduces the ledger's drift figure.
- rawRpcCalls: asserts the migrated module contains no raw-RPC escape
  (no 'cast' subprocess, no eth_* RPC url usage).
Run: python3 tests/test_mcp_migration.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from dryrun import (  # noqa: E402
    encode_calldata,
    parse_sig,
    revert_reason_from_mcp_error,
    compute_reconcile,
    EXPECTED_CHAIN_ID,
    GAS_SAFETY_FACTOR,
)

USDC = "0xc879c018db60520f4355c26ed1a6d572cdac1815"
TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


class TestCalldata(unittest.TestCase):
    def test_ping_selector(self):
        # canonical: cast calldata "ping()" == 0x5c36b186 (verified against Foundry)
        self.assertEqual(encode_calldata("ping()", []), "0x5c36b186")

    def test_count_output_annotation_uses_input_types(self):
        self.assertEqual(encode_calldata("count()(uint256)", []), "0x06661abd")

    def test_transfer_encoding(self):
        # canonical: cast calldata "transfer(address,uint256)" 0x...0002 100
        # (verified against Foundry; 0xa9059cbb = keccak("transfer(address,uint256)")[:4])
        got = encode_calldata(
            "transfer(address,uint256)",
            ["0x0000000000000000000000000000000000000002", "100"],
        )
        self.assertEqual(
            got,
            "0xa9059cbb"
            "0000000000000000000000000000000000000000000000000000000000000002"
            "0000000000000000000000000000000000000000000000000000000000000064",
        )

    def test_decimals_selector(self):
        self.assertEqual(encode_calldata("decimals()", []), "0x313ce567")

    def test_arg_count_mismatch_raises(self):
        with self.assertRaises(ValueError):
            encode_calldata("transfer(address,uint256)", ["0x" + "00" * 20])

    def test_parse_sig(self):
        self.assertEqual(parse_sig("count()(uint256)"), ("count", []))
        self.assertEqual(parse_sig("transfer(address,uint256)"),
                         ("transfer", ["address", "uint256"]))


class TestMcpRevertReason(unittest.TestCase):
    def test_reverts_with_error_string_data(self):
        # REAL Chain MCP error shape (estimate_gas on USDC transfer with no balance)
        err = {
            "message": "execution reverted: ERC20: transfer amount exceeds balance",
            "code": 3,
            "data": "0x08c379a00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002645524332303a207472616e7366657220616d6f756e7420657863656564732062616c616e63650000000000000000000000000000000000000000000000000000000000",
        }
        self.assertEqual(revert_reason_from_mcp_error(err),
                         "ERC20: transfer amount exceeds balance")

    def test_revert_no_data_falls_back_to_message(self):
        # REAL Chain MCP error shape (eth_call with unknown selector)
        err = {"message": "execution reverted: ", "code": 3, "data": "0x"}
        self.assertEqual(revert_reason_from_mcp_error(err), "reverted with no reason")


class TestReconcileMath(unittest.TestCase):
    """The post-mortem math must reproduce the recorded ledger drift.

    Real recorded entry: runs/prediction-ledger.jsonl tx 0xd294...:
    prediction gasEstimate=37379, gasLimit=44855, predictedCostPHRS=0.00044855;
    reality gasUsed=28370, effectiveGasPriceWei=1000000001, drift +31.8%.
    """

    def test_error_pct_matches_recorded_drift(self):
        gas_used = 28370
        price = 1000000001
        receipt = {
            "transactionHash": "0xd294bb5c03c55d7ffdd750b0a20384aa393e490da11fe3d7f67845d34d34fb03",
            "gasUsed": hex(gas_used),
            "effectiveGasPrice": hex(price),
            "status": "0x1",
            "blockNumber": "0x1e071dd",
            "logs": [],
            "from": "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
            "to": "0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f",
        }
        tx = {"from": receipt["from"], "to": receipt["to"], "value": "0x0"}
        pred = {"prediction": {
            "gasEstimate": 37379, "gasLimit": 44855,
            "predictedCostPHRS": 0.00044855, "dryRunBlock": 31486270}}
        r = compute_reconcile(receipt, tx, pred)
        self.assertEqual(r["actual"]["gasUsed"], gas_used)
        self.assertEqual(r["status"], "success")
        # gas error %: (37379 - 28370)/28370*100 == +31.75 → ledger rounds to 31.8
        self.assertAlmostEqual(r["match"]["gasErrorPct"], 31.75, places=1)
        self.assertTrue(r["match"]["gasWithinSafetyLimit"])
        # actual cost = 28370 * 1000000001 wei
        self.assertEqual(r["actual"]["actualCostWei"], gas_used * price)

    def test_erc20_transfer_deltas_decode(self):
        sender = "0xc5f6fe56976e0a55aed6c0e08951a8a2f8980f45"
        recvr = "0x936564245b69f5a293b42cbd752e0ee3bb68b470"
        amount = 0x35f65df97a8188f01
        receipt = {
            "transactionHash": "0x86fd78cf0f71905adbdabde6b7f93e791d0d7d1efe80eaeb5112291420971bde",
            "gasUsed": "0x2381e", "effectiveGasPrice": "0x39f2b8845",
            "status": "0x1", "blockNumber": "0x13c1807",
            "from": sender, "to": recvr,
            "logs": [{
                "address": USDC,
                "topics": [TRANSFER_TOPIC,
                           "0x" + "0" * 24 + sender[2:],
                           "0x" + "0" * 24 + recvr[2:]],
                "data": hex(amount),
            }],
        }
        tx = {"from": sender, "to": recvr, "value": "0x0"}
        r = compute_reconcile(receipt, tx, None)
        self.assertIsNone(r["prediction"])
        self.assertIsNone(r["match"])
        d = {(x["asset"], x["address"]): x["deltaRaw"] for x in r["erc20Deltas"]}
        self.assertEqual(d[(USDC.lower(), sender.lower())], -amount)
        self.assertEqual(d[(USDC.lower(), recvr.lower())], amount)
        self.assertEqual(r["nativeDeltasPROSwei"]["recipientValue"], 0)

    def test_no_raw_rpc_in_migrated_module(self):
        src = (Path(__file__).parent.parent / "src" / "dryrun.py").read_text()
        body = "\n".join(
            ln for ln in src.splitlines() if not ln.lstrip().startswith("#"))
        for tok in ("subprocess", '["cast"', '"cast"', "eth_feeHistory",
                    "eth_getBalance", "ATLANTIC_RPC_URL"):
            self.assertNotIn(tok, body, f"raw-RPC escape found: {tok}")
        self.assertEqual(EXPECTED_CHAIN_ID, 1672)
        self.assertEqual(GAS_SAFETY_FACTOR, 1.2)


if __name__ == "__main__":
    unittest.main()
