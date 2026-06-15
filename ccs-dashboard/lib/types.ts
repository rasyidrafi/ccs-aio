export type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "week"
  | "lastWeek"
  | "month"
  | "lastMonth"
  | "year"
  | "custom"
export type TrendGranularity =
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
export type TrendGranularityInput = TrendGranularity | "auto"
export type RowSourceState = "live" | "fallback" | "config"

export interface DashboardQuery {
  preset: DatePreset
  from?: string
  to?: string
  granularity?: TrendGranularityInput
}

export interface DashboardSourceBadge {
  label: string
  kind: "live" | "config" | "fallback" | "warning"
}

export interface DashboardTrendPoint {
  bucketStart: string
  label: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
  cost: number
}

export interface DashboardKeyRow {
  id: string
  displayName: string
  fingerprint: string
  maskedKey: string
  providerLabel: string
  requests: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  totalTokens: number
  cost: number
  modelsUsed: string[]
  lastUsed: string | null
  sourceState: RowSourceState
}

export interface DashboardModelRow {
  model: string
  requests: number
  tokens: number
  cost: number
}

export interface DashboardPayload {
  generatedAt: string
  range: {
    label: string
    from: string
    to: string
    granularity: TrendGranularity
    requestedGranularity: TrendGranularityInput | null
    resolvedGranularity: TrendGranularity
  }
  summary: {
    totalRequests: number
    totalTokens: number
    totalCost: number
    activeKeys: number
  }
  source: {
    mode: "live" | "fallback" | "mixed"
    managementUrl: string
    discoveredKeyCount: number
    lastUpdatedAt: string | null
    note: string | null
    badges: DashboardSourceBadge[]
  }
  trend: DashboardTrendPoint[]
  keys: DashboardKeyRow[]
  models: DashboardModelRow[]
}

export type AlertSeverity = "info" | "warning" | "urgent"

export interface LimitsQuotaWindow {
  label: string
  usedPercent: number
  remainingPercent: number
  resetAt: string | null
  resetAfterSeconds: number | null
}

export interface LimitsAdditionalPool {
  featureLabel: string
  displayLabel: string
  fiveHour: LimitsQuotaWindow | null
  weekly: LimitsQuotaWindow | null
}

export interface LimitsAlert {
  id: string
  severity: AlertSeverity
  title: string
  message: string
  accountLabel: string
}

export interface LimitsAccountRow {
  id: string
  email: string
  displayName: string
  planType: string | null
  status: "active" | "paused" | "expired" | "error"
  sourceLabel: string
  successCount: number
  failureCount: number
  updatedAt: string | null
  fiveHour: LimitsQuotaWindow | null
  weekly: LimitsQuotaWindow | null
  additionalPools: LimitsAdditionalPool[]
  alert: LimitsAlert | null
  error: string | null
}

export interface LimitsPayload {
  generatedAt: string
  summary: {
    totalAccounts: number
    activeAccounts: number
    resetSoonCount: number
    exhaustedWeeklyCount: number
  }
  alerts: LimitsAlert[]
  accounts: LimitsAccountRow[]
}

export interface BudgetRow {
  api_key_hash: string
  weekly_limit_usd: number
  week_start_date: string
  next_reset_date: string
  enabled: number
  created_at: string
  updated_at: string
  apiKeyName: string | null
  spentUsd: number
  remainingUsd: number
  percentUsed: number
  isOverBudget: boolean
  daysUntilReset: number
}

export interface ApiKeyEntry {
  hash: string
  name: string
  hasBudget: boolean
  budget: BudgetRow | null
}
