export type DatePreset = "all" | "today" | "week" | "month" | "year" | "custom";
export type TrendGranularity = "hourly" | "daily" | "weekly" | "monthly" | "yearly";
export type TrendGranularityInput = TrendGranularity | "auto";
export type RowSourceState = "live" | "fallback" | "config";

export interface DashboardQuery {
  preset: DatePreset;
  from?: string;
  to?: string;
  granularity?: TrendGranularityInput;
}

export interface DashboardSourceBadge {
  label: string;
  kind: "live" | "config" | "fallback" | "warning";
}

export interface DashboardTrendPoint {
  bucketStart: string;
  label: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: number;
}

export interface DashboardKeyRow {
  id: string;
  displayName: string;
  fingerprint: string;
  maskedKey: string;
  providerLabel: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  cost: number;
  modelsUsed: string[];
  lastUsed: string | null;
  sourceState: RowSourceState;
}

export interface DashboardModelRow {
  model: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface DashboardPayload {
  generatedAt: string;
  range: {
    label: string;
    from: string;
    to: string;
    granularity: TrendGranularity;
    requestedGranularity: TrendGranularityInput | null;
    resolvedGranularity: TrendGranularity;
  };
  summary: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    activeKeys: number;
  };
  source: {
    mode: "live" | "fallback" | "mixed";
    managementUrl: string;
    discoveredKeyCount: number;
    lastUpdatedAt: string | null;
    note: string | null;
    badges: DashboardSourceBadge[];
  };
  trend: DashboardTrendPoint[];
  keys: DashboardKeyRow[];
  models: DashboardModelRow[];
}
