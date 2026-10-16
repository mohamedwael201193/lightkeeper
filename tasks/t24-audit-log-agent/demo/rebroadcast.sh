#!/usr/bin/env bash
# t24-audit-log-agent — rebroadcast the 2 dust txs (first attempts were dropped
# from the mempool under shared-key nonce contention) and finish the demo.
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
set -a; source "$HOME/workspace/lightkeeper/.env"; set +a

T="$HOME/workspace/lightkeeper/tasks/t24-audit-log-agent"
cd "$T"
BIN="node bin/audit-log.mjs"
LOG="$T/state/audit-log.jsonl"
WALLET="0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
OUT="$T/sample-output"
mkdir -p "$OUT"
export ATLANTIC_RPC_URL

in_pool() {
  node --input-type=module -e "
const rpc=process.env.ATLANTIC_RPC_URL,h='$1';
const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionByHash',params:[h]})}).then(r=>r.json());
console.log(r.result?'YES':'NO');
"
}

send_dust() {
  local label="$1" attempt H ok
  for attempt in 1 2 3 4 5; do
    echo "[$label] broadcast attempt $attempt (flock-guarded)…"
    H=$(flock /tmp/lk-nonce.lock cast send "$WALLET" --value 0.0001ether \
      --gas-price 12000000000 --rpc-url "$ATLANTIC_RPC_URL" \
      --private-key "$DEPLOYER_PRIVATE_KEY" 2>/dev/null \
      | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
    if [ -z "${H:-}" ]; then echo "[$label] no hash captured, retrying…"; sleep 5; continue; fi
    echo "[$label] hash $H — checking mempool membership…"
    ok=NO
    for s in 1 2 3 4 5 6; do
      ok=$(in_pool "$H"); [ "$ok" = "YES" ] && break; sleep 5
    done
    if [ "$ok" = "YES" ]; then echo "[$label] IN POOL: $H"; echo "$H"; return 0; fi
    echo "[$label] $H never appeared in mempool (nonce contention) — retrying with fresh nonce…"
    $BIN log --actor lk-t24-agent --action "tx:dust-send-$label-attempt-dropped" \
      --params "{\"hash\":\"$H\",\"cause\":\"dropped from mempool under shared-key nonce contention, not mined\"}" \
      --tx "$H" --log "$LOG" >/dev/null
    sleep 5
  done
  echo "[$label] FAILED after 5 attempts" >&2; return 1
}

HASH1=$(send_dust 1)
HASH2=$(send_dust 2)
$BIN log --actor lk-t24-agent --action "tx:dust-send-1-retry" \
  --params "{\"to\":\"$WALLET\",\"valuePhrs\":\"0.0001\",\"purpose\":\"t24 audit-log live demo entry (retry after mempool drop)\"}" \
  --tx "$HASH1" --log "$LOG" >/dev/null
$BIN log --actor lk-t24-agent --action "tx:dust-send-2-retry" \
  --params "{\"to\":\"$WALLET\",\"valuePhrs\":\"0.0001\",\"purpose\":\"t24 audit-log live demo entry (retry after mempool drop)\"}" \
  --tx "$HASH2" --log "$LOG" >/dev/null
echo "$HASH1 $HASH2" > "$OUT/dust-tx-hashes.txt"

echo "== confirm receipts =="
wait_receipt() {
  local H="$1" i R
  for i in $(seq 1 60); do
    R=$(node --input-type=module -e "
const rpc=process.env.ATLANTIC_RPC_URL,h='$H';
const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionReceipt',params:[h]})}).then(r=>r.json());
const x=r.result;
console.log(x?JSON.stringify({status:x.status,blockNumber:x.blockNumber,gasUsed:x.gasUsed,effectiveGasPrice:x.effectiveGasPrice}):'PENDING');
")
    if [ "$R" != "PENDING" ]; then echo "$R"; return 0; fi
    sleep 5
  done
  echo "TIMEOUT-WAITING"; return 1
}
for i in 1 2; do
  eval "H=\$HASH$i"
  echo "waiting for $H …"
  R=$(wait_receipt "$H") || { echo "tx $i still pending after 5 min — aborting honestly"; exit 1; }
  STATUS=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).status")
  GASUSED=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).gasUsed")
  EGP=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).effectiveGasPrice")
  BN=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).blockNumber")
  echo "tx $i receipt: status=$STATUS gasUsed=$GASUSED blockHex=$BN effectiveGasPrice=$EGP"
  SPEND_HEX=$(node -e "console.log('0x'+(BigInt('$GASUSED')*BigInt('$EGP')).toString(16))")
  $BIN log --actor lk-t24-agent --action "read:receipt-$i" \
    --params "{\"status\":\"$STATUS\",\"gasUsed\":\"$GASUSED\",\"gasUsedDec\":$((GASUSED)),\"blockHex\":\"$BN\",\"effectiveGasPriceWei\":\"$EGP\",\"txFeeWeiHex\":\"$SPEND_HEX\"}" \
    --tx "$H" --log "$LOG" >/dev/null
