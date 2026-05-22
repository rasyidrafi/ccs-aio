#!/usr/bin/env bash
set -euo pipefail

RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive:ccs-backups}"
TMP_DIR="${TMP_DIR:-$HOME/.ccs-dashboard/backups/tmp}"
STAGE_DIR="${STAGE_DIR:-$HOME/.ccs-dashboard/backups/stage}"
RETENTION_DAYS="${RETENTION_DAYS:-90}"
TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
ARCHIVE_NAME="ccs-weekly-${TS}.tar.gz"
ARCHIVE_PATH="${TMP_DIR}/${ARCHIVE_NAME}"

DB_PATH="$HOME/.ccs-dashboard/data/usage-v2.db"
CCS_CONFIG="$HOME/.ccs/config.yaml"
CLIPROXY_DIR="$HOME/.ccs/cliproxy"
CLIPROXY_AUTH_DIR="$CLIPROXY_DIR/auth"

if ! command -v rclone >/dev/null 2>&1; then
  echo "backup-to-gdrive: rclone not found in PATH" >&2
  exit 1
fi

mkdir -p "$TMP_DIR" "$STAGE_DIR/ccs-dashboard/data" "$STAGE_DIR/ccs/cliproxy/auth"

if [[ ! -f "$DB_PATH" ]]; then
  echo "backup-to-gdrive: missing database at $DB_PATH" >&2
  exit 1
fi

if [[ ! -f "$CCS_CONFIG" ]]; then
  echo "backup-to-gdrive: missing config at $CCS_CONFIG" >&2
  exit 1
fi

cp -f "$DB_PATH" "$STAGE_DIR/ccs-dashboard/data/usage-v2.db"
cp -f "$CCS_CONFIG" "$STAGE_DIR/ccs/config.yaml"

if compgen -G "$CLIPROXY_DIR/config*.yaml" >/dev/null; then
  cp -f "$CLIPROXY_DIR"/config*.yaml "$STAGE_DIR/ccs/cliproxy/"
fi

if [[ -f "$CLIPROXY_DIR/accounts.json" ]]; then
  cp -f "$CLIPROXY_DIR/accounts.json" "$STAGE_DIR/ccs/cliproxy/accounts.json"
fi

if compgen -G "$CLIPROXY_AUTH_DIR/*.json" >/dev/null; then
  cp -f "$CLIPROXY_AUTH_DIR"/*.json "$STAGE_DIR/ccs/cliproxy/auth/"
fi

tar -C "$STAGE_DIR" -czf "$ARCHIVE_PATH" .
rclone copy "$ARCHIVE_PATH" "$RCLONE_REMOTE"

find "$TMP_DIR" -type f -name 'ccs-weekly-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
find "$STAGE_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

echo "backup-to-gdrive: uploaded ${ARCHIVE_NAME} to ${RCLONE_REMOTE}"
