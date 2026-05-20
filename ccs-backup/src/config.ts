import { homedir } from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const DEFAULT_MANAGEMENT_SECRET = 'ccs';
const DEFAULT_PORT = 8097;

export interface ResolvedConfig {
  ccsDir: string;
  stateDir: string;
  dbPath: string;
  managementUrl: string;
  managementSecret: string;
}

function expandHome(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith('~/')) return path.join(homedir(), input.slice(2));
  return input;
}

export function resolveCcsDir(input?: string): string {
  return path.resolve(expandHome(input ?? path.join(homedir(), '.ccs')));
}

export function resolveStateDir(input?: string): string {
  return path.resolve(expandHome(input ?? path.join(homedir(), '.ccs-dashboard')));
}

export function resolveDbPath(stateDir: string, input?: string): string {
  return path.resolve(expandHome(input ?? path.join(stateDir, 'data', 'usage-v2.db')));
}

async function readUtf8(filePath: string): Promise<string> {
  return await readFile(filePath, 'utf8');
}

function matchSingle(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match?.[1]?.trim() ?? null;
}

function matchBlock(text: string, blockName: string): string | null {
  const escaped = blockName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:^|\\n)${escaped}:\\s*\\n((?:[ \\t].*\\n?)*)`, 'm');
  const match = regex.exec(text);
  return match?.[1] ?? null;
}

function parsePortFromConfig(text: string): number {
  const localBlock = matchBlock(text, 'cliproxy_server');
  const localPortBlock = localBlock ? matchBlock(localBlock, 'local') : null;
  const portValue =
    (localPortBlock ? matchSingle(localPortBlock, /port:\s*([0-9]+)/) : null) ??
    matchSingle(text, /(?:^|\n)port:\s*([0-9]+)/m);
  const port = Number(portValue);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}

function parseManagementSecret(text: string): string {
  const cliproxyBlock = matchBlock(text, 'cliproxy');
  const authBlock = cliproxyBlock ? matchBlock(cliproxyBlock, 'auth') : null;
  return (
    (authBlock ? matchSingle(authBlock, /management_secret:\s*["']?([^"'\n#]+)["']?/) : null) ??
    DEFAULT_MANAGEMENT_SECRET
  );
}

export async function resolveConfig(ccsDirInput?: string, dbPathInput?: string): Promise<ResolvedConfig> {
  const ccsDir = resolveCcsDir(ccsDirInput);
  const stateDir = resolveStateDir();
  const dbPath = resolveDbPath(stateDir, dbPathInput);
  const configPath = path.join(ccsDir, 'config.yaml');

  let managementSecret = DEFAULT_MANAGEMENT_SECRET;
  let port = DEFAULT_PORT;

  try {
    const text = await readUtf8(configPath);
    managementSecret = parseManagementSecret(text);
    port = parsePortFromConfig(text);
  } catch {
    // Use defaults when config is absent or unreadable.
  }

  return {
    ccsDir,
    stateDir,
    dbPath,
    managementSecret,
    managementUrl: `http://127.0.0.1:${port}`,
  };
}
