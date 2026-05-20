# ccs-backup

Phase 1 durable usage collector for CCS.

Current scope:
- one-shot `sync` command
- ingest from live CLIProxy management usage API when available
- ingest from `~/.ccs/cache/cliproxy-usage/latest.json`
- persist deduplicated raw events into `~/.ccs/data/usage-v2.db`
- track sync state in SQLite

Examples:

```bash
bun run src/cli.ts sync
bun run src/cli.ts sync --ccs-dir ~/.ccs
bun run src/cli.ts sync --db-path ~/.ccs/data/custom-usage.db
```
