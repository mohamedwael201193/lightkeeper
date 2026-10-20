#!/usr/bin/env python3
"""Quote discipline check: every `>` quote block in evidence.md must appear
(whitespace-normalized) in the verbatim transcript JSONL answers.
Exit 0 = all quotes verified. Exit 1 = mismatch (printed)."""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TASK = os.path.dirname(HERE)
EVIDENCE_MD = os.path.join(TASK, "evidence.md")
TRANSCRIPT_DIR = os.path.join(TASK, "evidence", "transcripts")

REPO_ROOT = os.path.dirname(os.path.dirname(TASK))
# @lightkeeper/docs-grounding (L2): quote-block extraction + verbatim
# verification live here, not in per-task copies.
sys.path.insert(0, os.path.join(REPO_ROOT, "packages", "docs-grounding", "py"))
from lightkeeper_docs_grounding import (  # noqa: E402
    extract_quote_blocks, normalize_quote, quote_verified,
)


def norm(s):
    return normalize_quote(s)


def main():
    with open(EVIDENCE_MD) as f:
        md = f.read()
    # `>` quote blocks, extracted by @lightkeeper/docs-grounding
    quotes = extract_quote_blocks(md)
    # Skip the top-of-file correction blockquote (meta-commentary, not an MCP answer)
    quotes = [q for q in quotes if "Correction (2026-10-19)" not in q]

    jl_files = sorted(f for f in os.listdir(TRANSCRIPT_DIR) if f.endswith(".jsonl"))
    if not jl_files:
        print("NO TRANSCRIPTS")
        sys.exit(1)
    answers = []
    with open(os.path.join(TRANSCRIPT_DIR, jl_files[-1])) as f:
        for line in f:
            line = line.strip()
            if line:
                e = json.loads(line)
                if e.get("answer_verbatim"):
                    answers.append(norm(e["answer_verbatim"]))

    failures = []
    for q in quotes:
        nq = norm(q)
        # Strip markdown quote-mark convention ("...") — not part of the answer
        if len(nq) >= 2 and nq.startswith('"') and nq.endswith('"'):
            nq = nq[1:-1].strip()
        if len(nq) < 20:
            continue
        if not quote_verified(nq, answers):
            failures.append(nq[:120])

    print(f"quotes_checked={len([q for q in quotes if len(norm(q)) >= 20])} "
          f"transcript={jl_files[-1]} answers={len(answers)}")
    if failures:
        print("MISMATCHES:")
        for m in failures:
            print(" -", m)
        sys.exit(1)
    print("ALL QUOTES VERIFIED against the verbatim transcript")


if __name__ == "__main__":
    main()
