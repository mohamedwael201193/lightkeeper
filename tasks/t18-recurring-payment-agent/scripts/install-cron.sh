#!/usr/bin/env bash
#
# install-cron.sh — operator guide for scheduling TIDE (T18).
#
# SkillEngine has NO native cron/scheduling (confirmed-absent primitive G1),
# so the recurring ticks are driven by the OPERATOR's system cron.
#
# THIS SCRIPT INSTALLS NOTHING. It prints the exact cron line for your
# machine plus the commands to add / verify it. Run it, read the output,
# then add the line to your own crontab with `crontab -e`.
#
# Usage: ./scripts/install-cron.sh [--install]
#   --install is REFUSED on purpose: a build agent must never claim the
#   schedule is running unless the operator installed it themselves.

set -euo pipefail

TASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIDE="$TASK_DIR/src/tide.py"
REPO_ROOT="$(cd "$TASK_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

echo "=================================================================="
echo " TIDE (T18) — cron installer (INFORMATION ONLY, installs nothing)"
echo "=================================================================="
echo
echo "Task dir : $TASK_DIR"
echo "Executor : $TIDE"
echo "Env file : $ENV_FILE  (must exist, mode 600, NEVER committed)"
echo

if [[ ! -f "$ENV_FILE" ]]; then
  echo "WARNING: $ENV_FILE not found — the cron tick will fail until the"
  echo "operator places the repo .env (ATLANTIC_RPC_URL, DEPLOYER_PRIVATE_KEY)."
  echo
fi

# The tick is level-triggered and idempotent: only due, unpaid installments
# are ever paid, exactly once. A 5-minute cadence is safe and cheap
# (read-only until something is actually due).
CRON_LINE="*/5 * * * *  cd $TASK_DIR && set -a; source $ENV_FILE; set +a; export PATH=\"\$HOME/.foundry/bin:\$PATH\"; python3 $TIDE tick >> $TASK_DIR/state/cron.log 2>&1"

echo "--- cron line (copy into your crontab with: crontab -e) ---"
echo
echo "$CRON_LINE"
echo
echo "--- what it does ---"
echo "  * every 5 minutes, runs:  tide.py tick"
echo "  * tick pays AT MOST ONE due installment (real on-chain dust tx),"
echo "    otherwise prints SKIP and exits 0 — safe to run unattended."
echo "  * all decisions are appended to state/audit.log; payments to"
echo "    state/state.jsonl (both gitignored)."
echo
echo "--- verify after installing ---"
echo "  crontab -l | grep tide.py        # the line is present"
echo "  tail -f $TASK_DIR/state/cron.log  # ticks appear every 5 min"
echo "  python3 $TIDE status              # history + next payment"
echo
echo "--- to stop ---"
echo "  crontab -e   # delete the line,  OR run:  python3 $TIDE cancel"

if [[ "${1:-}" == "--install" ]]; then
  echo
  echo "REFUSED: --install is not honored. This script never modifies the"
  echo "system crontab. Add the line above with 'crontab -e' yourself, so the"
  echo "running schedule is always an explicit operator decision."
  exit 1
fi

echo
echo "STATUS: not installed (this script changes nothing)."
