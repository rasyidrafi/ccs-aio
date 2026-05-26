import { homedir } from "node:os"
import path from "node:path"
import { readFile, readdir, stat } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"
import YAML from "yaml"

import { shortUsageHash } from "@/lib/redaction"
import type {
  DashboardKeyRow,
  DashboardPayload,
  DashboardQuery,
  DashboardSourceBadge,
  DashboardTrendPoint,
  TrendGranularity,
  TrendGranularityInput,
} from "@/lib/types"

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_PORT = 8097
const SERVING_SCHEMA_VERSION = "2"

interface DashboardWindow {
  label: string
  from: Date
  to: Date
}

interface TrendRow {
  bucket_start: string
  request_count: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cost: number
}

interface KeySummaryRow {
  provider_key: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_tokens: number
  total_tokens: number
  cost: number
  models_used: string | null
  last_used: string | null
  live_requests: number
  snapshot_requests: number
}

interface ModelSummaryRow {
  model: string
  requests: number
  tokens: number
  cost: number
}

interface ApiKeyNameCacheEntry {
  signature: string
  names: Map<string, string>
}

type RollupGranularity = "hourly" | "daily" | "monthly"
type RollupTableName = "rollup_hourly" | "rollup_daily" | "rollup_monthly"

let apiKeyNameCache: ApiKeyNameCacheEntry | null = null

function getDatabasePath(): string {
  return path.join(homedir(), ".ccs-dashboard", "data", "usage-v2.db")
}

function getCcsConfigPath(): string {
  return path.join(homedir(), ".ccs", "config.yaml")
}

function getCliproxyConfigPath(): string {
  return path.join(homedir(), ".ccs", "cliproxy", "config.yaml")
}

function getCliproxyConfigDirPath(): string {
  return path.join(homedir(), ".ccs", "cliproxy")
}

function parseGranularityInput(
  value: string | null
): TrendGranularityInput | undefined {
  if (
    value === "auto" ||
    value === "hourly" ||
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "yearly"
  ) {
    return value
  }
  return undefined
}

export function parseDashboardQuery(params: URLSearchParams): DashboardQuery {
  const preset = params.get("preset")
  const granularity = parseGranularityInput(params.get("granularity"))

  if (
    preset === "all" ||
    preset === "today" ||
    preset === "yesterday" ||
    preset === "week" ||
    preset === "lastWeek" ||
    preset === "month" ||
    preset === "lastMonth" ||
    preset === "year" ||
    preset === "custom"
  ) {
    return {
      preset,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      granularity,
    }
  }

  return { preset: "today", granularity }
}

async function readManagementUrl(): Promise<string> {
  try {
    const text = await readFile(getCcsConfigPath(), "utf8")
    const match = /(?:^|\n)\s*port:\s*([0-9]+)/m.exec(text)
    const port = Number(match?.[1])
    return `http://127.0.0.1:${Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT}`
  } catch {
    return `http://127.0.0.1:${DEFAULT_PORT}`
  }
}

function startOfToday(now: Date): Date {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date
}

function parseLocalDate(
  value: string | undefined,
  fallback: Date,
  endOfDay = false
): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback
  }

  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function resolveWindow(
  query: DashboardQuery,
  now = new Date()
): DashboardWindow {
  const today = startOfToday(now)

  if (query.preset === "today") {
    return { label: "Today", from: today, to: now }
  }

  if (query.preset === "yesterday") {
    const from = new Date(today)
    from.setDate(from.getDate() - 1)
    const to = new Date(today.getTime() - 1)
    return { label: "Yesterday", from, to }
  }

  if (query.preset === "week") {
    const from = new Date(today)
    const shift = (from.getDay() + 6) % 7
    from.setDate(from.getDate() - shift)
    return { label: "This week", from, to: now }
  }

  if (query.preset === "lastWeek") {
    const from = new Date(today)
    const shift = (from.getDay() + 6) % 7
    from.setDate(from.getDate() - shift - 7)
    const to = new Date(today)
    to.setDate(to.getDate() - shift)
    to.setMilliseconds(to.getMilliseconds() - 1)
    return { label: "Last week", from, to }
  }

  if (query.preset === "month") {
    const from = new Date(today)
    from.setDate(1)
    return { label: "This month", from, to: now }
  }

  if (query.preset === "lastMonth") {
    const from = new Date(today)
    from.setMonth(from.getMonth() - 1, 1)
    const to = new Date(today)
    to.setDate(0)
    to.setHours(23, 59, 59, 999)
    return { label: "Last month", from, to }
  }

  if (query.preset === "year") {
    const from = new Date(today)
    from.setMonth(0, 1)
    return { label: "This year", from, to: now }
  }

  if (query.preset === "custom") {
    const from = parseLocalDate(query.from, today)
    const to = parseLocalDate(query.to, now, true)
    if (from.getTime() > to.getTime()) {
      return { label: "Custom range", from: to, to: from }
    }
    return { label: "Custom range", from, to }
  }

  return { label: "All time", from: new Date("2000-01-01T00:00:00"), to: now }
}

