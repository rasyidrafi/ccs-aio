import { runSync } from '@/sync';

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command !== 'sync') {
    console.error('Usage: bun run src/cli.ts sync [--ccs-dir <path>] [--db-path <path>]');
    process.exitCode = 1;
    return;
  }

  const summary = await runSync({
    ccsDir: readFlag('--ccs-dir'),
    dbPath: readFlag('--db-path'),
  });

  console.log(JSON.stringify(summary, null, 2));
}

await main();
