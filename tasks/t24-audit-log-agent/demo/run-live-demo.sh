#!/usr/bin/env bash
# t24-audit-log-agent — live demo run.
# Logs REAL agent actions with REAL tx hashes on Atlantic testnet (688689),
# then proves tamper-evidence by tampering a COPY.
set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
set -a; source "$HOME/workspace/lightkeeper/.env"; set +a

T="$HOME/workspace/lightkeeper/tasks/t24-audit-log-agent"
cd "$T"
BIN="node bin/audit-log.mjs"
LOG="$T/state/audit-log.jsonl"
WALLET="0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
OUT="$T/sample-output"
mkdir -p "$OUT" state logs

echo "== 1. chain assertion (must be 688689) =="
CID=$(cast chain-id --rpc-url "$ATLANTIC_RPC_URL")
echo "chain-id: $CID"
[ "$CID" = "688689" ] || { echo "WRONG CHAIN"; exit 1; }
BAL=$(cast balance "$WALLET" --rpc-url "$ATLANTIC_RPC_URL" --ether)
echo "balance: $BAL PHRS"

echo "== 2. log the read actions =="
$BIN log --actor lk-t24-agent --action read:chain-id \
  --params "{\"chainId\":$CID,\"rpc\":\"https://atlantic.dplabs-internal.com\",\"network\":\"atlantic-testnet\"}" \
  --log "$LOG" >/dev/null
$BIN log --actor lk-t24-agent --action read:balance \
  --params "{\"wallet\":\"$WALLET\",\"balancePhrs\":\"$BAL\",\"block\":$(cast block-number --rpc-url "$ATLANTIC_RPC_URL")}" \
  --log "$LOG" >/dev/null
echo "reads logged"

echo "== 3. execute 2 REAL dust txs (flock nonce guard, dust 0.0001 PHRS each) =="
for i in 1 2; do
  # Lock-timeout discipline (coordinator order): fail loudly, never hang the shared lock.
  HASH=$(timeout 600 flock -w 300 /tmp/lk-nonce.lock cast send "$WALLET" --value 0.0001ether \
    --rpc-url "$ATLANTIC_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" 2>/dev/null \
    | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
  [ -n "$HASH" ] || { echo "FAILED to capture tx hash for dust tx $i"; exit 1; }
  echo "dust tx $i: $HASH"
  eval "HASH$i=$HASH"
  $BIN log --actor lk-t24-agent --action "tx:dust-send-$i" \
    --params "{\"to\":\"$WALLET\",\"valuePhrs\":\"0.0001\",\"purpose\":\"t24 audit-log live demo entry\"}" \
    --tx "$HASH" --log "$LOG" >/dev/null
done

echo "== 4. confirm receipts (poll raw RPC, 3 min cap, honest pending logging) =="
wait_receipt() {
  local H="$1" i
  for i in $(seq 1 36); do
    R=$(node --input-type=module -e "
const rpc='$ATLANTIC_RPC_URL', h='$H';
const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionReceipt',params:[h]})}).then(r=>r.json());
const x=r.result;
console.log(x?JSON.stringify({status:x.status,blockNumber:x.blockNumber,gasUsed:x.gasUsed}):'PENDING');
")
    if [ "$R" != "PENDING" ]; then echo "$R"; return 0; fi
    sleep 5
  done
  echo "TIMEOUT-WAITING"
  return 1
}
for i in 1 2; do
  eval "H=\$HASH$i"
  R=$(wait_receipt "$H") || { echo "tx $i still pending after 3 min"; exit 1; }
  STATUS=$(echo "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).status))")
  GASUSED=$(echo "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).gasUsed))")
  BN=$(echo "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).blockNumber))")
  echo "tx $i receipt: status=$STATUS gasUsed=$GASUSED block=$BN"
  $BIN log --actor lk-t24-agent --action "read:receipt-$i" \
    --params "{\"status\":\"$STATUS\",\"gasUsed\":\"$GASUSED\",\"blockHex\":\"$BN\"}" \
    --tx "$H" --log "$LOG" >/dev/null
done

echo "== 5. verify original chain: must PASS =="
$BIN verify --log "$LOG" | tee "$OUT/verify-pass.txt"
$BIN verify --log "$LOG" >/dev/null

echo "== 6. tamper-demo on a COPY (original untouched) =="
CP="$OUT/audit-log.tampered-copy.jsonl"
cp "$LOG" "$CP"
node -e "
const fs=require('fs');
const lines=fs.readFileSync('$CP','utf8').trim().split('\n').map(JSON.parse);
// attacker edits entry #3 params on the COPY only
lines[3].params={valuePhrs:'1000000.0',note:'forged'};
fs.writeFileSync('$CP',lines.map(l=>JSON.stringify(l)).join('\n')+'\n');
console.log('tampered copy entry #3 params (copy only)');
"
$BIN verify --log "$CP" > "$OUT/verify-fail-tampered-copy.txt" 2>&1 || true
cat "$OUT/verify-fail-tampered-copy.txt"
echo "--- original again (must still PASS) ---"
$BIN verify --log "$LOG" >/dev/null && echo "original: PASS (untouched)"

echo "== 7. transcript snapshot =="
$BIN transcript --log "$LOG" --out "$OUT/audit-log.transcript.md"

echo "== 8. wallet activity report (last ~1h, md+csv+pdf) =="
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FROM=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
$BIN report --wallet "$WALLET" --from-date "$FROM" --to-date "$NOW" \
  --max-scan-blocks 2500 --export md,csv,pdf --outdir "$OUT" --log "$LOG"

echo "== DONE =="
ls -la "$OUT"
