#!/usr/bin/env bash
# t24-audit-log-agent — resume from step 4 (receipts) using already-mined txs.
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

HASH1=0x3327baea59b0851af7e8edea7deccc9ea9a5804eb5330589ca0f8970add9d9e7
HASH2=0x80a5506d8c77c36d7fe665a4c8e5842e88bcb489707e32081a24289eb1806061

echo "== 4. confirm receipts (poll raw RPC, honest pending logging) =="
wait_receipt() {
  local H="$1" i R
  for i in $(seq 1 40); do
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
TOTAL_GAS_WEI=0
for i in 1 2; do
  eval "H=\$HASH$i"
  echo "waiting for $H ..."
  R=$(wait_receipt "$H") || { echo "tx $i still pending after timeout"; exit 1; }
  STATUS=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).status")
  GASUSED=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).gasUsed")
  EGP=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).effectiveGasPrice")
  BN=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).blockNumber")
  echo "tx $i receipt: status=$STATUS gasUsed=$GASUSED blockHex=$BN effectiveGasPrice=$EGP"
  SPEND_HEX=$(node -e "console.log('0x'+(BigInt('$GASUSED')*BigInt('$EGP')).toString(16))")
  TOTAL_GAS_WEI=$((TOTAL_GAS_WEI + 0)) # computed below in node for precision
  $BIN log --actor lk-t24-agent --action "read:receipt-$i" \
    --params "{\"status\":\"$STATUS\",\"gasUsed\":\"$GASUSED\",\"gasUsedDec\":$((GASUSED)),\"blockHex\":\"$BN\",\"effectiveGasPriceWei\":\"$EGP\",\"txFeeWeiHex\":\"$SPEND_HEX\"}" \
    --tx "$H" --log "$LOG" >/dev/null
done
echo "$HASH1 $HASH2" > "$OUT/dust-tx-hashes.txt"

echo "== 5. verify original chain: must PASS =="
$BIN verify --log "$LOG" | tee "$OUT/verify-pass.txt"
$BIN verify --log "$LOG" >/dev/null

echo "== 6. tamper-demo on a COPY (original untouched) =="
CP="$OUT/audit-log.tampered-copy.jsonl"
cp "$LOG" "$CP"
node -e "
const fs=require('fs');
const lines=fs.readFileSync('$CP','utf8').trim().split('\n').map(JSON.parse);
lines[3].params={valuePhrs:'1000000.0',note:'forged by attacker'};
fs.writeFileSync('$CP',lines.map(l=>JSON.stringify(l)).join('\n')+'\n');
console.log('tampered COPY entry #3 params (copy only; original file untouched)');
"
$BIN verify --log "$CP" > "$OUT/verify-fail-tampered-copy.txt" 2>&1 || true
cat "$OUT/verify-fail-tampered-copy.txt"
echo "--- original again (must still PASS) ---"
$BIN verify --log "$LOG" >/dev/null && echo "original: PASS (untouched)"

echo "== 7. transcript snapshot =="
$BIN transcript --log "$LOG" --out "$OUT/audit-log.transcript.md"

echo "== 8. wallet activity report (last ~1h, md+csv+pdf) =="
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FROM=$(date -u -d '75 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
$BIN report --wallet "$WALLET" --from-date "$FROM" --to-date "$NOW" \
  --max-scan-blocks 2500 --export md,csv,pdf --outdir "$OUT" --log "$LOG"

echo "== spend accounting =="
node --input-type=module -e "
import {readFileSync} from 'node:fs';
const lines=readFileSync('$LOG','utf8').trim().split('\n').map(JSON.parse);
let gas=0n;
for(const e of lines){const p=e.params||{};if(p.txFeeWeiHex)gas+=BigInt(p.txFeeWeiHex);}
const int=gas/10n**18n,frac=(gas%10n**18n).toString().padStart(18,'0').replace(/0+$/,'')||'0';
console.log('total tx fees paid by t24 demo (PHRS):', int+'.'+frac);
console.log('dust values sent (PHRS): 0.0001 x 2');
" | tee "$OUT/spend-accounting.txt"

echo "== DONE =="
ls -la "$OUT"
