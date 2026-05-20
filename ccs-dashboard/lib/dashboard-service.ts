import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import type {
  DashboardKeyRow,
  DashboardModelRow,
  DashboardPayload,
  DashboardQuery,
  DashboardSourceBadge,
  DashboardTrendPoint,
  DatePreset,
  TrendGranularity,
  TrendGranularityInput,
} from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PORT = 8097;

interface DashboardWindow {
  label: string;
  from: Date;
  to: Date;
}

interface RollupRow {
  bucket_start: string;
  provider_key: string;
  model: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost: number;
  failed_count: number;
}

interface SummaryRow {
  total_requests: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  total_cost: number | null;
  active_keys: number | null;
}

interface KeyRollupRow {
  provider_key: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
  total_tokens: number;
  cost: number;
  models_used: string | null;
}

interface KeyMetaRow {
  provider_key: string;
  last_used: string | null;
  source_rank: number;
}

interface ModelRow {
  model: string;
  requests: number;
  tokens: number;
  cost: number;
}

interface ModeRow {
  live_count: number;
  snapshot_count: number;
  discovered_key_count: number;
}

function getDatabasePath(): string {
  return path.join(homedir(), ".ccs-dashboard", "data", "usage-v2.db");
}

function getCcsConfigPath(): string {
  return path.join(homedir(), ".ccs", "config.yaml");
}

function parseGranularityInput(value: string | null): TrendGranularityInput | undefined {
  if (
    value === "auto" ||
    value === "hourly" ||
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "yearly"
  ) {
    return value;
  }
  return undefined;
}

export function parseDashboardQuery(params: URLSearchParams): DashboardQuery {
  const preset = params.get("preset");
  const granularity = parseGranularityInput(params.get("granularity"));

  if (
    preset === "all" ||
    preset === "today" ||
    preset === "week" ||
    preset === "month" ||
    preset === "year" ||
    preset === "custom"
  ) {
    return {
      preset,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      granularity,
    };
  }

  return { preset: "today", granularity };
}

async function readManagementUrl(): Promise<string> {
  try {
    const text = await readFile(getCcsConfigPath(), "utf8");
    const match = /(?:^|\n)\s*port:\s*([0-9]+)/m.exec(text);
    const port = Number(match?.[1]);
    return `http://127.0.0.1:${Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT}`;
  } catch {
    return `http://127.0.0.1:${DEFAULT_PORT}`;
  }
}

function startOfToday(now: Date): Date {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}

function resolveWindow(query: DashboardQuery, now = new Date()): DashboardWindow {
  const today = startOfToday(now);

  if (query.preset === "today") {
    return { label: "Today", from: today, to: now };
  }

  if (query.preset === "week") {
    const from = new Date(today);
    const shift = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - shift);
    return { label: "This week", from, to: now };
  }

  if (query.preset === "month") {
    const from = new Date(today);
    from.setDate(1);
    return { label: "This month", from, to: now };
  }

  if (query.preset === "year") {
    const from = new Date(today);
    from.setMonth(0, 1);
    return { label: "This year", from, to: now };
  }

  if (query.preset === "custom") {
    const from = query.from ? new Date(`${query.from}T00:00:00`) : today;
    const to = query.to ? new Date(`${query.to}T23:59:59.999`) : now;
    return { label: "Custom range", from, to };
  }

  return { label: "All time", from: new Date("2000-01-01T00:00:00.000Z"), to: now };
}

function resolveGranularity(query: DashboardQuery, range: DashboardWindow): TrendGranularity {
  if (query.granularity && query.granularity !== "auto") {
    return query.granularity;
  }

  if (query.preset === "today") return "hourly";
  if (query.preset === "week") return "daily";
  if (query.preset === "month") return "daily";
  if (query.preset === "year") return "monthly";
  if (query.preset === "all") return "monthly";

  const spanDays = Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / DAY_MS));
  if (spanDays <= 31) return "daily";
  if (spanDays <= 365) return "monthly";
  return "yearly";
}

function toIsoDate(value: Date): string {
  return value.toISOString();
}

function startOfUtcBucket(date: Date, granularity: TrendGranularity): Date {
  const bucket = new Date(date);
  if (granularity === "hourly") {
    bucket.setUTCMinutes(0, 0, 0);
    return bucket;
  }
  if (granularity === "daily") {
    bucket.setUTCHours(0, 0, 0, 0);
    return bucket;
  }
  if (granularity === "weekly") {
    bucket.setUTCHours(0, 0, 0, 0);
    const shift = (bucket.getUTCDay() + 6) % 7;
    bucket.setUTCDate(bucket.getUTCDate() - shift);
    return bucket;
  }
  if (granularity === "monthly") {
    bucket.setUTCDate(1);
    bucket.setUTCHours(0, 0, 0, 0);
    return bucket;
  }
  bucket.setUTCMonth(0, 1);
  bucket.setUTCHours(0, 0, 0, 0);
  return bucket;
}

