# ccs-limit-notifier

Standalone Codex weekly reset notifier.

It polls discovered Codex auth files from cliproxy, detects `not full -> full` weekly quota resets for paid healthy accounts, signs a webhook with HMAC SHA-256, and persists state under `~/.ccs-limit-notifier`.

## Commands

```bash
bun install
bun run check-reset
bun run typecheck
bun test
bun run install:systemd
```

## Runtime state

- state: `~/.ccs-limit-notifier/state/reset-state.json`
- lock: `~/.ccs-limit-notifier/run/ccs-limit-notifier.lock`

## Filtering and grouping

- only paid plans are considered
- free plans are ignored
- expired auth files are ignored
- webhook delivery is grouped when detected resets are within 30 minutes of each other by default

## systemd

The installer writes user units and a 10-minute timer:

```bash
systemctl --user daemon-reload
systemctl --user enable --now ccs-limit-notifier-reset.timer
```
