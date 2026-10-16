#!/usr/bin/env bash
# t20-onchain-alert-bot — REAL trigger.
# Fires a genuine dust native transfer (0.001 PHRS) from the deployer wallet
# to the watched address (itself). This is the REAL on-chain event the watcher
# detects — disclosed self-test, Atlantic testnet only, never fabricated.
#
# Nonce safety: every broadcast goes through flock /tmp/lk-nonce.lock
# (28 workers share one key). cast waits for the receipt by default.
#
# Note: `cast send --json` only formats LOG lines as JSON (no machine-readable
# receipt), so we parse the human-readable output for the transaction hash.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is not set (env only)}"

parse_config
assert_chain

TO="${WATCHED_ADDRS[0]}"
VALUE_WEI=1000000000000000   # 0.001 PHRS dust
RAW_OUT="$LOG_DIR/trigger.raw.txt"

log "firing REAL dust trigger: 0.001 PHRS -> $TO (self)"
flock /tmp/lk-nonce.lock cast send "$TO" \
  --value "$VALUE_WEI" \
  --rpc-url "$ATLANTIC_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  >"$RAW_OUT" 2>&1
tee -a "$LOG_DIR/watch.log" <"$RAW_OUT" >/dev/null

TXHASH="$(grep -oE '0x[0-9a-fA-F]{64}' "$RAW_OUT" | head -1)"
if [[ -z "$TXHASH" ]]; then
  echo "FATAL: could not find tx hash in cast output ($RAW_OUT)" >&2
  exit 1
fi
echo "TRIGGER_TX=$TXHASH"
echo "$TXHASH" > "$STATE_DIR/trigger.txhash"

# Wait for the receipt and print the key fields (proves inclusion + real spend).
# (cast receipt --json returns the receipt directly, no envelope.)
cast receipt "$TXHASH" --rpc-url "$ATLANTIC_RPC_URL" --json 2>/dev/null \
  | jq -r '{blockNumber, gasUsed, effectiveGasPrice, status}'
