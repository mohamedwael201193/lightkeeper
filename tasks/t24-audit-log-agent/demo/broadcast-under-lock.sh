#!/usr/bin/env bash
# t24 — broadcast each dust tx and wait for its RECEIPT while HOLDING the
# nonce lock. This closes the same-nonce race with sibling workers:
# nobody else can submit at our nonce until our tx is mined.
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
set -a; source "$HOME/workspace/lightkeeper/.env"; set +a
export ATLANTIC_RPC_URL

T="$HOME/workspace/lightkeeper/tasks/t24-audit-log-agent"
export T
BIN="node $T/bin/audit-log.mjs"
LOG="$T/state/audit-log.jsonl"
OUT="$T/sample-output"
WALLET="0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
GAS_PRICE=25000000000  # 25 gwei: competitive under shared-key contention; still dust

mkdir -p "$OUT"

# This whole inner block runs under ONE flock hold.
# Lock-timeout discipline (coordinator order): the whole hold is capped at
# 1500s; inner attempts are capped too — a stuck broadcast fails loudly
# instead of hanging the shared lock.
timeout 1500 flock -w 300 /tmp/lk-nonce.lock bash -c '
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
for i in 1 2; do
  for attempt in 1 2 3 4; do
    echo "[tx$i] attempt $attempt: broadcasting…"
    H=$(cast send "'"$WALLET"'" --value 0.0001ether --gas-price "'"$GAS_PRICE"'" \
      --rpc-url "$ATLANTIC_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" 2>&1 \
      | grep -oE "0x[0-9a-fA-F]{64}" | head -1)
    if [ -z "${H:-}" ]; then echo "[tx$i] no hash, retrying"; sleep 3; continue; fi
    echo "[tx$i] hash $H — waiting for receipt (lock held)…"
    R=""
    for s in $(seq 1 60); do
      R=$(node "$T"/src/wait-receipt.mjs "$H")
      if [ "$R" != "PENDING" ] && [ "$R" != "RPCERR" ] && [ -n "$R" ]; then break; fi
      sleep 3
    done
    if [ "$R" != "PENDING" ] && [ "$R" != "RPCERR" ] && [ -n "$R" ]; then
      echo "[tx$i] MINED: $R"
      echo "$H" >> "'"$OUT"'/dust-tx-hashes.txt"
      echo "$R" > "'"$OUT"'/receipt-$i.json"
      break
    fi
    echo "[tx$i] attempt $attempt produced no receipt (dropped/replaced) — retrying"
  done
done
echo LOCK-RELEASED
'

echo "== hashes =="
cat "$OUT/dust-tx-hashes.txt"
N=$(wc -l < "$OUT/dust-tx-hashes.txt")
[ "$N" = "2" ] || { echo "only $N tx mined — aborting honestly"; exit 1; }

HASH1=$(sed -n 1p "$OUT/dust-tx-hashes.txt"); HASH2=$(sed -n 2p "$OUT/dust-tx-hashes.txt")
for i in 1 2; do
  eval "H=\$HASH$i"
  R=$(cat "$OUT/receipt-$i.json")
  STATUS=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).status")
  GASUSED=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).gasUsed")
  EGP=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).effectiveGasPrice")
  BN=$(echo "$R" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).blockNumber")
  SPEND_HEX=$(node -e "console.log('0x'+(BigInt('$GASUSED')*BigInt('$EGP')).toString(16))")
  echo "tx $i: $H status=$STATUS gasUsed=$GASUSED blockHex=$BN fee=$SPEND_HEX"
  $BIN log --actor lk-t24-agent --action "tx:dust-send-$i-final" \
    --params "{\"to\":\"$WALLET\",\"valuePhrs\":\"0.0001\",\"gasPriceWei\":\"$GAS_PRICE\",\"note\":\"mined under lock-held broadcast\"}" \
    --tx "$H" --log "$LOG" >/dev/null
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
node -e "
const fs=require('fs');
const lines=fs.readFileSync('$CP','utf8').trim().split('\n').map(JSON.parse);
const k=Math.min(3,lines.length-1);
lines[k].params={valuePhrs:'1000000.0',note:'forged by attacker'};
fs.writeFileSync('$CP',lines.map(l=>JSON.stringify(l)).join('\n')+'\n');
console.log('tampered COPY entry #'+k+' params (copy only; original untouched)');
"
$BIN verify --log "$CP" > "$OUT/verify-fail-tampered-copy.txt" 2>&1 || true
cat "$OUT/verify-fail-tampered-copy.txt"
$BIN verify --log "$LOG" >/dev/null && echo "original: PASS (untouched)"

echo "== transcript snapshot =="
$BIN transcript --log "$LOG" --out "$OUT/audit-log.transcript.md"

echo "== wallet activity report (last ~2h, md+csv+pdf) =="
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FROM=$(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%SZ)
$BIN report --wallet "$WALLET" --from-date "$FROM" --to-date "$NOW" \
  --max-scan-blocks 3000 --export md,csv,pdf --outdir "$OUT" --log "$LOG"

echo "== spend accounting =="
node --input-type=module -e "
import {readFileSync} from 'node:fs';
const lines=readFileSync('$LOG','utf8').trim().split('\n').map(JSON.parse);
let gas=0n,dust=0;
for(const e of lines){const p=e.params||{};if(p.txFeeWeiHex)gas+=BigInt(p.txFeeWeiHex);if(/^tx:dust-send-\d-final$/.test(e.action))dust++;}
const f=w=>{const i=w/10n**18n,fr=(w%10n**18n).toString().padStart(18,'0').replace(/0+$/,'')||'0';return i+'.'+fr;};
console.log('tx fees paid by t24 (PHRS):',f(gas));
console.log('dust value moved (PHRS):',(dust*0.0001).toFixed(4));
console.log('TOTAL SPEND (PHRS):',f(gas+BigInt(Math.round(dust*0.0001*1e18))));
" | tee "$OUT/spend-accounting.txt"

echo "== DONE =="
ls -la "$OUT"
