import { homedir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

function resolvePath(p: string): string {
  return p.replace(/^~/, homedir());
}

function readEnvFile(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const envPath = path.join(import.meta.dir, "..", ".env");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  } catch {
    // ignore
  }
  return result;
}

const rawEnv = readEnvFile();

function readPositiveNumber(key: string, fallback: number): number {
  const value = Number(rawEnv[key] || process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  port: Number(rawEnv.PORT || process.env.PORT) || 8098,
  upstreamUrl: rawEnv.UPSTREAM_URL || process.env.UPSTREAM_URL || "http://127.0.0.1:8097",
  jwtSecret: rawEnv.JWT_SECRET || process.env.JWT_SECRET || "change-me",
  adminUsername: rawEnv.ADMIN_USERNAME || process.env.ADMIN_USERNAME || "admin",
  adminPassword: rawEnv.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "admin",
  usageDbPath: resolvePath(
    rawEnv.USAGE_DB_PATH || process.env.USAGE_DB_PATH ||
      path.join(homedir(), ".ccs-dashboard", "data", "usage-v2.db")
  ),
  cliproxyConfigDir: resolvePath(
    rawEnv.CLIPROXY_CONFIG_DIR || process.env.CLIPROXY_CONFIG_DIR ||
      path.join(homedir(), ".ccs", "cliproxy")
  ),
  budgetDbPath: path.join(
    homedir(),
    ".ccs-dashboard",
    "data",
    "ccs-limit.db"
  ),
  upstreamIdleTimeoutMs: readPositiveNumber("UPSTREAM_IDLE_TIMEOUT_MS", 300_000),
  clientIdleTimeoutMs: readPositiveNumber("CLIENT_IDLE_TIMEOUT_MS", 300_000),
  headersTimeoutMs: readPositiveNumber("HEADERS_TIMEOUT_MS", 15_000),
  keepAliveTimeoutMs: readPositiveNumber("KEEP_ALIVE_TIMEOUT_MS", 5_000),
};
