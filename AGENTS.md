# AGENTS.md

## Workspace Rules

- Use `bun` for installs, scripts, builds, and package changes.
- Never use `npm install`, `npm ci`, or npm package-management commands.
- Do not write runtime dashboard data into `~/.ccs`; app-owned runtime data belongs under `~/.ccs-dashboard`.

## Current Architecture

- `ccs-backup` is the collector/converter service. It reads source usage from `~/.ccs` and writes the durable dashboard database to `~/.ccs-dashboard/data/usage-v2.db`.
- `ccs-dashboard` is the new Next.js dashboard. Its API reads `~/.ccs-dashboard/data/usage-v2.db`; the UI must not read raw `~/.ccs` files directly.
- `ccs-dashboard-old` is reference-only. Copy UI ideas from it if useful, but do not copy its old backend/data handling.
- `ccs-old-data` is only for historical backfill/input inspection.

## Dashboard UI Direction

- Keep the dashboard monochrome and operational: dense, scan-friendly, no decorative gradients or marketing layout.
- Preserve the current mobile pattern: each control row has a left label and a full-width control (`Theme`, `Refresh`, `Range`, `Date`, `Group`).
- Preserve the current desktop pattern: title/status on the left, theme/refresh on the right, range controls left, date/group controls right.
- Dropdown triggers must render user-facing labels, not raw values.
- Table overflow must be owned by shadcn `ScrollArea`; do not reintroduce native `overflow-x-auto` wrappers inside the table component.

## Verification

- For `ccs-dashboard`, run `bun run typecheck` and `bun run build` after UI/API changes.