function resolveGranularity(
  query: DashboardQuery,
  range: DashboardWindow
): TrendGranularity {
  if (query.granularity && query.granularity !== "auto") {
    return query.granularity
  }

  if (query.preset === "today") return "hourly"
  if (query.preset === "yesterday") return "hourly"
  if (query.preset === "week") return "daily"
  if (query.preset === "lastWeek") return "daily"
  if (query.preset === "month") return "daily"
  if (query.preset === "lastMonth") return "daily"
  if (query.preset === "year") return "monthly"
  if (query.preset === "all") return "monthly"

  const spanDays = Math.max(
    1,
    Math.ceil((range.to.getTime() - range.from.getTime()) / DAY_MS)
  )
  if (spanDays <= 31) return "daily"
  if (spanDays <= 365) return "monthly"
  return "yearly"
}

function startOfLocalBucket(
  date: Date,
  granularity: TrendGranularity | RollupGranularity
): Date {
  const bucket = new Date(date)
  if (granularity === "hourly") {
    bucket.setMinutes(0, 0, 0)
    return bucket
  }
  if (granularity === "daily") {
    bucket.setHours(0, 0, 0, 0)
    return bucket
  }
  if (granularity === "weekly") {
    bucket.setHours(0, 0, 0, 0)
    const shift = (bucket.getDay() + 6) % 7
    bucket.setDate(bucket.getDate() - shift)
    return bucket
  }
  if (granularity === "monthly") {
    bucket.setDate(1)
    bucket.setHours(0, 0, 0, 0)
    return bucket
  }
  bucket.setMonth(0, 1)
  bucket.setHours(0, 0, 0, 0)
  return bucket
}

function stepBucket(bucket: Date, granularity: TrendGranularity): Date {
  const next = new Date(bucket)
  if (granularity === "hourly") {
    next.setHours(next.getHours() + 1)
    return next
  }
  if (granularity === "daily") {
    next.setDate(next.getDate() + 1)
    return next
  }
  if (granularity === "weekly") {
    next.setDate(next.getDate() + 7)
    return next
  }
  if (granularity === "monthly") {
    next.setMonth(next.getMonth() + 1, 1)
    return next
  }
  next.setFullYear(next.getFullYear() + 1, 0, 1)
  return next
}

function formatLocalBucketStart(
  date: Date,
  granularity: RollupGranularity
): string {
  const bucket = startOfLocalBucket(date, granularity)
  const year = bucket.getFullYear()
  const month = `${bucket.getMonth() + 1}`.padStart(2, "0")
  const day = `${bucket.getDate()}`.padStart(2, "0")
  const hour = `${bucket.getHours()}`.padStart(2, "0")

  if (granularity === "hourly") {
    return `${year}-${month}-${day}T${hour}:00:00`
  }
  if (granularity === "daily") {
    return `${year}-${month}-${day}T00:00:00`
  }
  return `${year}-${month}-01T00:00:00`
}

function parseLocalBucket(value: string): Date {
  return new Date(value)
}

function formatBucketLabel(
  bucket: Date,
  granularity: TrendGranularity
): string {
  if (granularity === "hourly") {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
    }).format(bucket)
  }
  if (granularity === "daily") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(bucket)
  }
  if (granularity === "weekly") {
    const end = new Date(bucket)
    end.setDate(end.getDate() + 6)
    return `${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(bucket)}-${new Intl.DateTimeFormat("en-US", {
      day: "numeric",
    }).format(end)}`
  }
  if (granularity === "monthly") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
    }).format(bucket)
  }
  return String(bucket.getFullYear())
}

