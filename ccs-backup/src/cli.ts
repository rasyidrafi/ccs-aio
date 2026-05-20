import { resolveConfig } from '@/config';
import { readStatus } from '@/db';
import { runSync } from '@/sync';

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const ccsDir = readFlag('--ccs-dir');
  const dbPath = readFlag('--db-path');

  if (command === 'sync') {
    const summary = await runSync({ ccsDir, dbPath });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (command === 'status') {
    const config = await resolveConfig(ccsDir, dbPath);
    const status = await readStatus(config.dbPath);
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  console.error(
    'Usage: bun run src/cli.ts <sync|status> [--ccs-dir <path>] [--db-path <path>]'
  );
  process.exitCode = 1;
}

await main();
