import { readFile } from "node:fs/promises"
import { homedir, hostname } from "node:os"
import path from "node:path"

import YAML from "yaml"

import type { CliproxyConfig, NotifierConfig, UnifiedConfig } from "./types.ts"

const DEFAULT_MANAGEMENT_SECRET = "ccs"
const DEFAULT_PORT = 8097
const DEFAULT_STATE_DIR = path.join(homedir(), ".ccs-limit-notifier")

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function readUtf8(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8")
  } catch {
    return null
  }
}

function parseYamlText<T>(value: string | null): T | null {
  if (!value) return null
  return YAML.parse(value) as T
}

export async function resolveConfig(): Promise<NotifierConfig> {
  const ccsDir =
    process.env.CCS_DIR ||
    (process.env.CCS_HOME
      ? path.join(process.env.CCS_HOME, ".ccs")
      : path.join(homedir(), ".ccs"))

  const unifiedConfigPath = path.join(ccsDir, "config.yaml")
  const cliproxyConfigPath = path.join(ccsDir, "cliproxy", "config.yaml")
  const unifiedConfig = parseYamlText<UnifiedConfig>(
    await readUtf8(unifiedConfigPath)
  )
  const cliproxyConfig = parseYamlText<CliproxyConfig>(
    await readUtf8(cliproxyConfigPath)
  )

  const port =
    unifiedConfig?.cliproxy_server?.local?.port ??
    cliproxyConfig?.port ??
    DEFAULT_PORT
  const authDir =
    process.env.CLIPROXY_AUTH_DIR?.trim() ||
    cliproxyConfig?.["auth-dir"]?.trim() ||
    path.join(ccsDir, "cliproxy", "auth")

  const webhookUrl = process.env.CUSTOM_TRIGGER_WEBHOOK_URL?.trim() || ""
  const webhookSecret = process.env.CUSTOM_TRIGGER_WEBHOOK_SECRET?.trim() || ""

  if (!webhookUrl) {
    throw new Error("Missing CUSTOM_TRIGGER_WEBHOOK_URL")
  }
  if (!webhookSecret) {
    throw new Error("Missing CUSTOM_TRIGGER_WEBHOOK_SECRET")
  }

  return {
    ccsDir,
    authDir,
    managementUrl:
      process.env.CLIPROXY_MANAGEMENT_URL?.trim()?.replace(/\/$/, "") ||
      `http://127.0.0.1:${port}`,
    managementSecret:
      process.env.CLIPROXY_MANAGEMENT_SECRET?.trim() ||
      unifiedConfig?.cliproxy?.auth?.management_secret?.trim() ||
      DEFAULT_MANAGEMENT_SECRET,
    webhookUrl,
    webhookSecret,
    stateDir: process.env.CCS_LIMIT_NOTIFIER_STATE_DIR?.trim() || DEFAULT_STATE_DIR,
    resetConfirmationPolls: Math.max(
      1,
      Math.floor(parseNumber(process.env.RESET_CONFIRMATION_POLLS, 2))
    ),
    resetFullTolerancePercent: Math.max(
      0,
      Math.min(5, parseNumber(process.env.RESET_FULL_TOLERANCE_PERCENT, 0))
    ),
    resetGroupWindowMinutes: Math.max(
      1,
      Math.floor(parseNumber(process.env.RESET_GROUP_WINDOW_MINUTES, 30))
    ),
    resetTimezone: process.env.RESET_TIMEZONE?.trim() || "Asia/Jakarta",
    sourceName: process.env.SOURCE_NAME?.trim() || hostname(),
    subjectApp: process.env.SUBJECT_APP?.trim() || "ccs-limit-notifier",
    subjectEnvironment:
      process.env.SUBJECT_ENVIRONMENT?.trim() || "production",
    machineName: process.env.MACHINE_NAME?.trim() || hostname(),
    dashboardUrl: process.env.DASHBOARD_URL?.trim() || undefined,
    retryAttempts: Math.max(
      1,
      Math.floor(parseNumber(process.env.WEBHOOK_RETRY_ATTEMPTS, 3))
    ),
    retryBaseDelayMs: Math.max(
      100,
      Math.floor(parseNumber(process.env.WEBHOOK_RETRY_BASE_DELAY_MS, 500))
    ),
  }
}
