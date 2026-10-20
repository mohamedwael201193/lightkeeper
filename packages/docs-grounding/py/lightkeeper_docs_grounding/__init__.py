"""@lightkeeper/docs-grounding (L2) — citation objects and grounding verdicts.

Every technical assertion cites a canonical doc URL. This package owns:

* :class:`Citation` — a source URL plus the verbatim quote retrieved from it.
* :class:`GroundingVerdict` — ``grounded`` / ``partial`` / ``unknown``.
* :func:`require_grounding` — refuses to improvise: raises
  :class:`UnwillingToImprovise` unless the answer is fully grounded.
* Quote-block extraction + verbatim verification (the discipline the T03
  quote check enforces on evidence.md).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class GroundingVerdict(Enum):
    GROUNDED = "grounded"   # >=1 citation carrying a verbatim quote
    PARTIAL = "partial"     # citations exist but none carries a quote
    UNKNOWN = "unknown"     # no citations at all


class UnwillingToImprovise(RuntimeError):
    """Raised when code asks for an answer with no grounding — the library
    refuses to improvise instead of returning an ungrounded answer."""


@dataclass
class Citation:
    """One cited fact: where it came from and the verbatim quote."""
    source_url: str
    quote: str = ""
    retrieved_at: str = ""

    def __post_init__(self):
        if not self.source_url:
            raise ValueError("Citation requires a source_url")
        if not self.retrieved_at:
            self.retrieved_at = datetime.now(timezone.utc).isoformat()


def normalize_quote(s: str) -> str:
    """Whitespace-normalize a quote for verbatim comparison."""
    return re.sub(r"\s+", " ", s).strip()


def extract_quote_blocks(md: str) -> list[str]:
    """Extract ``>`` quote blocks from markdown (consecutive ``>`` lines
    form one block)."""
    blocks: list[str] = []
    current: list[str] = []
    for line in md.splitlines():
        if line.lstrip().startswith(">"):
            current.append(line.lstrip()[1:].lstrip())
        else:
            if current:
                blocks.append("\n".join(current))
                current = []
    if current:
        blocks.append("\n".join(current))
    return blocks


def ground_answer(citations: list[Citation]) -> GroundingVerdict:
    """Verdict for an answer given its citations."""
    if not citations:
        return GroundingVerdict.UNKNOWN
    if any(normalize_quote(c.quote) for c in citations):
        return GroundingVerdict.GROUNDED
    return GroundingVerdict.PARTIAL


def require_grounding(citations: list[Citation]) -> list[Citation]:
    """Return citations iff the answer is GROUNDED, else raise."""
    if ground_answer(citations) is not GroundingVerdict.GROUNDED:
        raise UnwillingToImprovise(
            f"refusing to answer: grounding verdict is "
            f"{ground_answer(citations).value}, need 'grounded' "
            f"(a citation with a verbatim quote)"
        )
    return citations


def quote_verified(quote: str, transcript_texts: list[str]) -> bool:
    """True iff the normalized quote appears verbatim in any transcript."""
    nq = normalize_quote(quote)
    if not nq:
        return False
    return any(nq in normalize_quote(t) for t in transcript_texts)


def citation_md(c: Citation) -> str:
    """Render one citation as markdown."""
    q = normalize_quote(c.quote)
    return f"- [{c.source_url}]({c.source_url})" + (f' — "{q}"' if q else "")


__all__ = [
    "GroundingVerdict", "UnwillingToImprovise", "Citation",
    "normalize_quote", "extract_quote_blocks", "ground_answer",
    "require_grounding", "quote_verified", "citation_md",
]