function stepBucket(bucket: Date, granularity: TrendGranularity): Date {
  const next = new Date(bucket);
  if (granularity === "hourly") {
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }
  if (granularity === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (granularity === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (granularity === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    return next;
  }
  next.setUTCFullYear(next.getUTCFullYear() + 1, 0, 1);
  return next;
}

function formatBucketLabel(bucket: Date, granularity: TrendGranularity): string {
  if (granularity === "hourly") {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(bucket);
  }
  if (granularity === "daily") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(bucket);
  }
  if (granularity === "weekly") {
    const end = new Date(bucket);
    end.setUTCDate(end.getUTCDate() + 6);
    return `${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(bucket)}-${new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      timeZone: "UTC",
    }).format(end)}`;
  }
  if (granularity === "monthly") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(bucket);
  }
  return String(bucket.getUTCFullYear());
}

function getTrendSourceTable(granularity: TrendGranularity): "rollup_hourly" | "rollup_daily" | "rollup_monthly" {
  if (granularity === "hourly") return "rollup_hourly";
  if (granularity === "monthly" || granularity === "yearly") return "rollup_monthly";
  return "rollup_daily";
}

function emptyPayload(
  query: DashboardQuery,
  managementUrl: string,
  note: string
): DashboardPayload {
  const range = resolveWindow(query);
  const resolvedGranularity = resolveGranularity(query, range);
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
      note,
      badges: [{ label: "Stored history", kind: "fallback" }],
    },
    trend: [],
    keys: [],
    models: [],
  };
}

function buildSourceBadges(mode: "live" | "fallback" | "mixed"): DashboardSourceBadge[] {
  if (mode === "live") {
    return [{ label: "Live API", kind: "live" }];
  }
  if (mode === "mixed") {
    return [{ label: "Live + stored history", kind: "warning" }];
  }
  return [{ label: "Stored history", kind: "fallback" }];
}

function inferKeyMeta(providerKey: string): Pick<DashboardKeyRow, "displayName" | "fingerprint" | "maskedKey" | "providerLabel"> {
  const value = providerKey.replace(/^api-key:/, "");
  const fingerprint = value.slice(-4).toUpperCase() || "KEY";
  const providerLabel = value.includes("claude")
    ? "Claude"
    : value.includes("gemini")
      ? "Gemini"
      : value.includes("codex") || value.includes("gpt")
        ? "Codex"
        : "API key";
  return {
    displayName: value
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    fingerprint,
    maskedKey: `sk-...${fingerprint}`,
    providerLabel,
  };
}

