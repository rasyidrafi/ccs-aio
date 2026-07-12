import { Database } from "bun:sqlite";
import { config } from "./config";

let usageDb: Database | null = null;
let pricingReady = false;
let cachedDataVersion = -1;
const costCache = new Map<string, number>();
const MAX_COST_CACHE_ENTRIES = 4_096;

function readSyncValue(db: Database, key: string): string | null {
  const row = db
    .query("SELECT value FROM sync_state WHERE key = ?")
    .get(key) as { value?: string } | null;
  return typeof row?.value === "string" ? row.value : null;
}

function ensureCanonicalPricing(db: Database): void {
  if (pricingReady) return;
  const schemaVersion = Number(readSyncValue(db, "serving.schema_version"));
  const pricingVersion = readSyncValue(db, "pricing.version");
  if (!Number.isFinite(schemaVersion) || schemaVersion < 3 || !pricingVersion) {
    throw new Error(
      "Usage pricing is not initialized. Run `bun run reprice` in ccs-backup."
    );
  }
  pricingReady = true;
}

export function getUsageDb(): Database {
  if (usageDb) return usageDb;
  usageDb = new Database(config.usageDbPath, { readonly: true });
  ensureCanonicalPricing(usageDb);
  return usageDb;
}

function refreshCostCache(db: Database): void {
  const row = db.query("PRAGMA data_version").get() as {
    data_version: number;
  };
  if (row.data_version !== cachedDataVersion) {
    cachedDataVersion = row.data_version;
    costCache.clear();
  }
}

function readCachedCost(key: string): number | undefined {
  return costCache.get(key);
}

function cacheCost(key: string, cost: number): void {
  if (costCache.size >= MAX_COST_CACHE_ENTRIES) costCache.clear();
  costCache.set(key, cost);
}

function dateCostKey(
  providerKey: string,
  startBucket: string,
  endBucket: string,
): string {
  return `d\0${providerKey}\0${startBucket}\0${endBucket}`;
}

function timestampCostKey(
  providerKey: string,
  startMs: number,
  endMs: number,
): string {
  return `t\0${providerKey}\0${startMs}\0${endMs}`;
}

/**
 * Get total cost for a provider_key in a date window.
 * Queries rollup_daily, where bucket_start is stored as YYYY-MM-DDT00:00:00.
 */
export function getCostForDateWindow(
  providerKey: string,
  startDateInclusive: string,
  endDateExclusive: string
): number {
  const db = getUsageDb();
  const startBucket = `${startDateInclusive}T00:00:00`;
  const endBucket = `${endDateExclusive}T00:00:00`;
  refreshCostCache(db);
  const cacheKey = dateCostKey(providerKey, startBucket, endBucket);
  const cached = readCachedCost(cacheKey);
  if (cached !== undefined) return cached;
  const row = db
    .query(
      `SELECT COALESCE(SUM(cost), 0) as total
       FROM rollup_daily
       WHERE provider_key = ?
         AND bucket_start >= ?
         AND bucket_start < ?`
    )
    .get(providerKey, startBucket, endBucket) as { total: number } | null;
  const total = row?.total ?? 0;
  cacheCost(cacheKey, total);
  return total;
}

function timestampMs(value: string): number {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value.includes("T")
      ? value
      : `${value.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid usage timestamp: ${value}`);
  }
  return ms;
}

/**
 * Get total cost for a provider_key in an exact timestamp window.
 */
export function getCostForTimestampWindow(
  providerKey: string,
  startInclusive: string,
  endExclusive: string
): number {
  const db = getUsageDb();
  const startMs = timestampMs(startInclusive);
  const endMs = timestampMs(endExclusive);
  refreshCostCache(db);
  const cacheKey = timestampCostKey(providerKey, startMs, endMs);
  const cached = readCachedCost(cacheKey);
  if (cached !== undefined) return cached;
  const row = db
    .query(
      `SELECT COALESCE(SUM(cost), 0) as total
       FROM raw_usage_events
       WHERE provider_key = ?
         AND timestamp_ms >= ?
         AND timestamp_ms < ?`
    )
    .get(providerKey, startMs, endMs) as { total: number } | null;
  const total = row?.total ?? 0;
  cacheCost(cacheKey, total);
  return total;
}
export function getCostsForDateWindow(
  providerKeys: string[],
  startDateInclusive: string,
  endDateExclusive: string,
): Map<string, number> {
  const db = getUsageDb();
  const startBucket = `${startDateInclusive}T00:00:00`;
  const endBucket = `${endDateExclusive}T00:00:00`;
  refreshCostCache(db);

  const result = new Map<string, number>();
  const missing: string[] = [];
  for (const providerKey of providerKeys) {
    const cached = readCachedCost(
      dateCostKey(providerKey, startBucket, endBucket),
    );
    if (cached === undefined) {
      missing.push(providerKey);
    } else {
      result.set(providerKey, cached);
    }
  }

  if (missing.length > 0) {
    const placeholders = missing.map(() => "?").join(",");
    const rows = db
      .query(
        `SELECT provider_key, COALESCE(SUM(cost), 0) AS total
         FROM rollup_daily
         WHERE provider_key IN (${placeholders})
           AND bucket_start >= ?
           AND bucket_start < ?
         GROUP BY provider_key`,
      )
      .all(...missing, startBucket, endBucket) as Array<{
        provider_key: string;
        total: number;
      }>;
    const totals = new Map(rows.map((row) => [row.provider_key, row.total]));
    for (const providerKey of missing) {
      const total = totals.get(providerKey) ?? 0;
      cacheCost(dateCostKey(providerKey, startBucket, endBucket), total);
      result.set(providerKey, total);
    }
  }

  return result;
}

export function getCostsForTimestampWindow(
  providerKeys: string[],
  startInclusive: string,
  endExclusive: string,
): Map<string, number> {
  const db = getUsageDb();
  const startMs = timestampMs(startInclusive);
  const endMs = timestampMs(endExclusive);
  refreshCostCache(db);

  const result = new Map<string, number>();
  const missing: string[] = [];
  for (const providerKey of providerKeys) {
    const cached = readCachedCost(
      timestampCostKey(providerKey, startMs, endMs),
    );
    if (cached === undefined) {
      missing.push(providerKey);
    } else {
      result.set(providerKey, cached);
    }
  }

  if (missing.length > 0) {
    const placeholders = missing.map(() => "?").join(",");
    const rows = db
      .query(
        `SELECT provider_key, COALESCE(SUM(cost), 0) AS total
         FROM raw_usage_events
         WHERE provider_key IN (${placeholders})
           AND timestamp_ms >= ?
           AND timestamp_ms < ?
         GROUP BY provider_key`,
      )
      .all(...missing, startMs, endMs) as Array<{
        provider_key: string;
        total: number;
      }>;
    const totals = new Map(rows.map((row) => [row.provider_key, row.total]));
    for (const providerKey of missing) {
      const total = totals.get(providerKey) ?? 0;
      cacheCost(timestampCostKey(providerKey, startMs, endMs), total);
      result.set(providerKey, total);
    }
  }

  return result;
}
