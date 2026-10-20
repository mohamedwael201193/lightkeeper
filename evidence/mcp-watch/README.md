# MCP staleness watch (WS1 #4)

**Baseline:** `baseline-tools.json` — live spec captured 2026-10-20:
Chain MCP `pharos-mcp-server 0.1.0`, protocol `2025-03-26`, 14 tools, block 20716280;
Docs MCP `0.27.2`, protocol `2024-11-05`, 4 tools.

**Detector:** `scripts/mcp-watch.py` — pulls both specs live and diffs against
the baseline. Alerts (exit 1) on tool add/remove/rename, inputSchema change,
protocolVersion switch (e.g. `2025-03-26` → `2026-07-28`), server version
bump, or a frozen chain (block not advancing over `--freeze-wait` seconds).
Exit 0 = no drift, exit 2 = infra error. Verified 2026-10-20: exit 0 on the
live spec; exit 1 with `version_bump` + `tool_added` + `protocol_switch`
against a deliberately tampered baseline.

## Cron job spec (install from the main chat)

Installing the schedule from a subagent session was rejected by the runtime
("a chat connected to an external messaging service can receive scheduled
results only from schedules created or changed inside that same chat").
Create it from the main WhatsApp chat with exactly:

- **id:** `mcp-staleness-watch`
- **title:** `MCP staleness watch (Chain + Docs MCP drift)`
- **owner:** `goal:pharos-agent-arena-campaign`
- **mode:** `task`, **enabled:** true
- **schedule:** interval, every `6h`, timezone `Africa/Cairo`
- **delivery:** the main chat (same chat_id as `lightkeeper-build-updates`)
- **body:**

> You watch the hosted Pharos MCP endpoints (Chain MCP + Docs MCP) for spec
> drift that would break LIGHTKEEPER submissions. The detector is a real
> script in the repo; you only run it and report what it says. Never invent
> drift.
>
> 1. Run exactly: `python3 ~/workspace/lightkeeper/scripts/mcp-watch.py --json`.
> 2. Exit 0 (no drift) → stay silent. Exit 2 (infra) → stay silent, do not
>    touch the watermark. Exit 1 → parse the `drift` array from stdout.
> 3. Dedup: signature = sha256 of the compact JSON of the `drift` array;
>    compare with `~/workspace/goals/pharos-agent-arena-campaign/hidden_files/mcp-watch-last-drift.txt`;
>    if identical, stay silent.
> 4. New signature → send ONE short Egyptian-Arabic message naming the
>    server and the change (tool added/removed, protocol switch with both
>    versions, version bump, frozen block), noting submissions may need a
>    re-verify via `scripts/mcp-verify.sh`; then write the signature to the
>    watermark file.
> 5. If a later run returns exit 0 after drift was reported, delete the
>    watermark silently.
>
> Rules: report only what the script printed, verbatim tool names/versions.
> Never modify the baseline yourself — re-baselining is a human decision.