done

echo "== verify original chain: must PASS =="
$BIN verify --log "$LOG" | tee "$OUT/verify-pass.txt"
$BIN verify --log "$LOG" >/dev/null

echo "== tamper-demo on a COPY (original untouched) =="
CP="$OUT/audit-log.tampered-copy.jsonl"
cp "$LOG" "$CP"
LASTIDX=$(node -e "const fs=require('fs');const l=fs.readFileSync('$LOG','utf8').trim().split('\n');console.log(l.length-1)")
node -e "
const fs=require('fs');
const lines=fs.readFileSync('$CP','utf8').trim().split('\n').map(JSON.parse);
const k=Math.min(3,lines.length-1);
lines[k].params={valuePhrs:'1000000.0',note:'forged by attacker'};
fs.writeFileSync('$CP',lines.map(l=>JSON.stringify(l)).join('\n')+'\n');
console.log('tampered COPY entry #'+k+' params (copy only; original file untouched)');
"
$BIN verify --log "$CP" > "$OUT/verify-fail-tampered-copy.txt" 2>&1 || true
cat "$OUT/verify-fail-tampered-copy.txt"
echo "--- original again (must still PASS) ---"
$BIN verify --log "$LOG" >/dev/null && echo "original: PASS (untouched)"

echo "== transcript snapshot =="
$BIN transcript --log "$LOG" --out "$OUT/audit-log.transcript.md"

echo "== wallet activity report (last ~75 min, md+csv+pdf) =="
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FROM=$(date -u -d '75 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
$BIN report --wallet "$WALLET" --from-date "$FROM" --to-date "$NOW" \
  --max-scan-blocks 2500 --export md,csv,pdf --outdir "$OUT" --log "$LOG"

echo "== spend accounting =="
node --input-type=module -e "
import {readFileSync} from 'node:fs';
const lines=readFileSync('$LOG','utf8').trim().split('\n').map(JSON.parse);
let gas=0n,dust=0;
for(const e of lines){const p=e.params||{};if(p.txFeeWeiHex)gas+=BigInt(p.txFeeWeiHex);if(e.action.startsWith('tx:dust-send-')&&!e.action.includes('dropped'))dust++;}
const f=w=>{const i=w/10n**18n,fr=(w%10n**18n).toString().padStart(18,'0').replace(/0+$/,'')||'0';return i+'.'+fr;};
console.log('tx fees paid by t24 (PHRS):',f(gas));
console.log('dust value moved (PHRS):',(dust*0.0001).toFixed(4));
console.log('TOTAL SPEND (PHRS):',f(gas+BigInt(Math.round(dust*0.0001*1e18))));
" | tee "$OUT/spend-accounting.txt"

echo "== DONE =="
ls -la "$OUT"
