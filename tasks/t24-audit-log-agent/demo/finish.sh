#!/usr/bin/env bash
# t24 — finish: log the 2 MINED dust txs + receipts, verify, tamper-demo, report.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source "$HOME/workspace/lightkeeper/.env"; set +a

T="$HOME/workspace/lightkeeper/tasks/t24-audit-log-agent"
BIN="node $T/bin/audit-log.mjs"
LOG="$T/state/audit-log.jsonl"
OUT="$T/sample-output"
WALLET="0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
mkdir -p "$OUT"

H1=0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1
H2=0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68
echo "$H1 $H2" > "$OUT/dust-tx-hashes.txt"

$BIN log --actor lk-t24-agent --action "note:mempool-drop-disclosure" \
  --params '{"summary":"first broadcast attempts (entries 2-3) were accepted by the RPC but never mined under shared-key nonce contention; retried with --async and both mined","mined":["0x3356b1db217d6e569ad3067d7e8f486a43343dfeaf50245f535392ce97f241c1","0xf52e77a545c858c0f0ec8aa181850fe44d9157e17dca172ee6ebd5ac91635f68"]}' \
  --log "$LOG" >/dev/null

i=0
for H in $H1 $H2; do
  i=$((i+1))
  R=$(node "$T/src/wait-receipt.mjs" "$H")
  STATUS=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).status")
  GASUSED=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).gasUsed")
  EGP=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).effectiveGasPrice")
  BN=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).blockNumber")
  BNDEC=$((BN))
  FEE_HEX=$(node -e "console.log('0x'+(BigInt('$GASUSED')*BigInt('$EGP')).toString(16))")
  FEE_DEC=$(node -e "console.log((BigInt('$GASUSED')*BigInt('$EGP')).toString())")
  echo "tx$i: $H status=$STATUS block=$BNDEC feeWei=$FEE_DEC"
  echo "$R" > "$OUT/receipt-$i.json"
  $BIN log --actor lk-t24-agent --action "tx:dust-send-$i" \
    --params "{\"to\":\"$WALLET\",\"valuePhrs\":\"0.0001\",\"mode\":\"--async broadcast, mined\",\"attempt\":\"final\"}" \
    --tx "$H" --log "$LOG" >/dev/null
  $BIN log --actor lk-t24-agent --action "read:receipt-$i" \
    --params "{\"status\":\"$STATUS\",\"gasUsed\":\"$GASUSED\",\"gasUsedDec\":$((GASUSED)),\"blockHex\":\"$BN\",\"blockDec\":$BNDEC,\"effectiveGasPriceWei\":\"$EGP\",\"txFeeWeiHex\":\"$FEE_HEX\",\"txFeeWeiDec\":\"$FEE_DEC\"}" \
    --tx "$H" --log "$LOG" >/dev/null
done

echo "== verify (must PASS) =="
$BIN verify --log "$LOG" | tee "$OUT/verify-pass.txt"
$BIN verify --log "$LOG" >/dev/null

echo "== tamper-demo on COPY =="
CP="$OUT/audit-log.tampered-copy.jsonl"
cp "$LOG" "$CP"
node -e "
const fs=require('fs'),path='$CP';
const lines=fs.readFileSync(path,'utf8').trim().split('\n').map(JSON.parse);
const k=lines.length-2;
lines[k].params={valuePhrs:'1000000.0',note:'forged by attacker'};
fs.writeFileSync(path,lines.map(l=>JSON.stringify(l)).join('\n')+'\n');
console.log('tampered COPY entry #'+k+' (copy only)');"
$BIN verify --log "$CP" > "$OUT/verify-fail-tampered-copy.txt" 2>&1 || true
cat "$OUT/verify-fail-tampered-copy.txt"
$BIN verify --log "$LOG" >/dev/null && echo "original: PASS (untouched)"

echo "== transcript =="
$BIN transcript --log "$LOG" --out "$OUT/audit-log.transcript.md"

echo "== report =="
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FROM=$(date -u -d '3 hours ago' +%Y-%m-%dT%H:%M:%SZ)
$BIN report --wallet "$WALLET" --from-date "$FROM" --to-date "$NOW" \
  --max-scan-blocks 4000 --export md,csv,pdf --outdir "$OUT" --log "$LOG"

echo "== spend =="
node --input-type=module -e "
import {readFileSync} from 'node:fs';
const lines=readFileSync('$LOG','utf8').trim().split('\n').map(JSON.parse);
let gas=0n,dust=0;
for(const e of lines){const p=e.params||{};if(p.txFeeWeiDec)gas+=BigInt(p.txFeeWeiDec);if(e.action==='tx:dust-send-1'||e.action==='tx:dust-send-2')dust++;}
const f=w=>{const i=w/10n**18n,fr=(w%10n**18n).toString().padStart(18,'0').replace(/0+$/,'')||'0';return i+'.'+fr;};
console.log('fees (PHRS):',f(gas));console.log('dust moved (PHRS):',(dust*0.0001).toFixed(4));
console.log('TOTAL (PHRS):',f(gas+BigInt(Math.round(dust*0.0001*1e18))));" | tee "$OUT/spend-accounting.txt"

ls -la "$OUT"
