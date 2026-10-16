#!/usr/bin/env bash
# t20-onchain-alert-bot — Telegram delivery.
# Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from the environment ONLY.
# Never prints the token. Exactly one send per matched event (dedupe in watch.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is not set (env only)}"
: "${TELEGRAM_CHAT_ID:?TELEGRAM_CHAT_ID is not set (env only)}"

# send_alert <condition> <watched> <amount_phrs> <txhash> <block>
# On success prints the Telegram message_id to stdout.
# Retries transient failures with backoff; fails loudly after 3 attempts.
send_alert() {
  local condition="$1" watched="$2" amount="$3" txhash="$4" block="$5"
  local cond_label
  cond_label="$(tr '[:lower:]-' '[:upper:] ' <<<"$condition")"
  local ts
  ts="$(date -u +%FT%TZ)"

  local text
  text="🚨 <b>LIGHTKEEPER · T20 On-Chain Alert</b>
<b>Condition:</b> ${cond_label}
<b>Watched:</b> <code>${watched}</code>
<b>Amount:</b> ${amount} PHRS
<b>Tx:</b> <code>${txhash}</code>
<b>Explorer:</b> ${EXPLORER_TX}/${txhash}
<b>Block:</b> ${block}
<b>Time:</b> ${ts}

Atlantic testnet · chain 688689 · disclosed self-test dust transfer"

  local attempt resp ok msgid
  for attempt in 1 2 3; do
    resp="$(curl -sS --max-time 30 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "parse_mode=HTML" \
      --data-urlencode "disable_web_page_preview=false" \
      --data-urlencode "text=${text}")"
    ok="$(jq -r '.ok // false' <<<"$resp")"
    if [[ "$ok" == "true" ]]; then
      msgid="$(jq -r '.result.message_id' <<<"$resp")"
      echo "$msgid"
      return 0
    fi
    log "telegram send attempt $attempt failed: $(jq -c '{ok, description} // .' <<<"$resp" | head -c 300)"
    sleep $((attempt * 5))
  done
  return 1
}
