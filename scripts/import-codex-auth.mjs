#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_INPUT = 'auth.json';
const CCS_AUTH_DIR = path.join(os.homedir(), '.ccs', 'cliproxy', 'auth');
const ACCOUNTS_PATH = path.join(os.homedir(), '.ccs', 'cliproxy', 'accounts.json');

function usage() {
  console.log(`Usage: node scripts/import-codex-auth.mjs [auth.json] [--set-default] [--keep-input]

Converts Codex ChatGPT auth export JSON into CCS/CLIProxy format.

Defaults:
  input       ./auth.json
  token dir   ~/.ccs/cliproxy/auth
  registry    ~/.ccs/cliproxy/accounts.json

Options:
  --set-default  Make the imported account the default Codex account.
  --keep-input   Do not archive/delete the source auth.json after import.`);
}

function parseArgs(argv) {
  const options = {
    inputPath: DEFAULT_INPUT,
    setDefault: false,
    keepInput: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--set-default') {
      options.setDefault = true;
      continue;
    }
    if (arg === '--keep-input') {
      options.keepInput = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    options.inputPath = arg;
  }

  return options;
}

function expandHome(filePath) {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2));
  return filePath;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode });
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }
}

function backupIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  try {
    fs.chmodSync(backupPath, 0o600);
  } catch {
    // Best effort.
  }
  return backupPath;
}

function decodeJwtPayload(token) {
  const payload = String(token || '').split('.')[1];
  if (!payload) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function normalizePlan(plan) {
  return String(plan || '')
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
}

function nicknameFromEmail(email) {
  return String(email || '').split('@')[0] || email;
}

function codexFileName(email, plan, accountId) {
  const normalizedPlan = normalizePlan(plan);
  if (!normalizedPlan) return `codex-${email}.json`;
  if (normalizedPlan === 'team') {
    const digest = crypto.createHash('sha256').update(accountId).digest('hex').slice(0, 8);
    return `codex-${digest}-${email}-${normalizedPlan}.json`;
  }
  return `codex-${email}-${normalizedPlan}.json`;
}

function archiveInput(inputPath) {
  const importDir = path.join(CCS_AUTH_DIR, 'imports');
  fs.mkdirSync(importDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(importDir, `auth.${stamp}.json`);

  try {
    fs.renameSync(inputPath, archivePath);
  } catch {
    fs.copyFileSync(inputPath, archivePath);
    fs.unlinkSync(inputPath);
  }

  try {
    fs.chmodSync(archivePath, 0o600);
  } catch {
    // Best effort.
  }
  return archivePath;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing ${label}`);
  }
  return value.trim();
}

function convertAuth(raw) {
  const tokens = raw && typeof raw.tokens === 'object' && raw.tokens !== null ? raw.tokens : raw;
  const idPayload = decodeJwtPayload(tokens.id_token);
  const accessPayload = decodeJwtPayload(tokens.access_token);
  const idAuth = idPayload?.['https://api.openai.com/auth'] || {};
  const accessAuth = accessPayload?.['https://api.openai.com/auth'] || {};
  const profile = accessPayload?.['https://api.openai.com/profile'] || {};

  const email = requireString(idPayload?.email || profile.email || raw.email, 'email');
  const accountId = requireString(
    tokens.account_id || idAuth.chatgpt_account_id || accessAuth.chatgpt_account_id,
    'account_id'
  );
  const plan = normalizePlan(idAuth.chatgpt_plan_type || accessAuth.chatgpt_plan_type);
  const fileName = codexFileName(email, plan, accountId);
  const accessExp = accessPayload?.exp
    ? new Date(Number(accessPayload.exp) * 1000).toISOString()
    : undefined;

  const converted = {
    id_token: requireString(tokens.id_token, 'id_token'),
    access_token: requireString(tokens.access_token, 'access_token'),
    refresh_token: requireString(tokens.refresh_token, 'refresh_token'),
    account_id: accountId,
    last_refresh: raw.last_refresh || new Date().toISOString(),
    email,
    type: 'codex',
    disabled: false,
  };
  if (accessExp) converted.expired = accessExp;

  return { converted, email, fileName, plan, accessExp };
}

function updateRegistry(email, fileName, setDefault) {
  const now = new Date().toISOString();
  const registry = fs.existsSync(ACCOUNTS_PATH)
    ? readJson(ACCOUNTS_PATH)
    : { version: 1, providers: {} };

  registry.version ||= 1;
  registry.providers ||= {};
  registry.providers.codex ||= { default: email, accounts: {} };
  registry.providers.codex.accounts ||= {};

  const existing = registry.providers.codex.accounts[email] || {};
  registry.providers.codex.accounts[email] = {
    email,
    nickname: existing.nickname || nicknameFromEmail(email),
    tokenFile: fileName,
    createdAt: existing.createdAt || now,
    lastUsedAt: now,
  };

  if (setDefault || !registry.providers.codex.default || registry.providers.codex.default === 'default') {
    registry.providers.codex.default = email;
  }

  writeJson(ACCOUNTS_PATH, registry);
  return registry.providers.codex.default;
}

function displayPath(filePath) {
  return filePath.replace(os.homedir(), '~');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(expandHome(options.inputPath));
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const raw = readJson(inputPath);
  const { converted, email, fileName, plan, accessExp } = convertAuth(raw);
  const tokenPath = path.join(CCS_AUTH_DIR, fileName);

  const tokenBackup = backupIfExists(tokenPath);
  const accountsBackup = backupIfExists(ACCOUNTS_PATH);
  writeJson(tokenPath, converted);
  const defaultAccount = updateRegistry(email, fileName, options.setDefault);
  const archivePath = options.keepInput ? null : archiveInput(inputPath);

  console.log(
    JSON.stringify(
      {
        imported: email,
        plan: plan || null,
        tokenFile: displayPath(tokenPath),
        registry: displayPath(ACCOUNTS_PATH),
        defaultAccount,
        accessExpires: accessExp || null,
        archivedInput: archivePath ? displayPath(archivePath) : null,
        backups: {
          tokenFile: tokenBackup ? displayPath(tokenBackup) : null,
          registry: accountsBackup ? displayPath(accountsBackup) : null,
        },
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(`import-codex-auth: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