export async function getDashboardPayload(query: DashboardQuery): Promise<DashboardPayload> {
  const managementUrl = await readManagementUrl();
  const dbPath = getDatabasePath();

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return emptyPayload(
      query,
      managementUrl,
      "No dashboard database was found at ~/.ccs-dashboard/data/usage-v2.db. Run ccs-backup sync or backfill old data first."
    );
  }

  try {
    const range = resolveWindow(query);
    const resolvedGranularity = resolveGranularity(query, range);
    const rangeFromIso = toIsoDate(range.from);
    const rangeToIso = toIsoDate(range.to);

    const summary = db
      .prepare(
        `SELECT
          SUM(request_count) as total_requests,
          SUM(input_tokens) as input_tokens,
          SUM(output_tokens) as output_tokens,
          SUM(cache_read_tokens) as cache_read_tokens,
          SUM(cost) as total_cost,
          COUNT(DISTINCT provider_key) as active_keys
        FROM rollup_daily
        WHERE bucket_start BETWEEN ? AND ?`
      )
      .get(rangeFromIso, rangeToIso) as unknown as SummaryRow;

    const trendSourceTable = getTrendSourceTable(resolvedGranularity);
    const trendRows = db
      .prepare(
        `SELECT
          bucket_start,
          provider_key,
          model,
          request_count,
          input_tokens,
          output_tokens,
          cache_read_tokens,
          cost,
          failed_count
        FROM ${trendSourceTable}
        WHERE bucket_start BETWEEN ? AND ?
        ORDER BY bucket_start ASC`
      )
      .all(rangeFromIso, rangeToIso) as unknown as RollupRow[];

    const trendMap = new Map<string, DashboardTrendPoint>();
    for (
      let bucket = startOfUtcBucket(range.from, resolvedGranularity);
      bucket.getTime() <= range.to.getTime();
      bucket = stepBucket(bucket, resolvedGranularity)
    ) {
      const key = bucket.toISOString();
      trendMap.set(key, {
        bucketStart: key,
        label: formatBucketLabel(bucket, resolvedGranularity),
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        cost: 0,
      });
    }

    for (const row of trendRows) {
      const bucketKey = startOfUtcBucket(new Date(row.bucket_start), resolvedGranularity).toISOString();
      const bucket = trendMap.get(bucketKey);
      if (!bucket) continue;
      bucket.requests += row.request_count;
      bucket.inputTokens += row.input_tokens;
      bucket.outputTokens += row.output_tokens;
      bucket.cacheReadTokens += row.cache_read_tokens;
      bucket.totalTokens += row.input_tokens + row.output_tokens + row.cache_read_tokens;
      bucket.cost += row.cost;
    }

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
          GROUP_CONCAT(DISTINCT model) as models_used
        FROM rollup_daily
        WHERE bucket_start BETWEEN ? AND ?
        GROUP BY provider_key
        ORDER BY cost DESC, requests DESC`
      )
      .all(rangeFromIso, rangeToIso) as unknown as KeyRollupRow[];

    const keyMetaRows = db
      .prepare(
        `SELECT
          provider_key,
          MAX(timestamp) as last_used,
          MAX(CASE
            WHEN live_seen = 1 THEN 2
            WHEN snapshot_seen = 1 THEN 1
            ELSE 0
          END) as source_rank
        FROM raw_usage_events
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY provider_key`
      )
      .all(rangeFromIso, rangeToIso) as unknown as KeyMetaRow[];
    const keyMetaMap = new Map(keyMetaRows.map((row) => [row.provider_key, row]));

    const keys: DashboardKeyRow[] = keyRows.map((row) => {
      const meta = keyMetaMap.get(row.provider_key);
      const inferred = inferKeyMeta(row.provider_key);
      return {
        id: row.provider_key,
        ...inferred,
        requests: row.requests,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheTokens: row.cache_tokens,
        totalTokens: row.total_tokens,
        cost: row.cost,
        modelsUsed: row.models_used ? row.models_used.split(",").filter(Boolean).sort() : [],
        lastUsed: meta?.last_used ?? null,
        sourceState: (meta?.source_rank ?? 0) >= 2 ? "live" : "fallback",
      };
    });

    const models = db
      .prepare(
        `SELECT
          model,
          SUM(request_count) as requests,
          SUM(input_tokens + output_tokens + cache_read_tokens) as tokens,
          SUM(cost) as cost
        FROM rollup_daily
        WHERE bucket_start BETWEEN ? AND ?
        GROUP BY model
        ORDER BY cost DESC, requests DESC`
      )
      .all(rangeFromIso, rangeToIso) as unknown as DashboardModelRow[];

    const modeRow = db
      .prepare(
        `SELECT
          SUM(CASE WHEN live_seen = 1 THEN 1 ELSE 0 END) as live_count,
          SUM(CASE WHEN snapshot_seen = 1 THEN 1 ELSE 0 END) as snapshot_count,
          COUNT(DISTINCT provider_key) as discovered_key_count
        FROM raw_usage_events
        WHERE timestamp BETWEEN ? AND ?`
      )
      .get(rangeFromIso, rangeToIso) as unknown as ModeRow;

    const mode: "live" | "fallback" | "mixed" =
      (modeRow.live_count ?? 0) > 0 && (modeRow.snapshot_count ?? 0) > 0
        ? "mixed"
        : (modeRow.live_count ?? 0) > 0
          ? "live"
          : "fallback";

    const hasAnyData = (summary?.total_requests ?? 0) > 0;

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
        totalRequests: summary?.total_requests ?? 0,
        totalTokens:
          (summary?.input_tokens ?? 0) + (summary?.output_tokens ?? 0) + (summary?.cache_read_tokens ?? 0),
        totalCost: summary?.total_cost ?? 0,
        activeKeys: summary?.active_keys ?? 0,
      },
      source: {
        mode,
        managementUrl,
        discoveredKeyCount: modeRow?.discovered_key_count ?? 0,
        note: hasAnyData
          ? "Served from ~/.ccs-dashboard/data/usage-v2.db rollups and raw event metadata."
          : "Database is available but there is no usage data for the selected range.",
        badges: buildSourceBadges(mode),
      },
      trend: Array.from(trendMap.values()),
      keys,
      models: models.map((row) => ({
        model: row.model,
        requests: row.requests,
        tokens: row.tokens,
        cost: row.cost,
      })),
    };
  } finally {
    db.close();
  }
}
