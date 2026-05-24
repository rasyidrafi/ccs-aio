export type UnifiedConfig = {
  cliproxy?: {
    auth?: {
      management_secret?: string
    }
  }
  cliproxy_server?: {
    local?: {
      port?: number
    }
  }
}

export type CliproxyConfig = {
  port?: number
  "auth-dir"?: string
}

export type AuthFileApiEntry = {
  email?: string
  label?: string
  name?: string
  path?: string
  provider?: string
  success?: number
  failed?: number
  updated_at?: string
}

export type AuthFileRecord = {
  access_token?: string
  account_id?: string
  email?: string
  expired?: string
}

export type CodexUsageWindow = {
  used_percent?: number
  usedPercent?: number
  reset_after_seconds?: number | null
  resetAfterSeconds?: number | null
}

export type CodexUsageResponse = {
  plan_type?: string
  planType?: string
  rate_limit?: {
    secondary_window?: CodexUsageWindow
    secondaryWindow?: CodexUsageWindow
  } | null
  rateLimit?: {
    secondary_window?: CodexUsageWindow
    secondaryWindow?: CodexUsageWindow
  } | null
}

export type NotifierConfig = {
  ccsDir: string
  authDir: string
  managementUrl: string
  managementSecret: string
  webhookUrl: string
  webhookSecret: string
  stateDir: string
  resetConfirmationPolls: number
  resetFullTolerancePercent: number
  resetGroupWindowMinutes: number
  resetTimezone: string
  sourceName: string
  subjectApp: string
  subjectEnvironment: string
  machineName: string
  dashboardUrl?: string
  retryAttempts: number
  retryBaseDelayMs: number
}

export type WeeklyQuotaObservation = {
  accountKey: string
  accountLabel: string
  planType: string
  observedAt: string
  remaining: number
  limit: number
  availablePercent: number
  resetAt: string | null
  isFull: boolean
}

export type PendingReset = {
  firstFullObservedAt: string
  consecutiveFullObservations: number
  before: WeeklyQuotaObservation
  detectedAt?: string
}

export type AccountResetState = {
  lastObservation: WeeklyQuotaObservation | null
  pendingReset: PendingReset | null
  lastEmittedEventId: string | null
}

export type ResetState = {
  version: 1
  updatedAt: string
  accounts: Record<string, AccountResetState>
  pendingGroups: PendingResetGroup[]
}

export type ResetEvent = {
  eventId: string
  accountKey: string
  accountLabel: string
  planType: string
  detectedAt: string
  previousObservationAt: string
  before: {
    remaining: number
    limit: number
    availablePercent: number
  }
  after: {
    remaining: number
    limit: number
    availablePercent: number
  }
  confidence: "low" | "medium" | "high"
  reason: string
}

export type PendingResetGroup = {
  groupId: string
  firstDetectedAt: string
  lastDetectedAt: string
  events: ResetEvent[]
}

export type GroupedResetEvent = {
  groupId: string
  firstDetectedAt: string
  lastDetectedAt: string
  events: ResetEvent[]
}

export type ResetWebhookPayload = {
  event: "codex.limit.reset"
  source: string
  timestamp: string
  observed_reset: {
    detected_at: string
    previous_observation_at: string
    confidence: "low" | "medium" | "high"
    reason: string
  }
  period: {
    kind: "weekly"
    timezone: string
  }
  before: {
    remaining: number
    limit: number
    available_percent: number
  }
  after: {
    remaining: number
    limit: number
    available_percent: number
  }
  subject: {
    app: string
    environment: string
    machine: string
  }
  details: {
    message: string
    dashboard_url?: string
    grouped: boolean
    account_count: number
    account_labels: string[]
  }
  accounts: Array<{
    account_key: string
    account_label: string
    plan_type: string
    detected_at: string
    previous_observation_at: string
    before: {
      remaining: number
      limit: number
      available_percent: number
    }
    after: {
      remaining: number
      limit: number
      available_percent: number
    }
  }>
  grouping: {
    window_minutes: number
    first_detected_at: string
    last_detected_at: string
  }
}
