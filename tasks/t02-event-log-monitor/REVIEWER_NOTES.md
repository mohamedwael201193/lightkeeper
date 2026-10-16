# T02 Reviewer Notes (self-review, 2026-10-16)

## Requirement audit (score each 1:1)

1. ✅ "(1) Chain MCP log queries filtered by contract address + event signature."
   `monitor.py::get_logs` issues `cast logs` with `--address` + positional topic0 per
   event; topic0 = `cast keccak(signature)` computed at runtime, verified byte-equal
   against the on-chain log topics (0x70b9fa9d… / 0x9d0b99c2… / 0x0217ec97…).
2. ✅ "(2) Runs CONTINUOUSLY (polling/block-by-block); reports only NEW events, no
   duplicates." 8s poll loop (`cmd_run`), seen-set keyed `blockNumber:logIndex`,
   atomic persist-before-emit. Proven by poll.log cycles + kill-9 restart → 0
   re-emissions.
3. ✅ "(3) Decodes events into readable fields (from/to/amount/tx/block)." `decode()`
   parses indexed topics + ABI data into named fields; alerts carry block, tx hash,
   log index. Sample in README §4.
4. ✅ "(4) Demonstrated catching ≥1 live or test event." FOUR real txs on Atlantic
   (Ping×2, Zap×1, Marker×1), one fired while the poller was running and caught in
   the next cycle. All explorer-verified.

## Bar check vs the contested T02 minimum (verdict 2026-10-16)

| Bar item | T02 status |
|---|---|
| Persistent server-side cursor surviving kill-9 | ✅ kill -9 → restart, cursor 31481379 restored, 0 re-emission |
| Confirmations-lag reorg tolerance | ✅ 2-block lag |
| Continuous poll log | ✅ poll.log, 8s cycles (kept running at delivery) |

## Weaknesses (shipped unsoftened)

- Poll history is a session log, not a multi-day archive (durable cursor makes this
  a deployment choice).
- No webhook/notification sink — alerts go to `alerts.jsonl`.
- Reorg handling = confirmation lag only, no reorg-detector.
- 4 emitter txs only; ranges chunked at exactly the node cap of 1,000 blocks.

## Reproducibility

The deterministic test (`monitor.py test --from-block=31481148 --to-block=<tip>
--expect=Ping,Ping,Zap,Marker`) is the 60-second reviewer test: it re-scans the
known range over live RPC and asserts EXACTLY the 4 emitted events. Passed.
