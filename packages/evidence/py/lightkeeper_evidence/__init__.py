"""@lightkeeper/evidence (L10) — the proof pipeline.

Every run emits records; evidence.md is rendered from them, never
hand-written. This package owns:

* :class:`Record` — a proof record. It REFUSES records without source
  identifiers: at least one of ``mcp_endpoint``, ``tx_hash``, ``block``,
  ``url`` (or any other non-empty source key) is required, else
  :class:`MissingSourceIdentifiers` is raised.
* :class:`EvidenceLog` — collects records, writes evidence.json, renders
  evidence.md from the records.
* :func:`secrets_scan` / :func:`redact` — scan record text for leaked
  secrets (private keys, tokens) before anything is written.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone


class MissingSourceIdentifiers(RuntimeError):
    """A record was emitted without any source identifier — refused."""


@dataclass
class Record:
    """One proof record: the payload plus its source identifiers.

    ``sources`` must contain at least one non-empty value — the record is
    refused otherwise. This is mechanical: no module can borrow another's
    proof, because the emitter requires the source on every record.
    """
    fields: dict
    sources: dict

    def __post_init__(self):
        if not isinstance(self.fields, dict) or not isinstance(self.sources, dict):
            raise TypeError("Record fields and sources must be dicts")
        ids = {k: v for k, v in self.sources.items()
               if v not in (None, "", [], {})}
        if not ids:
            raise MissingSourceIdentifiers(
                "refusing record: no source identifier "
                "(need e.g. mcp_endpoint, mcp_tool, tx_hash, block, or url)"
            )

    def to_dict(self) -> dict:
        return {**self.fields, **self.sources}


SECRET_PATTERNS = [
    ("hex-private-key", re.compile(r"\b0x[0-9a-fA-F]{64}\b")),
    ("bearer-token", re.compile(r"(?i)\bbearer\s+[A-Za-z0-9\-._~+/]+=*\b")),
    ("telegram-bot-token", re.compile(r"\b\d{6,}:[A-Za-z0-9_-]{30,}\b")),
    ("private-key-pem", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("mnemonic", re.compile(
        r"(?i)\bmnemonic['\"]?\s*[:=]\s*['\"]?([a-z]+\s+){11}[a-z]+")),
]


def secrets_scan(text: str) -> list[str]:
    """Scan ``text`` for leaked secrets. Returns finding descriptions."""
    findings: list[str] = []
    for name, pattern in SECRET_PATTERNS:
        for m in pattern.finditer(text or ""):
            findings.append(f"{name}: ...{m.group(0)[-8:]}")
    return findings


def redact(text: str) -> str:
    """Replace detected secrets with ``[REDACTED:<kind>]``."""
    out = text or ""
    for name, pattern in SECRET_PATTERNS:
        out = pattern.sub(f"[REDACTED:{name}]", out)
    return out


class EvidenceLog:
    """Collects records for one task run."""

    def __init__(self, task_id: str):
        self.task_id = task_id
        self.records: list[Record] = []

    def emit(self, kind: str, sources: dict, **fields) -> Record:
        """Emit one record. ``sources`` must carry ≥1 source identifier."""
        rec = Record(fields={"task": self.task_id, "kind": kind, **fields},
                     sources=sources)
        self.records.append(rec)
        return rec

    def to_dict(self) -> dict:
        return {
            "task": self.task_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "records": [r.to_dict() for r in self.records],
        }

    def save_json(self, path: str) -> None:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)

    def render_markdown(self, title: str) -> str:
        """Render evidence.md FROM the records — never hand-written."""
        lines = [f"# {title}", ""]
        for i, rec in enumerate(self.records, 1):
            d = rec.to_dict()
            lines.append(f"## E{i} — {d.get('kind', 'record')}")
            for k, v in d.items():
                if k in ("task", "kind"):
                    continue
                lines.append(f"- **{k}**: `{v}`")
            lines.append("")
        return "\n".join(lines)


__all__ = [
    "MissingSourceIdentifiers", "Record", "EvidenceLog",
    "secrets_scan", "redact", "SECRET_PATTERNS",
]
