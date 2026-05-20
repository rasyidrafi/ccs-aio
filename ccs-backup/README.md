# ccs-backup

Phase 2 durable usage collector for CCS.

Current scope:
- one-shot `sync` command
- `status` command for last sync health
- ingest from live CLIProxy management usage API when available
- ingest from `~/.ccs/cache/cliproxy-usage/latest.json`
- persist deduplicated raw events into `~/.ccs-dashboard/data/usage-v2.db`
- track sync state in SQLite
- user-systemd timer templates for every 10 minutes

Source vs runtime paths:
- reads CCS config and snapshots from `~/.ccs`
- writes `ccs-backup` runtime state into `~/.ccs-dashboard`

Examples:

```bash
bun run src/cli.ts sync
bun run src/cli.ts status
bun run src/cli.ts sync --ccs-dir ~/.ccs
bun run src/cli.ts sync --db-path ~/.ccs-dashboard/data/custom-usage.db
```

Install the 10-minute user timer:

```bash
bun run install:systemd
systemctl --user daemon-reload
systemctl --user enable --now ccs-backup.timer
systemctl --user status ccs-backup.timer
```
