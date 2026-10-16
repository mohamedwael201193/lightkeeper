#!/usr/bin/env bash
# T07 venue deployment — forge create + cast send (forge script is incompatible
# with the Atlantic RPC's block-param parsing; same bytecode, same result).
# Every broadcast is serialized with /tmp/lk-nonce.lock (28 workers share one key).
set -euo pipefail

cd "$(dirname "$0")"
export PATH="$HOME/.foundry/bin:$PATH"
set -a; source ~/workspace/lightkeeper/.env; set +a

DEPLOYER=0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3
SEND="flock /tmp/lk-nonce.lock cast send --rpc-url $ATLANTIC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY"
CREATE="flock /tmp/lk-nonce.lock forge create --rpc-url $ATLANTIC_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast"

echo "== deploying MockToken WPHRS =="
WPHRS=$($CREATE src/MockToken.sol:MockToken --constructor-args "Wrapped PHRS (T07 test)" "WPHRS" 2>/dev/null | grep -oP 'Deployed to:\s*\K0x[0-9a-fA-F]{40}')
echo "WPHRS=$WPHRS"

echo "== deploying MockToken TKB =="
TKB=$($CREATE src/MockToken.sol:MockToken --constructor-args "Test USD (T07 test)" "TKB" 2>/dev/null | grep -oP 'Deployed to:\s*\K0x[0-9a-fA-F]{40}')
echo "TKB=$TKB"

echo "== deploying ArbPool A/B/C =="
POOLA=$($CREATE src/ArbPool.sol:ArbPool --constructor-args "$WPHRS" "$TKB" 2>/dev/null | grep -oP 'Deployed to:\s*\K0x[0-9a-fA-F]{40}')
echo "POOLA=$POOLA"
POOLB=$($CREATE src/ArbPool.sol:ArbPool --constructor-args "$WPHRS" "$TKB" 2>/dev/null | grep -oP 'Deployed to:\s*\K0x[0-9a-fA-F]{40}')
echo "POOLB=$POOLB"
POOLC=$($CREATE src/ArbPool.sol:ArbPool --constructor-args "$WPHRS" "$TKB" 2>/dev/null | grep -oP 'Deployed to:\s*\K0x[0-9a-fA-F]{40}')
echo "POOLC=$POOLC"

MINT=$(cast to-wei 10000 ether)
SEED=$(cast to-wei 1000 ether)
SEED_B_TKB=$(cast to-wei 980 ether)
SEED_C_TKB=$(cast to-wei 1020 ether)
MAXUINT="115792089237316195423570985008687907853269984665640564039457584007913129639935"

echo "== minting test liquidity =="
$SEND "$WPHRS" "mint(address,uint256)" "$DEPLOYER" "$MINT" --json | grep -oP '"transactionHash":"\K0x[0-9a-f]{64}'
$SEND "$TKB"   "mint(address,uint256)" "$DEPLOYER" "$MINT" --json | grep -oP '"transactionHash":"\K0x[0-9a-f]{64}'

echo "== approving pools =="
for P in "$POOLA" "$POOLB" "$POOLC"; do
  $SEND "$WPHRS" "approve(address,uint256)" "$P" "$MAXUINT" --json | grep -oP '"transactionHash":"\K0x[0-9a-f]{64}'
  $SEND "$TKB"   "approve(address,uint256)" "$P" "$MAXUINT" --json | grep -oP '"transactionHash":"\K0x[0-9a-f]{64}'
done

echo "== seeding reserves (A 1000/1000, B 1000/980, C 1000/1020) =="
$SEND "$POOLA" "seed(uint112,uint112)" "$SEED" "$SEED" --json | grep -oP '"transactionHash":"\K0x[0-9a-f]{64}'
$SEND "$POOLB" "seed(uint112,uint112)" "$SEED" "$SEED_B_TKB" --json | grep -oP '"transactionHash":"\K0x[0-9a-f]{64}'
$SEND "$POOLC" "seed(uint112,uint112)" "$SEED" "$SEED_C_TKB" --json | grep -oP '"transactionHash":"\K0x[0-9a-f]{64}'

cat > deployments.json <<EOF
{
  "chain_id": 688689,
  "network": "pharos-atlantic-testnet",
  "deployer": "$DEPLOYER",
  "WPHRS": "$WPHRS",
  "TKB": "$TKB",
  "poolA": "$POOLA",
  "poolB": "$POOLB",
  "poolC": "$POOLC"
}
EOF
echo "== done =="
cat deployments.json
