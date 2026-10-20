#!/usr/bin/env bash
# t20-onchain-alert-bot — shared helpers. No secrets in this file.
set -euo pipefail

TASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$TASK_DIR/state"
LOG_DIR="$TASK_DIR/logs"
mkdir -p "$STATE_DIR" "$LOG_DIR"
touch "$STATE_DIR/seen"

EXPECTED_CHAIN_ID=688689
EXPLORER_TX="https://atlantic.pharosscan.xyz/tx"

log() {
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG_DIR/watch.log"
}

rpc() { # rpc <method> <params-json>  -> raw JSON-RPC response
  curl -sS --max-time 30 -X POST "$ATLANTIC_RPC_URL" \
    -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}"
}

assert_chain() {
  local got dec
  got="$(rpc eth_chainId '[]' | jq -r .result)"
  dec="$(cast --to-dec "$got")"
  if [[ "$dec" != "$EXPECTED_CHAIN_ID" ]]; then
    echo "FATAL: chain id $dec != $EXPECTED_CHAIN_ID (Atlantic testnet). Refusing to run." >&2
    exit 1
  fi
  log "chain ok: $dec (Atlantic testnet)"
}

# Parse the small, rigid config.yaml into shell globals:
#   WATCHED_ADDRS[], WATCHED_CONTRACTS[], LARGE_MIN_PHRS, INTERVAL, CONFIRM
parse_config() {
  local cfg="$TASK_DIR/config.yaml"
  WATCHED_ADDRS=()
  WATCHED_CONTRACTS=()
  LARGE_MIN_PHRS="0.5"
  INTERVAL=8
  CONFIRM=2
  local section=""
  local line item
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      "  addresses:") section="addrs" ;;
      "  contracts:"*)
        section="contracts"
        [[ "$line" == *"[]"* ]] && section=""   # inline empty list
        ;;
      *"minValuePHRS:"*)
        LARGE_MIN_PHRS="$(sed -E 's/.*minValuePHRS:[[:space:]]*"([^"]+)".*/\1/' <<<"$line")" ;;
      *"intervalSeconds:"*)
        INTERVAL="$(grep -o '[0-9][0-9]*' <<<"$line" | head -1)" ;;
      *"confirmBlocks:"*)
        CONFIRM="$(grep -o '[0-9][0-9]*' <<<"$line" | head -1)" ;;
      "    - "*)
        item="$(sed 's/^    - //' <<<"$line")"
        case "$section" in
          addrs) WATCHED_ADDRS+=("$item") ;;
          contracts) WATCHED_CONTRACTS+=("$item") ;;
        esac
        ;;
    esac
  done < "$cfg"

  WATCHED_LC=()
  local a
  for a in "${WATCHED_ADDRS[@]}"; do WATCHED_LC+=("$(tr '[:upper:]' '[:lower:]' <<<"$a")"); done
  CONTRACTS_LC=()
  for a in "${WATCHED_CONTRACTS[@]}"; do CONTRACTS_LC+=("$(tr '[:upper:]' '[:lower:]' <<<"$a")"); done
  THRESH_WEI="$(cast --to-wei "$LARGE_MIN_PHRS" ether)"
}

# ge_wei A B — print 1 if decimal-string A >= decimal-string B, else 0.
# Pure string compare; safe for 256-bit wei values (bash arithmetic would overflow).
ge_wei() {
  local a b
  a="${1#"${1%%[!0]*}"}"; a="${a:-0}"
  b="${2#"${2%%[!0]*}"}"; b="${b:-0}"
  if ((${#a} > ${#b})); then echo 1; return; fi
  if ((${#a} < ${#b})); then echo 0; return; fi
  if [[ "$a" > "$b" ]] || [[ "$a" == "$b" ]]; then echo 1; else echo 0; fi
}