function resolveServingTable(query: DashboardQuery): {
  tableName: RollupTableName
  tableGranularity: RollupGranularity
} {
  if (query.preset === "today") {
    return { tableName: "rollup_hourly", tableGranularity: "hourly" }
  }
  if (query.preset === "yesterday") {
    return { tableName: "rollup_hourly", tableGranularity: "hourly" }
  }
  if (query.preset === "year" || query.preset === "all") {
    return { tableName: "rollup_monthly", tableGranularity: "monthly" }
  }
  return { tableName: "rollup_daily", tableGranularity: "daily" }
}

function resolveBucketExpression(granularity: TrendGranularity): string {
  if (granularity === "hourly") {
    return "strftime('%Y-%m-%dT%H:00:00', bucket_start)"
  }
  if (granularity === "daily") {
    return "strftime('%Y-%m-%dT00:00:00', bucket_start)"
  }
  if (granularity === "monthly") {
    return "strftime('%Y-%m-01T00:00:00', bucket_start)"
  }
  if (granularity === "yearly") {
    return "strftime('%Y-01-01T00:00:00', bucket_start)"
  }

  return `strftime(
    '%Y-%m-%dT00:00:00',
    datetime(
      bucket_start,
      printf(
        '-%d days',
        (
          CAST(strftime('%w', bucket_start) AS INTEGER) + 6
        ) % 7
      )
    )
  )`
}

function buildSourceBadges(
  mode: "live" | "fallback" | "mixed"
): DashboardSourceBadge[] {
  if (mode === "live") {
    return [{ label: "Live API", kind: "live" }]
  }
  if (mode === "mixed") {
    return [{ label: "Live + stored history", kind: "warning" }]
  }
  return [{ label: "Stored history", kind: "fallback" }]
}

async function readConfiguredApiKeyNames(): Promise<Map<string, string>> {
  const configFiles = new Set<string>([getCliproxyConfigPath()])

  try {
    try {
      const entries = await readdir(getCliproxyConfigDirPath(), {
        withFileTypes: true,
      })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!/^config(?:-\d+)?\.ya?ml$/i.test(entry.name)) continue
        configFiles.add(path.join(getCliproxyConfigDirPath(), entry.name))
      }
    } catch {
      // Fall back to the default config path if the directory scan is unavailable.
    }

    const sortedFiles = Array.from(configFiles).sort()
    const signatureParts = await Promise.all(
      sortedFiles.map(async (filePath) => {
        try {
          const fileStat = await stat(filePath)
          return `${filePath}:${fileStat.mtimeMs}:${fileStat.size}`
        } catch {
          return `${filePath}:missing`
        }
      })
    )
    const signature = signatureParts.join("|")

    if (apiKeyNameCache?.signature === signature) {
      return apiKeyNameCache.names
    }

    const names = new Map<string, string>()
    for (const filePath of sortedFiles) {
      const text = await readFile(filePath, "utf8")
      const parsed = YAML.parse(text) as { "api-keys"?: unknown } | null
      const apiKeys = Array.isArray(parsed?.["api-keys"])
        ? parsed["api-keys"]
        : []

      for (const entry of apiKeys) {
        if (typeof entry !== "string") continue
        const separatorIndex = entry.indexOf("-sk-")
        if (separatorIndex <= 0) continue

        const name = entry.slice(0, separatorIndex).trim()
        if (!name) continue

        names.set(shortUsageHash(entry).slice(0, 8), name)
      }
    }

    apiKeyNameCache = { signature, names }
    return names
  } catch {
    return new Map()
  }
}

function inferKeyMeta(
  providerKey: string,
  configuredName?: string
): Pick<
  DashboardKeyRow,
  "displayName" | "fingerprint" | "maskedKey" | "providerLabel"
