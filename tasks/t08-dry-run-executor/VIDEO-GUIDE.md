# VIDEO-GUIDE.md — T08 Dry-Run Executor (45–90 seconds)

**Rule: every frame is real.** Real terminal, real commands, real Atlantic
explorer pages. No staged fakes, no pre-typed outputs, no mock UIs. If a command
fails on camera, keep it — then show the fix.

## Shot list

### Shot 1 — the good tx → PASS simulation (0:00–0:25)

**Show:** terminal, repo dir `tasks/t08-dry-run-executor/`.

**Type (live):**

```bash
python3 src/dryrun.py --rpc-url "$ATLANTIC_RPC_URL" \
  --from 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 \
  --to 0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f \
  --sig "ping()" --out runs/receipt-demo.json
```

**Say:** *"Dry-run executor, Atlantic testnet. I'm simulating a ping call —
nothing is broadcast, the dry-run module can't even hold a key. PASS: 58
thousand gas estimated, 1.2× safety limit, predicted cost under a thousandth
of a PHRS. Before-state: count is zero; projected after: count is one."*

**Show:** `cat runs/receipt-demo.json` — point at `"status": "PASS"`,
`"gasLimit"`, `"predictedCostPHRS"`, `"chainModified": false`.

### Shot 2 — the blocked tx → revert reason → execution refused (0:25–0:55)

**Type (live):**

```bash
python3 src/dryrun.py --rpc-url "$ATLANTIC_RPC_URL" \
  --from 0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3 \
  --to 0xd5f956BCb0806BE66aEfa7C5559f195cd5224a8f \
  --sig "boom()" --out runs/receipt-blocked.json
```

**Say:** *"Now the hostile case — boom always reverts. The dry-run catches it:
FAIL, with the exact revert reason decoded from the chain's own error
payload: 'DryRunProbe: forced boom'."*

**Type (live):**

```bash
python3 src/broadcast.py --receipt runs/receipt-blocked.json \
  --rpc-url "$ATLANTIC_RPC_URL" --key-env DEPLOYER_PRIVATE_KEY; echo "exit=$?"
```

**Say:** *"And when I try to broadcast the failed ticket anyway, the gate
refuses — exit code 2, EXECUTION REFUSED, written to the blocked-execution
log. There is no transaction for this on the explorer, because there never
was one."*

### Shot 3 — the real broadcast matches the prediction (0:55–1:30)

**Show:** browser on the real explorer tx page (already mined):
`https://atlantic.pharosscan.xyz/tx/0x639f87ba9b79ce1a9c62ebe12fdb4753e021d2dfb7fa3caed0e48fab20b012ee`

**Say:** *"Earlier I broadcast the PASS ticket through the gate. Here's the
real receipt: status success — the PASS prediction held. Gas used 45,470,
inside the 69,863 safety limit. The Pinged event fired, and the probe's count
moved from zero to one, exactly as the dry-run projected. Prediction matched
reality; total spend for the whole task: three ten-thousandths of a PHRS."*

**End card (text overlay):** `LIGHTKEEPER T08 · DRY-RUN EXECUTOR · simulate before you sign`

## Spoken script (full, ~85s at natural pace)

> "Every transaction deserves a rehearsal before it touches the chain. This is
> the Dry-Run Executor on Pharos Atlantic. [SHOT 1] I simulate a ping call —
> no broadcast, the dry-run module physically cannot sign. PASS: gas estimated,
> 1.2× safety limit applied, predicted cost shown, before-and-after state
> projected. [SHOT 2] The hostile case: boom always reverts. The dry-run
> catches it — FAIL, with the exact revert reason decoded from the chain's own
> error data. Try to broadcast the failed ticket anyway, and the gate refuses:
> exit code two, execution refused, logged. Nothing reaches the chain.
> [SHOT 3] The PASS ticket I did broadcast: real explorer receipt, status
> success, gas inside the safety limit, state moved exactly as projected.
> Simulate before you sign — that's T08."

## Checklist before filming

- [ ] Terminal font large enough to read at 1080p
- [ ] `$ATLANTIC_RPC_URL` exported; **never** `echo` the key env var
- [ ] Explorer pages loaded live (not screenshots) — tx `0x639f87…012ee`
- [ ] Keep the `blocked-execution.log` refusal line on screen ≥ 3 seconds
- [ ] No background browser tabs with unrelated content
