#!/usr/bin/env bash
# T01 test suite — runs the reader against the LIVE Atlantic deployment and
# asserts every reported value matches an INDEPENDENT on-chain read
# (raw JSON-RPC via curl — no cast, no shared code path with the reader).
set -uo pipefail

TASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ~/workspace/lightkeeper/.env; set +a; set +a

RPC="$ATLANTIC_RPC_URL"
CONTRACT="$(python3 -c "import json;print(json.load(open('$TASK_DIR/deployment.json'))['contract'])")"
KEEPER="0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
PASS=0; FAIL=0
MANIFEST="$TASK_DIR/evidence/run-manifest.json"

ok()   { PASS=$((PASS+1)); echo "  PASS: $*"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $*"; }

echo "═══ T01 TESTS — live Atlantic reads ═══"

echo "── [1] reader runs clean and emits a manifest"
if "$TASK_DIR/bin/read-contract-state.sh" --manifest "$MANIFEST" >/tmp/t01-out.txt 2>&1; then
  ok "reader exit 0"
else bad "reader exit $?"; fi
[[ -s "$MANIFEST" ]] && ok "manifest exists and non-empty" || bad "manifest missing/empty"

BLOCK="$(python3 -c "import json;print(json.load(open('$MANIFEST'))['blockReadAt'])")"
echo "── [2] independent re-reads at pinned block $BLOCK (raw JSON-RPC, python+urllib — no cast)"
export TASK_DIR
python3 - <<'EOF'
import json,urllib.request,os
from Crypto.Hash import keccak
rpc=os.environ["ATLANTIC_RPC_URL"]
m=json.load(open(os.environ["TASK_DIR"]+"/evidence/run-manifest.json"))
contract=m["contract"]; block=hex(m["blockReadAt"])
keeper="0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3"
def sel(sig):
    return "0x"+keccak.new(digest_bits=256,data=sig.encode()).hexdigest()[:8]
def call(data):
    req=urllib.request.Request(rpc,data=json.dumps(
     {"jsonrpc":"2.0","id":1,"method":"eth_call",
      "params":[{"to":contract,"data":data},block]}).encode(),
     headers={"content-type":"application/json"})
    return json.load(urllib.request.urlopen(req))["result"]
passed=failed=0
def check(name,cond,detail=""):
    global passed,failed
    if cond: passed+=1; print(f"  PASS: {name}")
    else: failed+=1; print(f"  FAIL: {name} {detail}")
check("totalLamps == 3", int(call(sel("totalLamps()")),16)==3)
r=call(sel("keeper()")); check("keeper == deployer", "0x"+r[-40:].lower()==keeper.lower(), r)
r=call(sel("realmName()"))
ln=int(r[2+64:2+128],16); s=bytes.fromhex(r[2+128:2+128+ln*2]).decode()
check("realmName == 'Atlantic Deep'", s=="Atlantic Deep", repr(s))
check("decimals == 6", int(call(sel("decimals()")),16)==6)
pad=keeper[2:].lower().rjust(64,"0")
check("lampBalanceOf(keeper) == 3000000", int(call(sel("lampBalanceOf(address)")+pad),16)==3000000)
for i in range(3):
    r=call(sel("lampBearer(uint256)")+("%064x"%i))
    check(f"lampBearer({i}) == keeper", "0x"+r[-40:].lower()==keeper.lower(), r)
v={x["name"]:x["decoded"] for x in m["values"]}
check("manifest decoded values agree (8/8)",
      v["totalLamps"]=="3" and v["keeper"]==keeper and v["realmName"]=="Atlantic Deep"
      and v["decimals"]=="6" and v["lampBalanceOf(keeper)"]=="3000000"
      and all(v[f"lampBearer({i})"]==keeper for i in range(3)))
print(f"SECTION2: {passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
EOF
[[ $? -eq 0 ]] && ok "section 2: all independent re-reads match" || bad "section 2 had failures"

echo "── [3] mapping storage-slot layout verified independently"
python3 - <<'EOF'
import json,urllib.request,os
from Crypto.Hash import keccak
keeper="f76e6b0920e9332ff4410f6dd53f01722abc71a3".rjust(64,"0")
slot=keccak.new(digest_bits=256,data=bytes.fromhex(keeper+"4".rjust(64,"0"))).hexdigest()
m=json.load(open(os.environ["TASK_DIR"]+"/evidence/run-manifest.json"))
block=hex(m["blockReadAt"])
req=urllib.request.Request(os.environ["ATLANTIC_RPC_URL"],data=json.dumps(
 {"jsonrpc":"2.0","id":1,"method":"eth_getStorageAt",
  "params":[m["contract"],"0x"+slot,block]}).encode(),headers={"content-type":"application/json"})
val=int(json.load(urllib.request.urlopen(req))["result"],16)
assert val==3000000, val
print("  PASS: eth_getStorageAt(keccak256(keeper||slot4)) == 3000000")
EOF
[[ $? -eq 0 ]] || bad "slot verification"

echo "── [4] negative path fails loudly"
if "$TASK_DIR/bin/read-contract-state.sh" --negative >/tmp/t01-neg.txt 2>&1; then
  grep -q "PASS (2/2 fail loudly)" /tmp/t01-neg.txt && ok "negative suite 2/2 loud" || bad "negative suite output"
else bad "negative suite exit $?"; fi
if "$TASK_DIR/bin/read-contract-state.sh" --contract 0x000000000000000000000000000000000000dEaD >/dev/null 2>&1; then
  bad "no-code address read should abort"
else ok "no-code address read aborts (exit $?)"; fi

echo "── [5] chain-id gate"
if EXPECT_CHAIN_ID=1 "$TASK_DIR/bin/read-contract-state.sh" >/dev/null 2>&1; then
  bad "wrong chain-id should abort"
else ok "chain-id mismatch aborts (exit $?)"; fi

echo "═══ RESULT: $PASS passed, $FAIL failed ═══"
[[ "$FAIL" -eq 0 ]]