> {
  const value = providerKey.replace(/^api-key:/, "")
  const fingerprint = value.slice(-4).toUpperCase() || "KEY"
  const providerLabel =
    configuredName ||
    (value.includes("claude")
      ? "Claude"
      : value.includes("gemini")
        ? "Gemini"
        : value.includes("codex") || value.includes("gpt")
          ? "Codex"
          : "API key")

  return {
    displayName:
      configuredName ||
      value
        .split(/[-_]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
    fingerprint,
    maskedKey: `sk-...${fingerprint}`,
    providerLabel,
  }
}

function readSyncValue(db: DatabaseSync, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM sync_state WHERE key = ?")
    .get(key) as { value?: string } | undefined
  return typeof row?.value === "string" ? row.value : null
}

function resolveTrendBucketBounds(
  query: DashboardQuery,
  granularity: TrendGranularity,
  range: DashboardWindow,
  trendRows: TrendRow[]
): { from: Date; to: Date } {
  if (query.preset !== "all" || trendRows.length === 0) {
    return { from: range.from, to: range.to }
  }

  if (granularity !== "monthly" && granularity !== "yearly") {
    return { from: range.from, to: range.to }
  }

  const firstBucket = startOfLocalBucket(
    parseLocalBucket(trendRows[0].bucket_start),
    granularity
  )
  const latestBucket = startOfLocalBucket(
    parseLocalBucket(trendRows[trendRows.length - 1].bucket_start),
    granularity
  )
  return {
    from: firstBucket,
    to: latestBucket,
  }
}

function emptyPayload(
  query: DashboardQuery,
  managementUrl: string,
  note: string
): DashboardPayload {
  const range = resolveWindow(query)
  const resolvedGranularity = resolveGranularity(query, range)
  return {
    generatedAt: new Date().toISOString(),
    range: {
      label: range.label,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      granularity: resolvedGranularity,
      requestedGranularity: query.granularity ?? null,
      resolvedGranularity,
    },
    summary: {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      activeKeys: 0,
    },
    source: {
      mode: "fallback",
      managementUrl,
      discoveredKeyCount: 0,
      lastUpdatedAt: null,
      note,
      badges: [{ label: "Stored history", kind: "fallback" }],
    },
    trend: [],
    keys: [],
    models: [],
  }
}

export async function getDashboardPayload(
  query: DashboardQuery
): Promise<DashboardPayload> {
  const managementUrl = await readManagementUrl()
  const configuredApiKeyNames = await readConfiguredApiKeyNames()
  const dbPath = getDatabasePath()

  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
  } catch {
    return emptyPayload(
      query,
      managementUrl,
      "No dashboard database was found at ~/.ccs-dashboard/data/usage-v2.db. Run ccs-backup sync or backfill old data first."
    )
  }

  try {
    const servingSchemaVersion = readSyncValue(db, "serving.schema_version")
    if (servingSchemaVersion !== SERVING_SCHEMA_VERSION) {
      return emptyPayload(
        query,
        managementUrl,
        "Serving tables are not ready for this dashboard version. Run ccs-backup rebuild-rollups once."
      )
    }

    const range = resolveWindow(query)
    const resolvedGranularity = resolveGranularity(query, range)
    const { tableName, tableGranularity } = resolveServingTable(query)
    const rangeFromBucket = formatLocalBucketStart(range.from, tableGranularity)
    const rangeToBucket = formatLocalBucketStart(range.to, tableGranularity)

    const bucketExpression = resolveBucketExpression(resolvedGranularity)
    const trendRows = db
      .prepare(
        `SELECT
        ${bucketExpression} as bucket_start,
        SUM(request_count) as request_count,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cache_read_tokens) as cache_read_tokens,
        SUM(cost) as cost
      FROM ${tableName}
      WHERE bucket_start BETWEEN ? AND ?
      GROUP BY ${bucketExpression}
      ORDER BY ${bucketExpression} ASC`
      )
      .all(rangeFromBucket, rangeToBucket) as unknown as TrendRow[]

    const keyRows = db
      .prepare(
        `SELECT
        provider_key,
        SUM(request_count) as requests,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cache_read_tokens) as cache_tokens,
        SUM(input_tokens + output_tokens + cache_read_tokens) as total_tokens,
        SUM(cost) as cost,
        GROUP_CONCAT(DISTINCT model) as models_used,
        MAX(last_event_at) as last_used,
        SUM(live_request_count) as live_requests,
        SUM(snapshot_request_count) as snapshot_requests
      FROM ${tableName}
      WHERE bucket_start BETWEEN ? AND ?
      GROUP BY provider_key
      ORDER BY cost DESC, requests DESC`
      )
      .all(rangeFromBucket, rangeToBucket) as unknown as KeySummaryRow[]

    const modelRows = db
      .prepare(
        `SELECT
        model,
        SUM(request_count) as requests,
        SUM(input_tokens + output_tokens + cache_read_tokens) as tokens,
        SUM(cost) as cost
      FROM ${tableName}
      WHERE bucket_start BETWEEN ? AND ?
      GROUP BY model
      ORDER BY cost DESC, requests DESC`
      )
      .all(rangeFromBucket, rangeToBucket) as unknown as ModelSummaryRow[]

    const trendBucketBounds = resolveTrendBucketBounds(
      query,
      resolvedGranularity,
      range,
      trendRows
    )
    const trendMap = new Map<string, DashboardTrendPoint>()
    for (
      let bucket = startOfLocalBucket(
        trendBucketBounds.from,
        resolvedGranularity
      );
      bucket.getTime() <= trendBucketBounds.to.getTime();
      bucket = stepBucket(bucket, resolvedGranularity)
    ) {
      const key = bucket.toISOString()
      trendMap.set(key, {
        bucketStart: key,
        label: formatBucketLabel(bucket, resolvedGranularity),
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        cost: 0,
      })
    }

    for (const row of trendRows) {
      const bucketKey = startOfLocalBucket(
        parseLocalBucket(row.bucket_start),
        resolvedGranularity
      ).toISOString()
      const bucket = trendMap.get(bucketKey)
      if (!bucket) continue
      bucket.requests = row.request_count
      bucket.inputTokens = row.input_tokens
      bucket.outputTokens = row.output_tokens
      bucket.cacheReadTokens = row.cache_read_tokens
      bucket.totalTokens =
        row.input_tokens + row.output_tokens + row.cache_read_tokens
      bucket.cost = row.cost
    }

    const keys: DashboardKeyRow[] = keyRows.map((row) => {
      const keyHash = row.provider_key.replace(/^api-key:/, "").toLowerCase()
      const inferred = inferKeyMeta(
        row.provider_key,
        configuredApiKeyNames.get(keyHash)
      )
      return {
        id: row.provider_key,
        ...inferred,
        requests: row.requests,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheTokens: row.cache_tokens,
        totalTokens: row.total_tokens,
        cost: row.cost,
        modelsUsed: row.models_used
          ? row.models_used.split(",").filter(Boolean).sort()
          : [],
        lastUsed: row.last_used,
        sourceState: row.live_requests > 0 ? "live" : "fallback",
      }
    })

    const hasLive = keyRows.some((row) => row.live_requests > 0)
    const hasSnapshot = keyRows.some((row) => row.snapshot_requests > 0)
    const mode: "live" | "fallback" | "mixed" =
      hasLive && hasSnapshot ? "mixed" : hasLive ? "live" : "fallback"

    const totalRequests = keys.reduce((sum, row) => sum + row.requests, 0)
    const totalTokens = keys.reduce((sum, row) => sum + row.totalTokens, 0)
    const totalCost = keys.reduce((sum, row) => sum + row.cost, 0)
    const lastUpdatedAt = readSyncValue(db, "serving.last_updated_at")

    return {
      generatedAt: new Date().toISOString(),
      range: {
        label: range.label,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        granularity: resolvedGranularity,
        requestedGranularity: query.granularity ?? null,
        resolvedGranularity,
      },
      summary: {
        totalRequests,
        totalTokens,
        totalCost,
        activeKeys: keys.length,
      },
      source: {
        mode,
        managementUrl,
        discoveredKeyCount: keys.length,
        lastUpdatedAt,
        note:
          keys.length > 0
            ? `Served entirely from local serving tables in ~/.ccs-dashboard/data/usage-v2.db. Last rollup update: ${lastUpdatedAt ?? "unknown"}.`
            : "Database is available but there is no usage data for the selected range.",
        badges: buildSourceBadges(mode),
      },
      trend: Array.from(trendMap.values()),
      keys,
      models: modelRows.map((row) => ({
        model: row.model,
        requests: row.requests,
        tokens: row.tokens,
        cost: row.cost,
      })),
    }
  } finally {
    db.close()
  }
}
