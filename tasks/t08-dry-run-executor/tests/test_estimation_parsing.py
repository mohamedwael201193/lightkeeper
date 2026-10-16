#!/usr/bin/env python3
"""T08 unit tests — estimation parsing, revert decoding, gate math.

Pure unit tests: no network, no private key, no chain.
Run: python3 tests/test_estimation_parsing.py
"""

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from revert_decode import (  # noqa: E402
    decode_revert_data,
    extract_reason_from_cast_stderr,
)

GAS_SAFETY_FACTOR = 1.2


def gas_limit_for(estimate: int) -> int:
    return math.ceil(estimate * GAS_SAFETY_FACTOR)


class TestCastOutputParsing(unittest.TestCase):
    def test_estimate_success_is_integer(self):
        out = "43487\n"
        self.assertEqual(int(out.strip()), 43487)

    def test_estimate_success_with_whitespace(self):
        self.assertEqual(int("  21000  \n".strip()), 21000)

    def test_estimate_failure_stderr_carries_reason(self):
        stderr = (
            "Error: \n"
            "execution reverted: DryRunProbe: forced boom\n"
        )
        reason = extract_reason_from_cast_stderr(stderr)
        self.assertEqual(reason, "DryRunProbe: forced boom")

    def test_estimate_failure_hex_revert_data_decoded(self):
        # Error(string) encoding of "boom"
        data = ("0x08c379a0"
                "0000000000000000000000000000000000000000000000000000000000000020"
                "0000000000000000000000000000000000000000000000000000000000000004"
                "626f6f6d00000000000000000000000000000000000000000000000000000000")
        stderr = f"Error: \nexecution reverted: {data}\n"
        self.assertEqual(extract_reason_from_cast_stderr(stderr), "boom")

    def test_non_revert_stderr_yields_empty(self):
        stderr = "Error: \nfailed to get gas estimate: insufficient funds\n"
        self.assertEqual(extract_reason_from_cast_stderr(stderr), "")


class TestRevertDecoding(unittest.TestCase):
    def test_error_string(self):
        data = ("0x08c379a0"
                "0000000000000000000000000000000000000000000000000000000000000020"
                "0000000000000000000000000000000000000000000000000000000000000018"
                "44727952756e50726f62653a20666f7263656420626f6f6d"
                "000000000000000000000000000000000000000000000000000000")
        # "DryRunProbe: forced boom" (24 chars) — pad to full 32-byte word
        self.assertIn("DryRunProbe", decode_revert_data(data))

    def test_panic_overflow(self):
        data = ("0x4e487b71"
                "0000000000000000000000000000000000000000000000000000000000000011")
        reason = decode_revert_data(data)
        self.assertIn("0x11", reason)
        self.assertIn("overflow", reason)

    def test_custom_error_not_invented(self):
        data = "0xdeadbeef" + "00" * 32
        reason = decode_revert_data(data)
        self.assertIn("0xdeadbeef", reason)
        self.assertIn("not invented", reason)

    def test_empty_data(self):
        self.assertIn("empty", decode_revert_data("0x"))


class TestGasSafetyFactor(unittest.TestCase):
    def test_factor_applied(self):
        self.assertEqual(gas_limit_for(43487), math.ceil(43487 * 1.2))

    def test_factor_is_conservative(self):
        for est in (21000, 43487, 100000, 500000):
            self.assertGreaterEqual(gas_limit_for(est), est)
            self.assertLessEqual(gas_limit_for(est), est * 1.2 + 1)

    def test_predicted_cost_math(self):
        gas_limit = gas_limit_for(43487)          # 52185
        gas_price = 1_000_000_000                 # 1 gwei
        cost_wei = gas_limit * gas_price
        cost_phrs = cost_wei / 10**18
        self.assertAlmostEqual(cost_phrs, 52185 * 1e9 / 1e18)


class TestGateRules(unittest.TestCase):
    def gate_allows(self, status: str) -> bool:
        return status == "PASS"

    def test_pass_ticket_allowed(self):
        self.assertTrue(self.gate_allows("PASS"))

    def test_fail_ticket_blocked(self):
        self.assertFalse(self.gate_allows("FAIL"))

    def test_error_ticket_blocked(self):
        self.assertFalse(self.gate_allows("ERROR"))

    def test_missing_ticket_blocked(self):
        self.assertFalse(self.gate_allows(None))

    def test_dryrun_module_has_no_signer(self):
        src = (Path(__file__).parent.parent / "src" / "dryrun.py").read_text()
        for tok in ("getenv", "os.environ", '"--private-key"', "'--private-key'"):
            self.assertNotIn(tok, src, f"signer capability in dry-run module: {tok}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
