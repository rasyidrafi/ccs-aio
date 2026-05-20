import { resolveConfig } from '@/config';
import { readStatus, rebuildRollups } from '@/db';
import { runBackfillOldData } from '@/backfill';
import { runSync } from '@/sync';
import type { SyncSourceMode } from '@/sources';

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const ccsDir = readFlag('--ccs-dir');
  const dbPath = readFlag('--db-path');
  const sourceDir = readFlag('--source-dir');
  const sourceMode = readFlag('--source') as SyncSourceMode | undefined;

  if (command === 'sync') {
    const summary = await runSync({ ccsDir, dbPath, sourceMode: sourceMode ?? 'all' });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === 'sync-live') {
    const summary = await runSync({ ccsDir, dbPath, sourceMode: 'live' });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === 'sync-snapshot') {
    const summary = await runSync({ ccsDir, dbPath, sourceMode: 'snapshot' });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === 'status') {
    const config = await resolveConfig(ccsDir, dbPath);
    const status = await readStatus(config.dbPath);
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (command === 'backfill-old-data') {
    const summary = await runBackfillOldData({ ccsDir, dbPath, sourceDir });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === 'rebuild-rollups') {
    const config = await resolveConfig(ccsDir, dbPath);
    const summary = await rebuildRollups(config.dbPath);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.error(
    'Usage: bun run src/cli.ts <sync|sync-live|sync-snapshot|status|backfill-old-data|rebuild-rollups> [--ccs-dir <path>] [--db-path <path>] [--source-dir <path>] [--source <live|snapshot|all>]'
  );
  process.exitCode = 1;
}

await main();
