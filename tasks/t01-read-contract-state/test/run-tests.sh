#!/usr/bin/env bash
# T01 test suite — runs the Chain-MCP reader against LIVE Pharos mainnet and
# asserts every reported value matches an INDEPENDENT on-chain re-read
# (raw JSON-RPC against the public mainnet RPC — no MCP, no shared code path
# with the reader). The MCP is keyless and the mainnet RPC is public, so no
# secrets are needed.
set -uo pipefail

TASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="https://rpc.pharos.xyz"
CONTRACT="0xc879c018db60520f4355c26ed1a6d572cdac1815"
PASS=0; FAIL=0
MANIFEST="$TASK_DIR/evidence/run-manifest.json"
export MANIFEST

ok()   { PASS=$((PASS+1)); echo "  PASS: $*"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $*"; }

echo "═══ T01 TESTS — live Chain MCP reads, independent RPC verification ═══"

echo "── [1] reader runs clean and emits a manifest"
if "$TASK_DIR/bin/read-contract-state.sh" --manifest "$MANIFEST" >/tmp/t01-out.txt 2>&1; then
  ok "reader exit 0"
else bad "reader exit $?"; fi
[[ -s "$MANIFEST" ]] && ok "manifest exists and non-empty" || bad "manifest missing/empty"

echo "── [2] manifest proves MCP routing (no raw-RPC calls)"
python3 - "$MANIFEST" <<'EOF'
import json,sys
m=json.load(open(sys.argv[1]))
tools=set(m.get("mcpToolsCalled",[]))
need={"get_chain_info","get_code","get_block_number","eth_call"}
assert need<=tools, f"missing MCP tools: {need-tools}"
assert m.get("rawRpcCalls")==0, "rawRpcCalls != 0"
assert m.get("mcpEndpoint")=="https://mcp.pharos.xyz/mcp", "wrong endpoint"
assert m.get("chainId")==1672, "wrong chain"
print("  PASS: manifest records MCP endpoint + 4 MCP tools, rawRpcCalls=0")
EOF
[[ $? -eq 0 ]] && ok "manifest MCP-routing proof" || bad "manifest MCP-routing proof"

BLOCK="$(python3 -c "import json;print(json.load(open('$MANIFEST'))['blockReadAt'])")"
echo "── [3] independent re-reads at pinned block $BLOCK (raw JSON-RPC, python+urllib — no MCP)"
RPC="$RPC" CONTRACT="$CONTRACT" BLOCK="$BLOCK" python3 - <<'EOF'
import json,urllib.request,os,time
rpc=os.environ["RPC"]; contract=os.environ["CONTRACT"]; block=hex(int(os.environ["BLOCK"]))
def call(data, attempts=3):
    last=None
    for i in range(attempts):
        try:
            req=urllib.request.Request(rpc,data=json.dumps(
             {"jsonrpc":"2.0","id":1,"method":"eth_call",
              "params":[{"to":contract,"data":data},block]}).encode(),
             headers={"content-type":"application/json"})
            return json.load(urllib.request.urlopen(req,timeout=30))["result"]
        except Exception as e:
            last=e
            if i < attempts-1: time.sleep(2*(i+1))
    raise last
def dec_str(h):
    b=bytes.fromhex(h[2:]); o=int.from_bytes(b[:32],"big"); ln=int.from_bytes(b[o:o+32],"big")
    return b[o+32:o+32+ln].decode()
passed=failed=0
def check(name,cond,detail=""):
    global passed,failed
    if cond: passed+=1; print(f"  PASS: {name}")
    else: failed+=1; print(f"  FAIL: {name} {detail}")
check("name() decodes", dec_str(call("0x06fdde03"))=="USDC")
check("symbol() == USDC", dec_str(call("0x95d89b41"))=="USDC")
check("decimals() == 6", int(call("0x313ce567"),16)==6)
check("totalSupply() > 0", int(call("0x18160ddd"),16)>0)
m=json.load(open(os.environ.get("MANIFEST","")))
v={x["name"]:x for x in m["values"]}
check("manifest name agrees", v["name"]["decoded"]=="USDC")
check("manifest symbol agrees", v["symbol"]["decoded"]=="USDC")
check("manifest decimals agrees", v["decimals"]["decoded"]=="6")
check("manifest totalSupply agrees",
      v["totalSupply"]["decoded"]==str(int(call("0x18160ddd"),16)))
print(f"SECTION3: {passed} passed, {failed} failed")
raise SystemExit(1 if failed else 0)
EOF
[[ $? -eq 0 ]] && ok "section 3: all independent re-reads match" || bad "section 3 had failures"

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
