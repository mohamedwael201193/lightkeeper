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


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def main():
    with open(EVIDENCE_MD) as f:
        md = f.read()
    # Collect `>` quote blocks (consecutive > lines form one block)
    quotes = []
    current = []
    for line in md.splitlines():
        if line.lstrip().startswith(">"):
            current.append(line.lstrip()[1:].lstrip())
        else:
            if current:
                quotes.append("\n".join(current))
                current = []
    if current:
        quotes.append("\n".join(current))
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
        if not any(nq in a for a in answers):
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
