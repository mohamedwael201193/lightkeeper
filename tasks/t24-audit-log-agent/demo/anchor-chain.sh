#!/usr/bin/env bash
# t24-audit-log-agent — anchor the chain head ON-CHAIN.
#
# One dust self-send whose CALLDATA is the audit log's terminal entryHash
# (entry #14's entryHash). Anyone can then fetch the mined tx and check its
# input data equals the chain head: the local hash chain is pinned to Atlantic.
# Dust only (0.0001 PHRS value), nonce-guarded via flock /tmp/lk-nonce.lock.
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
set -a; source "$HOME/workspace/lightkeeper/.env"; set +a

T="$HOME/workspace/lightkeeper/tasks/t24-audit-log-agent"
cd "$T"
BIN="node bin/audit-log.mjs"
LOG="$T/state/audit-log.jsonl"
WALLET="0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
OUT="$T/sample-output"
export ATLANTIC_RPC_URL

in_pool() {
  node --input-type=module -e "
const rpc=process.env.ATLANTIC_RPC_URL,h='$1';
const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionByHash',params:[h]})}).then(r=>r.json());
console.log(r.result?'YES':'NO');
"
}

echo "== broadcast anchor tx (flock-guarded, dust 0.0001 PHRS, data = head hash at broadcast time) =="
# Retry loop: under shared-key nonce contention a broadcast can return a hash
# that never reaches the mempool. Each attempt recomputes the head hash (drops
# are logged, so the head moves) and embeds THAT head in the tx data.
ANCHOR=""; AH=""
for attempt in 1 2 3 4 5; do
  HEADLINE=$(node --input-type=module -e "
import {readFileSync} from 'node:fs';
const l=readFileSync('$LOG','utf8').trim().split('\n').map(JSON.parse);
const last=l[l.length-1];
console.log(last.index+':'+last.entryHash);
")
  IDX="${HEADLINE%%:*}"; H="${HEADLINE##*:}"
  echo "[attempt $attempt] head: entry #$IDX ($H)"
  # --async: returns the hash immediately after submission; without it, cast's
  # receipt-polling path returns hashes that never reach the mempool here
  # (observed 6 consecutive drops without --async; the two mined dust txs used --async).
  ANCHOR=$(timeout 600 flock -w 300 /tmp/lk-nonce.lock cast send "$WALLET" --value 0.0001ether \
    --data "0x$H" --gas-price 12000000000 --async --rpc-url "$ATLANTIC_RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" 2>/dev/null \
    | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
  if [ -z "${ANCHOR:-}" ]; then echo "[attempt $attempt] no hash captured — retrying"; sleep 5; continue; fi
  echo "[attempt $attempt] hash $ANCHOR — checking mempool membership…"
  OK=NO
  for s in 1 2 3 4 5 6; do OK=$(in_pool "$ANCHOR"); [ "$OK" = "YES" ] && break; sleep 5; done
  if [ "$OK" = "YES" ]; then AH="$H"; AIDX="$IDX"; echo "[attempt $attempt] IN POOL: $ANCHOR (data = entry #$AIDX head)"; break; fi
  echo "[attempt $attempt] $ANCHOR never reached the mempool — logging the drop, retrying with fresh nonce…"
  $BIN log --actor lk-t24-agent --action "tx:chain-anchor-attempt-dropped" \
    --params "{\"hash\":\"$ANCHOR\",\"cause\":\"dropped from mempool under shared-key nonce contention, not mined\",\"headAtBroadcast\":{\"index\":$IDX,\"entryHash\":\"$H\"}}" \
    --tx "$ANCHOR" --log "$LOG" >/dev/null
  ANCHOR=""
  sleep 5
done
[ -n "${ANCHOR:-}" ] || { echo "FAILED after 5 attempts — aborting honestly"; exit 1; }
echo "anchor tx: $ANCHOR (embeds head of entry #$AIDX)"

echo "== waiting for receipt (3 min cap) =="
R=""
for s in $(seq 1 60); do
  R=$(node "$T"/src/wait-receipt.mjs "$ANCHOR")
  if [ "$R" != "PENDING" ] && [ "$R" != "RPCERR" ] && [ -n "$R" ]; then break; fi
  sleep 3
done
if [ "$R" = "PENDING" ] || [ "$R" = "RPCERR" ] || [ -z "$R" ]; then
  echo "no receipt after 3 min — aborting honestly"; exit 1
fi
echo "MINED: $R"

STATUS=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).status")
GASUSED=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).gasUsed")
EGP=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).effectiveGasPrice")
BN=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).blockNumber")
SPEND_HEX=$(node -e "console.log('0x'+(BigInt('$GASUSED')*BigInt('$EGP')).toString(16))")
echo "anchor receipt: status=$STATUS gasUsed=$GASUSED blockHex=$BN fee=$SPEND_HEX"

