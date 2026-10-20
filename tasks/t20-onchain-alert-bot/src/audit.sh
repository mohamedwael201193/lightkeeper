#!/usr/bin/env bash
# t20-onchain-alert-bot — alert-ledger auditor.
#
# Replays state/alerts.log against the LIVE chain and proves every SENT alert
# corresponds to a real mined transaction with the claimed recipient, value and
# block. This is what makes each alert self-verifying: the ledger is not just
# a log, it is an append-only receipt book anyone can re-check.
#
# Checks per SENT entry:
#   1. exactly one SENDING marker for <cond>:<txhash>, written BEFORE the SENT
#      (write-ahead ordering; one SENDING + one SENT = no duplicate)
#   2. the dedupe key <cond>:<txhash> is present in state/seen
#   3. the tx exists on-chain, receipt status == success
#   4. tx.to (case-insensitive) == the claimed watched address/contract
#   5. tx.blockNumber == the block in the SENDING marker
#   6. the value satisfies the condition semantics
#      (incoming-transfer: > 0; large-transfer: >= config threshold;
#       contract-interaction: recipient is a watched contract)
#   7. the live matcher (src/match.sh) agrees the tx matches the condition
#
# Usage: bash src/audit.sh
# Prints PASS/FAIL per alert + a summary; appends the run to state/audit.log.
# Exit 1 if anything fails. No secrets are echoed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/match.sh"

LEDGER="$STATE_DIR/alerts.log"
AUDIT_LOG="$STATE_DIR/audit.log"

parse_config
assert_chain

if [[ ! -s "$LEDGER" ]]; then
  echo "audit: ledger $LEDGER is empty — nothing to verify" >&2
  exit 1
fi

PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); echo "PASS: $1"; }
fail() { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

run_ts="$(date -u +%FT%TZ)"
# NOTE: output goes to a temp file, not a pipe — the group must run in THIS
# shell so PASS/FAIL counters survive (a trailing `| tee` would subshell them).
tmp="$(mktemp)"
{
echo "=== audit run $run_ts ==="

# SENT line format: "<ts> SENT <cond> <hash> message_id=<n>"
# (process substitution, not a pipe — the PASS/FAIL counters must survive)
while read -r _ts _ cond hash mid; do
  sending="$(grep " SENDING ${cond} ${hash} " "$LEDGER" || true)"
  sending_n="$(wc -l <<<"$sending" | tr -d ' ')"
  sent_n="$(grep -c " SENT ${cond} ${hash} " "$LEDGER" || true)"

  # 1. write-ahead ordering + exactly-once counts
  # (|| true: a missing marker must reach the shape check as a FAIL, not kill the script via set -e)
  send_line="$(grep -n -m1 " SENT ${cond} ${hash} " "$LEDGER" | cut -d: -f1 || true)"
  send_line_first="$(grep -n -m1 " SENDING ${cond} ${hash} " "$LEDGER" | cut -d: -f1 || true)"
  if [[ "$sending_n" == "1" && "$sent_n" == "1" && -n "$send_line_first" && "$send_line_first" -lt "$send_line" ]]; then
    pass "write-ahead exactly-once ${cond}:${hash:0:18}… (SENDING line $send_line_first < SENT line $send_line)"
  else
    fail "ledger shape ${cond}:${hash} (SENDING=$sending_n SENT=$sent_n order_ok=$([[ -n "$send_line_first" && -n "$send_line" && "$send_line_first" -lt "$send_line" ]] && echo yes || echo no))"
    continue
  fi

  # 2. dedupe store holds the key
  if grep -qxF "${cond}:${hash}" "$STATE_DIR/seen"; then
    pass "dedupe key present ${cond}:${hash:0:18}…"
  else
    fail "dedupe key MISSING ${cond}:${hash}"
  fi

  # 3. tx on-chain + success
  tx_json="$(cast tx "$hash" --rpc-url "$ATLANTIC_RPC_URL" --json 2>/dev/null | jq -c '.data // empty' || true)"
  status="$(cast receipt "$hash" --rpc-url "$ATLANTIC_RPC_URL" --json 2>/dev/null | jq -r '.status // empty' || true)"
  if [[ -z "$tx_json" ]]; then fail "tx NOT FOUND on chain ${hash}"; continue; fi
  if [[ "$status" == "0x1" ]]; then pass "on-chain success ${hash:0:18}…"; else fail "tx not successful ${hash} (status=$status)"; continue; fi

  to="$(jq -r '.to // ""' <<<"$tx_json")"
  valhex="$(jq -r '.value // "0x0"' <<<"$tx_json")"
  blockhex="$(jq -r '.blockNumber // ""' <<<"$tx_json")"
  blockdec="$(cast --to-dec "$blockhex")"
  valwei="$(cast --to-dec "$valhex")"
  to_lc="$(tr '[:upper:]' '[:lower:]' <<<"$to")"
  claim_block="$(sed -E 's/.*block=([0-9]+).*/\1/' <<<"$sending")"

  # 4+5. recipient + block match the claim
  claimed_ok=0
  if [[ "$cond" == "contract-interaction" ]]; then
    for a in ${CONTRACTS_LC[@]+"${CONTRACTS_LC[@]}"}; do [[ "$to_lc" == "$a" ]] && claimed_ok=1; done
  else
    for a in ${WATCHED_LC[@]+"${WATCHED_LC[@]}"}; do [[ "$to_lc" == "$a" ]] && claimed_ok=1; done
  fi
  if [[ $claimed_ok -eq 1 && "$blockdec" == "$claim_block" ]]; then
    pass "recipient+block match ${hash:0:18}… (block $blockdec)"
  else
    fail "recipient/block MISMATCH ${hash} (to=$to block=$blockdec claimed_block=$claim_block)"
  fi

  # 6. value semantics for the condition
  case "$cond" in
    incoming-transfer)
      [[ "$valwei" != "0" ]] && pass "value>0 for incoming-transfer (${hash:0:18}…)" \
        || fail "zero value for incoming-transfer ${hash}" ;;
    large-transfer)
      [[ "$(ge_wei "$valwei" "$THRESH_WEI")" == "1" ]] && pass "value>=threshold for large-transfer (${hash:0:18}…)" \
        || fail "value below threshold for large-transfer ${hash}" ;;
    contract-interaction)
      pass "contract-interaction value check n/a (${hash:0:18}…)" ;;
    *)
      fail "unknown condition $cond for ${hash}" ;;
  esac

  # 7. the live matcher agrees with the recorded condition.
  # NOTE: capture the matcher output FIRST, then grep the variable. Piping
  # match_tx straight into `grep -q` is a SIGPIPE race: grep -q exits on the
  # first match and closes the pipe while match_tx is still writing, so under
  # pipefail the check flakes (this exact bug failed two audit runs).
  matcher_out="$(match_tx "$hash" "$to" "$valhex" "$blockdec" || true)"
  if grep -qxF "$cond" <<<"$matcher_out"; then
    pass "matcher re-confirms ${cond} for ${hash:0:18}…"
  else
    fail "matcher DISAGREES with ${cond} for ${hash} (matcher said: [${matcher_out//$'\n'/,}])"
  fi
done < <(grep " SENT " "$LEDGER")

echo "---"
echo "AUDIT RESULT: PASS=$PASS FAIL=$FAIL"
} >"$tmp" 2>&1
tee -a "$AUDIT_LOG" <"$tmp"
rm -f "$tmp"

[[ $FAIL -eq 0 ]]
