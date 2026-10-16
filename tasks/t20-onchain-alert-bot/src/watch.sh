#!/usr/bin/env bash
# t20-onchain-alert-bot — block-by-block poller.
# Usage: watch.sh [--once] [--from-block N] [--to-block M] [--daemon]
#
# No-repeat-spam design (per official requirement 4 + QA fix):
#   * dedupe store state/seen keyed "<condition>:<txhash>"
#   * write-ahead "SENDING" marker persisted to state/alerts.log BEFORE the
#     Telegram send. A crash between send and the "SENT" write is recovered
#     at startup (recover_unacked): the event is treated as already delivered
#     and never re-sent — sendMessage has no idempotency key, so the safe
#     direction is "never duplicate".
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/match.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/alert.sh"

MODE="once"
FROM_BLOCK=""
TO_BLOCK=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --once) MODE="once"; shift ;;
    --daemon) MODE="daemon"; shift ;;
    --from-block) FROM_BLOCK="$2"; shift 2 ;;
    --to-block) TO_BLOCK="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

latest_confirmed() {
  local latest
  latest="$(rpc eth_blockNumber '[]' | jq -r .result)"
  echo $(( $(cast --to-dec "$latest") - CONFIRM ))
}

recover_unacked() {
  # Any SENDING marker without a matching SENT line = possible crash after a
  # successful send. Treat as delivered: seed the seen-store, never re-send.
  local sending sent
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # line format: "<ts> SENDING <cond> <hash> block=<b>"
    local cond hash
    cond="$(awk '{print $3}' <<<"$line")"
    hash="$(awk '{print $4}' <<<"$line")"
    sent="$(grep -c " SENT ${cond} ${hash} " "$STATE_DIR/alerts.log" 2>/dev/null || true)"
    if [[ "$sent" == "0" ]]; then
      printf '%s RECOVERED-SKIP %s %s (SENDING without SENT after restart; not re-sending)\n' \
        "$(date -u +%FT%TZ)" "$cond" "$hash" >> "$STATE_DIR/alerts.log"
      printf '%s\n' "${cond}:${hash}" >> "$STATE_DIR/seen"
      log "recover: ${cond}:${hash} marked delivered (no re-send)"
    fi
  done < <(grep " SENDING " "$STATE_DIR/alerts.log" 2>/dev/null || true)
}

handle_match() { # cond hash to valhex block
  local cond="$1" hash="$2" to="$3" valhex="$4" block="$5"
  local key="${cond}:${hash}"
  if grep -qxF "$key" "$STATE_DIR/seen"; then
    log "dedup skip (already alerted): $key"
    return 0
  fi
  # WRITE-AHEAD marker: persisted BEFORE the Telegram send.
  printf '%s SENDING %s %s block=%s\n' "$(date -u +%FT%TZ)" "$cond" "$hash" "$block" >> "$STATE_DIR/alerts.log"
  local amount msgid
  amount="$(cast --from-wei "$(cast --to-dec "$valhex")" | sed -E 's/(\.[0-9]*[1-9])0+$/\1/; s/\.0+$//')"
  if msgid="$(send_alert "$cond" "$to" "$amount" "$hash" "$block")"; then
    printf '%s SENT %s %s message_id=%s\n' "$(date -u +%FT%TZ)" "$cond" "$hash" "$msgid" >> "$STATE_DIR/alerts.log"
    printf '%s\n' "$key" >> "$STATE_DIR/seen"
    log "ALERT SENT cond=$cond tx=$hash block=$block amount=${amount}PHRS message_id=$msgid"
  else
    printf '%s SEND_FAILED %s %s (will retry next cycle; SENDING marker stands)\n' \
      "$(date -u +%FT%TZ)" "$cond" "$hash" >> "$STATE_DIR/alerts.log"
    log "send FAILED cond=$cond tx=$hash — will retry next cycle (no duplicate risk: key not in seen)"
    return 1
  fi
}

scan_block() { # block_number
  local b="$1" txs tx hash to val cond
  # fast path: header-only fetch first; skip empty blocks without pulling tx bodies
  local n
  n="$(cast block "$b" --rpc-url "$ATLANTIC_RPC_URL" --json 2>/dev/null | jq -r '.data.transactions | length')"
  if [[ "$n" == "0" ]]; then return 0; fi
  txs="$(cast block "$b" --full --rpc-url "$ATLANTIC_RPC_URL" --json 2>/dev/null \
    | jq -c '.data.transactions[]? | {hash, to, value}')"
  while IFS= read -r tx; do
    [[ -z "$tx" ]] && continue
    hash="$(jq -r .hash <<<"$tx")"
    to="$(jq -r '.to // ""' <<<"$tx")"
    val="$(jq -r '.value // "0x0"' <<<"$tx")"
    while IFS= read -r cond; do
      [[ -z "$cond" ]] && continue
      handle_match "$cond" "$hash" "$to" "$val" "$b" || true
    done < <(match_tx "$hash" "$to" "$val" "$b")
  done <<<"$txs"
}

pass_once() { # from to  (inclusive)
  local from="$1" to="$2" b
  log "scan pass: blocks $from..$to"
  for ((b=from; b<=to; b++)); do
    scan_block "$b"
    echo $((b + 1)) > "$STATE_DIR/cursor"
  done
  log "scan pass done; cursor=$(cat "$STATE_DIR/cursor")"
}

main() {
  parse_config
  assert_chain
  recover_unacked

  local cursor head from to
  if [[ -n "$FROM_BLOCK" ]]; then
    cursor="$FROM_BLOCK"
  elif [[ -f "$STATE_DIR/cursor" ]]; then
    cursor="$(cat "$STATE_DIR/cursor")"
  else
    cursor="$(latest_confirmed)"
    echo "$cursor" > "$STATE_DIR/cursor"
    log "no cursor; starting at latest-confirmed $cursor (no historical replay)"
  fi

  if [[ "$MODE" == "daemon" ]]; then
    while true; do
      head="$(latest_confirmed)"
      if ((cursor <= head)); then
        pass_once "$cursor" "$head"
        cursor="$(cat "$STATE_DIR/cursor")"
      else
        log "no new confirmed blocks (cursor=$cursor head=$head); sleeping ${INTERVAL}s"
      fi
      sleep "$INTERVAL"
    done
  else
    head="$(latest_confirmed)"
    [[ -n "$TO_BLOCK" ]] && head="$TO_BLOCK"
    if ((cursor > head)); then
      log "nothing to scan (cursor=$cursor > head=$head)"
      return 0
    fi
    pass_once "$cursor" "$head"
  fi
}

main
