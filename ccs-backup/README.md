# ccs-backup

Phase 3 durable usage collector for CCS.

Current scope:
- one-shot `sync` command
- one-shot `sync-live` command for low-latency management API ingest
- one-shot `sync-snapshot` command for slower snapshot reconciliation
- `status` command for last sync health
- `rebuild-rollups` command to regenerate all read rollups from deduplicated raw events
- ingest from live CLIProxy management usage API when available
- ingest from `~/.ccs/cache/cliproxy-usage/latest.json`
- persist deduplicated raw events into `~/.ccs-dashboard/data/usage-v2.db`
- maintain read-optimized `hourly`, `daily`, and `monthly` rollup tables
- track sync state in SQLite
- user-systemd timer templates for 30-second live sync plus 5-minute snapshot reconciliation

Source vs runtime paths:
- reads CCS config and snapshots from `~/.ccs`
- writes `ccs-backup` runtime state into `~/.ccs-dashboard`

Examples:

```bash
bun run src/cli.ts sync
bun run src/cli.ts sync-live
bun run src/cli.ts sync-snapshot
bun run src/cli.ts status
bun run src/cli.ts rebuild-rollups
bun run src/cli.ts sync --ccs-dir ~/.ccs
bun run src/cli.ts sync --db-path ~/.ccs-dashboard/data/custom-usage.db
```

Default automation:
- `ccs-backup-live.timer`: every 30 seconds, live management API only
- `ccs-backup-snapshot.timer`: every 5 minutes, snapshot reconciliation only
- `rebuild-rollups`: manual only

Install the default user timers:

```bash
bun run install:systemd
systemctl --user daemon-reload
systemctl --user enable --now ccs-backup-live.timer ccs-backup-snapshot.timer
systemctl --user status ccs-backup-live.timer
systemctl --user status ccs-backup-snapshot.timer
```
