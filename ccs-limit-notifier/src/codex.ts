import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

import type {
  AuthFileApiEntry,
  AuthFileRecord,
  CodexUsageResponse,
  NotifierConfig,
  WeeklyQuotaObservation,
} from "./types.ts"

const CODEX_API_BASE = "https://chatgpt.com/backend-api"
const CODEX_USER_AGENT =
  "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal"
const WEEKLY_LIMIT = 100

async function readUtf8(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8")
  } catch {
    return null
  }
}

function parseJsonText<T>(value: string | null): T | null {
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

async function fetchManagementAuthFiles(
  config: NotifierConfig
): Promise<AuthFileApiEntry[]> {
  try {
    const response = await fetch(
      `${config.managementUrl}/v0/management/auth-files`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.managementSecret}`,
        },
      }
    )
    if (!response.ok) return []

    const body = (await response.json()) as { files?: AuthFileApiEntry[] }
    return Array.isArray(body.files)
      ? body.files.filter((entry) => entry.provider === "codex")
      : []
  } catch {
    return []
  }
}

async function scanLocalCodexAuthFiles(authDir: string): Promise<AuthFileApiEntry[]> {
  try {
    const names = await readdir(authDir)
    return names
      .filter((name) => name.startsWith("codex") && name.endsWith(".json"))
      .map((name) => ({
        name,
        path: path.join(authDir, name),
        provider: "codex",
      }))
  } catch {
    return []
  }
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const value = new Date(expiresAt).getTime()
  return Number.isFinite(value) && value <= Date.now()
}

function normalizePlanType(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? ""
  if (!normalized) return null
  if (
    normalized === "business" ||
    normalized === "team" ||
    normalized === "blue"
  )
    return "team"
  return normalized
}

function normalizePercent(value: number): number {
  return Math.round(value * 100) / 100
}

async function fetchWeeklyQuota(
  auth: AuthFileRecord
): Promise<{
  planType: string | null
  remaining: number
  availablePercent: number
  resetAt: string | null
} | null> {
  if (!auth.access_token || !auth.account_id) {
    throw new Error("Missing Codex auth token or account id")
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)

  try {
    const response = await fetch(`${CODEX_API_BASE}/wham/usage`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${auth.access_token}`,
        "ChatGPT-Account-Id": auth.account_id,
        "User-Agent": CODEX_USER_AGENT,
      },
    })

    if (!response.ok) {
      throw new Error(`Quota request failed with HTTP ${response.status}`)
    }

    const payload = (await response.json()) as CodexUsageResponse
    normalizePlanType((payload.plan_type || payload.planType || null)?.toString())
    const rateLimit = payload.rate_limit || payload.rateLimit
    const weekly = rateLimit?.secondary_window || rateLimit?.secondaryWindow
    if (!weekly) return null

    const usedPercentRaw = weekly.used_percent ?? weekly.usedPercent ?? 0
    const usedPercent = Math.max(0, Math.min(100, Number(usedPercentRaw) || 0))
    const remaining = normalizePercent(100 - usedPercent)
    const resetAfterSecondsRaw =
      weekly.reset_after_seconds ?? weekly.resetAfterSeconds ?? null
    const resetAfterSeconds =
      typeof resetAfterSecondsRaw === "number" &&
      Number.isFinite(resetAfterSecondsRaw)
        ? Math.max(0, resetAfterSecondsRaw)
        : null

    return {
      planType: normalizePlanType(
        (payload.plan_type || payload.planType || null)?.toString()
      ),
      remaining,
      availablePercent: remaining,
      resetAt:
        resetAfterSeconds !== null
          ? new Date(Date.now() + resetAfterSeconds * 1000).toISOString()
          : null,
    }
  } finally {
    clearTimeout(timer)
  }
}

export function isFullCapacity(
  availablePercent: number,
  tolerancePercent: number
): boolean {
  return availablePercent >= WEEKLY_LIMIT - tolerancePercent
}

function isPaidPlan(planType: string | null): planType is string {
  return Boolean(planType && planType !== "free")
}

export async function getWeeklyQuotaObservations(
  config: NotifierConfig
): Promise<WeeklyQuotaObservation[]> {
  const discovered = await fetchManagementAuthFiles(config)
  const sourceFiles =
    discovered.length > 0
      ? discovered
      : await scanLocalCodexAuthFiles(config.authDir)

  const observations = await Promise.all(
    sourceFiles.map(async (entry): Promise<WeeklyQuotaObservation | null> => {
      const filePath = entry.path || path.join(config.authDir, entry.name || "")
      const sourceLabel = entry.name || path.basename(filePath)
      const raw = await readUtf8(filePath)
      const auth = parseJsonText<AuthFileRecord>(raw)
      if (!auth || isExpired(auth.expired)) return null

      try {
        const weekly = await fetchWeeklyQuota(auth)
        if (!weekly || !isPaidPlan(weekly.planType)) return null

        return {
          accountKey: sourceLabel,
          accountLabel: entry.label?.trim() || entry.email?.trim() || sourceLabel,
          planType: weekly.planType,
          observedAt: new Date().toISOString(),
          remaining: weekly.remaining,
          limit: WEEKLY_LIMIT,
          availablePercent: weekly.availablePercent,
          resetAt: weekly.resetAt,
          isFull: isFullCapacity(
            weekly.availablePercent,
            config.resetFullTolerancePercent
          ),
        }
      } catch {
        return null
      }
    })
  )

  return observations.filter((value): value is WeeklyQuotaObservation => value !== null)
}
