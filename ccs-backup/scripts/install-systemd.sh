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

LIVE_SERVICE_TEMPLATE="${REPO_DIR}/systemd/ccs-backup-live.service.template"
LIVE_TIMER_TEMPLATE="${REPO_DIR}/systemd/ccs-backup-live.timer.template"
SNAPSHOT_SERVICE_TEMPLATE="${REPO_DIR}/systemd/ccs-backup-snapshot.service.template"
SNAPSHOT_TIMER_TEMPLATE="${REPO_DIR}/systemd/ccs-backup-snapshot.timer.template"
LIVE_SERVICE_TARGET="${SYSTEMD_DIR}/ccs-backup-live.service"
LIVE_TIMER_TARGET="${SYSTEMD_DIR}/ccs-backup-live.timer"
SNAPSHOT_SERVICE_TARGET="${SYSTEMD_DIR}/ccs-backup-snapshot.service"
SNAPSHOT_TIMER_TARGET="${SYSTEMD_DIR}/ccs-backup-snapshot.timer"

sed \
  -e "s#__WORKDIR__#${REPO_DIR//\#/\\#}#g" \
  -e "s#__BUN__#${BUN_BIN//\#/\\#}#g" \
  "$LIVE_SERVICE_TEMPLATE" > "$LIVE_SERVICE_TARGET"

sed \
  -e "s#__WORKDIR__#${REPO_DIR//\#/\\#}#g" \
  -e "s#__BUN__#${BUN_BIN//\#/\\#}#g" \
  "$SNAPSHOT_SERVICE_TEMPLATE" > "$SNAPSHOT_SERVICE_TARGET"

cp "$LIVE_TIMER_TEMPLATE" "$LIVE_TIMER_TARGET"
cp "$SNAPSHOT_TIMER_TEMPLATE" "$SNAPSHOT_TIMER_TARGET"

echo "Installed:"
echo "  $LIVE_SERVICE_TARGET"
echo "  $LIVE_TIMER_TARGET"
echo "  $SNAPSHOT_SERVICE_TARGET"
echo "  $SNAPSHOT_TIMER_TARGET"
echo
echo "Next:"
echo "  systemctl --user daemon-reload"
echo "  systemctl --user enable --now ccs-backup-live.timer ccs-backup-snapshot.timer"
echo "  systemctl --user status ccs-backup-live.timer"
echo "  systemctl --user status ccs-backup-snapshot.timer"