echo "== verify calldata == chain head hash =="
INPUT=$(node --input-type=module -e "
const rpc=process.env.ATLANTIC_RPC_URL,h='$ANCHOR';
const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionByHash',params:[h]})}).then(r=>r.json());
console.log(r.result?r.result.input:'NONE');
")
[ "$INPUT" = "0x$AH" ] || { echo "calldata mismatch: got $INPUT, want 0x$AH — aborting honestly"; exit 1; }
echo "calldata confirmed == chain head hash at broadcast (entry #$AIDX)"

echo "== log entry: tx:chain-anchor =="
$BIN log --actor lk-t24-agent --action "tx:chain-anchor" \
  --params "{\"anchorsEntryIndex\":$AIDX,\"anchorsEntryHash\":\"$AH\",\"purpose\":\"pins the chain head on-chain: this mined tx's calldata IS entry #$AIDX's entryHash — anyone can verify the local chain against Atlantic\",\"blockHex\":\"$BN\",\"gasUsed\":\"$GASUSED\",\"gasUsedDec\":$((GASUSED)),\"effectiveGasPriceWei\":\"$EGP\",\"txFeeWeiHex\":\"$SPEND_HEX\"}" \
  --tx "$ANCHOR" --log "$LOG" >/dev/null

echo "== verify original chain: must PASS =="
$BIN verify --log "$LOG" | tee "$OUT/verify-pass.txt"
$BIN verify --log "$LOG" >/dev/null

echo "== tamper-demo on a COPY (one-char flip of entry #12 valuePhrs — matches the browser demo) =="
CP="$OUT/audit-log.tampered-copy.jsonl"
cp "$LOG" "$CP"
node -e "
const fs=require('fs');
const lines=fs.readFileSync('$CP','utf8').trim().split('\n');
const k=lines.findIndex(l=>JSON.parse(l).index===12);
const flipped=lines[k].replace('\"valuePhrs\":\"0.0001\"','\"valuePhrs\":\"0.0002\"');
if(flipped===lines[k]){console.error('flip failed');process.exit(1);}
lines[k]=flipped;
fs.writeFileSync('$CP',lines.join('\n')+'\n');
console.log('tampered COPY entry #12 valuePhrs 0.0001 -> 0.0002 (copy only; original untouched)');
"
$BIN verify --log "$CP" > "$OUT/verify-fail-tampered-copy.txt" 2>&1 || true
cat "$OUT/verify-fail-tampered-copy.txt"
echo "--- original again (must still PASS) ---"
$BIN verify --log "$LOG" >/dev/null && echo "original: PASS (untouched)"

echo "== transcript snapshot =="
$BIN transcript --log "$LOG" --out "$OUT/audit-log.transcript.md"

echo "$ANCHOR" >> "$OUT/dust-tx-hashes.txt"

echo "== spend accounting =="
node --input-type=module -e "
import {readFileSync} from 'node:fs';
const lines=readFileSync('$LOG','utf8').trim().split('\n').map(JSON.parse);
let gas=0n; const dustIdx=[];
lines.forEach((e,i)=>{const p=e.params||{};
  if(p.txFeeWeiHex)gas+=BigInt(p.txFeeWeiHex);
  // mined dust value movers: entries #10,#12 (final dust sends) + this run's chain-anchor entry
  if((e.action==='tx:dust-send-1'&&e.index===10)||(e.action==='tx:dust-send-2'&&e.index===12)||e.action==='tx:chain-anchor')dustIdx.push(i);
});
const f=w=>{const i=w/10n**18n,fr=(w%10n**18n).toString().padStart(18,'0').replace(/0+$/,'')||'0';return i+'.'+fr;};
console.log('tx fees paid by t24 (PHRS):',f(gas));
console.log('dust value moved (PHRS):',(dustIdx.length*0.0001).toFixed(4),'entries',dustIdx.join(','));
console.log('TOTAL SPEND (PHRS):',f(gas+BigInt(Math.round(dustIdx.length*0.0001*1e18))));
" | tee "$OUT/spend-accounting.txt"

echo "== DONE: ANCHOR_TX=$ANCHOR =="
