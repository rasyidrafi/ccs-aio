import { Database } from "bun:sqlite";
import { config } from "./config";

let usageDb: Database | null = null;
let pricingReady = false;

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
  const row = db
    .query(
      `SELECT COALESCE(SUM(cost), 0) as total
       FROM rollup_daily
       WHERE provider_key = ?
         AND bucket_start >= ?
         AND bucket_start < ?`
    )
    .get(providerKey, startBucket, endBucket) as { total: number } | null;
  return row?.total ?? 0;
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
  const row = db
    .query(
      `SELECT COALESCE(SUM(cost), 0) as total
       FROM raw_usage_events
       WHERE provider_key = ?
         AND timestamp_ms >= ?
         AND timestamp_ms < ?`
    )
    .get(
      providerKey,
      timestampMs(startInclusive),
      timestampMs(endExclusive)
    ) as { total: number } | null;
  return row?.total ?? 0;
}
