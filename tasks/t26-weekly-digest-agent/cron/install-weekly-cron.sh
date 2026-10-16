#!/usr/bin/env bash
# T26 — Weekly Digest Agent: weekly scheduler installer.
#
# Installs a REAL weekly cron entry on the OPERATOR'S machine that runs the
# digest pipeline (build + Telegram deliver) every Monday 08:00 local time.
#
# HONESTY NOTE (per LIGHTKEEPER doctrine): Pharos SkillEngine exposes NO cron
# primitive (see LIGHTKEEPER-VERDICT.md precision patches). This skill does
# NOT schedule itself — the operator installs this cron entry (or an
# equivalent GitHub Actions schedule, see cron/weekly-digest.github.yml).
# This script is NEVER run by the build agent on shared infra; it is a
# documented, operator-run installer.
#
# Usage on your own machine / server:
#   chmod +x cron/install-weekly-cron.sh
#   ./cron/install-weekly-cron.sh            # prints the entry, asks to install
#   ./cron/install-weekly-cron.sh --yes      # installs without prompting
#   ./cron/install-weekly-cron.sh --remove   # removes the T26 entry
#
# Requirements on the target machine:
#   - python3 with `requests` installed
#   - env file with TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
#     (defaults to <repo>/../.env i.e. ~/workspace/lightkeeper/.env layout;
#      override with T26_ENV_FILE)
set -euo pipefail

TASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${T26_ENV_FILE:-$(dirname "$TASK_DIR")/.env}"
MARKER="# lightkeeper-t26-weekly-digest"

cron_line() {
  # Monday 08:00 local: build digest, then deliver. Logs to cron/digest-cron.log
  echo "0 8 * * 1 set -a; . \"$ENV_FILE\"; set +a; cd \"$TASK_DIR\" && /usr/bin/python3 src/digest.py --run >> cron/digest-cron.log 2>&1 && /usr/bin/python3 src/digest.py --deliver >> cron/digest-cron.log 2>&1 $MARKER"
}

case "${1:-}" in
  --remove)
    crontab -l 2>/dev/null | grep -v "$MARKER" | crontab - || true
    echo "T26 cron entry removed (if it existed)."
    ;;
  --yes|"")
    if [ ! -f "$ENV_FILE" ]; then
      echo "ERROR: env file not found: $ENV_FILE" >&2
      echo "Set T26_ENV_FILE to the path of your .env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)." >&2
      exit 1
    fi
    LINE="$(cron_line)"
    echo "This will install the following weekly cron entry:"
    echo "  $LINE"
    if [ "${1:-}" != "--yes" ]; then
      read -r -p "Install? [y/N] " ans
      case "$ans" in [yY]*) ;; *) echo "Aborted — nothing installed."; exit 0;; esac
    fi
    ( crontab -l 2>/dev/null | grep -v "$MARKER"; echo "$LINE" ) | crontab -
    echo "Installed. Verify with: crontab -l | grep t26"
    echo "First scheduled run: next Monday 08:00 local. Logs: $TASK_DIR/cron/digest-cron.log"
    echo "To run once immediately (manual): cd $TASK_DIR && python3 src/digest.py --run && python3 src/digest.py --deliver"
    ;;
  *)
    echo "usage: $0 [--yes|--remove]" >&2; exit 2;;
esac
