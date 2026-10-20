#!/usr/bin/env python3
"""Quote discipline check (thin wrapper).

The real checks live in tests/test_quotes.py (unittest):
  - every `>` quote block in evidence.md appears verbatim in the latest
    transcript's verbatim Docs MCP answers
  - transcript structure: numbered entries (Q1..Qn), tool-name allowlist,
    required fields, >=10 verified quotes

This wrapper exists for existing CI/scripts; it runs the unittest suite
and exits with the suite's exit code (non-zero on any mismatch).
"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
sys.path.insert(0, TASK)  # so `tests.test_quotes` is importable

from tests.test_quotes import (  # noqa: E402
    TestQuoteDiscipline, TestTranscriptStructure,
)

if __name__ == "__main__":
    suite = unittest.TestSuite()
    for cls in (TestQuoteDiscipline, TestTranscriptStructure):
        suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(cls))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
