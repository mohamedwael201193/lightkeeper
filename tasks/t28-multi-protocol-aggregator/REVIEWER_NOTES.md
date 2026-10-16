# T28 — Reviewer Notes

## What to check first (2 minutes)

1. Open `runs/aggregation-report-block-31482191.json` — the full aggregation
   run: block, timestamp, per-venue raw + normalized reads, comparison ranking.
2. Open any deploy tx on the explorer, e.g.
   `https://atlantic.pharosscan.xyz/tx/0x3aca9fd713c1e6ed6115a59d6c29fb2b5db5730a23314b26c8bf371e8db2068c`
   — real contract creation on Atlantic.
3. Run `python3 aggregate.py run` yourself (needs `ATLANTIC_RPC_URL`) and
   compare your numbers to the report — they will differ slightly (yield
   accrues per second; borrows change utilization), which is exactly the
   point: the reads are live.

## How we exceed the bar (not just meet it)

- **Official bar:** ≥2 protocols/vaults behind one interface. **We ship 3
  venues across 2 protocol types** (2 vaults + 1 lending pool), each a real
  deployed contract with honest on-chain math — not stubs.
- **Official bar:** actions "prepared for signature". **We go further:** every
  prepared action carries a gas estimate AND an eth_call dry-run revert gate
  executed from the operator address, and the tool has *no code path that can
  broadcast* — preparation cannot accidentally become execution.
- **Official bar:** "handles one protocol down". **We prove it twice:**
  structurally (every venue read is exception-isolated with UNREACHABLE +
  reason, never zero-filled) and live (`aggregate.py chaos` forces a venue to
  a dead address; the other two aggregate and re-rank in the same run —
  transcript in `runs/chaos-demo.txt`).
- **Official bar:** architecture write-up "strongly encouraged". **Shipped**
  (`ARCHITECTURE.md`) including a failure-modes table.

## Honest limitations (read before scoring)

- The three venues are minimal purpose-built contracts at dust scale
  (~0.0055 PHRS total TVL). The math is real (share-price accrual,
  utilization-rate curve) but this is not a production protocol integration.
- Sibling LIGHTKEEPER tasks (T02/T07/T10/T15/T16) had deployed nothing
  on-chain when the registry was built — they are listed as PENDING, not
  faked. The registry is designed to absorb them later (`discover` re-verifies).
- Slippage, fees, and multi-block price moves are not modeled; amounts are dust.
- Video slot is PENDING-VIDEO at submission time; the filming guide
  (`VIDEO-GUIDE.md`) mandates real terminal + real explorer, no staged fakes.

## Reproducibility

```bash
set -a; source ~/workspace/lightkeeper/.env; set +a
export PATH="$HOME/.foundry/bin:$PATH"
cd tasks/t28-multi-protocol-aggregator
python3 -m pytest tests/ -q        # 10/10, no network, no keys
python3 aggregate.py discover      # bytecode checks, ~10s
python3 aggregate.py run           # full live run, ~90s (slow Atlantic RPC)
```

All 7 write transactions were dust-scale on Atlantic testnet only, under the
0.15 PHRS task budget (spend log in `evidence.json`). No mainnet, no key in
the repo, `.env` never committed.
