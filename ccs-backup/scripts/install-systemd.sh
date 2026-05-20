#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SYSTEMD_DIR_DEFAULT="${HOME}/.config/systemd/user"
SYSTEMD_DIR="${1:-$SYSTEMD_DIR_DEFAULT}"
BUN_BIN="${BUN_BIN:-$(command -v bun || true)}"

if [[ -z "$BUN_BIN" ]]; then
  echo "install-systemd: bun not found in PATH" >&2
  exit 1
fi

mkdir -p "$SYSTEMD_DIR"

SERVICE_TEMPLATE="${REPO_DIR}/systemd/ccs-backup.service.template"
TIMER_TEMPLATE="${REPO_DIR}/systemd/ccs-backup.timer.template"
SERVICE_TARGET="${SYSTEMD_DIR}/ccs-backup.service"
TIMER_TARGET="${SYSTEMD_DIR}/ccs-backup.timer"

sed \
  -e "s#__WORKDIR__#${REPO_DIR//\#/\\#}#g" \
  -e "s#__BUN__#${BUN_BIN//\#/\\#}#g" \
  "$SERVICE_TEMPLATE" > "$SERVICE_TARGET"

cp "$TIMER_TEMPLATE" "$TIMER_TARGET"

echo "Installed:"
echo "  $SERVICE_TARGET"
echo "  $TIMER_TARGET"
echo
echo "Next:"
echo "  systemctl --user daemon-reload"
echo "  systemctl --user enable --now ccs-backup.timer"
echo "  systemctl --user status ccs-backup.timer"
