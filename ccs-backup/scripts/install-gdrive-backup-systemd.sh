#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SYSTEMD_DIR_DEFAULT="${HOME}/.config/systemd/user"
SYSTEMD_DIR="${1:-$SYSTEMD_DIR_DEFAULT}"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive:ccs-backups}"

SERVICE_TEMPLATE="${REPO_DIR}/systemd/ccs-backup-gdrive-weekly.service.template"
TIMER_TEMPLATE="${REPO_DIR}/systemd/ccs-backup-gdrive-weekly.timer.template"
SERVICE_TARGET="${SYSTEMD_DIR}/ccs-backup-gdrive-weekly.service"
TIMER_TARGET="${SYSTEMD_DIR}/ccs-backup-gdrive-weekly.timer"

mkdir -p "$SYSTEMD_DIR"

sed \
  -e "s#__WORKDIR__#${REPO_DIR//\#/\\#}#g" \
  -e "s#__RCLONE_REMOTE__#${RCLONE_REMOTE//\#/\\#}#g" \
  "$SERVICE_TEMPLATE" > "$SERVICE_TARGET"

cp "$TIMER_TEMPLATE" "$TIMER_TARGET"

echo "Installed:"
echo "  $SERVICE_TARGET"
echo "  $TIMER_TARGET"
echo
echo "Next:"
echo "  chmod +x ${REPO_DIR}/scripts/backup-to-gdrive.sh"
echo "  systemctl --user daemon-reload"
echo "  systemctl --user enable --now ccs-backup-gdrive-weekly.timer"
echo "  systemctl --user status ccs-backup-gdrive-weekly.timer"
