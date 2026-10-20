#!/usr/bin/env bash
# t20-onchain-alert-bot — event matcher.
# match_tx <hash> <to> <value_hex> <block> prints matched condition ids, one per line.
# Globals required: WATCHED_LC[], CONTRACTS_LC[], THRESH_WEI.
#   incoming-transfer    — native PHRS transfer into a watched address (value > 0)
#   large-transfer       — incoming transfer with value >= THRESH_WEI
#   contract-interaction — transaction whose recipient is a watched contract

match_tx() {
  local _hash="$1"
  local to="$2" valhex="$3" _block="$4"
  local to_lc
  to_lc="$(tr '[:upper:]' '[:lower:]' <<<"$to")"

  local is_watched=0 is_contract=0 a
  for a in ${WATCHED_LC[@]+"${WATCHED_LC[@]}"}; do
    [[ -n "$to_lc" && "$to_lc" == "$a" ]] && is_watched=1
  done
  for a in ${CONTRACTS_LC[@]+"${CONTRACTS_LC[@]}"}; do
    [[ -n "$to_lc" && "$to_lc" == "$a" ]] && is_contract=1
  done

  local valwei
  valwei="$(cast --to-dec "$valhex")"

  if [[ $is_watched -eq 1 && "$valwei" != "0" ]]; then
    echo "incoming-transfer"
  fi
  if [[ $is_watched -eq 1 && "$(ge_wei "$valwei" "$THRESH_WEI")" == "1" ]]; then
    echo "large-transfer"
  fi
  if [[ $is_contract -eq 1 ]]; then
    echo "contract-interaction"
  fi
}
